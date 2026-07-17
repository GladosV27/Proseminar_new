# Graph-RAG Lab 🕸️

**Vergleich von Vektor-RAG und Graph-RAG mit einem kuratierten Wikipedia-basierten Wissensgraphen für On-Device-LLMs** – mein Proseminar-Projekt im Seminar »Let ChatGPT do the work?!« (SoSe 2026, TU Dortmund).

> **Forschungsfrage:** Verbessert Graph-RAG auf einem manuell kuratierten, eingefrorenen Wissensgraphen die Antwortqualität eines On-Device-LLMs (≤ 4 Mrd. Parameter) gegenüber Vektor-RAG und einer kontextfreien Baseline bei Multi-Hop-Fragen – und zu welchen Ressourcenkosten?

## Was ist hier drin?

| Pfad | Inhalt |
|---|---|
| [`app/`](app/) | **Fable / Graph-RAG Lab** – ein natürlicher, Wikipedia-angereicherter Wissenschat und sein wissenschaftlicher Messstand als lokale Web-App (React + TypeScript). Nach der einmaligen Vorbereitung laufen LLM-Inferenz, Retrieval und Speicherung lokal; es gibt keine Server-Inferenz und kein eigenes Backend. |
| [`docs/AUSARBEITUNG.md`](docs/AUSARBEITUNG.md) | Wissenschaftliche Ausarbeitung: Motivation, verwandte Arbeiten, Forschungsfragen & Hypothesen, komplettes Experimentaldesign (Metriken, Statistik, Protokoll), Architektur, Limitationen, Zeitplan, Fragenkatalog. |
| [`docs/TRANSPARENZBERICHT.md`](docs/TRANSPARENZBERICHT.md) | Vorlage für den abzugebenden Transparenz-Bericht (KI-Einsatz + Reproduzierbarkeit). |
| [`docs/Praesentation_Graph-RAG_Schaffungsprozess.pptx`](docs/Praesentation_Graph-RAG_Schaffungsprozess.pptx) | Aktuelle, editierbare Seminarpräsentation: technische Entwicklung und reflektierter KI-Schaffungsprozess als gemeinsamer Erzählbogen. |
| [`docs/PILOTPROTOKOLL.md`](docs/PILOTPROTOKOLL.md) | Vorab festgelegte Checkliste für den technischen Probelauf, die Korpusprüfung und die dokumentierte Entscheidung zum Hauptlauf. |
| [`docs/QUELLENPRUEFUNG.md`](docs/QUELLENPRUEFUNG.md) | Verifizierte Primärquellen für die Ausarbeitung und die Präsentation. |
| [`docs/OFFLINE_BETRIEB.md`](docs/OFFLINE_BETRIEB.md) | Anleitung für den Online-/Offline-Schalter, die einmalige Modellbereitstellung und den Flugmodus-Test. |
| [`docs/VORTRAG_OFFLINE.md`](docs/VORTRAG_OFFLINE.md) | Fester Vortragsablauf mit Build-Time-Precache und lokalem Node-Server auf `localhost:4173` – ohne npm-/npx-Aufruf auf der Bühne. |
| [`docs/LIVE_QUIZ.md`](docs/LIVE_QUIZ.md) | Einrichtung des QR-Code-Live-Quiz mit Supabase Realtime und kostenlosem Cloudflare-Pages-Hosting. |
| [`docs/HAUPTLAUF_CHECKLISTE.md`](docs/HAUPTLAUF_CHECKLISTE.md) | Verbindlicher Freeze-, Mess-, Bewertungs-, Statistik- und Abgabecheck für den empirischen Hauptlauf. |

## Die App in 60 Sekunden

- **Fable Wissensgespräch (Standardansicht)** – natürlicher Multi-Turn-Chat über Philosophie- und Ideengeschichte. Fable löst Anschlussbezüge auf, verbindet passende Graphknoten und legt Quellen auf Wunsch offen. Im Online-Modus recherchiert es echte MediaWiki-Verbindungen bei Wissenslücken und speichert sie lokal; dieses angereicherte Wissen bleibt anschließend offline nutzbar.
- **Zwei bewusst getrennte Oberflächen** – im Vortrags-/Produktmodus sind nur Gespräch, Wissensraum und Offline-Check sichtbar. Ein optionaler Studienmodus öffnet Experiment, Bewertung, Ergebnisse, Modellwahl, Wissensimport und Quiz.
- **Übersicht** – Projekt, Korpus-Statistik, die drei Bedingungen.
- **Graph-Explorer** – interaktiver Wissensgraph (75 Knoten, 165 typisierte Kanten, 5 manuell zugeordnete thematische Communities zur Domäne »Deutscher Idealismus«), Suche, Community-Filter und Knoten-Details. Zusammenfassungen, Relationen und Community-Zuordnungen wurden auf Grundlage ausgewählter Wikipedia-Inhalte manuell kuratiert und für das Experiment eingefroren.
- **Assistent** – Frage stellen, Bedingung umschalten (Baseline / Vektor-RAG / Graph-RAG), Antwort mit offengelegtem Kontext und visualisiertem Subgraph. Mit umschaltbarer Wissensbasis (eingefrorener Korpus vs. erweitert) und **Live-Recherche**: Ist das Gerät online, zieht die App fehlendes Wissen fragegetrieben aus der Wikipedia (Volltextsuche → Sitzungs-Cluster → Antwort mit Quellenangabe; auf Wunsch dauerhaft übernehmbar).
- **Experiment** – 40 stratifizierte Fragen (10 Single-Hop, 14 2-Hop, 8 3-Hop, 4 Vergleich, 4 unbeantwortbar) in den drei konfirmatorischen Bedingungen Baseline, Vektor-RAG und Graph-RAG. Budget-Kontrolle und Hybrid sind klar getrennte Kontroll- bzw. Explorationsläufe. Der Kernversuch umfasst pro Wiederholung `40 × 3 × 2 = 240` Trials für zwei Modelle; drei Wiederholungen werden separat gespeichert (720 Kern-Trials). Fragen werden mit dokumentiertem Seed gemischt, die drei Bedingungsreihenfolgen zyklisch rotiert.
- **Bewerten** – verblindete Doppelbewertung direkt in der App: gemischte Reihenfolge ohne Bedingung/Engine, zwei Bewertende (A/B), Cohens κ live, Konsens-Übernahme und Konfliktauflösung.
- **Ergebnisse** – Genauigkeit nach Hop-Tiefe, Evidenz-Diagnostik (Retrieval- vs. Generierungs-Versagen), End-to-End-Latenz einschließlich Retrieval und Generierung, Kontextgröße, Enthaltungsverhalten; Export als JSON/CSV.
- **Modelle** – lokale LLMs per WebGPU laden (Llama 3.2 1B/3B, Qwen 2.5, Gemma 2, Phi 3.5) oder deterministische Demo-Engine nutzen; dazu wählbares Retrieval-Backend für Vektor-RAG: TF-IDF oder **dichte Embeddings** (multilingual MiniLM via transformers.js, on-device).
- **Wissen füttern** – eigene Notizen oder PDFs vollständig lokal als Dokument- und Abschnittsknoten einpflegen; Dokumentstruktur und explizite Namensnennungen erzeugen nachvollziehbare Kanten. Themen können im Online-Modus über die MediaWiki-API importiert werden; Kanten entstehen dabei ausschließlich aus tatsächlichen MediaWiki-Links. Alle diese Erweiterungen bleiben bewusst außerhalb des Messprotokolls.
- **Pfad-Quiz** – die App würfelt 2–3-Hop-Pfade durch den Graphen als Multiple-Choice-Spiel; zugleich ein unerschöpflicher **Generator für Multi-Hop-Testfragen** mit garantiertem Gold-Evidenzpfad (Export als Katalog-JSON).
- **Live-Quiz** – Kahoot-artiger, vom Experiment getrennter Präsentationsmodus: Host-Raum, QR-Code-Beitritt, Lobby, 18-Sekunden-Timer, Punkte für Tempo und Richtigkeit, Serien und Siegerpodest. Der kostenlose Realtime-Dienst wird nur für diesen Online-Modus genutzt; Details in [`LIVE_QUIZ.md`](docs/LIVE_QUIZ.md).
- **Extras** – 🎙 Sprachmodus (Frage diktieren, Antwort vorlesen – Web Speech API), 🕰 Zeitreise-Slider im Explorer (1650–1900), 📱 QR-Code-Overlay zum Teilen der App, 📸 Chart-Export als PNG, animierte Pfadverfolgung im Subgraphen, haptisches Feedback und Konfetti bei κ ≥ 0,8.

## Starten

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm run build      # Produktions-Build in app/dist (statisch hostbar, z. B. GitHub Pages)
```

Echte LLM-Inferenz benötigt WebGPU (Chrome/Edge ≥ 113, Chrome auf Android). Ohne WebGPU läuft die vollständige Pipeline mit der Demo-Engine.

Die App ist eine **PWA** mit Online-/Offline-Schalter: Nach der einmaligen, dokumentierten Bereitstellung eines Modells und gegebenenfalls der Embeddings läuft der Messmodus ohne Server-Inferenz auf demselben Browserprofil. Wikipedia-Import und Live-Recherche werden im Offline-Modus gesperrt. Die genaue Einrichtung beschreibt [`docs/OFFLINE_BETRIEB.md`](docs/OFFLINE_BETRIEB.md). Ein GitHub-Actions-Workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) deployt sie zu GitHub Pages – dazu in den Repo-Einstellungen unter *Pages* die Quelle „GitHub Actions" wählen (läuft bei Push auf `main` oder manuell per *Run workflow*).

## Design-Entscheidungen (Kurzfassung)

- **Manuell kuratierter, eingefrorener Korpus** mit typisierten Beziehungen → reproduzierbare Struktur und geschlossene Beantwortbarkeit für saubere Hop-Strata. Beide RAG-Bedingungen verwenden dieselben Knotenzusammenfassungen; Graph-RAG ergänzt deren Auswahl um explizit serialisierte Relationen. Das Experiment vergleicht deshalb vollständige Retrieval-Pipelines und nicht ausschließlich eine abstrakte Topologievariable.
- **Privacy by Design:** keine Server-Komponente, keine Telemetrie; Ergebnisse und Nutzerwissen bleiben im localStorage.
- **Transparenz als Feature:** jeder Retrieval-Kontext und jeder extrahierte Subgraph ist in der UI einsehbar – ideal für die Live-Demo im Seminar.

## Wie ich das Projekt aufgebaut habe

Ich habe das Projekt schrittweise und iterativ über die normalen Chatfunktionen von Claude und ChatGPT entwickelt. Ich formulierte Ziele, Anforderungen, Probleme und Änderungswünsche; die Modelle erzeugten daraufhin wesentliche Texte und große Teile des Codes und arbeiteten Änderungen an Projektdateien aus beziehungsweise wandten sie an. Ich wählte die Richtung und Varianten aus, prüfte und testete die Zwischenstände und ließ Fehler in weiteren Chat-Runden korrigieren. Die fachlichen Entscheidungen und die Verantwortung für den finalen Stand liegen bei mir. Eine genauere Aufschlüsselung enthält der [`Transparenz-Bericht`](docs/TRANSPARENZBERICHT.md).

Details und Begründungen: [`docs/AUSARBEITUNG.md`](docs/AUSARBEITUNG.md).

## Studienstatus

Die App, der Korpus und das Auswertungsprotokoll sind vorbereitet. Es werden **keine empirischen Ergebnisse behauptet**, bevor die echten WebLLM-Läufe, die unabhängige Doppelbewertung und der Rohdatenexport abgeschlossen sind. Der reproduzierbare Ablauf dafür steht im [`Pilotprotokoll`](docs/PILOTPROTOKOLL.md); die geprüfte Literaturliste in der [`Quellenprüfung`](docs/QUELLENPRUEFUNG.md).
