@echo off
title Add API Key to .env.local
cd /d "%~dp0"

echo.
echo ============================================
echo   Add API Key (no terminal needed)
echo ============================================
echo.
echo STEP 1: Copy your API key/token (Ctrl+C)
echo STEP 2: Choose which key to add:
echo.
echo   1. WHOIS_API_KEY       (WhoisJSON)
echo   2. PAGESPEED_API_KEY   (Google PageSpeed)
echo   3. RESEND_API_KEY      (Resend email)
echo   4. TWILIO_ACCOUNT_SID  (Twilio)
echo   5. TWILIO_AUTH_TOKEN   (Twilio)
echo   6. TELEGRAM_BOT_TOKEN  (Telegram)
echo   7. APIFY_TOKEN         (Apify)
echo   8. ELEVEN_LABS_API_KEY (ElevenLabs)
echo   9. TWILIO_WHATSAPP_FROM (Twilio sandbox: whatsapp:+1415...)
echo.
set /p choice="Enter number (1-9): "

if "%choice%"=="1" set KEY=WHOIS_API_KEY
if "%choice%"=="2" set KEY=PAGESPEED_API_KEY
if "%choice%"=="3" set KEY=RESEND_API_KEY
if "%choice%"=="4" set KEY=TWILIO_ACCOUNT_SID
if "%choice%"=="5" set KEY=TWILIO_AUTH_TOKEN
if "%choice%"=="6" set KEY=TELEGRAM_BOT_TOKEN
if "%choice%"=="7" set KEY=APIFY_TOKEN
if "%choice%"=="8" set KEY=ELEVEN_LABS_API_KEY
if "%choice%"=="9" set KEY=TWILIO_WHATSAPP_FROM

if "%KEY%"=="" (
  echo Invalid choice.
  pause
  exit /b 1
)

echo.
echo Adding %KEY% from clipboard...
echo.
call npx tsx scripts\set-env-local-key-from-clipboard.ts --key %KEY%
echo.
echo Done. Press any key to close.
pause >nul
