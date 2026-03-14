"""
PDF Compressor Blueprint
POST /api/compress  — body: file (PDF), quality (int 0-100)

Maps quality slider → Ghostscript dPDFSETTINGS:
  0–24   → /screen   (72 dpi, heavy compression)
  25–49  → /ebook    (150 dpi)
  50–74  → /printer  (300 dpi)
  75–89  → /prepress (300 dpi, colour-preserving)
  90–100 → /default  (minimal compression)
"""
import os
import subprocess
import shutil
from flask import Blueprint, request, jsonify
from .utils import save_upload, json_ok, json_err, unique_path, download_url

compress_bp = Blueprint('compress', __name__)

QUALITY_MAP = [
    (25,  '/screen'),
    (50,  '/ebook'),
    (75,  '/printer'),
    (90,  '/prepress'),
    (101, '/default'),
]


def _quality_to_setting(q: int) -> str:
    for threshold, setting in QUALITY_MAP:
        if q < threshold:
            return setting
    return '/default'


def _ghostscript_bin() -> str:
    for candidate in ('gs', 'gswin64c', 'gswin32c'):
        if shutil.which(candidate):
            return candidate
    return None


@compress_bp.route('/api/compress', methods=['POST'])
def compress():
    if 'file' not in request.files:
        return jsonify(*json_err('No file provided'))

    src, meta = save_upload(request.files['file'])
    if not src:
        return jsonify(*json_err(meta.get('error', 'Upload failed')))

    try:
        quality = int(request.form.get('quality', 50))
        quality = max(0, min(100, quality))
    except (TypeError, ValueError):
        quality = 50

    gs = _ghostscript_bin()
    if not gs:
        return jsonify(*json_err(
            'Ghostscript not found. Install it and ensure it is on PATH. '
            'See README for instructions.'
        ))

    pdf_setting = _quality_to_setting(quality)
    dest = unique_path('pdf')
    original_size = os.path.getsize(src)

    cmd = [
        gs, '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dQUIET',
        f'-dPDFSETTINGS={pdf_setting}',
        '-dCompatibilityLevel=1.4',
        f'-sOutputFile={dest}',
        src,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            stderr = result.stderr.decode(errors='replace')
            return jsonify(*json_err(f'Ghostscript error: {stderr[:300]}'))
    except subprocess.TimeoutExpired:
        return jsonify(*json_err('Compression timed out (>120s)'))
    except Exception as exc:
        return jsonify(*json_err(f'Compression failed: {exc}'))
    finally:
        try:
            os.remove(src)
        except OSError:
            pass

    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
        return jsonify(*json_err('Ghostscript produced an empty file'))

    compressed_size = os.path.getsize(dest)
    saved_pct = round((1 - compressed_size / original_size) * 100, 1) if original_size else 0

    return jsonify(**json_ok({
        'download_url': download_url(dest),
        'original_size': original_size,
        'compressed_size': compressed_size,
        'saved_percent': saved_pct,
        'setting_used': pdf_setting,
        'warning': meta.get('warning'),
    })[0])


@compress_bp.route('/api/compress/estimate', methods=['POST'])
def estimate():
    """
    Quick size estimate without running Ghostscript.
    Returns rough prediction based on quality tier ratios.
    """
    if 'file' not in request.files:
        return jsonify(*json_err('No file'))

    file = request.files['file']
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)

    try:
        quality = int(request.form.get('quality', 50))
        quality = max(0, min(100, quality))
    except (TypeError, ValueError):
        quality = 50

    RATIOS = [(25, 0.10), (50, 0.30), (75, 0.55), (90, 0.75), (101, 0.92)]
    ratio = 0.92
    for threshold, r in RATIOS:
        if quality < threshold:
            ratio = r
            break

    estimated = int(size * ratio)
    return jsonify(**json_ok({'original_size': size, 'estimated_size': estimated})[0])
