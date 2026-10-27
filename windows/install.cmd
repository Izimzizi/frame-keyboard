@echo off
rem Double-click wrapper for install.ps1 (runs it without changing the system's script policy).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
