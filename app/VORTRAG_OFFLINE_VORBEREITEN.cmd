@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   Graph-RAG Lab - Offline-Vortrag vorbereiten
echo ============================================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo FEHLER: Node.js wurde nicht gefunden.
  echo Bitte Node.js vor der Vorbereitung installieren.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo FEHLER: npm.cmd wurde nicht gefunden.
  echo Bitte die Node.js-Installation prüfen.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo FEHLER: Die Projekt-Abhängigkeiten fehlen.
  echo Einmalig MIT Internet in diesem Ordner ausführen:
  echo.
  echo   npm.cmd ci
  echo.
  echo Danach diese Datei erneut starten. Es wird hier nichts automatisch heruntergeladen.
  pause
  exit /b 1
)

echo [1/2] Erzeuge den vollständigen Produktions- und Offline-Build ...
call npm.cmd run offline:prepare
if errorlevel 1 (
  echo.
  echo FEHLER: Der Build ist fehlgeschlagen. Die Meldung oben enthält die Ursache.
  pause
  exit /b 1
)

echo.
echo [2/2] Starte die App für die einmalige Browser- und Modellvorbereitung ...
echo.
echo Im Browser jetzt:
echo   1. Online-Modus aktivieren.
echo   2. Gewünschtes WebLLM-Modell vollständig laden.
echo   3. Falls benötigt: Dense-Embedding-Modell vollständig laden.
echo   4. Offline-Modus aktivieren, neu laden und im Flugmodus testen.
echo.
echo Dieses Fenster hält den lokalen Server offen. Beenden mit Strg+C.
echo.

node.exe ".\scripts\offline-server.mjs" --open
if errorlevel 1 (
  echo.
  echo FEHLER: Der Offline-Server konnte nicht gestartet werden.
  pause
  exit /b 1
)

endlocal
