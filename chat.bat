@echo off
setlocal enabledelayedexpansion

if "%1"=="" (
    echo.
    echo Usage: chat.bat ^<username^>
    echo Example: chat.bat alice
    echo.
    pause
    exit /b 1
)

echo.
echo Starting Offline P2P Terminal Chat...
echo Username: %1
echo.

node cli-chat.js %1

pause
