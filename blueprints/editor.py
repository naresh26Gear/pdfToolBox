"""
PDF Editor Blueprint
  GET  /api/preview   — query: file_id, page (0-indexed), scale (0.5-3.0)
  POST /api/edit/save — body: file, edits (JSON array of annotation objects)

Annotation object schema:
  { type: 'text'|'rect'|'highlight'|'note',
    page: int,          # 0-indexed
    x: float, y: float, # in PDF user-space points
    width: float, height: float,
    text: str,
    color: [r,g,b],     # 0.0-1.0 components
    font_size: float }
"""
import os
import io
import json
import base64
import uuid
from flask import Blueprint, request, jsonify, current_app
import fitz
from .utils import save_upload, json_ok, json_err, unique_path, download_url

editor_bp = Blueprint('editor', __name__)

# In-memory store mapping file_id → temp_path (cleared on next cleanup cycle)
_file_store: dict[str, str] = {}


@editor_bp.route('/api/editor/upload', methods=['POST'])
def editor_upload():
    """Upload a PDF for editing; returns file_id and page count."""
    if 'file' not in request.files:
        return jsonify(*json_err('No file provided'))

    src, meta = save_upload(request.files['file'])
    if not src:
        return jsonify(*json_err(meta.get('error', 'Upload failed')))

    try:
        doc = fitz.open(src)
        page_count = doc.page_count
        # Get page dimensions (points) for all pages
        pages_info = []
        for i, pg in enumerate(doc):
            r = pg.rect
            pages_info.append({'width': r.width, 'height': r.height})
        doc.close()
    except Exception as exc:
        return jsonify(*json_err(f'Cannot open PDF: {exc}'))

    file_id = uuid.uuid4().hex
    _file_store[file_id] = src

    return jsonify(**json_ok({
        'file_id': file_id,
        'page_count': page_count,
        'pages': pages_info,
        'warning': meta.get('warning'),
    })[0])


@editor_bp.route('/api/preview', methods=['GET'])
def preview():
    """Render a single PDF page as a base64 PNG."""
    file_id = request.args.get('file_id', '')
    page_idx = int(request.args.get('page', 0))
    scale = float(request.args.get('scale', 1.5))
    scale = max(0.5, min(3.0, scale))

    src = _file_store.get(file_id)
    if not src or not os.path.exists(src):
        return jsonify(*json_err('File not found. Please re-upload.', 404))

    try:
        doc = fitz.open(src)
        if page_idx < 0 or page_idx >= doc.page_count:
            return jsonify(*json_err(f'Page {page_idx} out of range'))
        mat = fitz.Matrix(scale, scale)
        pix = doc[page_idx].get_pixmap(matrix=mat, alpha=False)
        img_b64 = base64.b64encode(pix.tobytes('png')).decode()
        doc.close()
    except Exception as exc:
        return jsonify(*json_err(f'Render failed: {exc}'))

    return jsonify(**json_ok({'image': f'data:image/png;base64,{img_b64}'})[0])


@editor_bp.route('/api/edit/save', methods=['POST'])
def edit_save():
    """Apply a list of annotations to the PDF and return the modified file."""
    file_id = request.form.get('file_id', '')
    edits_raw = request.form.get('edits', '[]')

    src = _file_store.get(file_id)

    # Allow uploading a new file if no file_id provided
    if not src or not os.path.exists(src):
        if 'file' not in request.files:
            return jsonify(*json_err('file_id not found and no file uploaded'))
        src, meta = save_upload(request.files['file'])
        if not src:
            return jsonify(*json_err(meta.get('error', 'Upload failed')))

    try:
        edits = json.loads(edits_raw)
    except json.JSONDecodeError:
        return jsonify(*json_err('Invalid edits JSON'))

    dest = unique_path('pdf')

    try:
        doc = fitz.open(src)
        _apply_edits(doc, edits)
        doc.save(dest, garbage=4, deflate=True, incremental=False)
        doc.close()
    except Exception as exc:
        return jsonify(*json_err(f'Save failed: {exc}'))

    return jsonify(**json_ok({
        'download_url': download_url(dest),
        'output_size': os.path.getsize(dest),
    })[0])


@editor_bp.route('/api/editor/reorder', methods=['POST'])
def reorder():
    """Reorder / delete pages. Body: file_id, page_order (JSON array of 0-based indices)."""
    file_id = request.form.get('file_id', '')
    order_raw = request.form.get('page_order', '[]')

    src = _file_store.get(file_id)
    if not src or not os.path.exists(src):
        return jsonify(*json_err('File not found. Please re-upload.', 404))

    try:
        order = json.loads(order_raw)
    except json.JSONDecodeError:
        return jsonify(*json_err('Invalid page_order JSON'))

    dest = unique_path('pdf')

    try:
        src_doc = fitz.open(src)
        new_doc = fitz.open()
        for idx in order:
            if 0 <= idx < src_doc.page_count:
                new_doc.insert_pdf(src_doc, from_page=idx, to_page=idx)
        new_doc.save(dest, garbage=4, deflate=True)
        new_doc.close()
        src_doc.close()

        # Update store to point to new file
        new_id = uuid.uuid4().hex
        _file_store[new_id] = dest
        # Remove old temp
        try:
            os.remove(src)
        except OSError:
            pass
        del _file_store[file_id]

    except Exception as exc:
        return jsonify(*json_err(f'Reorder failed: {exc}'))

    try:
        doc = fitz.open(dest)
        page_count = doc.page_count
        pages_info = [{'width': doc[i].rect.width, 'height': doc[i].rect.height}
                      for i in range(page_count)]
        doc.close()
    except Exception:
        page_count, pages_info = len(order), []

    return jsonify(**json_ok({
        'file_id': new_id,
        'page_count': page_count,
        'pages': pages_info,
    })[0])


# ─────────────────────────── annotation renderer ────────────────────────────

def _apply_edits(doc: fitz.Document, edits: list):
    """
    Apply a list of annotation dicts to the fitz document in-place.

    Supported types:
      text      → FreeText annotation
      rect      → Square annotation (outline)
      highlight → Highlight annotation
      note      → Sticky-note annotation
    """
    for edit in edits:
        try:
            t     = edit.get('type', 'text')
            pg    = int(edit.get('page', 0))
            x     = float(edit.get('x', 100))
            y     = float(edit.get('y', 100))
            w     = float(edit.get('width', 200))
            h     = float(edit.get('height', 50))
            color = edit.get('color', [1, 0.8, 0])
            if isinstance(color, str):
                color = _hex_to_rgb(color)
            text  = edit.get('text', '')
            fsize = float(edit.get('font_size', 12))

            if pg < 0 or pg >= doc.page_count:
                continue
            page = doc[pg]
            rect = fitz.Rect(x, y, x + w, y + h)

            if t == 'text':
                page.insert_textbox(
                    rect, text,
                    fontsize=fsize,
                    color=color,
                    fontname='helv',
                    align=fitz.TEXT_ALIGN_LEFT,
                )

            elif t == 'rect':
                annot = page.add_rect_annot(rect)
                annot.set_colors(stroke=color)
                annot.set_border(width=2)
                annot.update()

            elif t == 'highlight':
                quads = page.search_for(text) if text else None
                if quads:
                    annot = page.add_highlight_annot(quads[0])
                    annot.set_colors(stroke=color)
                    annot.update()
                else:
                    # Highlight the given rectangle area
                    annot = page.add_highlight_annot(rect.quad)
                    annot.set_colors(stroke=color)
                    annot.update()

            elif t == 'note':
                annot = page.add_text_annot(fitz.Point(x, y), text)
                annot.set_colors(stroke=color)
                annot.update()

        except Exception:
            continue  # skip malformed edits


def _hex_to_rgb(hex_color: str) -> list:
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)
    r = int(hex_color[0:2], 16) / 255
    g = int(hex_color[2:4], 16) / 255
    b = int(hex_color[4:6], 16) / 255
    return [r, g, b]
