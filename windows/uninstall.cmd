@echo off
rem Double-click wrapper that removes frame-keyboard (the task and its files). Restart Steam afterwards.
rem To also delete the .cef-enable-remote-debugging file, run: uninstall.cmd -RemoveFlag
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall %*
echo.
pause
