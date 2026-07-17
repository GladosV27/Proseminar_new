# Online- und Offline-Betrieb

Die App ist **offline-first**, aber die Begriffe sind wichtig:

> Fuer den Vortrag nicht den variablen Preview-Server verwenden, sondern die feste Anleitung
> [`VORTRAG_OFFLINE.md`](VORTRAG_OFFLINE.md) mit `VORTRAG_OFFLINE_VORBEREITEN.cmd` und
> `VORTRAG_OFFLINE_STARTEN.cmd` auf `http://localhost:4173/`.

- Der Korpus, Graph- und Vektor-Retrieval, Messdaten, Bewertung und ein bereits bereitgestelltes Modell laufen lokal im Browser.
- Die App-Laufzeiten fuer WebLLM, die Vulkan-unabhaengige WebAssembly/CPU-Engine und Transformers.js werden mit dem Produktions-Build lokal ausgeliefert. Sie werden nicht von einem Inferenzserver geladen.
- Modellgewichte und das Embedding-Modell sind grosse Dateien. Sie muessen einmalig im **Online-Modus** geladen und im Browser-Cache gespeichert werden. Danach koennen sie im **Offline-Modus** ohne Server-Inferenz verwendet werden.
- Manuelle Wikipedia-Suche, der ausdrücklich aktivierte Nachimport nach Text/PDF und die automatische Chat-Recherche bei Wissenslücken sind bewusst getrennte Online-Funktionen und werden im Offline-Modus blockiert. Bereits gespeicherte Wikipedia-Auszüge bleiben lokal nutzbar.
- Der Textchat kann offline laufen; der optionale Live-Sprachdialog bleibt im Offline-Modus gesperrt. Die App kann nicht garantieren, dass die Web-Spracherkennung oder gewählte Vorlesestimme des Browsers ohne einen Anbieter-Onlinedienst funktioniert.

## Der Schalter in der App

Unten links befindet sich ein persistenter Schalter.

| Modus | Erlaubt | Blockiert |
|---|---|---|
| **Offline** (Standard) | eingefrorener Korpus, TF-IDF, Graph-RAG, Auswertung, lokale Daten, bereits gecachte CPU-/WebLLM-Modelle und Embeddings | Modell- oder Embedding-Nachladen, Wikipedia-Import, Live-Recherche |
| **Online** | einmaliger Modell- und Embedding-Download sowie bewusste Wikipedia-Funktionen | nichts zusaetzlich |

Im Offline-Modus prueft die App vor dem Laden eines CPU- oder WebLLM-Modells, ob dessen Gewichte vollstaendig im Browser-Speicher erkannt werden. Beim CPU-Modell wird die etwa 491 MB grosse GGUF-Datei per wllama in OPFS/Browser-Speicher abgelegt; die Inferenz wird mit `n_gpu_layers: 0`, einem CPU-Thread und einem Kontextfenster von 4096 Tokens erzwungen. Uebergrosse Graph-Prompts werden reproduzierbar gekuerzt, wobei die Frage am Ende erhalten bleibt. Damit beruehrt dieser Pfad weder WebGPU noch Vulkan. Verbindlich ist trotzdem erst das vollstaendige Laden plus eine echte Probeantwort bei ausgeschaltetem WLAN. Beim Embedding-Modell ist der Fernzugriff deaktiviert; eine vorhandene Browser-Kopie kann geladen werden, eine fehlende fuehrt zu einer lokalen Fehlermeldung.

## Einmalige Bereitstellung

1. Die Produktionsversion bauen:

   ```powershell
   cd app
   npm.cmd run offline:prepare
   npm.cmd run offline:start
   ```

2. Die feste Adresse `http://localhost:4173/` im Browser oeffnen. Fuer die PWA- und Cache-Funktionen ist die Produktionsversion wichtig; `npm.cmd run dev` ist nur fuer Entwicklung gedacht.

3. Unten links auf **Online** schalten.
4. In **Modelle** auf dem Smartphone zuerst **Qwen 2.5 0.5B Instruct · CPU** waehlen. Dieser Pfad ist die robuste Empfehlung bei `VK_ERROR_UNKNOWN`. WebGPU-Modelle nur verwenden, wenn der GPU-Compute-Vortest erfolgreich ist. Danach das Embedding-Modell laden, wenn die dichte Vektor-Baseline verwendet wird.
5. Warten, bis beide Ladeanzeigen vollstaendig abgeschlossen sind. Die App bittet den Browser anschliessend um persistenten Speicher.
6. Auf **Offline** schalten, die Browserdaten nicht loeschen und die App neu laden. Das Modell muss sich im Offline-Modus erneut aktivieren lassen; die dichte Vektor-Baseline muss sich ohne Download laden lassen.
7. Erst danach das Geraet in den Flugmodus versetzen und einen kompletten Test mit einer Graph-RAG- und einer Vektor-RAG-Frage durchfuehren.

## Grenzen einer Browser-App

Der Browser-Cache ist an Browserprofil und Adresse gebunden. Ein Wechsel von `localhost` zu einer anderen Domain, ein privates Fenster, geloeschte Browserdaten oder Speicherdruck kann die Dateien entfernen. Fuer die Seminar-Praemisse ist deshalb der korrekte Anspruch:

> **Keine Server-Inferenz; nach einmaliger, dokumentierter Bereitstellung offline auf demselben Browserprofil nutzbar.**

Ein vollstaendig air-gapped Paket, das auch ohne vorherigen Browser-Cache auf einem neuen Geraet startet, braeuchte die Modellgewichte und die Modell-WASM-Dateien als lokale Dateien. Je nach Modell sind das etwa 0,5 bis 4 GB zusaetzlich. Diese Dateien werden nicht in das Repository eingecheckt, weil sie gross sind und eigene Lizenzen haben; sie koennen aber fuer eine spaetere Distribution lokal mitgeliefert werden.

### Android-Pfad ohne Vulkan

Auf dem Samsung S23+ kann WebGPU vom Browser angeboten werden, waehrend Dawn beim Erstellen einer Vulkan-Compute-Pipeline mit `VK_ERROR_UNKNOWN` abbricht. Das ist kein Fehler der konkreten Qwen- oder Llama-Gewichte. Deshalb bietet Noesis zusaetzlich Qwen 2.5 0.5B Instruct (Q4_K_M, Apache-2.0) ueber wllama/llama.cpp an. Der einmalige Download umfasst rund 491 MB; waehrend der Inferenz sollten etwa 1 bis 1,5 GB RAM frei sein. Die CPU-Ausgabe ist merklich langsamer als WebGPU, bleibt aber echte lokale generative Inferenz und nicht die extraktive Demo-Engine.

### Zusatzgrenze des Sprachdialogs

Der Schalter **Offline** kontrolliert Noesis-eigene Netzfunktionen wie Recherche und Downloads, aber nicht die interne Implementierung der Web-Speech-API durch den Browser. Deshalb startet Noesis in diesem Modus gar keine Spracherkennung. Die App selbst speichert keine Audiodatei. Nach bewusster Online-Freigabe kann das Mikrofonsignal je nach Browser und Betriebssystem dennoch zur Erkennung an den jeweiligen Anbieter gehen; auch die Verfuegbarkeit und Grundqualität einer Vorlesestimme ist geraeteabhaengig. Noesis kann vorhandene deutsche Stimmen priorisieren und der Nutzer kann Stimme sowie Tempo auswählen; Satzsegmentierung und Pausen verbessern den Rhythmus, ersetzen aber keine hochwertige Systemstimme. Fuer einen belastbaren Flugmodus-Nachweis wird deshalb ausschließlich der normale Textchat verwendet.

## Regel fuer das Experiment

Die Hauptmessung wird im Offline-Modus auf dem eingefrorenen Korpus ausgefuehrt. Online-Funktionen sind waehrend des Experiments ausgeschaltet; sie gehoeren nur zum Assistenten-Modus ausserhalb des Messprotokolls.
