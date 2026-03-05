@echo off
setlocal

echo ========================================
echo   MusicTools Backend Starter
echo ========================================

REM change to this file's directory (backend/)
cd /d "%~dp0"

REM 0) optional proxy: set PROXY before calling this script, e.g.
REM    set PROXY=http://127.0.0.1:7890  &&  start_backend.bat
if not "%PROXY%"=="" (
  set "HTTP_PROXY=%PROXY%"
  set "HTTPS_PROXY=%PROXY%"
  echo [*] Using proxy %PROXY%
)

REM 1) venv
if not exist "venv\Scripts\python.exe" (
  echo [!] Creating virtual environment...
  py -3 -m venv venv 2>nul || python -m venv venv
)

REM Add FFmpeg bin to PATH if provided
if not "%FFMPEG_BIN%"=="" (
  set "PATH=%FFMPEG_BIN%;%PATH%"
  echo [*] Using FFmpeg bin: %FFMPEG_BIN%
)

echo [*] Activating venv
call "venv\Scripts\activate.bat"

REM 2) install deps when asked: start_backend.bat deps
if "%1"=="deps" (
  echo [*] Installing/Updating backend dependencies...
  pip install -r requirements.txt
)

REM 3) make sure folders exist
if not exist "downloads" mkdir downloads
if not exist "outputs"   mkdir outputs
if not exist "uploads"    mkdir uploads

REM 4) start server (reload for dev)
echo [*] Starting Uvicorn at http://localhost:8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

endlocal
