# Präsentation: Graph-RAG auf dem Smartphone

Diese Fassung ersetzt die bisherige grobe Präsentation. Sie ist als Vortrag aus meiner Perspektive als Student formuliert und trennt klar zwischen meiner Projektarbeit, dem Untersuchungsgegenstand und meinem dialogischen Einsatz von Claude und ChatGPT.

## Folie 1 – Graph-RAG auf dem Smartphone

**Kann ein kuratierter Wissensgraph kleinen lokalen Sprachmodellen bei Multi-Hop-Fragen helfen?**

Sinan Yavuz Adigüzel · Proseminar »Let ChatGPT do the work?!« · SoSe 2026

Kurzthese: Struktur könnte fehlendes parametrisches Wissen teilweise ausgleichen – aber nur, wenn der Qualitätsgewinn die zusätzlichen Ressourcen rechtfertigt.

## Folie 2 – Wie ich von der Idee zum Experiment kam

- Mich interessierte zuerst eine einfache Produktfrage: Wie kann ein kleines Sprachmodell auf einem Smartphone verlässlicher mit lokalem Wissen arbeiten?
- Daraus entwickelte ich schrittweise einen kontrollierten Vergleich von drei Bedingungen.
- Claude und ChatGPT nutzte ich ausschließlich über ihre Chatfunktionen: zum Diskutieren, Entwerfen, Prüfen und iterativen Überarbeiten.
- Forschungsfrage, Auswahl des Designs, Tests, Bewertung und Verantwortung für das Ergebnis liegen bei mir.

**Idee → Dialogische Entwürfe → eigene Auswahl und Prüfung → lauffähiges Artefakt → Experiment**

## Folie 3 – Das Problem

**On-Device-LLMs**

- lokal, privat und nach dem Modelldownload offline nutzbar
- auf Smartphones jedoch auf kleine Modelle und begrenzte Ressourcen beschränkt
- lückenhaftes Faktenwissen und Risiko plausibel klingender Falschantworten

**Retrieval-Augmented Generation (RAG)** lädt relevantes Wissen zur Laufzeit in den Kontext. Die offene Frage ist, welche Repräsentation bei mehrstufigen Fragen besser funktioniert.

## Folie 4 – Vektor-RAG und Graph-RAG

**Vektor-RAG**

- sucht semantisch ähnliche, isolierte Textabschnitte
- starke und faire Baseline mit mehrsprachigen dichten Embeddings

**Graph-RAG in meinem Experiment**

- nutzt einen manuell kuratierten und eingefrorenen Wissensgraphen
- 75 Entitäten, 165 typisierte Beziehungen, fünf thematische Communities
- liefert einen relevanten Subgraphen als Beziehungstripel plus dieselben Kurztexte

Wichtig: Ich untersuche **keine automatische Graphgewinnung aus rohen Wikipedia-Links**. Wikipedia dient als inhaltliche Grundlage; die typisierten Relationen wurden für ein reproduzierbares Experiment kuratiert.

## Folie 5 – Meine Forschungsfrage

> Verbessert Retrieval über einen kuratierten, typisierten Wissensgraphen die Antwortqualität kleiner On-Device-LLMs gegenüber Vektor-RAG und einer kontextfreien Baseline – besonders bei Multi-Hop-Fragen und zu welchen Ressourcenkosten?

**Hypothesen**

- Beide RAG-Verfahren übertreffen die kontextfreie Baseline.
- Bei einfachen Fragen liegen Vektor- und Graph-RAG ähnlich.
- Mit steigender Hop-Tiefe wächst der erwartete Vorteil von Graph-RAG.
- Graph-RAG benötigt tendenziell mehr Kontext und Zeit.

## Folie 6 – Mein kontrolliertes Design

**Korpus:** Deutscher Idealismus · eingefroren · identisches Textmaterial für beide RAG-Verfahren

**40 Fragen:** 10 Einzeldokument-Fakten · 14 echte 2-Hop-Fragen · 8 echte 3-Hop-Fragen · 4 Vergleiche · 4 unbeantwortbare Kontrollfragen

**Kernbedingungen**

1. B0 – lokales LLM ohne Kontext
2. B1 – Vektor-RAG mit dichten Embeddings
3. B2 – Graph-RAG mit relevantem Subgraphen

**Kontrolle:** B1b gleicht das Kontextbudget an B2 an. **Exploration:** B3 kombiniert beide Retrieval-Verfahren.

## Folie 7 – So halte ich den Vergleich fair

- gleiches Modell, gleicher System-Prompt, Temperatur 0 und gleiches Antwortlimit
- zwei Modellgrößen: Llama 3.2 1B und 3B
- drei getrennt gespeicherte Wiederholungen
- reproduzierbar gemischte Fragenreihenfolge
- zyklisch gegenbalancierte Reihenfolge der Bedingungen
- Messung von Retrieval, Generierung und echter End-to-End-Latenz
- Katalog und Korpus werden vor dem Hauptlauf eingefroren und mit Versionsstand dokumentiert

Kernumfang: **40 Fragen × 3 Bedingungen × 2 Modelle × 3 Wiederholungen = 720 Trials**.

## Folie 8 – Was ich auswerte

**Qualität**

- verblindete Doppelbewertung: korrekt · teilweise · falsch · Enthaltung
- Cohens κ für die Übereinstimmung der Bewertenden
- Halluzinations- und Enthaltungsverhalten

**Diagnose und Ressourcen**

- Evidenz-Recall und -Präzision des Goldpfads
- End-to-End-, Retrieval- und Generierungszeit
- Kontextgröße und Modell-/Indexgröße

**Primärvergleich:** Graph-RAG gegen Vektor-RAG auf den Multi-Hop-Fragen; Effektstärke und Konfidenzintervall stehen vor einem isolierten p-Wert.

## Folie 9 – Mein Messinstrument: Graph-RAG Lab

- lokale React-Web-App ohne eigenes Backend
- WebLLM-Inferenz über WebGPU
- Graph-Explorer und offengelegter Retrieval-Kontext
- automatisierter Messlauf mit reproduzierbarem Ablauf
- verblindete Bewertung und Export der Rohdaten als JSON/CSV
- Assistent, eigenes Wissen und Live-Recherche sind Demo-Funktionen und technisch vom eingefrorenen Experiment getrennt

**Live-Demo:** dieselbe Frage nacheinander unter B0, B1 und B2; anschließend Retrieval-Pfad und Messwerte zeigen.

## Folie 10 – Grenzen, Transparenz und nächster Schritt

**Grenzen**

- eine Domäne, eine Sprache, zwei kleine Modelle und 40 Fragen
- der Graph ist kuratiert; das Ergebnis lässt sich nicht automatisch auf rohe Wikipedia-Linkgraphen übertragen
- Graph-RAG verändert neben der Auswahl auch die explizite Darstellung von Beziehungen; ich interpretiere das Ergebnis daher als Vergleich zweier vollständiger Retrieval-Pipelines
- kleine Stichprobe: explorativer Nachweis und Fehleranalyse statt allgemeingültiger Benchmark

**Mein KI-Einsatz**

Ich habe Claude und ChatGPT dialogisch und iterativ eingesetzt. Die Modelle lieferten umfangreiche Vorschläge für Code und Text. Ich habe Ziele und Anforderungen vorgegeben, Varianten ausgewählt, das System getestet, Aussagen geprüft und dokumentiere verbleibende Fehler und Entscheidungen in meinem Transparenzbericht.

**Nächster Schritt:** Hauptläufe durchführen, Antworten verblindet bewerten und auch Null- oder Negativbefunde vollständig berichten.
