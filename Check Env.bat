@echo off
title Check Environment Variables
cd /d "%~dp0"

echo.
echo Checking required API keys...
echo.
call npx tsx scripts\check-env.ts
echo.
echo Press any key to close.
pause >nul
