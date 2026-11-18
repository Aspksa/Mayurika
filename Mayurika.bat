@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "launcher.py"
    goto :finish
)
where python >nul 2>nul
if not errorlevel 1 (
    python "launcher.py"
    goto :finish
)
echo Python 3 not found.
:finish
if errorlevel 1 pause
endlocal
