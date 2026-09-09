@echo off
cd /d "%~dp0"
echo ============================================
echo   NOVA PS HUB - Fix stuck git lock
echo ============================================
if exist ".git\index.lock" (
  del /f /q ".git\index.lock"
  echo Removed .git\index.lock
) else (
  echo No lock found - already clean.
)
echo.
echo Done. Now double-click the UPDATE bat again.
echo.
pause
