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

Die App verwendet absichtlich keinen Datenbankzugriff, keine Anmeldung und keine Server-Funktion: Der Realtime-Broadcast-Kanal reicht für einen Seminarraum. Auf dem aktuellen kostenlosen Supabase-Plan sind 200 gleichzeitige Realtime-Verbindungen und zwei Millionen Nachrichten enthalten – 20 Smartphones liegen weit darunter. Siehe [Realtime-Limits](https://supabase.com/docs/guides/realtime/limits) und [Preise](https://supabase.com/pricing).

Dieselbe Broadcast-Verbindung trägt den optionalen **gemeinsamen Seminargraphen**. Teilnehmende übertragen dort ausschließlich Spitzname und Themenbegriff. Vorschläge verändern noch nichts: Nur der Host kann einen Begriff freigeben; erst danach fragt das Präsentationsgerät die öffentliche MediaWiki-API ab und speichert den geprüften Import lokal. Die Smartphones erhalten lediglich die Annahme- oder Ablehnungsnachricht.

## Sicherheitsregel

Der `sb_publishable_…`-Key darf im Browser und damit im gebauten Frontend stehen. **Nie** einen `sb_secret_…`, `service_role`-Key oder ein anderes Geheimnis in `.env`, Git oder Cloudflare eintragen. Der Raum ist für eine moderierte Lehrveranstaltung gedacht, nicht für öffentliche, manipulationssichere Wettbewerbe. Der Host hält Spielstand und Lösungen nur im Arbeitsspeicher; ein Reload/Schließen des Host-Tabs beendet den Raum.

## Deployment mit Cloudflare Pages

GitHub Pages kann das Frontend zwar ausliefern, aber selbst keine Echtzeit-Verbindungen koordinieren. Cloudflare Pages hostet weiterhin nur die statischen Dateien; Supabase ist der getrennte Echtzeitdienst.

1. Kostenloses Konto bei [Cloudflare Pages](https://pages.cloudflare.com/) öffnen und das Git-Repository verbinden.
2. In den Build-Einstellungen setzen:

   | Einstellung | Wert |
   |---|---|
   | Framework | Vite |
   | Root directory | `app` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

3. Unter *Settings → Environment variables* für **Production** und **Preview** eintragen:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

4. Deploy auslösen. Die Pages-Adresse, z. B. `https://graph-rag-lab.pages.dev`, einmal im Browser öffnen.
5. Im Menü **Live-Quiz** auf dem Präsentationslaptop einen Raum eröffnen. Den angezeigten QR-Code projizieren; die Smartphones öffnen dadurch automatisch den richtigen Raum-Link.

Cloudflare Pages Free reicht für diesen Anwendungsfall; der Free-Plan erlaubt derzeit 500 Builds pro Monat und statische Seiten werden global ausgeliefert. Details: [Cloudflare Pages Limits](https://developers.cloudflare.com/pages/platform/limits/).

## Ablauf im Seminar

1. Vor der Sitzung auf dem Laptop die veröffentlichte Cloudflare-URL aufrufen und kurz einen Test-Raum erstellen.
2. Im Vortrag **Live-Quiz → Raum eröffnen → 5 Fragen / 2 Hops** wählen.
3. QR-Code projizieren und warten, bis die Namen in der Lobby erscheinen.
4. „Erste Frage starten“. Jede Runde dauert 18 Sekunden; der Host kann früher auflösen.
5. Nach der Auflösung erklärt der Host den Graph-Pfad. Das macht die abstrakte Multi-Hop-Idee unmittelbar sichtbar.
6. Nach der letzten Frage zeigt die App das Siegerpodest. Raum anschließend schließen.

## Fehlersuche

- **„Noch nicht verbunden“:** `.env` prüfen, Vite neu starten. Bei Cloudflare müssen beide Variablen in den Build-Einstellungen hinterlegt und danach neu gebaut werden.
- **Smartphone findet den Raum nicht:** Beide Geräte brauchen Internet; den QR-Code neu scannen oder den sechsstelligen Code manuell eingeben.
- **Teilnehmende warten dauerhaft:** Der Host-Tab muss offen bleiben. Nach einem Reload auf dem Host einen neuen Raum starten und neu scannen.
- **Browser blockiert WebSockets:** Seminar-WLAN wechseln oder einmal über Mobilfunk testen.
