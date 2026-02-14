@echo off
title PhantomX Trading Platform
color 0A

echo ============================================
echo   PhantomX — AI Trading Platform
echo ============================================
echo.

:: Navigate to project directory first
cd /d "%~dp0"

:: ---- Prerequisites Check ----

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Node.js is not installed or not on PATH.
    echo         Download from https://nodejs.org/ (v18+ required)
    echo.
    pause
    exit /b 1
)

:: Check Node.js version (need 18+)
for /f "tokens=*" %%v in ('node -e "process.stdout.write(String(process.versions.node.split(\".\")[0]))"') do set NODE_MAJOR=%%v
if "%NODE_MAJOR%"=="" set NODE_MAJOR=0
if %NODE_MAJOR% LSS 18 (
    color 0C
    echo [ERROR] Node.js v18+ required. You have:
    node -v
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js v%NODE_MAJOR% detected.

:: Check Claude Code (required for Agent SDK)
where claude >nul 2>&1
if errorlevel 1 (
    :: Check npm global install
    if not exist "%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\cli.js" (
        color 0E
        echo [WARN] Claude Code not found on PATH or in npm global.
        echo        AI features require Claude Code + Claude Max subscription.
        echo        Install: npm install -g @anthropic-ai/claude-code
        echo.
        echo        Continuing anyway — trading features will work without AI.
        echo.
        timeout /t 3 /nobreak >nul
    )
)

:: Check OAuth credentials
if not exist "%USERPROFILE%\.claude\.credentials.json" (
    if not exist "%USERPROFILE%\.claude\credentials.json" (
        color 0E
        echo [WARN] No Claude OAuth credentials found.
        echo        AI features require: claude login
        echo        (Or use Claude Code at least once to generate credentials)
        echo.
        timeout /t 3 /nobreak >nul
    )
)

color 0A

:: ---- Environment Setup ----

:: Auto-create .env.local if missing
if not exist ".env.local" (
    if exist ".env.example" (
        echo [*] Creating .env.local from .env.example...
        copy /y ".env.example" ".env.local" >nul
        echo [*] Edit .env.local with your Phemex API credentials.
        echo.
    )
)

:: ---- Port Cleanup ----

echo [*] Clearing port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    echo [*] Killing PID %%a on port 3000
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill any orphaned node processes running this project (using tasklist + findstr instead of wmic)
for /f "tokens=2 delims=," %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul ^| findstr /i "node.exe"') do (
    set "PID=%%~a"
)

:: Wait for ports to fully release
timeout /t 2 /nobreak >nul

:: Second pass — kill anything that grabbed 3000 during the wait
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    echo [*] Second-pass kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: Remove stale Next.js dev lock file
if exist ".next\dev\lock" (
    echo [*] Removing stale .next/dev/lock
    del /f /q ".next\dev\lock" >nul 2>&1
)

:: Wait a moment for everything to settle
timeout /t 1 /nobreak >nul

:: ---- Dependencies ----

if not exist "node_modules\" (
    echo [*] Installing dependencies (first run)...
    call npm install
    echo.
)

:: ---- Launch ----

set PORT=3000

echo [*] Starting PhantomX on http://localhost:%PORT% ...
echo [*] Browser will open automatically.
echo [*] Press Ctrl+C to stop the server.
echo.

:: Start a background process to open browser after server is ready
start /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:%PORT%"

:: Launch dev server (this blocks — terminal stays open with server output)
call npx next dev --turbopack -p %PORT%

:: If we get here, the server stopped
echo.
echo ============================================
echo   PhantomX server stopped.
echo ============================================
echo.
echo Press any key to exit...
pause >nul
