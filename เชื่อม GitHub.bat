@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo ============================================
echo   NOVA PS HUB - Connect to GitHub
echo ============================================
echo.
echo Repository:
echo    https://github.com/STT-WEB/STT-P-S-Hub.git
echo.

echo [1/4] Clearing any stuck git locks...
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock" >nul 2>&1
if exist ".git\maintenance.lock" del /f /q ".git\maintenance.lock" >nul 2>&1
for /r ".git\objects" %%F in (tmp_obj_*) do del /f /q "%%F" >nul 2>&1
echo.

echo [2/4] Setting the remote address...
git remote set-url origin https://github.com/STT-WEB/STT-P-S-Hub.git 2>nul
if errorlevel 1 git remote add origin https://github.com/STT-WEB/STT-P-S-Hub.git
echo    Current remote:
git remote -v
echo.

echo [3/4] Committing any local changes...
git add -A
git commit -m "connect to GitHub %date% %time%"
echo.

echo [4/4] Pushing to GitHub (first time)...
echo    A sign-in window may appear - use the GitHub account
echo    that owns STT-WEB.
git push -u origin master
if errorlevel 1 goto PUSHFAIL
echo.
echo ============================================
echo   DONE! Code is now backed up on GitHub.
echo.
echo   Open this to check:
echo      https://github.com/STT-WEB/STT-P-S-Hub
echo.
echo   From now on just use the UPDATE bat - it pushes
echo   to GitHub automatically every time.
echo ============================================
echo.
pause
exit /b 0

:PUSHFAIL
echo.
echo *** Push FAILED. Common reasons:
echo ***   1. Not signed in to GitHub yet - a browser window
echo ***      should have opened. Sign in and run this again.
echo ***   2. The repository does not exist or the name is wrong.
echo ***      Check: https://github.com/STT-WEB/STT-P-S-Hub
echo ***   3. No permission on the STT-WEB organization.
echo.
echo *** Tell Candy the red error message above.
echo.
pause
exit /b 1
