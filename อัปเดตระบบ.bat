@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo ============================================
echo    NOVA PS HUB - Update System
echo    (git backup + clasp push + deploy)
echo ============================================
echo.

echo [1/4] Backup (Git local + GitHub cloud)...
git add -A
git commit -m "update %date% %time%"
git push origin master
if errorlevel 1 echo    (WARNING: GitHub push failed - local commit is still saved)
echo.

echo [2/4] Upload ALL code files (clasp push)...
cd deploy
call clasp push -f
if errorlevel 1 goto PUSHFAIL
echo.

echo [3/4] Find deployment id...
set "DEPID="
if exist ".deployid" set /p DEPID=<.deployid
if "!DEPID!"=="" (
  echo    No deployment yet - creating the first one...
  call clasp deploy -d "first release"
  if errorlevel 1 goto DEPLOYFAIL
  for /f "tokens=2" %%A in ('clasp deployments ^| findstr /C:"AKfycb" ^| findstr /V "@HEAD"') do set "DEPID=%%A"
  if "!DEPID!"=="" goto NOID
  > .deployid echo !DEPID!
  echo    Saved deployment id: !DEPID!
  goto DONE
)
echo    Using deployment id: !DEPID!
echo.

echo [4/4] Publish new version (clasp deploy)...
call clasp deploy -i !DEPID! -d "auto update"
if errorlevel 1 goto DEPLOYFAIL

:DONE
echo.
echo ============================================
echo    DONE! Code uploaded + new version published.
echo.
echo    NEXT - THIS IS THE ONLY REAL PROOF:
echo    1. Close ALL app tabs
echo    2. Open the web app fresh
echo    3. Press Ctrl+Shift+R
echo    4. Check the version badge at top-right went UP
echo.
echo    If the badge did NOT change = it did NOT go live.
echo ============================================
echo.
pause
exit /b 0

:PUSHFAIL
echo.
echo *** ERROR: clasp push FAILED - code was NOT uploaded.
echo *** Most common cause = clasp login expired.
echo *** Fix: double-click the CLASP LOGIN bat, then run this again.
echo.
pause
exit /b 1

:DEPLOYFAIL
echo.
echo *** ERROR: clasp deploy FAILED - live app was NOT updated.
echo *** Manual way: Apps Script editor - Deploy - Manage deployments
echo ***             - Edit - Version: New version - Deploy
echo.
pause
exit /b 1

:NOID
echo.
echo *** ERROR: could not read the deployment id.
echo *** Run this in the deploy folder and tell Candy what it prints:
echo ***    clasp deployments
echo.
pause
exit /b 1
