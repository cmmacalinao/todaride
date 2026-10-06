@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
call npx vite --mode isolated --port 5200 --strictPort
