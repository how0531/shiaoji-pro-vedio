@echo off
title Shioaji Pro Launcher
cd /d "%~dp0"

echo Launching Shioaji Pro Application...

start /b "" npm run preview -- --port 4173 --host 127.0.0.1 >nul 2>&1

timeout /t 2 /nobreak >nul

start msedge.exe --app=http://127.0.0.1:4173 --name="Shioaji Pro"

exit
