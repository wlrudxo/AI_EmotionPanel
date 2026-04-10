@echo off
echo Checking port 3100...
powershell -Command "Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
if not exist "%~dp0core\server\node_modules" (
    cd /d "%~dp0core\server"
    call npm install
)
echo Starting Emotion Panel MCP Server...
start /B node "%~dp0core\server\index.js"
ping -n 3 127.0.0.1 >/dev/null
echo Starting Claude Emotion Viewer...
start "" "%~dp0viewers\tauri\src-tauri\target\release\claude-emotion-viewer.exe"
