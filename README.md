# PDF Tool Suite — Local

A complete, fully offline PDF toolkit. Zero cloud. Zero subscriptions. Everything runs on your machine.

---

## Features

| Tool | Description |
|------|-------------|
| **PDF Editor** | Add text, rectangles, highlights, sticky notes. Reorder/delete pages. |
| **Compressor** | Ghostscript-powered compression with quality slider and real-time size estimate. |
| **Merge** | Combine 2–50 PDFs with drag-to-reorder and thumbnail previews. |
| **Split** | Split by range (`1-3,5`), every N pages, or click-to-select pages. |
| **Unlock** | Remove password protection from encrypted PDFs. |
| **PDF → JPG** | Export pages as JPG images at 72/150/300 DPI. |
| **PDF → PNG** | Export pages as PNG with transparency support. |
| **PDF → WebP** | Export pages as WebP with quality slider. |
| **PDF → Excel** | Extract tables with pdfplumber → formatted `.xlsx` workbook. |
| **PDF → Word** | Convert to editable `.docx` via pdf2docx. |
| **PDF → PowerPoint** | Each page becomes one high-res slide in a `.pptx` file. |

---

## Prerequisites

### 1. Python 3.10 or newer

**Windows**
1. Download from https://www.python.org/downloads/
2. During install, check **"Add Python to PATH"**
3. Verify: open Command Prompt and run `python --version`

**macOS**
```bash
brew install python
```

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install python3.10 python3.10-venv python3-pip
```

---

### 2. Ghostscript *(required for PDF Compression only)*

All other tools work without Ghostscript.

**Windows**
1. Download the installer from https://www.ghostscript.com/releases/gsdnld.html
2. Run the installer (choose the 64-bit version)
3. The installer adds Ghostscript to PATH automatically
4. Verify: open a new Command Prompt and run `gswin64c --version`

**macOS**
```bash
brew install ghostscript
```

**Ubuntu / Debian**
```bash
sudo apt install ghostscript
```

---

## Quick Start

### Option A — One-click launchers (recommended)

**Windows:**
```
Double-click run.bat
```

**Linux / macOS:**
```bash
chmod +x run.sh
./run.sh
```

Both scripts:
- Check for Python 3.10+
- Create a `.venv` virtual environment if it doesn't exist
- Install all Python dependencies from `requirements.txt`
- Check for Ghostscript and warn if missing
- Start the Flask server on port 5000
- Automatically open your browser to http://localhost:5000

---

### Option B — Manual setup

```bash
# 1. Clone / extract the project
cd pdf-tool-suite

# 2. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Linux/macOS
# OR
.venv\Scripts\activate.bat       # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
python app.py

# 5. Open in browser
# http://localhost:5000
```

---

## Stopping the Server

Press **Ctrl+C** in the terminal where Flask is running.

---

## File Size Notes

- Recommended maximum per operation: **100 MB**
- Files above 100 MB will display a warning but will still process
- Temporary files are automatically deleted after **10 minutes**
- All files stay on your machine — nothing is uploaded anywhere

---

## Project Structure

```
pdf-tool-suite/
├── app.py                   # Flask entry point, blueprint registration, cleanup
├── requirements.txt         # Pinned Python dependencies
├── run.bat                  # Windows one-click launcher
├── run.sh                   # Linux/macOS one-click launcher
├── README.md                # This file
│
├── blueprints/
│   ├── __init__.py
│   ├── utils.py             # Shared helpers (upload, paths, JSON responses)
│   ├── compress.py          # POST /api/compress, /api/compress/estimate
│   ├── merge.py             # POST /api/merge, /api/merge/thumbnail
│   ├── split.py             # POST /api/split, /api/split/info
│   ├── unlock.py            # POST /api/unlock
│   ├── convert.py           # POST /api/to-jpg, to-png, to-webp, to-excel, to-word, to-ppt
│   └── editor.py            # GET /api/preview, POST /api/editor/upload, /api/edit/save, /api/editor/reorder
│
├── static/
│   ├── css/
│   │   └── styles.css       # Full CSS with dark/light themes, animations, responsive layout
│   └── js/
│       ├── app.js           # Core: navigation, theme, toast, progress, upload helpers
│       ├── compress.js
│       ├── merge.js
│       ├── split.js
│       ├── unlock.js
│       ├── to-jpg.js
│       ├── to-png.js
│       ├── to-webp.js
│       ├── to-excel.js
│       ├── to-word.js
│       ├── to-ppt.js
│       └── editor.js
│
└── templates/
    └── index.html           # Single-page app with all tool sections
```

---

## API Endpoints

All endpoints accept `multipart/form-data` and return JSON.

```
POST /api/compress          file, quality (0-100)
POST /api/compress/estimate file, quality              → size prediction (no GS needed)
POST /api/merge             files[] (2-50 PDFs)
POST /api/merge/thumbnail   file                       → base64 first-page thumbnail
POST /api/split             file, mode, value
POST /api/split/info        file                       → page count + thumbnails
POST /api/unlock            file, password
POST /api/to-jpg            file, dpi
POST /api/to-png            file, dpi
POST /api/to-webp           file, quality
POST /api/to-excel          file
POST /api/to-word           file
POST /api/to-ppt            file
POST /api/editor/upload     file                       → file_id, page count, dimensions
GET  /api/preview           ?file_id=…&page=…&scale=… → base64 page image
POST /api/edit/save         file_id, edits (JSON)
POST /api/editor/reorder    file_id, page_order (JSON)
GET  /download/<filename>   serve output file for download
```

**Response shape (success):**
```json
{ "status": "ok", "download_url": "/download/abc123.pdf", ... }
```

**Response shape (error):**
```json
{ "status": "error", "message": "Human-readable description" }
```

---

## Troubleshooting

### "Ghostscript not found"
Install Ghostscript and ensure it is on your system PATH. On Windows, open a new terminal after installing. See Prerequisites section above.

### "pdf2docx" conversion is slow or produces poor output
pdf2docx works best on text-based PDFs with clear formatting. Complex layouts (tables, multi-column text) may not perfectly round-trip. Scanned image PDFs will produce near-empty .docx files — run OCR first.

### Large PDF causes timeout
For PDFs over ~80 MB, especially for PowerPoint conversion (which renders every page at 150 DPI), processing can take 60–120 seconds. The progress overlay will remain visible during this time — do not close the tab.

### Port 5000 already in use
Edit `app.py`, last line:
```python
app.run(debug=False, port=5001, host='127.0.0.1')
```

### pip install fails on pikepdf (Windows)
pikepdf requires Visual C++ Redistributable. Download from:
https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist

### pip install fails on pdf2image
pdf2image requires the `poppler` system library.
- **macOS:** `brew install poppler`
- **Ubuntu:** `sudo apt install poppler-utils`
- **Windows:** Download poppler for Windows from https://github.com/oschwartz10612/poppler-windows/releases and add the `bin/` directory to PATH.

Note: pdf2image is used by the PowerPoint conversion. If it fails to install, PowerPoint conversion will not work, but all other tools will function normally.

---

## Privacy

This application makes **zero external network requests at runtime**. All processing occurs on your local machine. No files, metadata, or usage data are transmitted anywhere.

---

## License

MIT — free to use, modify, and distribute.
