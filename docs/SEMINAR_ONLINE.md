# QR-Seminarmodus: lokales Wissen, gemeinsames Online-Modell

Der QR-Modus ist bewusst vom wissenschaftlichen Offline-Experiment getrennt:

- Texte und PDFs werden auf jedem Handy lokal gelesen und im Browserprofil gespeichert.
- Graph-Retrieval und die Auswahl der Belegknoten laufen auf dem jeweiligen Handy.
- Erst beim Absenden gehen Frage, kurzer Gesprächsverlauf und höchstens 5.000 Zeichen ausgewählter Graphkontext an die Edge Function.
- Eigene Text-/PDF-Belege sind dabei standardmäßig ausgeschlossen. Jede Person muss „Eigenes Wissen für Online-Antworten freigeben“ bewusst aktivieren.
- Die separate Wikipedia-Suche ist im Seminarraum ebenfalls standardmäßig ausgeschaltet.
- Die vollständige PDF, der vollständige persönliche Graph und der Modellschlüssel werden nicht übertragen.
- Im optionalen Live-Sprachdialog nimmt Noesis selbst keine Audiodatei auf oder dauerhaft entgegen. Die vorgeschaltete Web-Spracherkennung stammt jedoch aus dem Browser und kann das Mikrofonsignal an einen Dienst des Browseranbieters senden. Erst das daraus entstandene Transkript durchläuft anschließend den hier beschriebenen Noesis-Pfad.
- Antworten des QR-Modus sind Demonstrationsdaten und dürfen nicht mit den Offline-Experimentergebnissen vermischt werden.

## Architektur

```text
GitHub Pages (Noesis)
  -> Web-Spracherkennung des Browsers (optional; ggf. Anbieter-Onlinedienst)
  -> lokaler PDF-/Textimport
  -> lokaler persönlicher Wissensgraph
  -> lokales Graph-Retrieval
  -> Supabase Edge Function `seminar-chat`
  -> atomarer Supabase-Raumzähler
  -> Groq Chat Completions API
  -> Vorlesestimme des Browsers/Betriebssystems (optional)
```

GitHub Pages bleibt rein statisch. Der geheime Provider-Schlüssel liegt ausschließlich in Supabase.

## 1. Öffentliche Supabase-Konfiguration für GitHub Pages

Im GitHub-Repository unter **Settings -> Secrets and variables -> Actions -> Variables** anlegen:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Diese Werte sind Client-Konfiguration und werden vom Pages-Workflow in den Build eingebettet. Niemals einen Provider- oder Supabase-Secret-Key als `VITE_...` eintragen.

## 2. Serverseitige Secrets in Supabase

Unter **Supabase Dashboard -> Edge Functions -> Secrets** anlegen:

- `GROQ_API_KEY`: geheimer API-Schlüssel; niemals in Git oder `.env.example` eintragen
- `SEMINAR_ROOM_CODE`: temporärer Raumcode, zum Beispiel `PHILO2026`
- `SEMINAR_ACTIVE_UNTIL`: ISO-Zeitpunkt, nach dem der Raum automatisch schließt, zum Beispiel `2026-07-31T18:00:00+02:00`
- optional `GROQ_MODEL`: Standard ist `meta-llama/llama-4-scout-17b-16e-instruct`
- optional `SEMINAR_ALLOWED_ORIGINS`: kommaseparierte Origins; standardmäßig GitHub Pages und die beiden lokalen Entwicklungsadressen

`SEMINAR_ACTIVE_UNTIL` ist verpflichtend: Fehlt der Wert oder ist er ungültig, lehnt die Funktion alle Räume ab. Setze im Groq-Projekt zusätzlich ein hartes Ausgaben-/Nutzungslimit. Der zentrale Supabase-Zähler begrenzt atomar auf 4 Anfragen je temporärer Browser-Sitzung und 28 pro Raum und Minute.

Die Funktion nimmt keinen frei wählbaren Systemprompt entgegen. Sie akzeptiert nur getrennte, größenbegrenzte Felder für Frage, Kontext und Verlauf und verwendet serverseitig den festen Noesis-Prompt. Damit ist sie kein allgemeiner Chat-Proxy.

## 3. Edge Function deployen

Die Funktion liegt unter `supabase/functions/seminar-chat/index.ts`. Nach Login und Verknüpfung mit dem Projekt:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref DEIN_PROJECT_REF
npx.cmd supabase db push
npx.cmd supabase functions deploy seminar-chat --use-api
```

`supabase db push` installiert die Migration `supabase/migrations/202607170001_seminar_rate_limits.sql`. Ohne diese Migration arbeitet die Edge Function absichtlich nicht, damit sie nie als unlimitierter Modell-Proxy offensteht. Alternativ die Migration zuerst im SQL-Editor ausführen und danach die Funktion über den Dashboard-Editor veröffentlichen.

## 4. QR-Code öffnen

Der Raumcode steht nur im temporären Seminarlink:

```text
https://gladosv27.github.io/Proseminar_new/?seminar=PHILO2026
```

Noesis wählt für diesen Link automatisch die Seminar-Online-Engine. Ohne `?seminar=...` bleibt die normale lokale beziehungsweise wissenschaftliche Variante erhalten.

## 5. Belastungstest vor dem Termin

1. Raum auf fünf Geräten öffnen.
2. Auf jedem Gerät einen kurzen Text oder eine PDF lokal importieren.
3. Prüfen, dass neue Knoten und Brückenkanten sichtbar werden.
4. Ohne Freigabe fragen: Persönliche Knoten dürfen nicht in den verwendeten Quellen erscheinen.
5. „Eigenes Wissen … freigeben“ aktivieren und erneut fragen: Nur nun dürfen ausgewählte persönliche Belege erscheinen.
6. Wikipedia-Schalter getrennt prüfen; nur eingeschaltet darf eine MediaWiki-Anfrage ausgelöst werden.
7. Gleichzeitig je eine Frage absenden und die verständliche 429-Meldung bei Überlastung prüfen.
8. Den Live-Sprachdialog auf Android Chrome prüfen: Berechtigung, ein kompletter Sprachzug, Unterbrechen, Pausieren und Beenden. Kontrollieren, dass beim Ansichtswechsel kein Mikrofon weiterläuft.
9. Nach Ablauf von `SEMINAR_ACTIVE_UNTIL` muss die Funktion Anfragen ablehnen.

Für etwa 20 Geräte bleiben Prompts kurz: maximal 1.200 Zeichen Frage, 1.800 Zeichen Verlauf, 5.000 Zeichen Graphkontext und 220 Ausgabetokens. Bei HTTP 429 fordert die App zu einem kurzen erneuten Versuch auf. Große optionale WebLLM-/ONNX-Dateien gehören nicht mehr zum automatischen QR-App-Precache; sie werden erst bei bewusster lokaler Modell-/Embedding-Nutzung geladen.

## Transparenztext in der Präsentation

> Im QR-Seminarmodus wurden Fragen beziehungsweise erkannte Sprachtranskripte, ein kurzer Verlauf und maximal 5.000 Zeichen ausgewählter Graphkontext an ein gehostetes Llama-Modell übermittelt. Persönliche Text-/PDF-Belege wurden nur nach ausdrücklicher Freigabe einbezogen; die Originaldateien und vollständigen Wissensgraphen blieben im jeweiligen Browser. Eine optionale Wikipedia-Suche übertrug die Suchfrage separat an MediaWiki. Beim Live-Sprachdialog konnte der Browser das Mikrofonsignal zusätzlich über einen eigenen Spracherkennungsdienst verarbeiten; Noesis speicherte keine Audiodatei. Dieser Modus diente nur der interaktiven Demonstration und war nicht Teil des Offline-Experiments.
