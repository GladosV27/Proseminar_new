# Graph-RAG Lab 🕸️

**Vergleich von Vektor-RAG und Graph-RAG mit einem kuratierten Wikipedia-basierten Wissensgraphen für On-Device-LLMs** – mein Proseminar-Projekt im Seminar »Let ChatGPT do the work?!« (SoSe 2026, TU Dortmund).

> **Forschungsfrage:** Verbessert Graph-RAG auf einem manuell kuratierten, eingefrorenen Wissensgraphen die Antwortqualität eines On-Device-LLMs (≤ 4 Mrd. Parameter) gegenüber Vektor-RAG und einer kontextfreien Baseline bei Multi-Hop-Fragen – und zu welchen Ressourcenkosten?

## Was ist hier drin?

| Pfad | Inhalt |
|---|---|
| [`app/`](app/) | **Noesis / Graph-RAG Lab** – philosophischer Wissensdialog und wissenschaftlicher Messstand als lokale Web-App (React + TypeScript). Der Messmodus läuft nach der Vorbereitung lokal; für inkompatible Seminar-Handys existiert getrennt ein transparent gekennzeichneter, zeitlich begrenzter QR-Online-Modus. |
| [`docs/AUSARBEITUNG.md`](docs/AUSARBEITUNG.md) | Wissenschaftliche Ausarbeitung: Motivation, verwandte Arbeiten, Forschungsfragen & Hypothesen, komplettes Experimentaldesign (Metriken, Statistik, Protokoll), Architektur, Limitationen, Zeitplan, Fragenkatalog. |
| [`docs/TRANSPARENZBERICHT.md`](docs/TRANSPARENZBERICHT.md) | Vorlage für den abzugebenden Transparenz-Bericht (KI-Einsatz + Reproduzierbarkeit). |
| [`docs/Praesentation_Graph-RAG_Schaffungsprozess.pptx`](docs/Praesentation_Graph-RAG_Schaffungsprozess.pptx) | Aktuelle, editierbare Seminarpräsentation: technische Entwicklung und reflektierter KI-Schaffungsprozess als gemeinsamer Erzählbogen. |
| [`docs/PILOTPROTOKOLL.md`](docs/PILOTPROTOKOLL.md) | Vorab festgelegte Checkliste für den technischen Probelauf, die Korpusprüfung und die dokumentierte Entscheidung zum Hauptlauf. |
| [`docs/QUELLENPRUEFUNG.md`](docs/QUELLENPRUEFUNG.md) | Verifizierte Primärquellen für die Ausarbeitung und die Präsentation. |
| [`docs/OFFLINE_BETRIEB.md`](docs/OFFLINE_BETRIEB.md) | Anleitung für den Online-/Offline-Schalter, die einmalige Modellbereitstellung und den Flugmodus-Test. |
| [`docs/VORTRAG_OFFLINE.md`](docs/VORTRAG_OFFLINE.md) | Fester Vortragsablauf mit Build-Time-Precache und lokalem Node-Server auf `localhost:4173` – ohne npm-/npx-Aufruf auf der Bühne. |
| [`docs/LIVE_QUIZ.md`](docs/LIVE_QUIZ.md) | Einrichtung des QR-Code-Live-Quiz mit Supabase Realtime und kostenlosem Cloudflare-Pages-Hosting. |
| [`docs/SEMINAR_ONLINE.md`](docs/SEMINAR_ONLINE.md) | Datenschutz- und Deployment-Anleitung für den getrennten QR-Seminarmodus mit lokalem Nutzergraphen und gemeinsamem Online-Modell. |
| [`docs/HAUPTLAUF_CHECKLISTE.md`](docs/HAUPTLAUF_CHECKLISTE.md) | Verbindlicher Freeze-, Mess-, Bewertungs-, Statistik- und Abgabecheck für den empirischen Hauptlauf. |

## Die App in 60 Sekunden

- **Noesis · philosophischer Wissensdialog (Standardansicht)** – natürlicher Multi-Turn-Chat über Philosophie- und Ideengeschichte. Der Antwortweg ist direkt zwischen Automatik, Vektor-, Graph- und Hybrid-RAG umschaltbar; jede Antwort zeigt Verfahren, Kontextmenge, Retrieval- und Modellzeit. Für das langsame CPU-Modell nutzt nur dieser Produktchat ein kleineres Evidenzfenster, kürzere Historie und ein engeres Ausgabelimit – der eingefrorene Versuchsaufbau bleibt davon unberührt. Ein eigener Schalter erlaubt automatische Wikipedia-Recherche ausschließlich bei lokalen Wissenslücken; alternativ wählt der Nutzer Artikel manuell. Natürlichsprachliche Befehle wie „Füge Albert Einstein in deinen Wissensbaum hinzu“ starten den Import direkt im Chat; mehrdeutige Treffer werden zur Auswahl angeboten.
- **Live-Gespräch** – ein eigener, mobil optimierter Sprachdialog hört einen Sprachzug, sendet das Transkript an dieselbe transparente Graph-RAG-Pipeline, liest die fertige Antwort vor und öffnet danach automatisch wieder das Mikrofon. Neben Browser-/Systemstimmen lässt sich bewusst die deutsche Piper-Stimme »Thorsten« samt Laufzeit laden (zusammen rund 100 MB); Modell und Laufzeit werden danach lokal im Browser ausgeführt. Pausieren, Stummschalten, Unterbrechen und Beenden sind jederzeit möglich. Die App selbst speichert keine Audiodatei. Die Spracheingabe stammt aber weiterhin aus der Web-Speech-Erkennung des Browsers und kann einen Anbieter-Onlinedienst verwenden; deshalb bleibt das Mikrofon im Noesis-Offline-Modus gesperrt.
- **Zwei bewusst getrennte Oberflächen** – im Vortrags-/Produktmodus sind Gespräch, eigenes Wissen, Wissensraum und Offline-Check sichtbar. Ein optionaler Studienmodus öffnet Experiment, Bewertung, Ergebnisse, Modellwahl, technische Importe und Quiz.
- **Übersicht** – Projekt, Korpus-Statistik, die drei Bedingungen.
- **Graph-Explorer** – frei navigierbarer Wissensgraph mit Hintergrund-Pan, cursorzentriertem Mausrad-Zoom, Pinch-Zoom, einzeln ziehbaren Knoten, Einpassen/Reset, Ebenenfiltern und Knoten-Details. Eine einzelne Kante lässt sich als kontrollierte „Was wäre ohne diese Kante?“-Gegenprobe direkt in die Arena schicken. Der eingefrorene Messgraph umfasst 75 Knoten, 165 typisierte Kanten und 5 manuell zugeordnete Communities.
- **Live-Arena** – verblindeter A/B-Vergleich zweier Retrievalbedingungen und wahlweise der aktiven gegen die extraktive Demo-Engine, jeweils mit Latenz, Kontextgröße und aufklappbarem Evidenzgraph. Zwei große lokale WebLLMs werden aus Speichergründen nicht parallel gehalten. Neben den vorhandenen Ablationen kann die Arena exakt eine im Explorer gewählte Kante aus der rechten Gegenprobe entfernen.
- **Gemeinsamer Seminargraph** – bis zu 20 Handys schlagen über QR-Code Themen vor. Nur der Host kann einen Vorschlag freigeben; erst dann wird der öffentliche Wikipedia-Artikel geprüft und in den lokalen Präsentationsgraphen importiert.
- **Assistent** – Frage stellen, Bedingung umschalten (Baseline / Vektor-RAG / Graph-RAG), Antwort mit offengelegtem Kontext und visualisiertem Subgraph. Mit umschaltbarer Wissensbasis (eingefrorener Korpus vs. erweitert) und **Live-Recherche**: Ist das Gerät online, zieht die App fehlendes Wissen fragegetrieben aus der Wikipedia (Volltextsuche → Sitzungs-Cluster → Antwort mit Quellenangabe; auf Wunsch dauerhaft übernehmbar).
- **Experiment** – 40 stratifizierte Fragen (10 Single-Hop, 14 2-Hop, 8 3-Hop, 4 Vergleich, 4 unbeantwortbar) in den drei konfirmatorischen Bedingungen Baseline, Vektor-RAG und Graph-RAG. Budget-Kontrolle und Hybrid sind klar getrennte Kontroll- bzw. Explorationsläufe. Der Kernversuch umfasst pro Wiederholung `40 × 3 × 2 = 240` Trials für zwei Modelle; drei Wiederholungen werden separat gespeichert (720 Kern-Trials). Fragen werden mit dokumentiertem Seed gemischt, die drei Bedingungsreihenfolgen zyklisch rotiert.
- **Bewerten** – verblindete Doppelbewertung direkt in der App: gemischte Reihenfolge ohne Bedingung/Engine, zwei Bewertende (A/B), Cohens κ live, Konsens-Übernahme und Konfliktauflösung.
- **Ergebnisse** – Genauigkeit nach Hop-Tiefe, Evidenz-Diagnostik (Retrieval- vs. Generierungs-Versagen), End-to-End-Latenz einschließlich Retrieval und Generierung, Kontextgröße, Enthaltungsverhalten; Export als JSON/CSV.
- **Modelle** – auf Android empfohlen: Qwen 2.5 0.5B als echtes lokales GGUF-Modell über WebAssembly/CPU, ausdrücklich ohne WebGPU/Vulkan. Optional stehen die schnelleren WebGPU-Modelle Llama 3.2 1B/3B, Qwen 2.5, Gemma 2 und Phi 3.5 bereit; dazu ein wählbares Retrieval-Backend für Vektor-RAG: TF-IDF oder **dichte Embeddings** (multilingual MiniLM via transformers.js, on-device).
- **Eigenes Wissen** – Notizen oder PDFs lokal als Dokument- und Abschnittsknoten einpflegen. PDF-Abschnitte werden nicht mehr aufgrund ihrer Reihenfolge verbunden: Neben der ehrlichen Dokument→Abschnitt-Struktur entstehen nur eindeutige Namensnennungen und begrenzte, gestrichelt dargestellte TF-IDF-Themenkanten oberhalb fester Schwellen. Score, Schwelle, gemeinsame Begriffe und Belegstellen bleiben einsehbar. Optional kann der Nutzer Wikipedia gezielt durchsuchen oder nach einem Import höchstens drei ausdrücklich erkannte Entitätsnamen einmalig nachladen lassen; privater Dokumenttext wird dabei nie übertragen. Reimporte sind idempotent, und alle Erweiterungen bleiben außerhalb des Messprotokolls.
- **Robuste lokale Speicherung** – eigenes Wissen und Ergebnisse werden versioniert in IndexedDB gespiegelt; `localStorage` bleibt nur als schneller synchroner Start-Snapshot und Rückfall. Der jeweils neuere validierte Stand gewinnt.
- **Technische Qualitätssicherung** – `npm test` prüft natürliche Aktionsbefehle, negative Kommandofälle und einen Graph-RAG-Traversalpfad. GitHub Pages führt die Tests vor jedem Produktions-Build aus. Ein echter Mini-Compute-Test erkennt WebGPU-Geräte, die erst beim Erzeugen einer Compute-Pipeline scheitern.
- **QR-Seminarmodus** – für Geräte ohne funktionierende WebGPU-Pipeline kann ein gemeinsames Online-Modell Antworten formulieren. Import, Speicherung und Retrieval bleiben lokal; eigene Belege sind standardmäßig gesperrt und werden erst nach expliziter Freigabe als begrenzter Kontext übertragen. Raumablauf, zentraler Rate-Limiter und fester Serverprompt schützen den temporären Endpunkt; Einrichtung in [`SEMINAR_ONLINE.md`](docs/SEMINAR_ONLINE.md).
- **Pfad-Quiz** – die App würfelt 2–3-Hop-Pfade durch den Graphen als Multiple-Choice-Spiel; zugleich ein unerschöpflicher **Generator für Multi-Hop-Testfragen** mit garantiertem Gold-Evidenzpfad (Export als Katalog-JSON).
- **Live-Quiz** – Kahoot-artiger, vom Experiment getrennter Präsentationsmodus: Host-Raum, QR-Code-Beitritt, Lobby, 18-Sekunden-Timer, Punkte für Tempo und Richtigkeit, Serien und Siegerpodest. Der kostenlose Realtime-Dienst wird nur für diesen Online-Modus genutzt; Details in [`LIVE_QUIZ.md`](docs/LIVE_QUIZ.md).
- **Extras** – 🕰 Zeitreise-Slider im Explorer (1650–1900), 📱 QR-Code-Overlay zum Teilen der App, 📸 Chart-Export als PNG, animierte Pfadverfolgung im Subgraphen, haptisches Feedback und Konfetti bei κ ≥ 0,8.

## Starten

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm run build      # Produktions-Build in app/dist (statisch hostbar, z. B. GitHub Pages)
```

Echte LLM-Inferenz hat zwei lokale Pfade: WebAssembly/CPU (aktuelles Chrome mit Memory64, kein Vulkan; langsamer) und WebGPU (schneller, aber treiberabhängig). Scheitert der WebGPU-Compute-Vortest, bleibt das CPU-Modell ein echtes lokales LLM; die extraktive Demo-Engine ist nur die zusätzliche deterministische Referenz.

Die App ist eine **PWA** mit Online-/Offline-Schalter: Nach der einmaligen, dokumentierten Bereitstellung eines Modells und gegebenenfalls der Embeddings läuft der Messmodus ohne Server-Inferenz auf demselben Browserprofil. Wikipedia-Import, Live-Recherche und der nicht garantiert lokale Browser-Sprachdienst werden im Offline-Modus gesperrt. Der klar getrennte `?seminar=…`-Link verwendet dagegen bewusst das zeitlich begrenzte Online-Modell. Die genaue Offline-Einrichtung beschreibt [`docs/OFFLINE_BETRIEB.md`](docs/OFFLINE_BETRIEB.md). Ein GitHub-Actions-Workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) deployt sie zu GitHub Pages – dazu in den Repo-Einstellungen unter *Pages* die Quelle „GitHub Actions" wählen (läuft bei Push auf `main` oder manuell per *Run workflow*).

## Design-Entscheidungen (Kurzfassung)

- **Manuell kuratierter, eingefrorener Korpus** mit typisierten Beziehungen → reproduzierbare Struktur und geschlossene Beantwortbarkeit für saubere Hop-Strata. Beide RAG-Bedingungen verwenden dieselben Knotenzusammenfassungen; Graph-RAG ergänzt deren Auswahl um explizit serialisierte Relationen. Das Experiment vergleicht deshalb vollständige Retrieval-Pipelines und nicht ausschließlich eine abstrakte Topologievariable.
- **Privacy by Design:** keine Telemetrie; Ergebnisse, Originaldateien und Nutzergraph bleiben im Browser. Im optionalen QR-Modus werden nur nach transparenter Anzeige und ausdrücklicher Freigabe begrenzte, lokal ausgewählte Belegauszüge an das Seminar-Modell übertragen. Der Sprachdialog legt separat offen, dass der Browser das Mikrofonsignal zur Erkennung an einen eigenen Dienst übertragen kann.
- **Transparenz als Feature:** jeder Retrieval-Kontext und jeder extrahierte Subgraph ist in der UI einsehbar – ideal für die Live-Demo im Seminar.

## Wie ich das Projekt aufgebaut habe

Ich habe das Projekt schrittweise und iterativ über die normalen Chatfunktionen von Claude und ChatGPT entwickelt. Ich formulierte Ziele, Anforderungen, Probleme und Änderungswünsche; die Modelle erzeugten daraufhin wesentliche Texte und große Teile des Codes und arbeiteten Änderungen an Projektdateien aus beziehungsweise wandten sie an. Ich wählte die Richtung und Varianten aus, prüfte und testete die Zwischenstände und ließ Fehler in weiteren Chat-Runden korrigieren. Die fachlichen Entscheidungen und die Verantwortung für den finalen Stand liegen bei mir. Eine genauere Aufschlüsselung enthält der [`Transparenz-Bericht`](docs/TRANSPARENZBERICHT.md).

Details und Begründungen: [`docs/AUSARBEITUNG.md`](docs/AUSARBEITUNG.md).

## Studienstatus

Die App, der Korpus und das Auswertungsprotokoll sind vorbereitet. Es werden **keine empirischen Ergebnisse behauptet**, bevor die echten WebLLM-Läufe, die unabhängige Doppelbewertung und der Rohdatenexport abgeschlossen sind. Der reproduzierbare Ablauf dafür steht im [`Pilotprotokoll`](docs/PILOTPROTOKOLL.md); die geprüfte Literaturliste in der [`Quellenprüfung`](docs/QUELLENPRUEFUNG.md).
