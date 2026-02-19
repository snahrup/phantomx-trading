@echo off
chcp 65001 >nul 2>&1
title PhantomX Trading Platform
color 0A

echo ============================================
echo   PhantomX - AI Trading Platform
echo ============================================
echo.

:: Navigate to project directory (where this script lives)
cd /d "%~dp0"

:: ---- Prerequisites ----

where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Node.js is not installed or not on PATH.
    echo         Download from https://nodejs.org/ ^(v18+ required^)
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node.js %%v

:: ---- Environment ----

if not exist ".env.local" (
    if exist ".env.example" (
        echo [*] Creating .env.local from .env.example...
        copy /y ".env.example" ".env.local" >nul
        echo [!] Edit .env.local with your Phemex API credentials.
        echo.
    )
)

:: ---- Kill anything on port 3000 ----

echo [*] Clearing port 3000...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo     Killing PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Second pass (stubborn processes)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Remove stale Next.js lock
if exist ".next\dev\lock" del /f /q ".next\dev\lock" >nul 2>&1

:: ---- Dependencies ----

if not exist "node_modules\" (
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        color 0C
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo.
)

:: Verify next is actually installed
if not exist "node_modules\.bin\next.cmd" (
    echo [*] Next.js not found, running npm install...
    call npm install
    if errorlevel 1 (
        color 0C
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

:: ---- Launch ----

set PORT=3000
set NEXT_TELEMETRY_DISABLED=1

echo.
echo ============================================
echo   Starting on http://localhost:%PORT%
echo   Press Ctrl+C to stop
echo ============================================
echo.

:: Open browser after a delay (background)
start "" /b cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:%PORT%"

:: Run next dev directly via node_modules (most reliable on Windows)
node_modules\.bin\next.cmd dev -p %PORT%

:: Server exited
echo.
color 0C
echo ============================================
echo   Server stopped.
echo ============================================
echo.
echo Troubleshooting:
echo   1. npm install
echo   2. rmdir /s /q .next
echo   3. Check errors above
echo.
pause
