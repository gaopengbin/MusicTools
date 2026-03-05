@echo off
echo ========================================
echo   MusicTools Launcher
echo ========================================
echo.

if not exist "backend\venv\Scripts\python.exe" (
    echo [!] Creating virtual environment...
    python -m venv backend\venv
)

echo [1] Installing backend dependencies...
call backend\venv\Scripts\activate.bat
pip install -r backend\requirements.txt

echo.
echo [2] Starting backend (port 8000)...
start "Backend" cmd /k "cd /d %~dp0backend && ..\backend\venv\Scripts\python.exe main.py"

timeout /t 3 /nobreak >nul

echo [3] Starting Tauri app...
cd /d %~dp0frontend
start "Tauri" cmd /k "npm run tauri:dev"

echo.
echo ========================================
echo   Started!
echo   Tauri App: Desktop Window
echo   Backend:   http://localhost:8000
echo ========================================
pause
