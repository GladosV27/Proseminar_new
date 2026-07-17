# Pilotprotokoll und Freigabe zum Hauptlauf

**Projekt:** Graph-RAG auf dem Smartphone  
**Status:** Vor der ersten Ergebnisinterpretation auszufüllen

Dieses Protokoll trennt einen technischen Probelauf von der eigentlichen Studie. Es verhindert, dass Demo-Ausgaben, unvollständige Downloads oder nachträgliche Korpusänderungen als Forschungsergebnis erscheinen.

## 1. Messstand einfrieren

Vor dem Pilot werden folgende Angaben festgehalten:

| Prüfpunkte | Eintrag |
|---|---|
| Git-Commit des Messstands | ⬜ |
| Datum und Uhrzeit | ⬜ |
| Browser, Betriebssystem, Gerät, RAM | ⬜ |
| WebGPU verfügbar | ⬜ ja / ⬜ nein |
| WebLLM-Modell-ID und Quantisierung | ⬜ |
| Retrieval-Backend der Hauptauswertung | ⬜ dichte Embeddings / ⬜ TF-IDF |
| Temperatur und Antwortlimit | `0` / `220`; Abweichung: ⬜ |
| Seeds für die drei Wiederholungen | ⬜ |

Der eingefrorene Korpus ist ausschließlich `app/src/data/graph.ts`; Nutzerwissen, Wikipedia-Importe und Live-Recherche bleiben für alle Messläufe deaktiviert.

## 2. Korpus- und Fragenprüfung

Vor dem Hauptlauf wird jede der 40 Fragen einzeln gegen den eingefrorenen Korpus kontrolliert.

| Prüfung je Frage | Kriterium |
|---|---|
| Gold-Antwort | Im Korpus eindeutig belegbar bzw. bewusst unbeantwortbar |
| Goldpfad | Knoten und Kanten existieren; Hop-Tiefe stimmt |
| Formulierung | Keine Kantenlabels oder Lösungshinweise im Fragetext |
| Stratum | Verteilung bleibt 10 Single-Hop, 14 Zwei-Hop, 8 Drei-Hop, 4 Vergleich, 4 unbeantwortbar |

Änderungen nach dieser Prüfung erhalten eine Begründung, einen Zeitstempel und eine neue Commit-ID. Nach dem Einfrieren werden Fragen, Korpus und Scoring-Schlüssel nicht mehr an beobachtete Modellantworten angepasst.

## 3. Technischer Probelauf

Der technische Probelauf prüft die Pipeline, nicht die Hypothesen. Er nutzt zunächst die deterministische Demo-Engine und danach genau einen WebLLM-Lauf mit einer kleinen, vorab ausgewählten Teilmenge. Seine Antworten werden nicht in die Hauptauswertung übernommen.

| Prüfschritt | Erfolgskriterium | Ergebnis |
|---|---|---|
| Schedule | Seed, Frageposition und zyklische Bedingungsrotation werden exportiert | ⬜ |
| Baseline | Kontextlänge ist `0`; kein Retrieval wird protokolliert | ⬜ |
| Vektor-RAG | Abgerufene Knoten und Kontext sind im Export sichtbar | ⬜ |
| Graph-RAG | Subgraph, Kanten und Evidenzmetriken sind im Export sichtbar | ⬜ |
| Zeitmessung | Vorbereitung, Retrieval, Generierung und End-to-End-Zeit sind getrennt vorhanden | ⬜ |
| Speicherung | Wiederholungen erzeugen getrennte `runId`s und überschreiben nichts | ⬜ |
| Verblindung | Bewertungsansicht zeigt weder Bedingung noch Kontext oder Auto-Score | ⬜ |
| Export | JSON und CSV enthalten alle im Transparenzbericht genannten Felder | ⬜ |

**Warm-up-Regel:** Modell- und Embedding-Download sowie der erste Modellaufruf werden als Startphase separat dokumentiert. Für die Hauptlatenz werden nur Läufe verglichen, die denselben Cache-Zustand haben. Kaltstarts werden zusätzlich, aber getrennt berichtet.

## 4. Freigabekriterium

Der Hauptlauf beginnt erst, wenn alle Prüfpunkte aus Abschnitt 3 erfüllt sind und die Korpusprüfung abgeschlossen ist. Ist ein Punkt nicht erfüllt, wird entweder der Fehler behoben und der Messstand neu eingefroren oder die Einschränkung als Abweichung offengelegt.

## 5. Hauptlauf und Bewertung

Der konfirmatorische Hauptlauf umfasst pro Modell 40 Fragen × 3 Kernbedingungen × 3 Wiederholungen. Bei zwei Modellen entstehen 720 Kern-Trials. Die Budget-Kontrolle und der Hybridlauf werden nur dann zusätzlich ausgeführt, wenn sie getrennt als Kontroll- bzw. explorative Analyse gekennzeichnet werden.

Nach dem Export bewerten zwei Personen die Antworten unabhängig und verblindet. Der Auto-Score dient nur der Vorstrukturierung. Als Ergebnis zählen die manuelle Bewertung, Cohens Kappa und die dokumentierte Konsensentscheidung.

## 6. Ergebnisregel

Es werden nur tatsächlich erzeugte, exportierte und bewertete Daten als Ergebnis bezeichnet. Ein Nullbefund, ein Vorteil von Vektor-RAG oder ein technisches Scheitern bleiben berichtenswert. Die Präsentation und der Transparenzbericht erhalten erst nach diesem Ablauf Zahlen, Diagramme und Hypothesenurteile.
