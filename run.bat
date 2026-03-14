@echo off
title PDF Tool Suite — Local Server
color 0A

echo.
echo  ============================================
echo   PDF Tool Suite — Local Server Launcher
echo  ============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Python not found. Install from https://www.python.org/downloads/
    echo          Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo  [OK] Python found
python --version

:: Check / create virtualenv
if not exist ".venv\Scripts\activate.bat" (
    echo.
    echo  [SETUP] Creating virtual environment...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo  [OK] Virtual environment created
)

:: Activate
call .venv\Scripts\activate.bat

:: Install / upgrade requirements
echo.
echo  [SETUP] Installing Python dependencies (first run may take a minute)...
pip install -r requirements.txt --quiet --upgrade
if %errorlevel% neq 0 (
    echo  [ERROR] pip install failed. Check requirements.txt and your internet connection.
    pause
    exit /b 1
)
echo  [OK] Dependencies ready

:: Check Ghostscript (warn only — compression needs it)
where gswin64c >nul 2>&1
if %errorlevel% neq 0 (
    where gswin32c >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  [WARN] Ghostscript not found on PATH.
        echo         The PDF Compressor tool requires Ghostscript.
        echo         Download: https://www.ghostscript.com/releases/gsdnld.html
        echo         (All other tools will work without it.)
        echo.
    ) else (
        echo  [OK] Ghostscript ^(32-bit^) found
    )
) else (
    echo  [OK] Ghostscript ^(64-bit^) found
)

:: Create temp dir
if not exist "%TEMP%\pdf_tool_suite" mkdir "%TEMP%\pdf_tool_suite"

echo.
echo  [START] Launching Flask server on http://localhost:5000
echo          Press Ctrl+C to stop the server.
echo.

:: Open browser after 2 seconds
start "" /B cmd /C "timeout /T 2 >nul && start http://localhost:5000"

:: Run Flask
python app.py

pause
