# Verbindliche Checkliste für den Hauptlauf

Diese Checkliste trennt den fertig entwickelten Messstand von den noch zu erhebenden Ergebnissen. Ich fülle die Felder selbst aus und ändere nach dem Einfrieren weder Fragen, Goldpfade, Scoringregeln noch den System-Prompt. Technische Fehlerkorrekturen dokumentiere ich mit Zeitpunkt, Grund und betroffenen Läufen.

## 1. Messstand einfrieren

- [ ] Datum und Uhrzeit: ____________________
- [ ] App-Version / Repository-Stand: ____________________
- [ ] Hash von `app/src/data/graph.ts`: ____________________
- [ ] Hash von `app/src/data/questions.ts`: ____________________
- [ ] Hash von `app/src/engine/experiment.ts`: ____________________
- [ ] Produktions-Build erfolgreich (`npm.cmd run build`)
- [ ] Pilotdaten exportiert und anschließend aus der Hauptlaufansicht entfernt
- [ ] Keine Pilotdaten als empirisches Ergebnis verwendet

Hashes unter Windows erzeugen:

```powershell
Get-FileHash .\src\data\graph.ts -Algorithm SHA256
Get-FileHash .\src\data\questions.ts -Algorithm SHA256
Get-FileHash .\src\engine\experiment.ts -Algorithm SHA256
```

## 2. Umgebung dokumentieren

- [ ] Gerät, CPU/GPU, RAM: ____________________
- [ ] Betriebssystem und Version: ____________________
- [ ] Browser und Version: ____________________
- [ ] Energieversorgung, Akkustand und Energiesparmodus: ____________________
- [ ] Hintergrundprogramme geschlossen
- [ ] Gerät vor jedem Lauf mindestens fünf Minuten abkühlen lassen
- [ ] Exakte Modell-IDs und Quantisierung: ____________________
- [ ] Retrieval-Backend: TF-IDF / Dense
- [ ] Offline-Modus während der Messung aktiviert

Der Abgabe-Export ergänzt automatisch User-Agent, Plattform, CPU-Threadzahl, verfügbaren Gerätespeicher, WebGPU-Status, Prompt, Bedingungen, Fragen-IDs und Korpusgröße.

## 3. Konfirmatorischer Hauptlauf

- [ ] Modell 1: 40 Fragen × Baseline, Vektor-RAG, Graph-RAG × 3 Wiederholungen
- [ ] Modell 2: 40 Fragen × Baseline, Vektor-RAG, Graph-RAG × 3 Wiederholungen
- [ ] identischer dokumentierter Seed für den Modellvergleich
- [ ] kein Wechsel von Modell, Retrieval oder Gerät innerhalb eines Laufs
- [ ] Abbrüche mit Trial, Ursache und Entscheidung protokolliert
- [ ] jeder vollständige Lauf separat als JSON und CSV exportiert

Erwarteter Kernumfang: `40 × 3 Bedingungen × 3 Wiederholungen × 2 Modelle = 720 Trials`.

## 4. Kontroll- und Explorationsläufe

Diese Läufe werden getrennt vom konfirmatorischen Ergebnis berichtet:

- [ ] Vektor+Budget gegen Graph-RAG: Kontrolle des Kontextumfangs
- [ ] Graph−Kanten gegen Graph-RAG: dieselben Graph-Knoten, aber keine serialisierten Relationen
- [ ] Hybrid: ausschließlich explorative Fehlerüberlappung

Die Graph−Kanten-Ablation prüft gezielt, ob explizite Relationskanten zusätzlichen Nutzen bringen. Sie beweist nicht, dass jede Differenz ausschließlich durch Topologie verursacht wird, weil die Knotenauswahl weiterhin über den Graph-Index erfolgt.

## 5. Verblindete Bewertung

- [ ] Bewertungsrubrik vor Einsicht in die Bedingungen gelesen
- [ ] Bewertende Person A unabhängig
- [ ] Bewertende Person B unabhängig und möglichst nicht am Projekt beteiligt
- [ ] beide sehen weder Bedingung noch Modell noch Auto-Score
- [ ] Cohen’s κ berichtet
- [ ] Konflikte erst nach Abschluss beider Bewertungen aufgelöst
- [ ] finale Entscheidungen und Begründungen dokumentiert

## 6. Statistik und Bericht

- [ ] Genauigkeit und 95%-Wilson-Intervalle
- [ ] gepaarte Differenz Graph−Vektor auf identischen Fragen/Wiederholungen
- [ ] exakter McNemar-Test nur ergänzend zur Effektgröße
- [ ] getrennte Analyse nach Single-Hop, 2-Hop, 3-Hop, Vergleich und unbeantwortbar
- [ ] Evidenz-Recall und Genauigkeit bei vollständiger Evidenz
- [ ] p50/p95 der End-to-End-Latenz
- [ ] Null- und Negativbefunde unverändert berichtet
- [ ] Kontroll- und explorative Ergebnisse klar gekennzeichnet
- [ ] keine Verallgemeinerung über die Domäne, Modelle und Geräte hinaus

## 7. Abgabepaket

- [ ] Rohdaten-JSON
- [ ] CSV-Prüftabelle
- [ ] Abgabe-Paket aus der Ergebnisansicht
- [ ] ausgefüllte Checkliste
- [ ] Bewertungsrubrik und κ
- [ ] Transparenzbericht
- [ ] Präsentation mit echten Ergebnissen oder eindeutigem Status »noch nicht erhoben«
