# Graph-RAG auf dem Smartphone

## Vektor-RAG und Graph-RAG mit einem kuratierten Wikipedia-basierten Wissensgraphen – Konzept, Systemarchitektur und Experimentaldesign

**Sinan Yavuz Adigüzel** · TU Dortmund, Fakultät für Informatik
Proseminar »Let ChatGPT do the work?! KI-Anwendungen in Kontexten der Journalistik und Informatik« · SoSe 2026
Begleitartefakt: **Graph-RAG Lab** (React-Web-App, `app/` in diesem Repository)

**Arbeitsweise:** Ich habe das Projekt iterativ über die normalen Chatfunktionen von Claude und ChatGPT aufgebaut. In aufeinanderfolgenden Dialogen habe ich Ziele, Anforderungen, Fehler und Änderungswünsche formuliert. Die Modelle haben daraufhin wesentliche Texte und große Teile des Codes erzeugt und Änderungen an Projektdateien ausgearbeitet beziehungsweise angewandt. Ich habe die Richtung vorgegeben, Varianten ausgewählt, Zwischenstände geprüft und getestet und weitere Korrekturrunden angestoßen. Die fachlichen Entscheidungen und die Verantwortung für den finalen Stand liegen bei mir. Details dokumentiere ich im Transparenz-Bericht.

---

## Abstract

Kleine Sprachmodelle (1–4 Mrd. Parameter) können heute lokal auf Smartphones inferieren – privat und nach dem initialen Modell- und Bibliotheksdownload auch offline, aber mit lückenhaftem Faktenwissen und hoher Halluzinationsneigung. Retrieval-Augmented Generation (RAG) kann fehlendes Wissen nachladen; klassisches Vektor-RAG liefert jedoch isolierte Textfragmente und kann Schwierigkeiten bekommen, wenn eine Antwort die *Verkettung* mehrerer Fakten erfordert (Multi-Hop). Ich untersuche deshalb, ob **Graph-RAG** auf einem manuell kuratierten und eingefrorenen Wissensgraphen die Antwortqualität von On-Device-LLMs bei Multi-Hop-Fragen stärker verbessert als Vektor-RAG, und zu welchen Ressourcenkosten. Dafür habe ich ein lokal ausführendes Messinstrument entwickelt: WebGPU-Inferenz via WebLLM, einen Wikipedia-basierten Korpus »Deutscher Idealismus« mit 75 Knoten und 165 typisierten Kanten sowie einen stratifizierten Katalog aus 40 Fragen einschließlich Halluzinations-Proben. Das vorab festgelegte Auswertungsprotokoll umfasst gepaarte Tests, verblindete Doppelbewertung und Enthaltungsmetriken. Erwartet wird ein *Interaktionseffekt*: annähernde Parität bei Single-Hop-Fragen und ein wachsender Graph-RAG-Vorsprung mit steigender Hop-Tiefe – möglicherweise um den Preis größerer Kontexte und höherer Latenz. Diese Erwartungen sind Hypothesen und keine bereits erhobenen Ergebnisse.

---

## 1 Motivation: Kluge Modelle, leeres Gedächtnis

Zwei Entwicklungslinien laufen derzeit aufeinander zu. Erstens sind Sprachmodelle der 1–4-Milliarden-Parameter-Klasse (Gemma, Phi, Llama 3.2, Qwen 2.5) so effizient geworden, dass sie auf handelsüblichen Smartphones in Echtzeit laufen [4, 5]. Zweitens wächst das Bedürfnis nach *privater* KI: Gesundheitsfragen, persönliche Notizen, journalistische Recherchen mit Quellenschutz – Anwendungsfälle, in denen kein Wort das Gerät verlassen soll.

On-Device-Modelle lösen das Privatheitsproblem, erben aber ein anderes: Ihr parametrisches Faktenwissen ist dünn und sie halluzinieren, statt Wissenslücken einzugestehen. Der naheliegende Ausweg ist Retrieval-Augmented Generation [2]: Wissen wird nicht ins Modell trainiert, sondern zur Laufzeit als Kontext nachgeladen.

Das dominante Verfahren – **Vektor-RAG** – zerlegt einen Korpus in Chunks, bettet sie ein und reicht die k ähnlichsten Fragmente an das Modell weiter. Es hat eine bekannte strukturelle Schwäche: Die Chunks sind *isoliert*. Eine Frage wie

> *»Welcher dänische Philosoph hörte in Berlin die Vorlesungen von Hegels ehemaligem Tübinger Stubengenossen?«*

verlangt die Kette Hegel → (Stubengenosse) → Schelling → (Berliner Vorlesungen 1841) → Kierkegaard. Kein einzelner Chunk enthält diese Kette; die Ähnlichkeitssuche findet Fragmente *über* Hegel und *über* Berlin, aber die verbindende Struktur geht im Chunking verloren. **Graph-RAG** [1] setzt genau hier an: Wissen wird als Graph aus Entitäten und typisierten Relationen repräsentiert, Retrieval wird zur Traversierung, und die Beziehungen bleiben im Kontext *explizit* erhalten.

Für meinen Messkorpus habe ich ausgewählte Wikipedia-Inhalte nicht als fertige Graphstruktur übernommen. Ich habe Entitäten und Zusammenfassungen ausgewählt, Beziehungen als typisierte Kanten kuratiert, fünf thematische Communities manuell zugeordnet und diesen Stand vor den Messläufen eingefroren. Die Leitidee lautet: **Topologie macht kleines Wissen groß** – die explizite Struktur eines kompakten Korpus könnte teilweise ersetzen, was kleinen Modellen an parametrischem Weltwissen fehlt.

## 2 Verwandte Arbeiten

- **RAG** [2] begründete das Paradigma, parametrisches Wissen durch nicht-parametrisches Retrieval zu ergänzen; die Standardimplementierung nutzt dichte Embeddings über Text-Chunks.
- **GraphRAG** [1] (Microsoft Research) extrahiert mit LLM-Unterstützung einen Entitätsgraphen aus einem Korpus, clustert ihn hierarchisch (Leiden) und beantwortet Fragen über Community-Zusammenfassungen. Die Arbeit zielt auf *globale* Sensemaking-Fragen über große Korpora auf Serverhardware; die vorliegende Arbeit überträgt den Kerngedanken (Struktur + Communities) auf das entgegengesetzte Regime: *lokale* Multi-Hop-Fragen, kleines Modell, Smartphone.
- **HippoRAG** [6] verbindet einen offenen Wissensgraphen mit Personalized PageRank für Multi-Hop-Retrieval in einem einzigen Schritt und zeigt deutliche Gewinne auf Multi-Hop-Benchmarks (MuSiQue, 2WikiMultiHopQA) – starke Evidenz dafür, dass Strukturinformation genau dort wirkt, wo diese Arbeit sie vermutet.
- **Phi-3** [5] und **Gemma** [4] dokumentieren, dass Modelle dieser Größenklasse auf Telefonen lauffähig sind; **WebLLM/MLC** [8] stellt die WebGPU-Inferenz bereit, die das Begleitartefakt nutzt.
- **Multi-Hop-QA-Benchmarks** wie HotpotQA [7] etablieren die Fragenkonstruktion mit Gold-Evidenzpfaden, die der hiesige Katalog auf Deutsch und im geschlossenen Korpus nachbildet.

Ich adressiere damit folgende Lücke: Graph-RAG und Vektor-RAG wurden bisher überwiegend mit großen Modellen auf Serverhardware verglichen. Ob *kleine* Modelle unter *On-Device-Restriktionen* (begrenztes Kontextfenster, begrenzter RAM, Latenzbudget) von Struktur profitieren – und ob sie es *stärker* tun als größere Modelle, weil ihnen mehr parametrisches Wissen fehlt –, ist offen.

## 3 Forschungsfragen und Hypothesen

**Hauptforschungsfrage (RQ):**

> Verbessert Graph-RAG auf einem manuell kuratierten, eingefrorenen und Wikipedia-basierten Wissensgraphen die Antwortqualität eines On-Device-LLMs (≤ 4 Mrd. Parameter) gegenüber Vektor-RAG und einer kontextfreien Baseline bei Multi-Hop-Fragen – und zu welchen Ressourcenkosten?

Aufgefächert in vier präzise Teilfragen:

- **RQ1 (Qualität × Hop-Tiefe):** Wie verändert sich der Qualitätsunterschied zwischen Graph-RAG und Vektor-RAG mit der Hop-Tiefe der Frage (1, 2, 3 Hops, Vergleichsfragen)?
- **RQ2 (Halluzinationsresistenz):** Verändern die Bedingungen das Verhalten bei *unbeantwortbaren* Fragen – enthält sich das Modell, oder konfabuliert es?
- **RQ3 (Ressourcen):** Welche Kosten entstehen pro Bedingung in Latenz (p50/p95), Kontextgröße (Zeichen) und Modell-/Indexgröße?
- **RQ4 (Modellgrößen-Sensitivität):** Profitiert ein 1-Mrd.-Modell relativ stärker von Graph-Struktur als ein 3-Mrd.-Modell? (These: Struktur substituiert parametrisches Wissen.)

**Hypothesen** (gerichtet, vor der Datenerhebung festgelegt):

| # | Hypothese | Prüfgröße |
|---|---|---|
| H1 | Beide RAG-Bedingungen schlagen die Baseline in der Gesamtkorrektheit deutlich. | Korrektheitsrate gesamt |
| H2 | Bei Single-Hop-Fragen sind Vektor-RAG und Graph-RAG annähernd gleichauf. | Korrektheit im Stratum S1 |
| H3 | **Kernhypothese:** Bei 2- und 3-Hop-Fragen ist Graph-RAG Vektor-RAG überlegen; der Abstand wächst mit der Hop-Tiefe (Interaktionseffekt Bedingung × Hop-Tiefe). | Korrektheit S2/S3, gepaart je Frage |
| H4 | Graph-RAG erhöht die korrekte Enthaltungsrate bei unbeantwortbaren Fragen (der leere/degenerierte Subgraph ist ein nutzbares »Ich-weiß-nichts«-Signal). | Enthaltungsrate im Stratum S5 |
| H5 | Graph-RAG kostet mehr: größere Kontexte und höhere End-to-End-Latenz als Vektor-RAG. | p50/p95-Latenz, Kontextgröße |

Als erwartetes Gesamtbild lege ich vor der Datenerhebung das Trade-off-Diagramm aus meiner Projektpräsentation zugrunde: Graph-RAG oben rechts (mehr Qualität, mehr Ressourcen), mit dem entscheidenden Zusatz, dass ein möglicher Qualitätsgewinn *selektiv* bei Multi-Hop-Fragen auftritt. Bleibt dieser Interaktionseffekt aus, ist das ebenso berichtenswert: Dann genügt Vektor-RAG in diesem Versuchsaufbau möglicherweise auch on-device und der zusätzliche Graph-Aufwand wäre nicht gerechtfertigt.

## 4 Studiendesign

### 4.1 Korpus: ein eingefrorener, Wikipedia-basierter Wissensgraph

Als Messkorpus verwende ich den thematischen Wissensgraphen **»Deutscher Idealismus«**: 75 Knoten (31 Personen, 19 Werke, 12 Konzepte, 8 Orte/Institutionen, 5 Ereignisse) und 165 typisierte Kanten (`lehrer_von`, `verfasste`, `kritisierte`, `nachfolger_von`, `studierte_an`, `ehe_mit`, …). Ich habe die Knoten fünf thematischen Communities zugeordnet (Kritische Philosophie · Hochidealismus Jena/Tübingen · Jenaer Frühromantik · Weimarer Klassik · Kritiker & Nachhegelianer) und diese Zuordnung als Teil des Messkorpus eingefroren. Der Korpus deckt auch die Vorgeschichte (Leibniz, Wolff, Lessing) und Ausläufer (Stirner, Heine, Nietzsche) der Epoche ab. Jeder Knoten trägt eine enzyklopädische Kurzzusammenfassung von zwei bis vier Sätzen; Zusammenfassungen und Relationen beruhen auf ausgewählten Wikipedia-Inhalten und werden vor dem Einfrieren einzeln geprüft.

Ich habe Inhalte, typisierte Kanten und Community-Zuordnungen bewusst **manuell kuratiert und eingefroren** (versioniert im Repository). Das ist eine methodische Entscheidung:

1. **Reproduzierbarkeit:** Wikipedia ändert sich täglich; ein eingefrorener Korpus hält die Eingabedaten und Retrieval-Grundlage konstant. Laufzeitmessungen und Modellantworten können trotzdem technisch streuen.
2. **Kontrolle der Konfundierung:** Vektor-RAG und Graph-RAG verwenden dieselben Knoten-Zusammenfassungen – sie sind zugleich die Vektor-Chunks. Graph-RAG serialisiert zusätzlich kuratierte Relationslabels. Die Budget-Kontrolle reduziert Unterschiede in der Kontextmenge, kann den Unterschied der Darstellungsform aber nicht eliminieren. Entsprechend interpretiere ich das Ergebnis als Vergleich zweier Retrieval-Pipelines.
3. **Geschlossene Beantwortbarkeit:** Für jede Testfrage ist per Konstruktion bekannt, ob und über welchen Evidenzpfad sie aus dem Korpus beantwortbar ist – die Voraussetzung für saubere Hop-Stratifizierung und für Halluzinations-Proben.

Die Domäne ist ideal für Multi-Hop-Konstruktionen: dichte, gut dokumentierte Beziehungen (Lehrstuhl-Nachfolgen, Stubengenossen, Streit-Ereignisse) und zugleich hinreichend Nischenwissen, bei dem kleine Modelle ohne Kontext erwartbar scheitern.

### 4.2 Bedingungen (unabhängige Variable, within-subjects)

In meinem Within-Subjects-Design durchläuft jede Frage alle Bedingungen mit **demselben Modell, demselben System-Prompt, Temperatur 0 und demselben Token-Limit**. Planmäßig variiert vor allem die Konstruktion des Retrieval-Kontexts:

| Bedingung | Kontextkonstruktion |
|---|---|
| **B0 · Baseline** | Kein Kontext. Misst parametrisches Wissen und Konfabulationsneigung. |
| **B1 · Vektor-RAG** | Top-k (k = 4) Chunks nach Kosinus-Ähnlichkeit. Zwei implementierte, per Schalter wählbare Backends über derselben Schnittstelle: TF-IDF (deterministisch, überall lauffähig) und **dichte Embeddings** (multilingual MiniLM-L12 via transformers.js, vollständig on-device). Die Hauptauswertung nutzt die dichten Embeddings – TF-IDF matcht nur Wortstämme und wäre gegenüber den absichtlich paraphrasierenden Multi-Hop-Fragen (»der Verfasser der Phänomenologie«) eine unfair schwache Baseline; H3 wäre dann nicht identifiziert. Keinerlei Strukturinformation. |
| **B2 · Graph-RAG** | (1) Entity-Linking der Frage auf Knotentitel/Aliasse → Seeds; (2) gescorte Breitensuche (Beam 4, Tiefe 3, max. 14 Knoten) – Kanten werden bevorzugt, deren Relation/Zielknoten lexikalisch zur Frage passen; (3) Linearisierung des Subgraphen als Tripel-Liste (»Hegel — übernahm 1818 den Berliner Lehrstuhl von → Fichte«) plus Zusammenfassungen der Pfadknoten. Die feste Tiefe 3 gilt für alle Fragen und verwendet keine Gold-Labels. |
| **B1b · Vektor-RAG (Budget-Kontrolle)** | Wie B1, aber k wird pro Frage erhöht, bis das Zeichenbudget dem Graph-Kontext **derselben Frage** möglichst nahekommt. Die Bedingung reduziert die Konfundierung »mehr Text statt Struktur«: Graph-Kontexte können größer als vier Vektor-Chunks sein; ohne diese Kontrolle wäre ein möglicher Graph-Vorsprung nicht sicher von einem Mengeneffekt zu unterscheiden. Wegen ganzer Chunks ist die Angleichung nur näherungsweise, und die Darstellungsform (isolierte Chunks gegenüber Tripeln plus Zusammenfassungen) bleibt verschieden. |
| **B2a · Graph−Kanten (Ablation)** | Verwendet exakt die vom Graph-Index ausgewählten Knoten und ihre Zusammenfassungen, entfernt aber die serialisierten Relationskanten aus dem Modellkontext. Der Vergleich B2 gegen B2a isoliert den zusätzlichen Beitrag expliziter Relationsdarstellung; die Knotenauswahl bleibt graphbasiert und wird deshalb nicht als vollständige »kein Graph«-Kontrolle interpretiert. |
| **B3 · Hybrid (Exploration)** | Subgraph (B2) plus bis zu drei zusätzliche Vektor-Chunks, die der Subgraph nicht enthält. Testet Fehlerkomplementarität: Gewinnen Vektor- und Graph-Retrieval bei *verschiedenen* Fragetypen, ist die Kombination beiden überlegen – die Designempfehlung wäre dann ein Query-Router statt eines Entweder-oder. |

B0–B2 sind die konfirmatorischen Kernbedingungen (H1–H5); B1b und B2a werden getrennt als Kontrollen ausgewertet, B3 explorativ. Der System-Prompt instruiert ausdrücklich zur Enthaltung bei fehlender Evidenz (»Dazu habe ich keine gesicherte Information«) – die Voraussetzung für die Messung von RQ2.

### 4.3 Fragenkatalog (n = 40, stratifiziert)

Der Katalog (vollständig in Anhang A und `app/src/data/questions.ts`) ist entlang des minimalen Gold-Evidenzpfads stratifiziert:

| Stratum | n | Definition | Beispiel |
|---|---|---|---|
| S1 · Single-Hop | 10 | Fakt in einer Zusammenfassung bzw. einer Kante | »In welcher Stadt wurde Hegel geboren?« |
| S2 · 2-Hop | 14 | genau eine Zwischenentität nötig | »An welcher Universität lehrte der Verfasser der ›Phänomenologie des Geistes‹ zuletzt?« |
| S3 · 3-Hop | 8 | zwei Zwischenentitäten nötig | »Welcher dänische Philosoph hörte die Vorlesungen von Hegels ehemaligem Stubengenossen?« |
| S4 · Vergleich/Aggregation | 4 | mehrere Evidenzstücke kombinieren | »Nenne Hegels drei Universitäten in chronologischer Reihenfolge.« |
| S5 · Unbeantwortbar | 4 | Antwort nicht im Korpus; korrekt ist die Enthaltung | »Welches Thema hatte Hegels Dissertation?« |

Jede Frage trägt: Gold-Antwort, Gold-Evidenzpfad (Knoten-IDs), Muss-Schlüsselbegriffe für das automatische Scoring und ggf. das Enthaltungsflag. S5 enthält bewusst eine anachronistische Fangfrage (»Hegels Aufsatz über künstliche Intelligenz«) als härteste Konfabulations-Probe.

Bei 40 Fragen × 3 Kernbedingungen entstehen je Modell und Wiederholung 120 Trials. Mit zwei Modellgrößen umfasst eine vollständige Wiederholung 240 Kern-Trials; drei getrennt gespeicherte Wiederholungen ergeben 720 Kern-Trials. Werden Budget-Kontrolle und Hybridbedingung zusätzlich ausgeführt, entstehen je vollständiger Wiederholung 400 und bei drei Wiederholungen 1200 Trials; diese Zusatzläufe werden getrennt von der konfirmatorischen Kernanalyse ausgewiesen.

### 4.4 Abhängige Variablen und Messung

**Primär – Antwortqualität:**
- *Korrektheit* (korrekt / teilweise / falsch / Enthaltung): zweistufig gemessen. Stufe 1 ist ein regelbasiertes Auto-Scoring gegen Muss-Schlüsselbegriffe (konservativ, transparent, in der App implementiert). Stufe 2 ist die **verblindete Doppelbewertung**, für die die App einen eigenen Bewertungsmodus mitbringt (Ansicht »Bewerten«): Antworten erscheinen in deterministisch gemischter Reihenfolge *ohne* Bedingung, Engine, Kontext oder Auto-Score; zwei Bewertende (A/B) urteilen unabhängig, Cohens κ wird live berechnet, Konsens wird als maßgeblicher Score übernommen und Konflikte werden explizit aufgelöst. Die Verblindung ist nicht Kosmetik, sondern Konstruktvalidität: Wer System und Hypothese kennt, bewertet Grenzfälle sonst systematisch zugunsten der erwarteten Bedingung. Die manuelle Bewertung ist maßgeblich, das Auto-Scoring dient der Vorstrukturierung und der Live-Ansicht.
- *Halluzinationsrate* (S5): Anteil unbeantwortbarer Fragen, bei denen das Modell eine substantielle (falsche) Antwort erfindet statt sich zu enthalten.
- *Enthaltungspräzision* (S1–S4): Anteil unnötiger Enthaltungen bei eigentlich beantwortbaren Fragen – die Gegenmetrik, damit »immer schweigen« nicht als Erfolg zählt.

**Diagnostisch – Retrieval-Qualität (erklärt *warum* eine Bedingung gewinnt):**
- *Evidenz-Recall:* Anteil der Gold-Pfad-Knoten, die im übergebenen Kontext enthalten sind.
- *Evidenz-Präzision:* Anteil des übergebenen Kontexts, der zum Gold-Pfad gehört (misst Distraktor-Ballast).
- Beide Metriken werden **pro Trial automatisch** erhoben (die App vergleicht Gold-Pfad und abgerufene Knoten-IDs) und erlauben die zentrale bedingte Analyse *Genauigkeit gegeben vollständige Evidenz*: Sie trennt Retrieval-Versagen (Evidenz fehlte im Kontext → Pipeline-Problem) von Generierungs-Versagen (Evidenz war da, das Modell hat sie nicht genutzt → Kontexttreue-Grenze kleiner Modelle, RQ4). Damit ist jedes Ergebnismuster – auch ein Nullbefund – ursächlich erklärbar statt nur beobachtbar.

**Ressourcen (RQ3):**
- End-to-End-Latenz pro Trial vom Beginn der Kontextkonstruktion beziehungsweise des Retrievals bis zum Ende der Modellantwort (p50/p95), zusätzlich getrennt nach Retrieval- und Generierungsanteil;
- Kontextgröße in Zeichen (ein exakter Tokenwert wäre modell- und tokenizerabhängig und wird in der aktuellen App nicht erhoben);
- Modell- und Indexgröße auf dem Gerät (MB), Peak-RAM soweit auslesbar.

### 4.5 Statistische Auswertung

Das Design ist vollständig **gepaart** (jede Frage in jeder Bedingung). Vorab festgelegt:

1. **Primärtest (H3):** Graph-RAG vs. Vektor-RAG auf der binarisierten Korrektheit (korrekt vs. nicht korrekt) der Multi-Hop-Strata S2∪S3 (n = 22 Paare) mit dem **exakten McNemar-Test**; Effektstärke als Differenz der Korrektheitsanteile mit 95-%-Bootstrap-Konfidenzintervall (Resampling über Fragen, 10 000 Iterationen).
2. **Sekundärtests:** H1 (jede RAG-Bedingung vs. Baseline, gesamt), H2 (S1), H4 (S5) analog; **Holm-Korrektur** über die Testfamilie, α = 0,05.
3. **Interaktion (RQ1):** deskriptiv als Genauigkeitsprofil über die Hop-Tiefe je Bedingung (das zentrale Diagramm der App) – bei n = 40 wäre ein formales logistisches Mischmodell überparametrisiert.
4. **Kontroll- und Explorationsanalysen:** B1b vs. B2 (gleiches Kontextbudget) prüft, ob ein Graph-Vorsprung nach Ausgleich der Kontextmenge bestehen bleibt – erst dann ist er der *Struktur* zuzuschreiben. B3 wird deskriptiv ausgewertet (Fehlerüberlappung: Wie viele Fragen löst nur Vektor, nur Graph, beide, keiner?); ein komplementäres Fehlerprofil motiviert den Query-Router als Designkonsequenz.
5. **Transparenz statt Signifikanz-Theater:** Bei Proseminar-Stichprobengröße ist die Power für kleine Effekte gering. Berichtet werden daher grundsätzlich Effektstärken mit Konfidenzintervallen und alle Einzelantworten (JSON/CSV-Export der App als Anhang des Transparenz-Berichts); p-Werte sind Ergänzung, nicht Ergebnis.

### 4.6 Modelle und Geräte

| Rolle | Modell | Parameter |
|---|---|---|
| Klein | Llama 3.2 1B Instruct (q4f16) | 1,2 Mrd. |
| Groß | Llama 3.2 3B Instruct (q4f16) | 3,2 Mrd. |
| Ergänzend | Qwen 2.5 1.5B · Gemma 2 2B · Phi 3.5 mini | 1,5–3,8 Mrd. |

Inferenz via **WebLLM/MLC** (WebGPU) direkt im Browser – identischer Code auf Laptop und Android-Smartphone. Nach einer dokumentierten Bereitstellung von Modell und Embeddings auf demselben Browserprofil läuft die Messung ohne Server-Inferenz im Offline-Modus. Online-Funktionen sind dabei gesperrt; Details stehen in `OFFLINE_BETRIEB.md`. Primärgerät ist ein Android-Smartphone (Chrome ≥ 121, WebGPU); ein Laptop dient als Zweitgerät für die Latenz-Gegenprobe. Die Modellpaarung 1B/3B beantwortet RQ4 über den Vergleich der *Deltas*: Δ(Graph−Vektor) bei 1B vs. bei 3B.

Zusätzlich enthält die App eine deterministische **Demo-Engine** (extraktiver Antworter ohne neuronales Modell) für technische Probeläufe der Pipeline. Ihre Ausgaben sind keine Ergebnisse des Hauptversuchs und werden nicht in die Hypothesentests aufgenommen.

### 4.7 Ablaufprotokoll

1. **Technischer Probelauf:** Mit einer kleinen, vorab dokumentierten Teilmenge prüfe ich Prompt-Verständlichkeit, Token-Limits, Speicherung und Zeitmessung. Diese Ausgaben werden als Probelauf markiert, nicht als Ergebnis ausgewertet; anschließend friere ich Korpus, Fragen und Codeversion ein.
2. **Hauptdurchlauf:** Pro Modell und Wiederholung werden `40 × 3 = 120` Kern-Trials ausgeführt, für zwei Modelle also 240. Ich plane drei Wiederholungen und damit insgesamt 720 Kern-Trials. Jede Wiederholung wird mit eigener `runId`, Wiederholungsnummer und eigenem Export gespeichert, sodass frühere Läufe nicht überschrieben werden.
3. **Reihenfolgekontrolle:** Die Fragenreihenfolge wird mit einem dokumentierten Seed reproduzierbar gemischt. Die Reihenfolge von Baseline, Vektor-RAG und Graph-RAG rotiert für jede Frage und Wiederholung zyklisch in einer Latin-Square-artigen Anordnung, damit Aufwärm-, Akku- oder Thermikeffekte nicht immer dieselbe Bedingung treffen.
4. **Bewertung:** Export → Verblindung → unabhängige Doppelbewertung → κ → Konsens.
5. **Auswertung:** vorab festgelegte Tests, Diagramme (Genauigkeit × Hop-Tiefe, End-to-End-Latenz, Enthaltungsmatrix) und Fehleranalyse. Für jeden Graph-RAG-Fehlschlag prüfe ich qualitativ, ob das Linking, die Traversierung oder die Generierung die wahrscheinliche Ursache war.

## 5 Systemarchitektur

Das Begleitartefakt **Graph-RAG Lab** implementiert die komplette wissenschaftliche Pipeline als lokale Web-App (React + TypeScript). Der folgende Aufbau beschreibt ausschließlich den reproduzierbaren Offline-Messmodus:

```
┌────────────────────────────── Smartphone / Browser ──────────────────────────────┐
│                                                                                  │
│  Kuratierter Messgraph (eingefroren, versioniert) Nutzerwissen (optional)        │
│  75 Knoten · 165 Kanten · 5 manuelle Communities  Notizen · Import · Recherche   │
│        │                                                        │                │
│        └──────────────┬─────────────────────────────────────────┘                │
│                       ▼                                                          │
│              Arbeitsgraph (in-memory)                                            │
│              │                        │                                          │
│  VectorIndex (TF-IDF | Dense-MiniLM)   GraphIndex (Adjazenz + Namensindex)       │
│              │                        │                                          │
│   B1: Top-k-Chunks          B2: Linking → Beam-Traversal → Subgraph              │
│   B1b: Budget-Kontrolle     B3: Hybrid (Subgraph + Chunks)                       │
│              │                        │                                          │
│              └────────┬───────────────┘          B0: (kein Kontext)              │
│                       ▼                                                          │
│               Prompt-Assembler (System-Prompt · Kontext · Frage)                 │
│                       ▼                                                          │
│         LLM-Engine-Schnittstelle                                                 │
│         ├─ WebLLM/MLC (WebGPU, lokal): Llama 3.2 · Qwen · Gemma · Phi            │
│         └─ Demo-Engine (extraktiv, deterministisch)                              │
│                       ▼                                                          │
│   Experiment-Runner: E2E-/Retrieval-/Generierungszeit · Kontextgröße ·           │
│   Evidenz-Recall/-Präzision ·                                                     │
│   Auto-Score · verblindete Doppelbewertung (κ) im Bewertungsmodus                │
│                       ▼                                                          │
│   Ergebnis-Dashboard (Genauigkeit × Hop-Tiefe · Evidenz-Diagnostik ·             │
│   Ressourcen) · JSON/CSV-Export                                                  │
│                       ▼                                                          │
│               localStorage (alles bleibt auf dem Gerät)                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Für die interaktive QR-Demonstration auf Smartphones mit inkompatibler WebGPU-Pipeline existiert zusätzlich ein **klar getrennter, zeitlich begrenzter Seminar-Online-Modus**. Auch dort bleiben Dateiimport, Speicherung und Graph-Retrieval lokal; erst beim Senden gehen Frage, kurzer Verlauf und ein begrenzter Graphkontext an eine Supabase Edge Function und das gehostete Modell. Persönliche Text-/PDF-Belege und eine optionale MediaWiki-Suche sind standardmäßig ausgeschaltet und erfordern getrennte Freigaben. Dieser Modus ist kein Teil der Messläufe oder Hypothesentests; technische Details und Transparenztext stehen in `SEMINAR_ONLINE.md`.

Als Bedienoberfläche besitzt Noesis außerdem einen **turn-basierten Live-Sprachdialog**. Nach einem Informationsschritt und einer bewussten Mikrofonfreigabe führt die App abwechselnd Spracherkennung, dieselbe Graph-RAG-/Modellpipeline wie im Textchat und Browser-Sprachausgabe aus; danach beginnt der nächste Sprachzug. Diese Halbduplex-Entscheidung verhindert, dass das Handy seine eigene Vorlesestimme erneut als Frage erkennt. Sie ist nicht mit einer voll-duplex Realtime-Audioverbindung gleichzusetzen. Für eine weniger roboterhafte Ausgabe entfernt die App nicht sprechbare Markdown-Elemente, segmentiert Sätze und Teilsätze, setzt kurze Pausen und eine zurückhaltende Frageprosodie und priorisiert höherwertig bezeichnete deutsche Stimmen. Stimme und Tempo sind im Dialog wählbar. Diese Maßnahmen verbessern Rhythmus und Verständlichkeit, können aus einer schwachen Gerätestimme aber keine neue neuronale Stimme erzeugen. Die Web-Speech-Spezifikation lässt sowohl server- als auch clientbasierte Implementierungen zu [9]. Die App speichert selbst keine Audiodatei, kann aber technisch nicht garantieren, dass Browser oder Betriebssystem Spracherkennung und Sprachausgabe lokal statt über eigene Onlinedienste verarbeiten. Deshalb bleibt die Spracherkennung im Noesis-Offline-Modus gesperrt. Der Sprachmodus ist eine Demonstrations- und Bedienfunktion, kein Faktor oder Messinstrument des Experiments.

Beim Import **eigenen Wissens** bleibt die Dokument→Abschnitt-Kante als überprüfbare Quellenstruktur bestehen; die frühere Kette „Abschnitt 1 → Abschnitt 2 → …“ wurde entfernt. Inhaltliche Verbindungen entstehen lokal aus eindeutigen Entitätsnennungen oder aus einer konservativen TF-IDF-Heuristik: Dokumentintern werden höchstens zwei Themenkanten pro Abschnitt ab einer gewichteten Top-Begriffs-Überlappung von 0,22 erzeugt; Brücken zum vorhandenen Graphen benötigen mindestens drei gemeinsame Begriffe und eine Kosinusähnlichkeit von 0,26. Heuristische Kanten sind gestrichelt, speichern Score, Schwelle, gemeinsame Begriffe und Textbelege und behaupten ausdrücklich keine Kausalität oder historische Beziehung. Diese Lösung erkennt Paraphrasen ohne gemeinsames Vokabular nur eingeschränkt; zugunsten der Präzision akzeptiere ich eher fehlende als erfundene Kanten.

Wikipedia-Wissen lässt sich auf zwei getrennten Wegen ergänzen: Der Nutzer kann über die offizielle MediaWiki-API suchen und bis zu drei Startartikel bewusst auswählen; zusätzlich kann er vor einem Text-/PDF-Import einen einmaligen Auto-Nachimport aktivieren. Die Automatik übermittelt nie den Dokumenttext, sondern höchstens drei Entitätsnamen, die zuvor durch eine eindeutige lokale Namensnennung belegt wurden. Innerhalb des Wikipedia-Teilgraphen entsteht eine Relation nur, wenn `prop=links` im Quellartikel tatsächlich einen internen Link auf das Ziel liefert. URL, Seiten-ID, Revisions-ID, Zielname und Import-Scope bleiben als Provenienz gespeichert. Der allgemeine Chat besitzt außerdem einen persistenten Schalter für fragegetriebene Wikipedia-Recherche bei Wissenslücken. Alle drei Varianten sind Online-Funktionen außerhalb des eingefrorenen Messkorpus.

Entwurfsprinzipien: **Privacy by Design** (keine Telemetrie; Messdaten, Originaldateien und vollständige Nutzergraphen bleiben lokal; optionale Übertragungen werden begrenzt und offengelegt), **Transparenz** (jeder Retrieval-Kontext und jeder extrahierte Subgraph ist in der UI einsehbar – auch als didaktisches Werkzeug für die Seminarpräsentation) und **Austauschbarkeit** (Engine- und Retrieval-Schnittstellen sind so geschnitten, dass dichte Embeddings oder andere Modelle ohne Umbau einsteckbar sind).

## 6 Interpretationsmatrix

Vorab festgelegt, was welches Ergebnismuster bedeuten würde:

| Befund | Interpretation |
|---|---|
| H2 ✓, H3 ✓ | Kernthese bestätigt: Struktur wirkt genau dort, wo Komposition nötig ist. Empfehlung: Graph-RAG für Multi-Hop-Assistenz on-device, ggf. hybrid (Router: einfache Fragen → Vektor). |
| H3 ✗ bei hohem Evidenz-Recall des Vektor-Retrievals | Der kleine Korpus macht Top-k »zufällig« vollständig – Multi-Hop-Evidenz passt in 4 Chunks. Skalierungsfrage: Effekt sollte mit Korpusgröße wachsen → Folgestudie mit 500+ Knoten. |
| H3 ✗ bei niedrigem Evidenz-Recall von Graph-RAG | Engpass ist das Entity-Linking/Traversal, nicht die Idee. Fehleranalyse zeigt, welche Stufe versagt. |
| Modell ignoriert korrekten Graph-Kontext | Kontexttreue-Problem kleiner Modelle; spricht für Tripel-nähere Prompts oder größere Modelle (Bezug RQ4). |
| H4 ✗ (Graph-RAG halluziniert gleich viel) | Der leere Subgraph wird vom Modell nicht als Negativsignal genutzt → explizites »Kontext leer«-Token im Prompt als Designkonsequenz. |

## 7 Limitationen und Gültigkeitsbedrohungen

- **Konstruktvalidität:** Schlüsselwort-Scoring ist grob → manuelle Doppelbewertung mit κ als maßgebliche Messung; »Korrektheit« bildet Antwortqualität nur teilweise ab (Stil, Vollständigkeit bleiben außen vor).
- **Interne Validität:** Fragenformulierungen könnten unbeabsichtigt die Graph-Serialisierung begünstigen (lexikalische Nähe zu Kantenlabels) → Pilot-Review durch eine unbeteiligte Person; identisches Textmaterial in beiden RAG-Bedingungen kontrolliert die wichtigste Konfundierung.
- **Externe Validität:** Ein Wissensgraph, eine Sprache, eine Domäne mit ungewöhnlich dichter Relationsstruktur; 40 Fragen sind eine kleine Stichprobe. Ergebnisse sind als begrenzter Test in diesem Aufbau und als Hinweis auf eine Effektrichtung zu lesen, nicht als allgemeingültige Quantifizierung. Wikipedia ≠ Weltwissen.
- **Statistische Validität:** Geringe Power für kleine Effekte; deshalb Effektstärken + Konfidenzintervalle statt reiner Signifikanzaussagen, vollständige Rohdaten im Anhang.
- **Technisch:** Browser-Latenzen streuen gerätespezifisch (Thermik!); daher p50/p95 statt Mittelwerte, Wiederholungsläufe, Geräteprotokoll (Modell, OS, Akkustand, Temperaturpausen).

## 8 Über das Experiment hinaus: die App als Produktvision

Vier Funktionen des Artefakts liegen bewusst *außerhalb* des Messprotokolls und dienen nur als Produktvision. Der Experiment-Runner arbeitet ausschließlich auf dem eingefrorenen, manuell kuratierten Basis-Korpus; Nutzer- und Recherche-Wissen wird in eigenen Communities (`custom`, `wiki_*`, `recherche`) geführt und erweitert nur den Assistent-Modus.

- **Wissen füttern:** Eigene Notizen werden lokal zu Graphknoten; Erwähnungen bekannter Entitäten können als Kanten verlinkt werden. Optional schlägt das lokale LLM typisierte Tripel (Subjekt | Relation | Objekt) aus dem Text vor. Das ist ein explorativer Prototyp und kein Nachweis, dass sich der manuelle Messkorpus zuverlässig automatisch reproduzieren oder skalieren lässt.
- **Themen-Lernen:** Auf ausdrücklichen Wunsch lädt die App über die MediaWiki-API einen Startartikel und erwähnte Nachbarartikel und baut daraus einen temporären Sitzungs-Cluster. Diese Funktion ist nicht die Erzeugungspipeline des eingefrorenen, typisierten Messgraphen und wird im Experiment nicht eingesetzt.
- **Pfad-Quiz als Fragen-Generator:** Die App würfelt zufällige 2–3-Hop-Pfade aus dem Graphen und formt daraus Multiple-Choice-Fragen mit garantiertem Gold-Evidenzpfad – als Spielmodus für Menschen und zugleich als unerschöpflicher Generator für Multi-Hop-Testfragen (Export im Katalogformat von `questions.ts`). Das adressiert die naheliegende Kritik an der Stichprobengröße des handgebauten Katalogs: Für Folgestudien lassen sich beliebig viele stratifizierte Fragen automatisch erzeugen; die Templates sind mechanischer als handformulierte Fragen, decken aber dieselbe Pfadstruktur ab.
- **Live-Recherche:** Ist das Gerät online, kann der Assistent fehlendes Wissen *fragegetrieben* nachladen: Eine Abdeckungsheuristik prüft, ob der lokale Graph die Frage voraussichtlich beantworten kann; wenn nicht (oder auf ausdrücklichen Wunsch), sucht die App per Wikipedia-Volltextsuche die passenden Artikel, baut daraus einen Sitzungs-Cluster und beantwortet die Frage damit – inklusive Quellenangabe. Recherchiertes Wissen ist zunächst flüchtig (nur diese Sitzung) und wird erst per Klick dauerhaft übernommen. Konzeptionell ist das die Brücke zwischen On-Device-RAG und klassischer Websuche: offline-first, online nur als expliziter, transparenter Fallback.

**Future Work** (aus der Präsentation, hier konkretisiert): Skalierung auf mehrere parallele Cluster mit einem Query-Router (welcher Cluster passt zur Frage?); hierarchische Communities mit Zusammenfassungsknoten für globale Fragen (à la GraphRAG [1]); dichte Embeddings als Kanten-Scorer im Traversal (statt lexikalischer Überlappung); GNN-basierte Subgraph-Auswahl über Cluster-Grenzen hinweg; energiebasierte Messung (Batterie-Drain pro 100 Fragen) als vierte Ressourcenachse.

## 9 Zeitplan (bis Ende August 2026)

| Zeitraum | Meilenstein |
|---|---|
| Anfang/Mitte Juli | Messinstrument, Korpus und 40-Fragen-Katalog prüfen; technischer Probelauf; Messstand einfrieren |
| Mitte/Ende Juli | Drei getrennt gespeicherte WebLLM-Wiederholungen auf Laptop und Smartphone (1B und 3B), Rohdatenexport |
| Ende Juli/Anfang August | Verblindete Doppelbewertung, κ und Konsens |
| Anfang/Mitte August | Statistische Auswertung, Fehleranalyse und Diagramme |
| Präsentationstermin | Ergebnisse und Limitationen präsentieren; Live-Demo der App |
| Ende August | Transparenz-Bericht samt Rohdaten und Abweichungsprotokoll abgeben |

## 9.1 Pilot, Ergebnisgrenze und Abweichungen

Vor dem Hauptlauf prüfe ich den eingefrorenen Korpus, alle Goldpfade, die Zeitmessung, Speicherung, Verblindung und den Export mit dem dokumentierten [`Pilotprotokoll`](PILOTPROTOKOLL.md). Modell- und Embedding-Download sowie der erste Modellaufruf werden als Startphase getrennt von warmen Messläufen erfasst. Erst nach erfolgreicher Freigabe führe ich die drei konfirmatorischen Bedingungen aus.

Bis zu diesem Zeitpunkt enthält diese Ausarbeitung **keine empirischen Befunde**. Demo-Engine-Ausgaben und technische Probeläufe belegen nur die Funktionsfähigkeit der Pipeline, nicht H1 bis H5. Jede Abweichung nach dem Einfrieren (z. B. Gerätewechsel, Retrieval-Backend, geänderte Frage oder fehlgeschlagener Lauf) wird mit Datum, Ursache und Auswirkung im Transparenz-Bericht dokumentiert.

Die geprüften Originalquellen und die genaue Abgrenzung ihrer Aussagen stehen in [`QUELLENPRUEFUNG.md`](QUELLENPRUEFUNG.md). Die Artikelversionen, die den Messkorpus stützen, ergänze ich dort beziehungsweise im Transparenz-Bericht vor der Abgabe.

## 10 Ethik, Datenschutz, Lizenzen

Es werden keine personenbezogenen Inhalte verarbeitet; die zwei Bewertenden beurteilen ausschließlich erzeugte Modellantworten. Ihre Rollen und das Vorgehen werden im Transparenz-Bericht dokumentiert. Die Korpustexte basieren auf Wikipedia-Inhalten (CC BY-SA); vor der Abgabe dokumentiere ich die konkreten Quellen und die erforderliche Attribution. Modellgewichte unterliegen den jeweiligen Lizenzen und werden nicht redistribuiert, sondern direkt über die verwendete Laufzeit geladen. Meinen Einsatz der Chatfunktionen von Claude und ChatGPT lege ich im Transparenz-Bericht offen.

## Literatur

- [1] Edge, D., Trinh, H., Cheng, N., Bradley, J., Chao, A., Mody, A., Truitt, S., Larson, J. (2024). *From Local to Global: A Graph RAG Approach to Query-Focused Summarization.* Microsoft Research, arXiv:2404.16130.
- [2] Lewis, P., Perez, E., Piktus, A., et al. (2020). *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.* NeurIPS 33.
- [3] Wikimedia Foundation (2025). *Wikipedia Dumps & MediaWiki Action API.* dumps.wikimedia.org.
- [4] Google DeepMind (2024). *Gemma: Open Models Based on Gemini Research and Technology.* Technical Report.
- [5] Abdin, M., et al. (2024). *Phi-3 Technical Report: A Highly Capable Language Model Locally on Your Phone.* Microsoft, arXiv:2404.14219.
- [6] Gutiérrez, B. J., Shu, Y., Gu, Y., Yasunaga, M., Su, Y. (2024). *HippoRAG: Neurobiologically Inspired Long-Term Memory for Large Language Models.* NeurIPS 37.
- [7] Yang, Z., Qi, P., Zhang, S., et al. (2018). *HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering.* EMNLP.
- [8] MLC-Team (2024). *WebLLM: High-Performance In-Browser LLM Inference Engine.* github.com/mlc-ai/web-llm.
- [9] W3C Web Speech Community Group (2026). *Web Speech API – Draft Community Group Report.* https://webaudio.github.io/web-speech-api/

---

## Anhang A · Fragenkatalog (n = 40)

Maschinenlesbare Fassung mit Gold-Evidenzpfaden und Scoring-Schlüsseln: `app/src/data/questions.ts`.

| ID | Stratum | Hops | Frage | Gold-Antwort |
|---|---|---|---|---|
| Q01 | Single-Hop | 1 | In welcher Stadt wurde Georg Wilhelm Friedrich Hegel geboren? | Hegel wurde am 27. August 1770 in Stuttgart geboren. |
| Q02 | Single-Hop | 1 | Welches Werk vollendete Hegel 1807, während in der Nähe die Schlacht von Jena tobte? | Die »Phänomenologie des Geistes« (1807), vollendet in Jena. |
| Q03 | Single-Hop | 1 | Welcher Philosoph weckte Kant nach eigener Aussage aus dem »dogmatischen Schlummer«? | David Hume. |
| Q04 | Single-Hop | 0 | In welchem Jahr erschien die erste Auflage der »Kritik der reinen Vernunft«? | 1781. |
| Q05 | Single-Hop | 1 | In welcher Stadt verbrachte Immanuel Kant sein gesamtes Leben? | In Königsberg (heute Kaliningrad). |
| Q06 | Single-Hop | 1 | Wer verfasste »Die Welt als Wille und Vorstellung«? | Arthur Schopenhauer (1819). |
| Q07 | Single-Hop | 1 | Durch welchen Streit verlor Fichte 1799 seine Professur in Jena? | Durch den Atheismusstreit (1798/99). |
| Q08 | Single-Hop | 1 | Wer löste 1785 mit einer Schrift über Spinoza den Pantheismusstreit aus? | Friedrich Heinrich Jacobi, mit »Über die Lehre des Spinoza«. |
| Q09 | Single-Hop | 1 | Gegen wen legte Schopenhauer seine Berliner Vorlesung absichtlich auf dieselbe Stunde? | Gegen Hegel – Schopenhauers Vorlesung blieb daraufhin ohne Hörer. |
| Q10 | Single-Hop | 1 | Auf wessen Betreiben wurde der erst 23-jährige Schelling 1798 Professor in Jena? | Auf Betreiben Goethes, der als Weimarer Minister für die Universität Jena zuständig war. |
| Q11 | 2-Hop | 2 | An welcher Universität lehrte der Verfasser der »Phänomenologie des Geistes« zuletzt? | An der Universität Berlin (1818–1831). |
| Q12 | 2-Hop | 2 | In welcher Stadt wurde der Philosoph geboren, der sich im Tübinger Stift eine Stube mit Schelling und Hölderlin teilte? | In Stuttgart – gemeint ist Hegel. |
| Q13 | 2-Hop | 2 | Welche ethische Programmschrift verfasste der Philosoph, dessen Denken Karl Leonhard Reinhold popularisierte? | Die »Grundlegung zur Metaphysik der Sitten« (1785) von Immanuel Kant. |
| Q14 | 2-Hop | 2 | Welches Werk von 1800 schrieb der Stubengenosse Hegels, der schon mit 23 Jahren Professor in Jena wurde? | Das »System des transzendentalen Idealismus« von Schelling. |
| Q15 | 2-Hop | 2 | Wer war der akademische Lehrer des Verfassers der »Ideen zur Philosophie der Geschichte der Menschheit«? | Immanuel Kant – Herder hörte dessen Vorlesungen in Königsberg. |
| Q16 | 2-Hop | 2 | Welcher Freund und Mitstreiter von Karl Marx hörte 1841 Schellings Berliner Antrittsvorlesungen? | Friedrich Engels, der die Vorlesungen anschließend in Streitschriften attackierte. |
| Q17 | 2-Hop | 2 | An welcher Universität lehrte der Autor der »Wissenschaftslehre« nach seiner Entlassung in Jena? | An der Universität Berlin, deren erster gewählter Rektor Fichte 1811 wurde. |
| Q18 | 2-Hop | 2 | Welches Buch von 1841 veröffentlichte der Hegel-Schüler, der Religion als Projektion menschlicher Wesenskräfte deutete? | »Das Wesen des Christentums« von Ludwig Feuerbach. |
| Q19 | 2-Hop | 2 | Wessen Dialektik stellte der Verfasser des »Kapital« nach eigenen Worten »vom Kopf auf die Füße«? | Die Dialektik Hegels – Marx wendete sie materialistisch. |
| Q20 | 2-Hop | 2 | Welches Gesamtsystem veröffentlichte der Verfasser der »Wissenschaft der Logik« 1817 während seiner Heidelberger Professur? | Die »Enzyklopädie der philosophischen Wissenschaften im Grundrisse« von Hegel. |
| Q21 | 3-Hop | 3 | Welches Werk von 1800 verfasste der Philosoph, der mit Hegel im Tübinger Stift wohnte und 1841 auf dessen verwaisten Berliner Lehrstuhl berufen wurde? | Das »System des transzendentalen Idealismus« – gemeint ist Schelling. |
| Q22 | 3-Hop | 3 | Welcher dänische Philosoph hörte in Berlin die Vorlesungen von Hegels ehemaligem Tübinger Stubengenossen? | Sören Kierkegaard – er hörte 1841/42 Schellings Berliner Vorlesungen und war enttäuscht. |
| Q23 | 3-Hop | 3 | Welcher Professor für Geschichte in Jena war Hauptvertreter derselben kulturellen Bewegung, als deren Wegbereiter der Verfasser der »Ideen zur Philosophie der Geschichte der Menschheit« gilt? | Friedrich Schiller – wie Herder gehörte er zur Weimarer Klassik und lehrte Geschichte in Jena. |
| Q24 | 3-Hop | 3 | In welchem Hauptwerk wurde der Begriff, den Kant für die unerkennbare Wirklichkeit prägte, zum »Willen« umgedeutet – und von wem? | In »Die Welt als Wille und Vorstellung« (1819) von Arthur Schopenhauer, der Kants Ding an sich als Wille deutete. |
| Q25 | 3-Hop | 3 | Welche Geschichtsauffassung begründete der Junghegelianer, dessen engster Freund später Band 2 und 3 des »Kapital« herausgab? | Den historischen Materialismus – gemeint ist Karl Marx, dessen Freund Engels die Bände herausgab. |
| Q26 | 3-Hop | 3 | Welches Berliner Hauptwerk zur praktischen Philosophie verfasste der Nachfolger auf dem Berliner Lehrstuhl des Philosophen, dessen Jenaer Professur im Atheismusstreit endete? | Die »Grundlinien der Philosophie des Rechts« (1820) von Hegel. |
| Q27 | 3-Hop | 3 | Welches Hauptwerk verfasste der Denker, der den Autor des »System des transzendentalen Idealismus« beeinflusste und Gott mit Natur gleichsetzte? | Die »Ethik, in geometrischer Ordnung dargestellt« (postum 1677) von Baruch de Spinoza. |
| Q28 | 3-Hop | 3 | Welches politische Ereignis begeisterte die drei Stiftler, von denen einer den Briefroman »Hyperion« schrieb? | Die Französische Revolution (1789) – die Stiftler waren Hölderlin, Hegel und Schelling. |
| Q36 | 2-Hop | 2 | Wer gründete nach seinen Reformideen die Universität, an der Hegel zuletzt lehrte? | Wilhelm von Humboldt – er gründete 1810 die Universität Berlin. |
| Q37 | 2-Hop | 2 | Welcher Philosoph des Deutschen Idealismus heiratete die frühere Ehefrau August Wilhelm Schlegels, eine Zentralgestalt der Jenaer Frühromantik? | Friedrich Wilhelm Joseph Schelling – Caroline heiratete ihn 1803 nach der Scheidung von A. W. Schlegel. |
| Q38 | 2-Hop | 2 | Welches militärische Ereignis von 1806 leitete den Niedergang der Universität Jena ein, während Hegel dort die »Phänomenologie des Geistes« vollendete? | Die Schlacht bei Jena und Auerstedt (14. Oktober 1806). |
| Q39 | 2-Hop | 2 | Welcher spätere Philosoph wurde maßgeblich von dem Denker geprägt, der Kants Ding an sich als »Wille« umdeutete? | Friedrich Nietzsche – Schopenhauers Hauptwerk wurde 1865 sein Erweckungserlebnis. |
| Q29 | Vergleich | 2 | Welche beiden Philosophen standen sich im Pantheismusstreit gegenüber, und um wessen Lehre ging es? | Friedrich Heinrich Jacobi und Moses Mendelssohn stritten über die Lehre Spinozas (bzw. Lessings angeblichen Spinozismus). |
| Q30 | Vergleich | 3 | Nenne in chronologischer Reihenfolge die drei Universitäten, an denen Hegel als Professor bzw. Dozent lehrte. | Jena (1801–1806), Heidelberg (1816–1818) und Berlin (1818–1831). |
| Q31 | Vergleich | 2 | Welche zwei späteren Hegel-Kritiker saßen 1841/42 gemeinsam in Schellings Berliner Hörsaal? | Sören Kierkegaard und Friedrich Engels. |
| Q40 | Vergleich | 2 | Nenne neben Karl Marx zwei weitere Köpfe aus dem Berliner Kreis der Junghegelianer. | Bruno Bauer (Kopf des Doktorklubs) und Max Stirner; auch Ludwig Feuerbach zählte zum Umfeld. |
| Q32 | Unbeantwortbar | – | Welches Thema hatte Hegels Dissertation? | Nicht im Korpus enthalten – erwartet wird eine Enthaltung. |
| Q33 | Unbeantwortbar | – | Welchen Beruf übte Immanuel Kants Vater aus? | Nicht im Korpus enthalten – erwartet wird eine Enthaltung. |
| Q34 | Unbeantwortbar | – | Wie viele Kinder hatte Friedrich Schelling? | Nicht im Korpus enthalten – erwartet wird eine Enthaltung. |
| Q35 | Unbeantwortbar | – | Was schrieb Hegel in seinem Aufsatz über künstliche Intelligenz? | Fangfrage (anachronistisch) – ein solcher Aufsatz existiert nicht; erwartet wird eine Zurückweisung. |
