"""
PDF Unlock Blueprint
POST /api/unlock  — body: file (encrypted PDF), password (string)
"""
import os
from flask import Blueprint, request, jsonify
import pikepdf
from .utils import save_upload, json_ok, json_err, unique_path, download_url

unlock_bp = Blueprint('unlock', __name__)


@unlock_bp.route('/api/unlock', methods=['POST'])
def unlock():
    if 'file' not in request.files:
        return jsonify(*json_err('No file provided'))

    src, meta = save_upload(request.files['file'])
    if not src:
        return jsonify(*json_err(meta.get('error', 'Upload failed')))

    password = request.form.get('password', '')

    dest = unique_path('pdf')

    try:
        pdf = pikepdf.open(src, password=password)
    except pikepdf.PasswordError:
        try:
            os.remove(src)
        except OSError:
            pass
        return jsonify(*json_err('Wrong password. Please try again.', 401))
    except pikepdf.PdfError as exc:
        try:
            os.remove(src)
        except OSError:
            pass
        err = str(exc).lower()
        if 'not encrypted' in err or 'no password' in err:
            return jsonify(*json_err('This PDF is not password-protected.'))
        return jsonify(*json_err(f'Cannot open PDF: {exc}'))
    except Exception as exc:
        try:
            os.remove(src)
        except OSError:
            pass
        return jsonify(*json_err(f'Unexpected error: {exc}'))

    try:
        pdf.save(dest)
        pdf.close()
        page_count = _get_page_count(dest)
    except Exception as exc:
        return jsonify(*json_err(f'Failed to save unlocked PDF: {exc}'))
    finally:
        try:
            os.remove(src)
        except OSError:
            pass

    return jsonify(**json_ok({
        'download_url': download_url(dest),
        'page_count': page_count,
        'output_size': os.path.getsize(dest),
        'warning': meta.get('warning'),
    })[0])


def _get_page_count(path: str) -> int:
    try:
        import fitz
        doc = fitz.open(path)
        n = doc.page_count
        doc.close()
        return n
    except Exception:
        return 0
