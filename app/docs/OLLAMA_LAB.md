# Noesis Lab: lokaler PC-Messstand mit Ollama

Das wissenschaftliche Web-Lab und die mobile Noesis-App sind bewusst getrennt. Das Lab läuft auf dem PC unter
`http://localhost:4173`, verwendet Ollama unter `http://127.0.0.1:11434` und sendet keine Experimentfragen an einen
Cloudanbieter. Die GitHub-Pages-Ausgabe ist **nicht** der Ollama-Messstand.

## Einmalige Vorbereitung

1. Node.js LTS und [Ollama für Windows](https://docs.ollama.com/windows) installieren.
2. Im Ordner `app` einmalig `npm.cmd ci` ausführen.
3. `ollama pull qwen3:8b` ausführen. Das Q4_K_M-Modell belegt rund 5,2 GB.
4. Danach genügt ein Doppelklick auf `NOESIS_LAB_STARTEN.cmd`.

Der Starter prüft Node, npm, Ollama und das Modell, erzeugt einen Produktionsbuild und öffnet das lokale Lab. Fehlt
das Modell, fragt er vor dem einmaligen Download nach. Während eines Experiments gibt es keinen stillen Fallback auf
WebLLM, Demo-Engine oder eine Online-API.

## Eingefrorener Messstand

| Parameter | Wert |
|---|---:|
| Modell | `qwen3:8b` |
| Thinking | `false` |
| Temperatur | `0` |
| Seed | `42` |
| Kontextfenster | `4096` Tokens |
| maximale Ausgabe | `160` Tokens |
| Keep-alive | `30m` |
| Parallelität | ein Trial nach dem anderen |

Qwen3 unterstützt laut [Ollama-Dokumentation](https://docs.ollama.com/capabilities/thinking) explizit einen
Nicht-Thinking-Pfad. `keep_alive` hält das Modell zwischen Trials im Speicher; dadurch wird die einmalige Ladezeit
nicht in jeden Trial hineingetragen. Die Parameter `num_ctx` und `seed` sind Teil der offiziellen
[Ollama-Runtimeoptionen](https://docs.ollama.com/modelfile).

Vor jedem Lauf werden `/api/version`, `/api/tags` und das konkrete Modell geprüft. Anschließend wärmt ein leerer
Generate-Aufruf das Modell vor. Pro Trial werden zusätzlich gespeichert:

- Modell-Tag und unveränderlicher Digest
- Ollama-Version und Quantisierung
- alle oben genannten Inferenzparameter
- Ausführungsgerät und Browser
- TTFT, Prompt-/Ausgabetokens und Tokens pro Sekunde
- Modell-, Prompt- und Gesamtdauer aus der Ollama-Antwort

Die Felder `modelProvenance` und `generationMetrics` sind Bestandteil von JSON, Abgabe-Paket und CSV (Schema 4) und
bleiben beim Import auf einen anderen Rechner erhalten.

## Fortsetzen nach einem Abbruch

Noesis legt vor dem ersten Trial einen lokalen Checkpoint an. Nach jedem erfolgreichen Trial werden die Ergebnisse
sofort gespeichert. Nach Browserneustart oder Modellfehler verwendet „Durchlauf fortsetzen“ dieselbe `runId` und
überspringt nur exakt passende Kombinationen aus Wiederholung, Frage und Bedingung. Ändern sich Modell-Digest,
Parameter, Retrievalmodus, Bedingungen, Wiederholungszahl oder Seed, wird stattdessen ein neuer Lauf angelegt.

„Neuen Lauf anlegen“ verwirft nur den Checkpoint. Bereits gemessene Teilergebnisse bleiben mit ihrer alten `runId`
erhalten und können transparent exportiert oder gelöscht werden.

## Performance und Hardware ehrlich prüfen

Auf dem vorgesehenen Rechner (Ryzen 7 5700X, 32 GB RAM, RX 6900 XT 16 GB, Ollama 0.32.1) beantwortete `qwen3:8b`
im kleinen technischen Smoke-Test 5/5 Kontrollfragen inhaltlich plausibel. Nach dem Warm-up lag die Antwortzeit im
Mittel bei 1,076 s und die Dekodierung bei 41,6 Tokens/s; der Kaltstart lag bei rund 10,1 s. `gemma4:e4b` erreichte
manuell ebenfalls 5/5, brauchte im Mittel aber 1,435 s und rund 20,3 s Kaltstart (51,9 Tokens/s). Deshalb bleibt Qwen
für das zeitkritische Lab der pragmatische Default. **n=5 ist nur ein Smoke-Test**, kein belastbarer wissenschaftlicher
Modellvergleich; die Werte dürfen nicht als Hauptergebnis präsentiert werden.

Mit `ollama ps` lässt sich während eines Laufs die Spalte `PROCESSOR` prüfen. Die App zeigt ergänzend die von
`/api/ps` gemeldete VRAM-Residenz, behauptet daraus aber nicht automatisch ein bestimmtes Backend. Bei der RX 6900 XT
kann Ollama unter Windows Vulkan verwenden; das muss am Vortragsrechner real geprüft und im Transparenzbericht als
beobachteter Runtimepfad, nicht als allgemeine Garantie, dokumentiert werden.

## Warum 4096 statt maximalem Kontext?

Der eingefrorene Korpus und die kurzen Antworten benötigen kein 40K-Fenster. Ein kleineres `num_ctx` reduziert den
KV-Cache, verbessert die Geschwindigkeit und hält alle Bedingungen auf demselben Budget. Wird später ein längeres
Fenster untersucht, ist das ein neuer Messstand und darf nicht in denselben Run gemischt werden.
