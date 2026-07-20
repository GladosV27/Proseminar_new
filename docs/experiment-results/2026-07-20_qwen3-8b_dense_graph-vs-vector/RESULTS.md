# Ergebnisbericht: Dense Vector-RAG vs. Graph-RAG

## Kurzfazit

In diesem Messlauf beantwortete Graph-RAG **37 von 40 einzigartigen Fragen korrekt (92,5 %)**, Dense Vector-RAG **30 von 40 (75,0 %)**. Der beobachtete Unterschied beträgt damit **+17,5 Prozentpunkte beziehungsweise sieben zusätzliche korrekt beantwortete Fragen zugunsten von Graph-RAG**. Der exakte zweiseitige McNemar-Test auf der korrekten Analyseeinheit „Frage“ ergibt jedoch **p = 0,0654296875**. Das Resultat ist daher ein deutlicher deskriptiver Vorteil, aber bei einem vorab üblichen Niveau von α = 0,05 **kein statistisch signifikanter Nachweis**.

Der Qualitätsgewinn war außerdem teuer: Die mediane Ende-zu-Ende-Latenz stieg von **1.098,8 ms** bei Dense Vector-RAG auf **4.359,5 ms** bei Graph-RAG. Graph-RAG war in diesem Aufbau also ungefähr viermal langsamer. Die ehrliche Schlussfolgerung dieses Laufs lautet deshalb nicht „Graph-RAG ist generell besser“, sondern:

> In diesem eingefrorenen philosophischen Korpus und mit diesem lokalen Modell fand Graph-RAG häufiger die für eine korrekte Antwort nötige Evidenz. Dafür übergab es dem Modell deutlich mehr Kontext und benötigte wesentlich länger. Mit 40 unabhängigen Fragen bleibt die inferenzstatistische Evidenz knapp unterhalb der üblichen 5-%-Schwelle.

## Forschungsfrage und Vergleich

Die praktische Frage war: Verbessert relationale Graphnavigation die Antwortqualität eines lokalen LLM gegenüber semantischem Dense Retrieval, wenn Modell, Fragen und Korpus gleich bleiben?

Verglichen wurden ausschließlich:

- **Dense Vector-RAG:** semantisches Retrieval mit `paraphrase-multilingual-MiniLM-L12-v2`;
- **Graph-RAG:** Entitätsverknüpfung und Traversierung der Knoten und Kanten des Wissensgraphs.

Weitere im Programm vorhandene Bedingungen wie Baseline, Hybrid, Budget-Kontrolle oder „Graph ohne Kanten“ waren **nicht Teil dieses konkreten Laufs**. Insbesondere ist dies kein budgetgleicher Kausaltest der Kantenwirkung: Graph-RAG erhielt im Mittel erheblich mehr Kontext. Der Lauf prüft die beiden praktisch konfigurierten Gesamtsysteme, nicht isoliert nur den Effekt einer einzelnen Komponente.

## Versuchsaufbau

| Merkmal | Festgelegter Wert |
|---|---|
| Run-ID | `run_mrsmtfho_e43f3c5f` |
| Fragen | 40 eingefrorene deutschsprachige Fragen |
| Wiederholungen | 5 je Frage und Bedingung |
| Roh-Trials | 400: 200 Graph, 200 Vector |
| Korpus | eingefroren, 75 Knoten, 165 Kanten |
| Generatives Modell | `qwen3:8b`, Ollama, Q4_K_M |
| Modelldigest | `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41` |
| Ollama | 0.32.1 |
| Modellparameter | Temperatur 0, Seed 42, Kontext 4.096, maximal 160 Ausgabetokens, Thinking aus |
| Reihenfolge | Seed `20260616`, Fragen-Shuffle und zyklisches Condition-Counterbalancing |
| Messumgebung | Windows, Chrome 150, 16 logische Threads, 32 GiB gemeldeter Gerätespeicher |
| Laufzeitraum | 20.07.2026, 04:55:12–05:11:58 Uhr MESZ |

Alle 400 Trial-IDs sind eindeutig. Für jede Kombination aus Frage, Wiederholung und Bedingung existiert genau ein Ergebnis; es fehlen keine Graph-Vector-Paare.

## Warum die primäre Stichprobe n = 40 und nicht n = 200 ist

Die fünf Wiederholungen dienten dazu, Laufzeit und technische Stabilität zu beobachten. Sie erzeugen aber **keine fünf neuen inhaltlich unabhängigen Fragen**. Durch Temperatur 0 und den festen Modellseed waren die automatischen Scores innerhalb jeder Frage-Bedingung-Kombination vollständig stabil: Keiner der 80 Cluster aus 40 Fragen × 2 Bedingungen wechselte zwischen den fünf Wiederholungen seine Score-Kategorie.

Würde man die 200 Trials je Bedingung für den Gütevergleich wie 200 unabhängige Beobachtungen behandeln, entstünde **Pseudoreplikation**. Die künstlich vergrößerte Stichprobe würde zu übermäßig engen Konfidenzintervallen und einem irreführend kleinen p-Wert führen. Deshalb gilt in diesem Bericht:

- **Güte, Konfidenzintervalle und McNemar-Test:** 40 einzigartige Fragen;
- **Latenz und Stabilität:** alle 200 Trials je Bedingung.

Die trialweise Darstellung von 185/200 gegenüber 150/200 enthält bei diesem deterministischen Lauf dieselbe Information fünfmal. Sie wird nicht als primärer Signifikanztest verwendet.

## Primäres Ergebnis: Antwortgüte pro einzigartiger Frage

| Bedingung | Korrekt | Accuracy | 95-%-Wilson-Intervall |
|---|---:|---:|---:|
| Graph-RAG | 37/40 | 92,5 % | 80,1–97,4 % |
| Dense Vector-RAG | 30/40 | 75,0 % | 59,8–85,8 % |
| Differenz Graph − Vector | +7 Fragen | +17,5 Prozentpunkte | deskriptiv |

Die gepaarte 2×2-Aufteilung auf Fragenebene lautet:

| Ergebnis je Frage | Anzahl |
|---|---:|
| beide korrekt | 28 |
| nur Graph korrekt (`b`) | 9 |
| nur Vector korrekt (`c`) | 2 |
| beide nicht korrekt | 1 |

Der exakte zweiseitige McNemar-Test verwendet nur die 11 diskordanten Fragen: **b = 9, c = 2, p = 0,0654296875**. Graph gewinnt deutlich häufiger als Vector, aber die Anzahl unabhängiger Fragen reicht in diesem Lauf nicht aus, um die Nullhypothese auf dem 5-%-Niveau zu verwerfen. „Nicht signifikant“ bedeutet dabei nicht „kein Effekt“, sondern: Die vorliegenden Daten sind noch nicht stark genug für einen belastbaren allgemeinen Nachweis.

## Sekundäre Ergebnisse: Retrieval und Laufzeit

Die folgenden Laufzeitkennzahlen nutzen wie vorgesehen alle 200 technischen Wiederholungen je Bedingung. Q1 und Q3 bezeichnen das erste und dritte Quartil.

| Kennzahl | Graph-RAG | Dense Vector-RAG | Einordnung |
|---|---:|---:|---|
| Ende-zu-Ende-Latenz, Median [Q1–Q3] | 4.359,5 [3.502,8–4.804,9] ms | 1.098,8 [900,9–1.310,1] ms | Graph ca. 4,0× langsamer |
| Ende-zu-Ende-Latenz, p95 | 5.467,0 ms | 1.686,8 ms | deutlich längerer Graph-Tail |
| Time to First Token, Median [Q1–Q3] | 4.025,9 [3.040,2–4.386,9] ms | 707,8 [611,3–786,9] ms | Wartezeit entsteht vor allem vor dem ersten Token |
| Generationsrate, Median [Q1–Q3] | 76,7 [76,2–78,0] tok/s | 80,6 [79,7–81,7] tok/s | Decodierung selbst nur leicht langsamer |
| Kontextlänge, Mittelwert | 7.112,6 Zeichen | 1.720,2 Zeichen | Graph ca. 4,1× größerer Promptkontext |
| Retrievalzeit, Median | 1,0 ms | 0,2 ms | Retrievalberechnung ist nicht der Hauptengpass |
| Evidenz-Recall | 93,1 % (`n = 180`) | 49,3 % (`n = 180`) | Graph findet wesentlich mehr erwartete Evidenz |
| Evidenz-Precision | 22,1 % (`n = 180`) | 34,0 % (`n = 180`) | Graph liefert dafür mehr irrelevanten Kontext |

Für vier der 40 Fragen war keine erwartete Evidenzmenge hinterlegt; bei fünf Wiederholungen bleiben deshalb 180 statt 200 auswertbare Evidenz-Trials je Bedingung.

Die Kombination aus fast gleicher Tokenrate, sehr unterschiedlicher Time to First Token und etwa vierfacher Kontextmenge spricht dafür, dass der größte Zeitverlust nicht in der Graphsuche selbst, sondern im längeren Prompt beziehungsweise dessen Verarbeitung durch das lokale LLM entsteht. Das ist eine aus den Messwerten abgeleitete Interpretation, kein separat isolierter Hardwaretest.

Auf Trialebene ergab das automatische Scoring folgende vollständig deterministische Häufigkeiten:

| Score | Graph-RAG | Dense Vector-RAG |
|---|---:|---:|
| korrekt | 185 | 150 |
| teilweise | 5 | 15 |
| falsch | 0 | 15 |
| Enthaltung | 10 | 20 |

Diese Tabelle eignet sich zur Beschreibung der Antworttypen, nicht zur künstlichen Vergrößerung der inferenzstatistischen Stichprobe.

## Interpretation

Der plausibelste Mechanismus im vorliegenden Aufbau ist ein **Recall-gegen-Präzision-Trade-off**. Graph-RAG folgte Beziehungen und deckte dadurch erwartete Evidenz fast doppelt so häufig ab. Gleichzeitig fiel seine Evidenz-Precision niedriger aus und der Kontext wurde erheblich größer. Für mehrstufige oder relationale Fragen war das offenbar häufig nützlich; das Modell musste aber mehr Material verarbeiten.

Die technische Konsequenz ist keine pauschale Entscheidung für eine Methode. Für schnelle, direkte Fragen ist Dense Vector-RAG in diesem Lauf klar attraktiver. Für Fragen, deren Antwort über Beziehungen zwischen Entitäten gefunden werden muss, kann Graph-RAG den Latenzaufschlag rechtfertigen. Ein späterer Router könnte beide Wege abhängig von der Frageart auswählen.

## Grenzen und ehrliche Bewertung

1. **Automatisches Scoring statt menschlicher Blindbewertung.** Alle 400 Einträge besitzen einen `autoScore`; kein Eintrag besitzt einen `manualScore`. Das automatische Verfahren ist reproduzierbar, kann aber semantisch richtige Umformulierungen übersehen oder erwartete Schlüsselbegriffe bevorzugen.
2. **Keine Doppelblind-Testung.** Antworten wurden nicht unabhängig, randomisiert und blind von mehreren Personen bewertet. Aussagen über journalistische Qualität, Sprachfluss oder faktische Nuancen bleiben deshalb offen.
3. **Nur 40 unabhängige Aufgaben.** Der Effekt ist deskriptiv groß, der exakte Test mit p = 0,0654 aber nicht signifikant bei α = 0,05. Mehr neue Fragen wären wertvoller als weitere deterministische Wiederholungen derselben Fragen.
4. **Ein Modell, ein Korpus, ein Themenfeld.** Gemessen wurden Qwen3 8B, ein philosophischer Graph und deutschsprachige Fragen auf einem Rechner. Das Ergebnis lässt sich nicht ohne Weiteres auf andere Modelle, Fachgebiete, Sprachen oder Mobilgeräte übertragen.
5. **Kein gleiches Kontextbudget.** Graph-RAG erhielt im Mittel 7.112,6, Vector-RAG 1.720,2 Kontextzeichen. Der Lauf vergleicht daher reale Pipelines, isoliert aber nicht, ob der Vorteil durch Graphkanten, größere Kontextmenge oder beides entstand.
6. **Keine entscheidenden Ablationen in diesem Lauf.** Eine Budget-Kontrolle und „Graph ohne Kanten“ wären notwendig, um Kantenwirkung und Kontextmenge sauberer voneinander zu trennen.
7. **Determinismus ist zugleich Stärke und Grenze.** Er macht den Vergleich kontrollierbar und zeigte stabile Ausführung, bildet aber die Varianz eines natürlichen Chatbetriebs mit Sampling nicht ab.

## Was als Nächstes verbessert werden sollte

- Die 40 Fragen um neue, vorab festgelegte Aufgaben erweitern; nicht lediglich dieselben Aufgaben öfter wiederholen.
- Antworten randomisieren und von mindestens zwei blinden menschlichen Ratern bewerten; Übereinstimmung der Rater berichten.
- `vector_budget` gegen Graph-RAG laufen lassen, damit beide Bedingungen ein vergleichbares Kontextbudget erhalten.
- `graph_no_edges` ergänzen, um den Mehrwert echter Relationen gegenüber bloß mehr Knoten zu isolieren.
- Fragetypen vorab schichten: direkte Fakten, semantische Paraphrasen, ein- und mehrstufige Relationen sowie bewusst unbeantwortbare Fragen.
- Einen zweiten Modelltyp und nach Möglichkeit einen zweiten Themenkorpus als Replikation verwenden.
- Qualitätsgewinn und Latenzkosten gemeinsam berichten, statt nur Accuracy zu optimieren.

## Reproduzierbarkeit und Dateien

Die unveränderten Rohdaten liegen in `raw-results.json` und `raw-results.csv`. `submission-bundle.json` enthält das vollständige Abgabepaket. Die Analyse wurde mit dem versionierten Skript `app/scripts/analyze-experiment-results.mjs` validiert. Eine vollständige Neuerzeugung der beiden Analyseausgaben und der Prüfsummen erfolgt vom Repository-Wurzelverzeichnis aus mit:

```powershell
node docs/experiment-results/2026-07-20_qwen3-8b_dense_graph-vs-vector/reproduce-analysis.mjs
```

Die dabei erzeugte `analysis.txt` ist menschenlesbar; `analysis.json` enthält dieselbe Zusammenfassung maschinenlesbar. `SHA256SUMS.txt` erlaubt anschließend die Integritätsprüfung der dokumentierten Dateien. Die primäre methodische Regel – 40 Fragen für Güteinferenz, 200 Trials je Bedingung nur für Laufzeit und Stabilität – ist sowohl in den Ausgaben als auch in diesem Bericht ausdrücklich festgehalten.
