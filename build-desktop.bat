@echo off
rem Builds the native desktop app: dist\Strata Studio.exe (single file, app embedded).
rem Needs Rust (https://rustup.rs). Re-run after changing anything in index.html, css\, js\, fonts\, vendor\ or models\.
setlocal
cd /d "%~dp0desktop"
cargo build --release || (echo. & echo Build failed. & pause & exit /b 1)
if not exist "%~dp0dist" mkdir "%~dp0dist"
copy /y "target\release\strata-studio.exe" "%~dp0dist\Strata Studio.exe" >nul
echo.
echo Built: %~dp0dist\Strata Studio.exe
echo Share that one file - it runs on Windows 10/11 with nothing to install.
