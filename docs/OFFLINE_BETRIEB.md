# Online- und Offline-Betrieb

Die App ist **offline-first**, aber die Begriffe sind wichtig:

> Fuer den Vortrag nicht den variablen Preview-Server verwenden, sondern die feste Anleitung
> [`VORTRAG_OFFLINE.md`](VORTRAG_OFFLINE.md) mit `VORTRAG_OFFLINE_VORBEREITEN.cmd` und
> `VORTRAG_OFFLINE_STARTEN.cmd` auf `http://localhost:4173/`.

- Der Korpus, Graph- und Vektor-Retrieval, Messdaten, Bewertung und ein bereits bereitgestelltes Modell laufen lokal im Browser.
- Die App-Laufzeiten fuer WebLLM und Transformers.js werden mit dem Produktions-Build lokal ausgeliefert. Sie werden nicht mehr von `esm.run` geladen.
- Modellgewichte und das Embedding-Modell sind grosse Dateien. Sie muessen einmalig im **Online-Modus** geladen und im Browser-Cache gespeichert werden. Danach koennen sie im **Offline-Modus** ohne Server-Inferenz verwendet werden.
- Wikipedia-Import und Live-Recherche sind bewusst Online-Funktionen und werden im Offline-Modus blockiert.

## Der Schalter in der App

Unten links befindet sich ein persistenter Schalter.

| Modus | Erlaubt | Blockiert |
|---|---|---|
| **Offline** (Standard) | eingefrorener Korpus, TF-IDF, Graph-RAG, Auswertung, lokale Daten, bereits gecachte WebLLM-Modelle und Embeddings | Modell- oder Embedding-Nachladen, Wikipedia-Import, Live-Recherche |
| **Online** | einmaliger Modell- und Embedding-Download sowie bewusste Wikipedia-Funktionen | nichts zusaetzlich |

Im Offline-Modus prueft die App vor dem Laden eines WebLLM-Modells, ob dessen Gewichte im Browser-Cache erkannt werden. Diese Vorpruefung garantiert technisch nicht, dass auch Konfiguration, Tokenizer und Runtime vollstaendig vorliegen. Verbindlich ist deshalb erst das vollstaendige Laden plus eine echte Probeantwort bei ausgeschaltetem WLAN. Beim Embedding-Modell ist der Fernzugriff deaktiviert; eine vorhandene Browser-Kopie kann geladen werden, eine fehlende fuehrt zu einer lokalen Fehlermeldung.

## Einmalige Bereitstellung

1. Die Produktionsversion bauen:

   ```powershell
   cd app
   npm.cmd run offline:prepare
   npm.cmd run offline:start
   ```

2. Die feste Adresse `http://localhost:4173/` im Browser oeffnen. Fuer die PWA- und Cache-Funktionen ist die Produktionsversion wichtig; `npm.cmd run dev` ist nur fuer Entwicklung gedacht.

3. Unten links auf **Online** schalten.
4. In **Modelle** genau das Modell laden, das im Versuch genutzt werden soll. Danach das Embedding-Modell laden, wenn die dichte Vektor-Baseline verwendet wird.
5. Warten, bis beide Ladeanzeigen vollstaendig abgeschlossen sind. Die App bittet den Browser anschliessend um persistenten Speicher.
6. Auf **Offline** schalten, die Browserdaten nicht loeschen und die App neu laden. Das Modell muss sich im Offline-Modus erneut aktivieren lassen; die dichte Vektor-Baseline muss sich ohne Download laden lassen.
7. Erst danach das Geraet in den Flugmodus versetzen und einen kompletten Test mit einer Graph-RAG- und einer Vektor-RAG-Frage durchfuehren.

## Grenzen einer Browser-App

Der Browser-Cache ist an Browserprofil und Adresse gebunden. Ein Wechsel von `localhost` zu einer anderen Domain, ein privates Fenster, geloeschte Browserdaten oder Speicherdruck kann die Dateien entfernen. Fuer die Seminar-Praemisse ist deshalb der korrekte Anspruch:

> **Keine Server-Inferenz; nach einmaliger, dokumentierter Bereitstellung offline auf demselben Browserprofil nutzbar.**

Ein vollstaendig air-gapped Paket, das auch ohne vorherigen Browser-Cache auf einem neuen Geraet startet, braeuchte die Modellgewichte und die Modell-WASM-Dateien als lokale Dateien. Je nach Modell sind das etwa 1 bis 4 GB zusaetzlich. Diese Dateien werden nicht in das Repository eingecheckt, weil sie gross sind und eigene Lizenzen haben; sie koennen aber fuer eine spaetere Distribution lokal mitgeliefert werden.

## Regel fuer das Experiment

Die Hauptmessung wird im Offline-Modus auf dem eingefrorenen Korpus ausgefuehrt. Online-Funktionen sind waehrend des Experiments ausgeschaltet; sie gehoeren nur zum Assistenten-Modus ausserhalb des Messprotokolls.
