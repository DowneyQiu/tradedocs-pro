@echo off
setlocal
cd /d "%~dp0"

rem TradeDocs Pro v3.0.0 launcher (bundled-runtime edition). ASCII-only: avoids OEM codepage issues.
rem Lookup order: bundled runtime -> system Python launcher -> system Python -> clear error.
set "PYCMD="

if exist "%~dp0runtime\python\python.exe" (
  "%~dp0runtime\python\python.exe" -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>nul
  if not errorlevel 1 set PYCMD="%~dp0runtime\python\python.exe"
)

if not defined PYCMD (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>nul
    if not errorlevel 1 set "PYCMD=py -3"
  )
)

if not defined PYCMD (
  where python >nul 2>nul
  if not errorlevel 1 (
    python -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>nul
    if not errorlevel 1 set "PYCMD=python"
  )
)

if not defined PYCMD (
  echo.
  echo [ERROR] No usable Python 3.8+ was found, and the bundled runtime is missing.
  echo The folder "runtime\python" must stay next to this launcher.
  echo Re-extract the full delivery ZIP, or install Python 3 from
  echo https://www.python.org/downloads/ with "Add Python to PATH" ticked.
  echo No data was changed.
  echo.
  pause
  exit /b 1
)

echo Starting TradeDocs Pro ...
echo Keep this window open while using the app. Press Ctrl+C to stop safely.
echo.

%PYCMD% server.py %*
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] TradeDocs Pro exited with code %EXITCODE%.
  echo Read the message above. The local database tradedocs.sqlite3 was not deleted.
  pause
) else (
  echo TradeDocs Pro stopped safely. All data remains in tradedocs.sqlite3.
)
exit /b %EXITCODE%
