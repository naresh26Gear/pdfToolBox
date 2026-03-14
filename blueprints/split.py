"""
PDF Split Blueprint
POST /api/split  — body: file, mode (range|every|extract), value (string)

Modes:
  range   — value = "1-3,5,7-10"  (1-based page numbers)
  every   — value = "3"           (split every N pages)
  extract — value = "1,4,7"       (specific pages to extract into one PDF)

Returns a ZIP of split PDF files, or single PDF for 'extract'.
"""
import os
import io
import zipfile
import json
from flask import Blueprint, request, jsonify, send_file
import fitz
from .utils import save_upload, json_ok, json_err, unique_path, download_url

split_bp = Blueprint('split', __name__)


def _parse_range_string(s: str, max_page: int) -> list[list[int]]:
    """
    Parse '1-3,5,7-10' → [[0,1,2],[4],[6,7,8,9]]  (0-indexed lists).
    Returns list of page-index groups, each group becomes one output PDF.
    """
    groups = []
    for part in s.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-', 1)
            a, b = int(a.strip()), int(b.strip())
            a, b = max(1, a), min(max_page, b)
            if a <= b:
                groups.append(list(range(a - 1, b)))
        else:
            p = int(part.strip())
            if 1 <= p <= max_page:
                groups.append([p - 1])
    return groups


def _parse_every(n: int, max_page: int) -> list[list[int]]:
    """Split every N pages → list of page-index groups."""
    groups = []
    for start in range(0, max_page, n):
        groups.append(list(range(start, min(start + n, max_page))))
    return groups


def _build_zip(src_doc: fitz.Document, groups: list[list[int]], label_prefix: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for idx, pages in enumerate(groups, 1):
            out = fitz.open()
            out.insert_pdf(src_doc, from_page=pages[0], to_page=pages[-1])
            # For non-contiguous groups, we need page-by-page insertion
            if pages != list(range(pages[0], pages[-1] + 1)):
                out.close()
                out = fitz.open()
                for p in pages:
                    out.insert_pdf(src_doc, from_page=p, to_page=p)
            pdf_bytes = out.tobytes(garbage=4, deflate=True)
            out.close()
            prange = f'{pages[0]+1}-{pages[-1]+1}' if len(pages) > 1 else str(pages[0]+1)
            zf.writestr(f'{label_prefix}_part{idx}_pages{prange}.pdf', pdf_bytes)
    return buf.getvalue()


@split_bp.route('/api/split', methods=['POST'])
def split():
    if 'file' not in request.files:
        return jsonify(*json_err('No file provided'))

    src, meta = save_upload(request.files['file'])
    if not src:
        return jsonify(*json_err(meta.get('error', 'Upload failed')))

    mode  = request.form.get('mode', 'range')
    value = request.form.get('value', '').strip()

    try:
        doc = fitz.open(src)
    except Exception as exc:
        return jsonify(*json_err(f'Cannot open PDF: {exc}'))
    finally:
        pass  # keep open for processing below

    max_page = doc.page_count

    try:
        if mode == 'range':
            if not value:
                return jsonify(*json_err('Provide page ranges, e.g. 1-3,5,7-10'))
            try:
                groups = _parse_range_string(value, max_page)
            except Exception:
                return jsonify(*json_err('Invalid range string. Use format: 1-3,5,7-10'))
            if not groups:
                return jsonify(*json_err('No valid pages found in range'))

        elif mode == 'every':
            try:
                n = int(value)
                if n < 1:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify(*json_err('Value must be a positive integer'))
            groups = _parse_every(n, max_page)

        elif mode == 'extract':
            if not value:
                return jsonify(*json_err('Provide page numbers to extract'))
            try:
                pages = [int(p.strip()) - 1 for p in value.split(',') if p.strip()]
                pages = [p for p in pages if 0 <= p < max_page]
            except ValueError:
                return jsonify(*json_err('Invalid page list'))
            if not pages:
                return jsonify(*json_err('No valid pages to extract'))
            groups = [pages]  # single group → single output PDF

        else:
            return jsonify(*json_err(f'Unknown mode: {mode}'))

        if len(groups) == 1 and mode == 'extract':
            # Return a single PDF directly
            out = fitz.open()
            for p in groups[0]:
                out.insert_pdf(doc, from_page=p, to_page=p)
            dest = unique_path('pdf')
            out.save(dest, garbage=4, deflate=True)
            out.close()
            doc.close()
            return jsonify(**json_ok({
                'download_url': download_url(dest),
                'type': 'pdf',
                'page_count': len(groups[0]),
            })[0])
        else:
            zip_bytes = _build_zip(doc, groups, 'split')
            doc.close()
            dest = unique_path('zip')
            with open(dest, 'wb') as f:
                f.write(zip_bytes)
            return jsonify(**json_ok({
                'download_url': download_url(dest),
                'type': 'zip',
                'part_count': len(groups),
            })[0])

    except Exception as exc:
        return jsonify(*json_err(f'Split failed: {exc}'))
    finally:
        try:
            doc.close()
        except Exception:
            pass
        try:
            os.remove(src)
        except OSError:
            pass


@split_bp.route('/api/split/info', methods=['POST'])
def split_info():
    """Return page count + thumbnail grid (up to 20 pages) for a PDF."""
    if 'file' not in request.files:
        return jsonify(*json_err('No file'))

    src, meta = save_upload(request.files['file'])
    if not src:
        return jsonify(*json_err(meta.get('error', 'Upload failed')))

    import base64
    thumbnails = []
    try:
        doc = fitz.open(src)
        page_count = doc.page_count
        limit = min(page_count, 24)
        mat = fitz.Matrix(0.3, 0.3)
        for i in range(limit):
            pix = doc[i].get_pixmap(matrix=mat, alpha=False)
            b64 = base64.b64encode(pix.tobytes('png')).decode()
            thumbnails.append(f'data:image/png;base64,{b64}')
        doc.close()
    except Exception as exc:
        return jsonify(*json_err(f'Cannot read PDF: {exc}'))
    finally:
        try:
            os.remove(src)
        except OSError:
            pass

    return jsonify(**json_ok({
        'page_count': page_count,
        'thumbnails': thumbnails,
        'warning': meta.get('warning'),
    })[0])
