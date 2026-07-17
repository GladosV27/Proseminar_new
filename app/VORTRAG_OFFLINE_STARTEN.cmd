@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   Graph-RAG Lab - Offline-Vortragsmodus
echo ============================================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo FEHLER: Node.js wurde nicht gefunden.
  echo Der Vortragsserver benötigt nur die bereits installierte Node.js-Laufzeit.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo FEHLER: app\dist\index.html fehlt.
  echo Bitte vor dem Vortrag VORTRAG_OFFLINE_VORBEREITEN.cmd ausführen.
  pause
  exit /b 1
)

if not exist "dist\sw.js" (
  echo FEHLER: app\dist\sw.js fehlt.
  echo Bitte vor dem Vortrag VORTRAG_OFFLINE_VORBEREITEN.cmd ausführen.
  pause
  exit /b 1
)

echo Starte ausschließlich lokale Dateien unter http://localhost:4173/ ...
echo Es werden weder npm noch npx ausgeführt und nichts heruntergeladen.
echo Beenden mit Strg+C.
echo.

node.exe ".\scripts\offline-server.mjs" --open
if errorlevel 1 (
  echo.
  echo FEHLER: Der Offline-Server konnte nicht gestartet werden.
  pause
  exit /b 1
)

endlocal
