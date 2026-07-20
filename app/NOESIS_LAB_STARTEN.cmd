@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

set "NOESIS_MODEL=qwen3:8b"
set "NOESIS_URL=http://localhost:4173/?lab=1"

echo.
echo ============================================================
echo   Noesis Lab - lokaler, reproduzierbarer PC-Messstand
echo ============================================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 goto :missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :missing_node
where ollama.exe >nul 2>&1
if errorlevel 1 goto :missing_ollama

if not exist "node_modules\vite\bin\vite.js" (
  echo FEHLER: Projekt-Abhängigkeiten fehlen.
  echo Einmalig in diesem Ordner ausführen: npm.cmd ci
  goto :failed
)

echo [1/4] Prüfe Ollama unter http://127.0.0.1:11434 ...
powershell.exe -NoProfile -Command "try { $null = Invoke-RestMethod -TimeoutSec 2 http://127.0.0.1:11434/api/version; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo       Ollama läuft noch nicht - starte lokalen Dienst ...
  set "OLLAMA_KEEP_ALIVE=30m"
  set "OLLAMA_CONTEXT_LENGTH=4096"
  set "OLLAMA_MAX_LOADED_MODELS=1"
  set "OLLAMA_NUM_PARALLEL=1"
  start "Noesis Ollama" /min ollama.exe serve
  for /L %%I in (1,1,30) do (
    powershell.exe -NoProfile -Command "try { $null = Invoke-RestMethod -TimeoutSec 1 http://127.0.0.1:11434/api/version; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 goto :ollama_ready
    ping.exe -n 2 127.0.0.1 >nul
  )
  echo FEHLER: Ollama wurde innerhalb von 30 Sekunden nicht bereit.
  echo Prüfe das Fenster "Noesis Ollama" und starte diese Datei erneut.
  goto :failed
)

:ollama_ready
echo [2/4] Prüfe festes Experimentmodell %NOESIS_MODEL% ...
ollama.exe list | findstr /B /I /C:"%NOESIS_MODEL%" >nul
if errorlevel 1 (
  echo.
  echo Das Modell %NOESIS_MODEL% ist noch nicht installiert ^(ca. 5,2 GB^).
  choice.exe /C JN /M "Jetzt einmalig mit Internet herunterladen"
  if errorlevel 2 goto :missing_model
  ollama.exe pull %NOESIS_MODEL%
  if errorlevel 1 goto :failed
)

echo [3/4] Erzeuge den lokalen Produktionsbuild ...
call npm.cmd run build
if errorlevel 1 goto :failed

echo [4/4] Starte Noesis Lab ...
echo.
echo Modell:     %NOESIS_MODEL% ^(Thinking aus; temp 0; seed 42^)
echo App:        %NOESIS_URL%
echo Inferenz:   ausschließlich lokal über Ollama
echo Beenden:    Strg+C in diesem Fenster
echo.
node.exe ".\scripts\offline-server.mjs" --open --lab
if errorlevel 1 goto :failed
exit /b 0

:missing_node
echo FEHLER: Node.js beziehungsweise npm.cmd wurde nicht gefunden.
echo Installiere Node.js LTS und starte diese Datei erneut.
goto :failed

:missing_ollama
echo FEHLER: Ollama wurde nicht gefunden.
echo Installiere Ollama für Windows und starte diese Datei erneut.
goto :failed

:missing_model
echo Abgebrochen. Ohne %NOESIS_MODEL% beginnt das Experiment nicht und nutzt kein Ersatzmodell.
goto :failed

:failed
echo.
pause
exit /b 1
