# Live-Quiz: kostenlos hosten und im Seminar nutzen

Der **Live-Quizmodus** ist eine Kahoot-artige Präsentationsfunktion. Der Host erstellt auf dem Laptop einen Raum; bis zu etwa 20 Teilnehmende treten per QR-Code oder sechsstelligen Code bei. Der Host-Browser erzeugt die Graph-Fragen, prüft Antworten und berechnet Punkte. Über Supabase Realtime werden nur kurzlebige Spielereignisse synchronisiert.

> Das Live-Quiz ist absichtlich **vollständig getrennt** von Experiment, Bewertung und Forschungsdaten. Quiz-Nicknames, Antworten und Punkte gehen weder in die RAG-Auswertung noch in deren Export ein.

## Einmalig: kostenloses Supabase-Projekt

1. Bei [Supabase](https://supabase.com/dashboard) ein kostenloses Projekt anlegen.
2. In *Project Settings → API* die **Project URL** und den **Publishable key** kopieren.
3. Im Ordner `app` die Datei `.env.example` nach `.env` kopieren und die beiden Werte einsetzen:

   ```dotenv
   VITE_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_DEIN_OEFFENTLICHER_SCHLUESSEL
   ```

4. Den laufenden Vite-Server stoppen und neu starten:

   ```powershell
   npm.cmd run dev
   ```

Die App verwendet absichtlich keinen Datenbankzugriff, keine Anmeldung und keine Server-Funktion: Supabase Realtime Broadcast reicht für den moderierten Seminarraum. Pro Raum werden zwei öffentliche Topics verwendet:

- `graph-rag-live:RAUMCODE:host`: Nur der Host abonniert dieses Postfach. Smartphones senden Beitritte, Antworten und Synchronisationsanfragen dorthin.
- `graph-rag-live:RAUMCODE:state`: Nur die Smartphones abonnieren diesen Kanal. Der Host verteilt darüber Lobby, Frage, Auflösung und Punktestand.

Diese Trennung verhindert, dass jede Antwort unnötig an alle Smartphones aufgefächert wird. Zusätzlich sendet der Host höchstens alle 600 ms einen neuen Spielstand. Bei 20 gleichzeitig antwortenden Teilnehmenden entstehen damit im ungünstigsten Sekundenfenster ungefähr 82 berechnete Realtime-Nachrichten pro Sekunde (etwa 40 für Antworten und Host-Empfang sowie höchstens 42 für Zustandsversand und Empfänger). Das bleibt unter dem Free-Limit von 100 Nachrichten pro Sekunde; die App begrenzt Räume deshalb konsequent auf 20 Personen. Siehe [Realtime-Limits](https://supabase.com/docs/guides/realtime/limits) und [Nachrichtenabrechnung](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages).

Dieselbe Broadcast-Verbindung trägt den optionalen **gemeinsamen Seminargraphen**. Teilnehmende übertragen dort ausschließlich Spitzname und Themenbegriff. Vorschläge verändern noch nichts: Nur der Host kann einen Begriff freigeben; erst danach fragt das Präsentationsgerät die öffentliche MediaWiki-API ab und speichert den geprüften Import lokal. Die Smartphones erhalten lediglich die Annahme- oder Ablehnungsnachricht.

## Sicherheitsregel

Der `sb_publishable_…`-Key darf im Browser und damit im gebauten Frontend stehen. **Nie** einen `sb_secret_…`, `service_role`-Key oder ein anderes Geheimnis in `.env`, GitHub-Actions-Variablen oder den gebauten Frontend-Code eintragen. Die öffentlichen Broadcast-Topics sind für eine moderierte Lehrveranstaltung gedacht, nicht für einen öffentlichen, manipulationssicheren Wettbewerb. Der Host hält Spielstand und Lösungen nur im Arbeitsspeicher; ein Reload oder Schließen des Host-Tabs beendet den Raum. Smartphones versuchen nach einem kurzzeitigen Verbindungsabbruch automatisch erneut zu verbinden und fordern anschließend den aktuellen Zustand beim Host an.

## Deployment mit GitHub Pages

GitHub Pages liefert ausschließlich das statische Frontend aus; Supabase bleibt der getrennte Echtzeitdienst. Der vorhandene GitHub-Actions-Workflow baut und veröffentlicht die App.

1. Im GitHub-Repository unter *Settings → Pages* als Quelle **GitHub Actions** wählen.
2. Unter *Settings → Secrets and variables → Actions → Variables* zwei **Repository variables** anlegen:

   | Name | Wert |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://DEIN-PROJEKT.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_DEIN_OEFFENTLICHER_SCHLUESSEL` |

3. Auf `main` pushen oder den Workflow unter *Actions* manuell starten. Änderungen an Variablen wirken erst nach einem neuen Build.
4. Die veröffentlichte Adresse, z. B. `https://GLADOSV27.github.io/Proseminar_new/`, einmal auf Laptop und Smartphone öffnen.
5. Im Menü **Live-Quiz** auf dem Präsentationslaptop einen Raum eröffnen. Den angezeigten QR-Code projizieren; er enthält bereits Raumcode und Beitrittslink. Die Teilnehmenden bestätigen nur noch ihren Spitznamen.

## Ablauf im Seminar

1. Vor der Sitzung auf dem Laptop die veröffentlichte GitHub-Pages-URL aufrufen und mit einem Smartphone einen vollständigen Test-Raum durchspielen.
2. Im Vortrag **Live-Quiz → Raum eröffnen** wählen. Das Quiz nutzt kurze, leicht verständliche Multiple-Choice-Fragen statt anspruchsvoller Pfad-Rätsel.
3. QR-Code projizieren und warten, bis die Namen in der Lobby erscheinen.
4. „Erste Frage starten“. Jede Runde dauert 18 Sekunden; der Host kann früher auflösen.
5. Nach jeder Antwort zeigt die Auflösung die richtige Lösung, eine kurze fachliche Einordnung und ihre Position beziehungsweise Verbindung im Wissensgraphen. So wird aus dem normalen Quiz schrittweise eine verständliche Graph-RAG-Demonstration.
6. Nach der letzten Frage zeigt die App das Siegerpodest. Raum anschließend schließen.

## Fehlersuche

- **„Noch nicht verbunden“:** Lokal `.env` prüfen und Vite neu starten. Auf GitHub müssen beide Actions-Variablen hinterlegt und die Pages-App danach neu gebaut worden sein.
- **Smartphone findet den Raum nicht:** Beide Geräte brauchen Internet; den QR-Code neu scannen oder den sechsstelligen Code manuell eingeben.
- **Verbindung war kurz weg:** Das Smartphone verbindet sich erneut und fordert den aktuellen Spielstand beim weiterhin geöffneten Host an.
- **Teilnehmende warten dauerhaft:** Der Host-Tab muss offen bleiben. Nach einem Host-Reload ist der nur im Arbeitsspeicher gehaltene Raum beendet; einen neuen Raum starten und neu scannen.
- **Mehr als 20 Personen:** Weitere Beitritte werden absichtlich abgewiesen, damit der Raum innerhalb des kostenlosen Realtime-Nachrichtenlimits bleibt.
- **Browser blockiert WebSockets:** Seminar-WLAN wechseln oder einmal über Mobilfunk testen.
