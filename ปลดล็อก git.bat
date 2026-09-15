@echo off
cd /d "%~dp0"
echo ============================================
echo   NOVA PS HUB - Clean stuck git locks
echo ============================================
echo.
if not exist ".git" (
  echo No .git folder here. Nothing to clean.
  pause
  exit /b 0
)
echo Removing lock files...
if exist ".git\index.lock"       del /f /q ".git\index.lock"       & echo   - index.lock
if exist ".git\HEAD.lock"        del /f /q ".git\HEAD.lock"        & echo   - HEAD.lock
if exist ".git\maintenance.lock" del /f /q ".git\maintenance.lock" & echo   - maintenance.lock
for /r ".git" %%F in (*.lock) do del /f /q "%%F" >nul 2>&1
echo Removing leftover temp objects...
for /r ".git\objects" %%F in (tmp_obj_*) do del /f /q "%%F" >nul 2>&1
echo.
echo Checking repository...
git status --short
echo.
echo Done. Now double-click the UPDATE bat again.
echo.
pause
