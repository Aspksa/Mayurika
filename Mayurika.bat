@echo off
setlocal
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Python not found.
  pause
  exit /b 1
)
where tsc >nul 2>nul
if errorlevel 1 (
  if exist "node_modules\.bin\tsc.cmd" (
    set "TSC=node_modules\.bin\tsc.cmd"
  ) else (
    echo TypeScript compiler tsc not found. Install only after approval.
    pause
    exit /b 1
  )
) else (
  set "TSC=tsc"
)
if not exist "frontend\dist" mkdir "frontend\dist"
call %TSC% --project "frontend\tsconfig.json"
if errorlevel 1 (
  echo TypeScript build failed.
  pause
  exit /b 1
)
copy /Y "frontend\index.html" "frontend\dist\index.html" >nul
copy /Y "frontend\style.css" "frontend\dist\style.css" >nul
start "" "http://127.0.0.1:53554"
%PY% "backend\main.py"
endlocal
