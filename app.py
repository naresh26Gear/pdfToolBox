import os
import time
import threading
from flask import Flask, render_template, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:5000", "http://127.0.0.1:5000"])

app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB
app.config['UPLOAD_FOLDER'] = os.path.join(
    os.environ.get('TMPDIR', '/tmp'), 'pdf_tool_suite'
)
app.secret_key = 'pdf_tool_suite_local_only_2024'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ── Register blueprints ───────────────────────────────────────────────────────
from blueprints.compress import compress_bp
from blueprints.merge    import merge_bp
from blueprints.split    import split_bp
from blueprints.unlock   import unlock_bp
from blueprints.convert  import convert_bp
from blueprints.editor   import editor_bp

app.register_blueprint(compress_bp)
app.register_blueprint(merge_bp)
app.register_blueprint(split_bp)
app.register_blueprint(unlock_bp)
app.register_blueprint(convert_bp)
app.register_blueprint(editor_bp)

# ── Static asset helper ───────────────────────────────────────────────────────
@app.route('/download/<path:filename>')
def download_file(filename):
    """Serve generated output files for download."""
    return send_from_directory(
        app.config['UPLOAD_FOLDER'], filename, as_attachment=True
    )

@app.route('/')
def index():
    return render_template('index.html')

# ── Background cleanup (TTL = 10 minutes) ─────────────────────────────────────
def _cleanup_loop():
    folder = app.config['UPLOAD_FOLDER']
    while True:
        time.sleep(120)
        cutoff = time.time() - 600
        try:
            for name in os.listdir(folder):
                path = os.path.join(folder, name)
                if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                    os.remove(path)
        except Exception:
            pass

threading.Thread(target=_cleanup_loop, daemon=True).start()

@app.errorhandler(404)
def not_found(e):
    from flask import jsonify
    return jsonify(status='error', message=f'Endpoint not found: {e}'), 404

@app.errorhandler(413)
def too_large(e):
    from flask import jsonify
    return jsonify(status='error', message='File too large. Maximum allowed is 200 MB.'), 413

@app.errorhandler(500)
def internal_error(e):
    from flask import jsonify
    import traceback
    print("\n[500 ERROR]\n" + traceback.format_exc())
    return jsonify(status='error', message=f'Server error: {str(e)[:200]}. See Flask terminal for full traceback.'), 500

@app.errorhandler(Exception)
def unhandled_exception(e):
    from flask import jsonify
    import traceback
    print("\n[UNHANDLED EXCEPTION]\n" + traceback.format_exc())
    return jsonify(status='error', message=f'{type(e).__name__}: {str(e)[:200]}'), 500

if __name__ == '__main__':
    print("\n  PDF Tool Suite — http://localhost:5000\n")
    app.run(debug=False, port=5000, host='127.0.0.1')
