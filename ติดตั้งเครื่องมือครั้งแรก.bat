@echo off
cd /d "%~dp0"
echo ============================================
echo   NOVA PS HUB - First time setup
echo ============================================
echo.
echo [1/2] Checking Node.js...
call node --version
if errorlevel 1 (
  echo *** Node.js NOT found. Install it first: https://nodejs.org
  pause
  exit /b 1
)
echo.
echo [2/2] Installing clasp (Google Apps Script CLI)...
call npm install -g @google/clasp
if errorlevel 1 (
  echo *** Install FAILED. Try running this file as Administrator.
  pause
  exit /b 1
)
echo.
call clasp --version
echo.
echo ============================================
echo   Done. NEXT STEPS:
echo   1. Double-click the CLASP LOGIN bat
echo   2. Double-click the UPDATE bat
echo ============================================
echo.
pause
