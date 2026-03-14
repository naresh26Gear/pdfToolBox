"""
PDF Merge Blueprint
POST /api/merge  — body: files[] (multiple PDFs), order[] (optional index list)
"""
import os
import json
from flask import Blueprint, request, jsonify
import fitz  # PyMuPDF
from .utils import save_upload, json_ok, json_err, unique_path, download_url

merge_bp = Blueprint('merge', __name__)


@merge_bp.route('/api/merge', methods=['POST'])
def merge():
    files = request.files.getlist('files[]')
    if not files or len(files) < 2:
        return jsonify(*json_err('Provide at least 2 PDF files'))

    if len(files) > 50:
        return jsonify(*json_err('Maximum 50 files per merge'))

    # Honour explicit ordering if supplied
    try:
        order_raw = request.form.get('order', '[]')
        order = json.loads(order_raw)
        if order and len(order) == len(files):
            files = [files[i] for i in order]
    except Exception:
        pass

    saved_paths = []
    for f in files:
        path, meta = save_upload(f)
        if not path:
            _cleanup(saved_paths)
            return jsonify(*json_err(meta.get('error', f'Upload failed for {f.filename}')))
        saved_paths.append(path)

    dest = unique_path('pdf')

    try:
        merged = fitz.open()
        for p in saved_paths:
            try:
                doc = fitz.open(p)
            except Exception as exc:
                _cleanup(saved_paths)
                return jsonify(*json_err(f'Cannot open {os.path.basename(p)}: {exc}'))
            merged.insert_pdf(doc)
            doc.close()

        merged.save(dest, garbage=4, deflate=True)
        merged.close()
    except Exception as exc:
        _cleanup(saved_paths)
        return jsonify(*json_err(f'Merge failed: {exc}'))
    finally:
        _cleanup(saved_paths)

    total_pages = fitz.open(dest).page_count

    return jsonify(**json_ok({
        'download_url': download_url(dest),
        'page_count': total_pages,
        'file_count': len(saved_paths),
        'output_size': os.path.getsize(dest),
    })[0])


@merge_bp.route('/api/merge/thumbnail', methods=['POST'])
def thumbnail():
    """Render first page of uploaded PDF as base64 PNG for preview."""
    if 'file' not in request.files:
        return jsonify(*json_err('No file'))

    path, meta = save_upload(request.files['file'])
    if not path:
        return jsonify(*json_err(meta.get('error', 'Upload failed')))

    try:
        doc = fitz.open(path)
        page = doc[0]
        mat = fitz.Matrix(0.5, 0.5)  # 50% scale thumbnail
        pix = page.get_pixmap(matrix=mat, alpha=False)
        import base64
        img_b64 = base64.b64encode(pix.tobytes('png')).decode()
        pages = doc.page_count
        doc.close()
    except Exception as exc:
        return jsonify(*json_err(f'Thumbnail failed: {exc}'))
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    return jsonify(**json_ok({'thumbnail': f'data:image/png;base64,{img_b64}', 'pages': pages})[0])


def _cleanup(paths):
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass
