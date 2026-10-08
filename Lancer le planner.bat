@echo off
chcp 65001 >nul
title Mon petit planner
cd /d "%~dp0"
if not exist node_modules (
  echo Installation des dependances, un instant...
  call npm install
)
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node --disable-warning=ExperimentalWarning server.js
pause
