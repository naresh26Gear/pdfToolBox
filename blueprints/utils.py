"""Shared helpers used across all Flask blueprints."""
import os
import uuid
import time
from flask import current_app
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'pdf'}
MAX_WARN_BYTES = 100 * 1024 * 1024  # 100 MB


def upload_dir() -> str:
    d = current_app.config['UPLOAD_FOLDER']
    os.makedirs(d, exist_ok=True)
    return d


def unique_path(ext: str) -> str:
    """Return a unique file path inside the upload folder."""
    name = f"{uuid.uuid4().hex}.{ext.lstrip('.')}"
    return os.path.join(upload_dir(), name)


def save_upload(file_storage, allowed: set = None) -> tuple[str, dict]:
    """
    Save an uploaded FileStorage object.
    Returns (saved_path, error_dict_or_None).
    """
    if allowed is None:
        allowed = ALLOWED_EXTENSIONS

    filename = secure_filename(file_storage.filename or 'upload')
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    if ext not in allowed:
        return '', {'error': f'File type .{ext} not allowed. Expected: {", ".join(allowed)}'}

    dest = unique_path(ext)
    file_storage.save(dest)

    size = os.path.getsize(dest)
    warning = None
    if size > MAX_WARN_BYTES:
        warning = f'File is large ({size // (1024*1024)} MB). Processing may take a while.'

    return dest, {'warning': warning} if warning else {}


def json_ok(data: dict) -> tuple:
    return {'status': 'ok', **data}, 200


def json_err(msg: str, code: int = 400) -> tuple:
    return {'status': 'error', 'message': msg}, code


def download_url(path: str) -> str:
    """Convert an absolute temp path to a /download/<filename> URL."""
    return f'/download/{os.path.basename(path)}'
