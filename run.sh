#!/usr/bin/env bash
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'  # No Colour

echo ""
echo -e "${BOLD} ============================================${NC}"
echo -e "${BOLD}  PDF Tool Suite — Local Server Launcher${NC}"
echo -e "${BOLD} ============================================${NC}"
echo ""

# ── Check Python ──────────────────────────────────────────────────────────────
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        VER=$("$candidate" --version 2>&1 | awk '{print $2}')
        MAJOR=$(echo "$VER" | cut -d. -f1)
        MINOR=$(echo "$VER" | cut -d. -f2)
        if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 10 ]; then
            PYTHON="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo -e "${RED}[ERROR]${NC} Python 3.10+ not found."
    echo "        macOS:  brew install python"
    echo "        Ubuntu: sudo apt install python3.10 python3.10-venv"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} Found $($PYTHON --version)"

# ── Virtual environment ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
    echo ""
    echo -e "${YELLOW}[SETUP]${NC} Creating virtual environment..."
    "$PYTHON" -m venv .venv
    echo -e "${GREEN}[OK]${NC} Virtual environment created"
fi

# Activate
# shellcheck disable=SC1091
source .venv/bin/activate

# ── Install dependencies ──────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[SETUP]${NC} Installing / updating Python dependencies..."
pip install -r requirements.txt --quiet --upgrade
echo -e "${GREEN}[OK]${NC} Dependencies ready"

# ── Check Ghostscript ─────────────────────────────────────────────────────────
if command -v gs &>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Ghostscript found: $(gs --version)"
else
    echo ""
    echo -e "${YELLOW}[WARN]${NC} Ghostscript not found. The PDF Compressor needs it."
    echo "       macOS:  brew install ghostscript"
    echo "       Ubuntu: sudo apt install ghostscript"
    echo "       (All other tools work without it.)"
fi

# ── Temp dir ──────────────────────────────────────────────────────────────────
TMPDIR_SUITE="${TMPDIR:-/tmp}/pdf_tool_suite"
mkdir -p "$TMPDIR_SUITE"

# ── Launch ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}[START]${NC} Launching server at ${BOLD}http://localhost:5000${NC}"
echo "        Press Ctrl+C to stop."
echo ""

# Open browser (non-blocking, best-effort)
(
    sleep 2
    if command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:5000" 2>/dev/null &
    elif command -v open &>/dev/null; then
        open "http://localhost:5000" 2>/dev/null &
    fi
) &

python app.py
