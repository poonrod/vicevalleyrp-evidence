@echo off
REM Uninstall Bodycam Companion (stops the app, removes this folder, optional user data).
title Bodycam Companion — Uninstall
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Uninstall failed with code %ERR%.
  pause
  exit /b %ERR%
)
