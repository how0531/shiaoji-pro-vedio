@echo off
title Shioaji Pro Auto-Builder
cd /d "%~dp0"

echo ===================================================
echo   Shioaji Pro Auto-Build Tool
echo ===================================================
echo.

echo [1/2] Building frontend code (npm run build)...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed! Please check your code for errors.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Creating Desktop Shortcut...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = '%~dp0'.TrimEnd('\'); $ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Shioaji Pro Desktop.lnk')); $s.TargetPath = [System.IO.Path]::Combine($root, 'Shioaji-Pro-Launcher.bat'); $s.WorkingDirectory = $root; $s.Save();"

echo.
echo ===================================================
echo [SUCCESS] Build completed successfully!
echo Shortcut 'Shioaji Pro Desktop' updated on Desktop!
echo ===================================================
echo.
pause
