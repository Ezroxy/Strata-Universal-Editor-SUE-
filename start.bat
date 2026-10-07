@echo off
rem Strata Studio launcher — starts the local server and opens the app in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "Strata Studio server" /min node server.js
  timeout /t 1 /nobreak >nul
  start "" "http://localhost:5178"
) else (
  echo Node.js not found - opening the app directly from disk instead.
  start "" "%~dp0index.html"
)
