@echo off
cd /d "%~dp0deploy"
echo ============================================
echo   NOVA PS HUB - Login to clasp (Google)
echo ============================================
echo A browser window will open.
echo Sign in with the account that OWNS the script:
echo    sasipa@suteetankers.com
echo then allow access.
echo.
call clasp login
echo.
if errorlevel 1 (
  echo *** Login FAILED. Try again or check internet.
) else (
  echo Login OK. Now double-click the UPDATE bat again.
)
echo.
pause
