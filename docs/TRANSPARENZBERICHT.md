# Transparenz-Bericht

**Projekt:** Graph-RAG auf dem Smartphone – Vergleich mit einem manuell kuratierten, Wikipedia-basierten Wissensgraphen  
**Autor:** Sinan Yavuz Adigüzel · **Seminar:** »Let ChatGPT do the work?!« (SoSe 2026, TU Dortmund)  
**Abgabe:** Ende August 2026 · **Status:** Arbeitsfassung – die mit ⬜ markierten Angaben ergänze ich nach Abschluss der Prüfung beziehungsweise der Messläufe.

In diesem Bericht lege ich offen, wie ich Claude und ChatGPT beim Aufbau des Projekts eingesetzt habe. Außerdem dokumentiere ich das Experiment so, dass mein Vorgehen anhand des eingefrorenen Korpus, der Prompts, Parameter und Rohdaten nachvollzogen werden kann.

---

## 1 Mein Einsatz von KI im Arbeitsprozess

Für die **Erstellung** habe ich Claude und ChatGPT ausschließlich über ihre normalen Chatfunktionen genutzt; ich verwendete keine Modell-API als Entwicklungswerkzeug. Der Aufbau erfolgte schrittweise und dialogisch: Ich beschrieb jeweils ein Ziel, ein Problem oder einen Änderungswunsch; die Systeme erzeugten daraufhin Texte und Code und arbeiteten Änderungen an den Projektdateien aus beziehungsweise wandten sie an. Anschließend prüfte ich den Zwischenstand, testete zentrale Funktionen und formulierte auf dieser Grundlage die nächste Korrekturrunde. Davon zu unterscheiden ist der später ergänzte Laufzeitmodus der App: Für die freiwillige QR-Demonstration kann Noesis über eine abgesicherte Supabase-Funktion ein gehostetes Modell ansprechen.

Der KI-Anteil ist substanziell und nicht auf Rechtschreibkorrekturen beschränkt: Claude und ChatGPT erzeugten und überarbeiteten umfangreiche Rohfassungen, Codeblöcke und teilweise vollständige Dateien; ein erheblicher Teil des implementierten Codes geht auf diese promptgesteuerten Chat-Runden zurück. Meine Leistung bestand darin, die Projektidee und Anforderungen vorzugeben, Entscheidungen zu treffen, Widersprüche zu erkennen, Varianten auszuwählen und zusammenzuführen sowie den resultierenden Stand fachlich und technisch zu überprüfen. Für sämtliche Aussagen, den Versuchsaufbau, den ausgeführten Code und die Schlussfolgerungen trage ich die Verantwortung.

| Einsatzzweck | Verwendete Chatfunktion | Beitrag der KI | Mein Beitrag und meine Kontrolle |
|---|---|---|---|
| Forschungsfrage und Versuchsdesign | Claude und ChatGPT | Vorschläge für Abgrenzung, Bedingungen, Hypothesen, Metriken und Auswertung | Ich gab die Projektidee vor, verglich Alternativen und legte das Design fest; die abschließende methodische Prüfung ist ⬜ |
| Softwareentwicklung (`app/`) | Claude und ChatGPT | Erzeugung und promptgesteuerte Anwendung umfangreicher React-/TypeScript-Änderungen für Retrieval-Pipelines, Benutzeroberfläche, Experiment-Runner und Fehlerkorrekturen | Ich formulierte Anforderungen und Änderungswünsche, entschied über Varianten, kontrollierte das Verhalten und führte Builds sowie Tests aus; abschließender Funktionstest ⬜ |
| Live-Sprachdialog | ChatGPT | Entwurf und Implementierung einer Zustandsmaschine für Spracherkennung, Modellantwort, Vorlesen, Pause, Unterbrechung und mobilen Vollbilddialog; außerdem Hinweise auf Browser- und Datenschutzgrenzen | Ich verlangte ein Gesprächserlebnis ähnlich einem modernen Voice-Chat, entschied mich nach Abwägung gegen vorgetäuschtes Voll-Duplex und für den stabileren turn-basierten Ablauf. Ich prüfte Desktop- und Smartphone-Layout, Steuerung und Build; ein Test mit realer Sprache auf meinem S23+ ist noch ⬜ |
| Messkorpus und Wissensgraph | Claude und ChatGPT | Vorschläge für Entitäten, Zusammenfassungen, typisierte Relationen und thematische Zuordnung | Ich wählte die Domäne und kuratierte daraus einen eingefrorenen Graphen auf Grundlage ausgewählter Wikipedia-Inhalte; Faktenprüfung aller Knoten und Kanten ⬜ |
| Fragenkatalog | Claude und ChatGPT | Entwürfe für 40 Fragen, Gold-Antworten, Evidenzpfade und Scoring-Begriffe | Ich prüfte und korrigierte Hop-Tiefen, Beantwortbarkeit und Verteilung; abschließende Einzelprüfung aller Fragen ⬜ |
| Ausarbeitung, Präsentation und Transparenz-Bericht | Claude und ChatGPT | Umfangreiche Textentwürfe, Struktur- und Formulierungsvorschläge | Ich bestimmte Argumentation und Auswahl, überarbeitete die Texte und gleiche sie mit App und Messdaten ab; Endredaktion ⬜ |

**Wichtige Abgrenzung:** Die lokal über WebLLM ausgeführten Sprachmodelle sind im Hauptversuch keine Hilfsmittel für die Erstellung, sondern der **Untersuchungsgegenstand**. Ihre Antworten werden als Messdaten gespeichert und bewertet. Das gehostete Modell des QR-Seminarmodus dient nur der interaktiven Vorführung und wird weder mit diesen Messdaten vermischt noch zur Beantwortung der Forschungsfrage ausgewertet.

### 1.1 Vom Messlabor zum vorzeigbaren Produkt

Eine späte, aber wichtige Iteration entstand aus meiner eigenen Kritik an der App: Obwohl viele Einzelfunktionen vorhanden waren, wirkte die Oberfläche eher wie eine Sammlung technischer Werkzeuge als wie ein klares Endprodukt. Ich entschied deshalb, dass im normalen Vortragsmodus nur das Ergebnis sichtbar sein sollte: ein natürlicher, Wikipedia-angereicherter Wissenschat, der seine Quellen und Beziehungen bei Bedarf offenlegt. Experiment, Bewertung, Modelle, Import und Quiz blieben erhalten, wurden aber hinter einen ausdrücklich wählbaren Studienmodus verschoben.

| Entwicklungsschritt | Ehrliche Hürde | Beitrag von ChatGPT | Meine Entscheidung und Kontrolle |
|---|---|---|---|
| Produktfokus | Die Funktionsfülle verdeckte den eigentlichen Nutzen. | Vorschlag und Umsetzung einer getrennten Produkt- und Studiennavigation sowie eines mehrstufigen Chatverlaufs. | Ich legte fest, dass Gespräch, eigenes Wissen, Wissensraum und Offline-Check die Standardoberfläche bilden. |
| Natürliches Gespräch | Der bisherige Assistent beantwortete nur Einzelfragen und wirkte mit der Demo-Engine nicht wie ChatGPT. | Implementierung von Gesprächshistorie, Anschlussfragen, Streaming, Unsicherheitsregel und Quellenchips. | Ich trenne zwei Vorführwege: lokales WebLLM nach bestandenem Gerätecheck oder den ausdrücklich gekennzeichneten QR-Online-Modus für inkompatible Handys. |
| Live sprechen statt nur diktieren | Der alte Mikrofonknopf nahm nur eine einzelne Frage auf; die erste Browserstimme klang außerdem monoton und las Markdown-Zeichen mit vor. Ein echtes gleichzeitiges Hören und Vorlesen hätte auf Handys Rückkopplungen erzeugt, und die Browser-Spracherkennung arbeitet nicht garantiert lokal. | ChatGPT implementierte den Ablauf „zuhören → transkribieren → Graph-RAG/Modell → vorlesen → erneut zuhören“, Zwischen-Transkripte, Fehlerklassen und Lifecycle-Abbruch. In einer zweiten Iteration ergänzte es Stimmenranking, manuelle Stimmen-/Tempowahl, Satzsegmentierung, kurze Pausen, zurückhaltende Prosodie, echo-sichere Übergabetimer und wahrheitsgemäße Verarbeitungsstatus. | Ich akzeptiere bewusst einen turn-basierten statt eines technisch übertrieben dargestellten Realtime-Audiomodus. Die Verbesserungen steuern Rhythmus und wählen nur vorhandene Stimmen; ihre Grundqualität bleibt vom Gerät abhängig. Im Offline-Modus bleibt das Mikrofon gesperrt, online startet der Browserdienst erst nach informierter Bestätigung. |
| Wikipedia-Anreicherung | Eine bloße Namensnennung oder thematische Ähnlichkeit ist noch keine belastbare Wikipedia-Relation; ein stiller Auto-Abruf könnte zudem privaten Dokumentinhalt preisgeben. | ChatGPT implementierte eine manuelle MediaWiki-Suche mit Auswahl und einen ausdrücklich aktivierbaren Auto-Nachimport. Die Automatik leitet nur lokal belegte Entitätsnamen weiter, nie PDF-/Notiztext. URL, Page-ID, Revision und Import-Scope werden gespeichert; Abruf- und Kantenlimits verhindern unkontrolliertes Wachstum. | Ich verlangte drei sichtbare Zustände: aus, automatische Recherche nur bei Chat-Wissenslücken und gezielte Nutzerauswahl. Wikipedia-Kanten entstehen ausschließlich aus tatsächlich von `prop=links` gelieferten Links; das eingefrorene Experiment bleibt davon getrennt. |
| Natürlichsprachlicher Wissensbefehl | Der Chat konnte zuvor zwar antworten, einen Satz wie „Füge Albert Einstein in deinen Wissensbaum hinzu“ aber nur als Gespräch behandeln. | ChatGPT ergänzte eine deterministische Erkennung mehrerer deutscher Befehlsvarianten, die Wikipedia-Suche, eine sichtbare Auswahl bei mehrdeutigen Treffern und den Sprung zum importierten Graphknoten. | Ich entschied, dass diese Schreibaktion nicht vom geladenen LLM abhängen darf. Erst ein eindeutiger Treffer oder meine Auswahl löst den Import aus; die Bestätigung nennt das tatsächliche Importdelta und die Zahl belegter Kanten. |
| Eigenes lokales Wissen | Der erste PDF-Import schnitt längere Dokumente still ab, verlor Seitenbelege, verband Abschnitte nur nach Reihenfolge und hinterließ bei Reimporten alte Knoten. | Umsetzung von lokalem PDF-Parsing, SHA-256-Fingerprint, Provenienz, atomarem Source-Scope-Reimport und Delta-Bericht. Danach ersetzte ChatGPT die Nachbarschaftskette durch begrenzte TF-IDF-Themen- und Ähnlichkeitskanten mit gespeichertem Score, Schwelle, gemeinsamen Begriffen und Textbelegen. | Ich verlangte, dass Dokument→Abschnitt als Quellenstruktur erhalten bleibt, aber Abschnittsreihenfolge keine inhaltliche Beziehung mehr vortäuscht. Heuristische Kanten sind gestrichelt und ausdrücklich keine Faktenrelation. Paraphrasen ohne gemeinsames Vokabular sowie OCR und komplexes Spaltenlayout bleiben offene Grenzen. |
| Offline-Vortrag | Der erste Service Worker löschte beim Aktualisieren unbeabsichtigt auch fremde Modellcaches und lud die App-Dateien nicht vollständig vor. | Diagnose, versionierter Build-Time-Precache, fester lokaler Starter und sichtbarer Bereitschaftstest. | Ich übernahm den engeren Offline-Anspruch: vollständig lokal erst nach einmaliger Vorbereitung im selben Browserprofil und erfolgreicher Probeantwort bei ausgeschaltetem WLAN. |
| QR-Modus als ehrlicher Fallback | Auf meinem Samsung S23+ scheiterten sowohl Qwen als auch Llama in der WebGPU/Vulkan-Pipeline; ein verlässliches lokales Modell für alle 20 Handys war deshalb unrealistisch. | Implementierung eines getrennten Supabase-/Groq-Pfads, festen Serverprompts, Ablaufdatums, zentralen Rate-Limits und begrenzter strukturierter Prompts. | Ich entschied, den Offline-Hauptversuch beizubehalten, die Publikumsdemo aber transparent online zu erlauben. Persönliche Belege und MediaWiki sind getrennt opt-in; Originaldateien und vollständige Graphen werden nicht übertragen. |
| Prüfung | Ein erfolgreicher TypeScript-Build beweist weder Modellcache noch Bühnenablauf. | Automatisierte Build-, Manifest- und HTTP-Prüfungen sowie eine Preflight-Seite für App-Shell, WebGPU, Speicher, Modell und Probeantwort. | Den abschließenden Flugmodus-Test mit dem konkreten Vortragsgerät muss ich selbst noch durchführen und dokumentieren: ⬜. |

## 2 Reproduzierbarkeit des Experiments

### 2.1 Artefakt, Korpus und Fragenkatalog

- Repository: `GladosV27/Proseminar_new`, Commit des eingefrorenen Messstands: ⬜ `<Commit-Hash>`
- App: `app/` (React + TypeScript), Start: `npm install && npm run dev`
- Messkorpus: `app/src/data/graph.ts` (75 Knoten, 165 typisierte Kanten und fünf manuell zugeordnete thematische Communities, vor den Messläufen eingefroren)
- Herkunft des Korpus: Ich habe Zusammenfassungen, typisierte Relationen und Community-Zuordnungen auf Basis ausgewählter Wikipedia-Inhalte manuell kuratiert und als Messstand eingefroren.
- Fragenkatalog: `app/src/data/questions.ts` (n = 40: 10 Single-Hop-, 14 2-Hop-, 8 3-Hop-, 4 Vergleichs- und 4 unbeantwortbare Fragen), eingefroren am ⬜
- Nutzer-, Import- und Recherchewissen ist technisch vom eingefrorenen Messkorpus getrennt und wird in den Experimentläufen nicht verwendet.

### 2.2 Modelle und Laufzeitumgebung

| Feld | Geplanter beziehungsweise dokumentierter Wert |
|---|---|
| Kernmodelle | Llama 3.2 1B Instruct und Llama 3.2 3B Instruct; genaue WebLLM-IDs und Quantisierung: ⬜ |
| Modellgrenze | höchstens 4 Mrd. Parameter |
| WebLLM-Version | `0.2.79` (in `app/src/engine/llm.ts` festgelegt); im Hauptlauf erneut prüfen |
| Geräte | ⬜ Smartphone (Modell, SoC, RAM, Android-/Chrome-Version) · ⬜ Laptop |
| Decoding | Temperatur 0 · `max_tokens` 220 · identischer System-Prompt in allen Bedingungen |
| Retrieval-Backend der Hauptauswertung | ⬜ dichte Embeddings beziehungsweise TF-IDF gemäß eingefrorenem Protokoll; lokal gebündeltes transformers.js `3.8.1` ist im Code festgelegt |

### 2.3 Bedingungen, Umfang und Reihenfolge

Die drei konfirmatorischen Kernbedingungen sind Baseline, Vektor-RAG und Graph-RAG. Pro Wiederholung entstehen damit je Modell `40 × 3 = 120` Trials. Für zwei Modelle umfasst eine vollständige Wiederholung `40 × 3 × 2 = 240` Trials; bei drei getrennt gespeicherten Wiederholungen sind es insgesamt 720 Kern-Trials. Budget-Kontrolle, Graph−Kanten-Ablation und Hybridbedingung werden, falls ausgeführt, separat als Kontroll- beziehungsweise explorative Läufe ausgewiesen und nicht in diese Kernzahl eingerechnet. Die Ablation hält die graphbasierte Knotenauswahl konstant, entfernt aber die Relationskanten aus dem LLM-Kontext; sie prüft damit den zusätzlichen Nutzen der expliziten Relationsdarstellung.

Jede Wiederholung erhält eine eigene `runId`. Die Fragenreihenfolge wird mit einem dokumentierten Seed reproduzierbar gemischt. Damit nicht immer dieselbe Bedingung zuerst ausgeführt wird, rotiert die Bedingungsreihenfolge für jede Frage und Wiederholung zyklisch in einer Latin-Square-artigen Anordnung. Die drei Wiederholungen werden nicht überschrieben, sondern getrennt gespeichert und exportiert.

### 2.4 Prompts (wörtlich)

- **System-Prompt:** »Du bist ein präziser Wissensassistent auf einem Smartphone. Antworte auf Deutsch, in höchstens drei Sätzen, ohne Spekulation. Wenn der bereitgestellte Kontext (falls vorhanden) die Antwort nicht enthält oder du sie nicht sicher weißt, sage ausdrücklich: ›Dazu habe ich keine gesicherte Information.‹«
- **User-Prompt:** `KONTEXT:\n<Kontext>\n\nFRAGE: <Frage>`; in der Baseline entfällt der Kontextblock.
- Kontextkonstruktion je Bedingung: Ausarbeitung § 4.2; Implementierung: `app/src/engine/{vectorRag,graphRag}.ts` und `app/src/engine/experiment.ts`.

### 2.5 Zeitmessung und Rohdaten

Die End-to-End-Latenz beginnt vor der Kontextkonstruktion beziehungsweise dem Retrieval und endet nach der vollständigen Modellantwort. Zusätzlich werden Retrieval- und Generierungszeit getrennt protokolliert. So umfasst die ausgewiesene End-to-End-Zeit die tatsächlich für einen Trial benötigte Pipeline und nicht nur die Textgenerierung.

- Vollständiger Export aller Trials (JSON und CSV aus der App): ⬜ `docs/daten/…`
- Felder je Trial: `runId`, Wiederholungsnummer, Seed, Position in der Ausführungsreihenfolge, Frage-ID, Bedingung, Retrieval-Backend, Engine, Antwort im Wortlaut, Auto-Score, manuelle Bewertung, End-to-End-, Vorbereitungs-, Retrieval- und Generierungszeit, Kontextgröße in Zeichen, abgerufene Knoten-IDs, Evidenz-Recall/-Präzision und Zeitstempel.
- Technische Probeläufe werden von den Hauptmessdaten getrennt gekennzeichnet und nicht als Ergebnis berichtet.

## 3 Bewertungsprotokoll

- Das regelbasierte Auto-Scoring prüft Muss-Schlüsselbegriffe (`app/src/engine/experiment.ts`) und dient nur der Vorstrukturierung.
- Für die maßgebliche manuelle Bewertung zeigt die App die Antworten in deterministisch gemischter Reihenfolge ohne Bedingung, Engine, Kontext oder Auto-Score.
- Zwei Bewertende (A/B) urteilen unabhängig. Namen beziehungsweise Rollen: ⬜. Cohens κ: ⬜. Abweichende Urteile werden anschließend in der Konfliktliste diskutiert und als Konsens dokumentiert: ⬜ Datum.

### 3.1 Pilot- und Freigabeprotokoll

Vor dem Hauptlauf arbeite ich die Checkliste in [`PILOTPROTOKOLL.md`](PILOTPROTOKOLL.md) ab. Sie trennt Demo- und technische Probeläufe vom Hauptversuch und dokumentiert Messstand, Cache-Zustand, Goldpfadprüfung, Zeitmessung, Speicherung, Verblindung und Export. Erst nach dieser Freigabe dürfen WebLLM-Daten als Studienergebnis interpretiert werden.

## 4 Ergebnisse

Dieser Abschnitt bleibt bis zum Abschluss der echten WebLLM-Messläufe offen. Technische Probeläufe oder Demo-Engine-Ausgaben behandle ich nicht als Studienergebnis.

- H1 (RAG > Baseline): ⬜
- H2 (annähernde Parität bei Single-Hop): ⬜
- H3 (Graph > Vektor bei Multi-Hop; exakter McNemar-Test, Δ mit 95-%-Bootstrap-Konfidenzintervall): ⬜
- H4 (Enthaltungsverhalten bei unbeantwortbaren Fragen): ⬜
- H5 (Ressourcenkosten: p50/p95 der End-to-End-Latenz und Kontextgröße): ⬜
- Abweichungen vom festgelegten Protokoll, jeweils mit Begründung: ⬜

## 5 Bekannte Grenzen und ehrliche Einordnung

Der Umfang entspricht einem Proseminar: ein manuell kuratierter Wissensgraph, eine Sprache, eine Domäne und n = 40 Fragen. Die Stichprobe erlaubt keine allgemeingültige Aussage über Graph-RAG oder Wikipedia insgesamt. Die manuelle Kuratierung verbessert die Kontrolle, begrenzt aber die Übertragbarkeit und kann meine Erwartungen in den Korpus eingebracht haben. Browser- und Smartphone-Latenzen hängen außerdem von Gerät, Hintergrundlast und Temperatur ab. Ich dokumentiere deshalb Gerätebedingungen, Wiederholungen und p50/p95 und berichte auch Null- oder Negativbefunde unverändert. Der Live-Sprachdialog ist eine Bedienfunktion außerhalb des Experiments: Er nutzt die Web-Speech-Schnittstellen des jeweiligen Browsers, ist nicht auf allen Browsern verfügbar und ist weder garantiert offline noch echtes gleichzeitiges Realtime-Audiostreaming. Weitere Limitationen stehen in der Ausarbeitung, Abschnitt 7.

Die fachlichen und technischen Grundlagen wurden zusätzlich in [`QUELLENPRUEFUNG.md`](QUELLENPRUEFUNG.md) gegen Primärquellen geprüft. Diese Literatur begründet aber keine Ergebnisse des eigenen Experiments; dafür zählen ausschließlich exportierte und bewertete Messdaten.

## 6 Erklärung

Ich versichere, dass ich den Einsatz von Claude und ChatGPT in diesem Bericht nach bestem Wissen vollständig und wahrheitsgemäß darstelle. Vor der Abgabe prüfe ich alle übernommenen Inhalte und kennzeichne offene Prüfungen oder Abweichungen. Für den finalen Projektstand und seine Aussagen trage ich die Verantwortung.

Dortmund, den ⬜ · Sinan Yavuz Adigüzel
