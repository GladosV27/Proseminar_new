# Offline-App für den Vortrag

Für den Vortrag gibt es einen festen, lokalen Startweg. Die App-Dateien kommen aus `app/dist`, der kleine Server verwendet ausschließlich in Node.js eingebaute Module und die Adresse bleibt immer gleich:

> **http://localhost:4173/**

Dadurch bleiben Service Worker, WebLLM-Modell und Embedding-Modell demselben Browser-Ursprung zugeordnet. Auf der Bühne werden weder `npm` noch `npx` ausgeführt und es wird nichts installiert.

Der präzise Offline-Anspruch lautet:

> **Keine Server-Inferenz; nach einmaliger, dokumentierter Bereitstellung vollständig offline auf demselben Gerät, in demselben Browserprofil und unter derselben Localhost-Adresse nutzbar.**

Wikipedia-Import und Live-Recherche benötigen weiterhin Internet. Bereits in den lokalen Wissensgraphen übernommene Inhalte können danach offline verwendet werden.

## Einmalige Vorbereitung vor dem Vortrag

1. Node.js sowie die Projekt-Abhängigkeiten müssen vorhanden sein. Falls `node_modules` noch fehlt, im Ordner `app` **mit Internet** einmal ausführen:

   ```powershell
   npm.cmd ci
   ```

2. `app/VORTRAG_OFFLINE_VORBEREITEN.cmd` doppelklicken. Das Skript:

   - baut die Produktions-App,
   - erzeugt aus allen Dateien in `app/dist` eine versionierte Precache-Liste,
   - startet den lokalen Server auf Port 4173,
   - öffnet die feste Localhost-Adresse im Browser.

3. Im gewohnten Chrome- oder Edge-Profil den **Online-Modus** aktivieren.
4. Unter **Modelle** genau das WebLLM-Modell vollständig laden, das im Vortrag verwendet wird.
5. Falls Dense Retrieval gezeigt wird, auch das Embedding-Modell vollständig laden.
6. Warten, bis alle Ladeanzeigen abgeschlossen sind. Keine Browserdaten mehr löschen.
7. In der App auf **Offline** schalten und die Seite einmal neu laden.
8. WLAN deaktivieren oder den Flugmodus einschalten und mindestens zwei echte Testfragen stellen. Danach den Browser schließen, den Rechner neu starten und den Test wiederholen.

Wichtig: Immer `http://localhost:4173/` verwenden. `127.0.0.1`, eine GitHub-Pages-Adresse, ein privates Fenster oder ein anderes Browserprofil besitzen jeweils eigene Browser-Caches.

## Start am Vortragstag

1. Optional bereits vor Betreten des Raums WLAN deaktivieren.
2. `app/VORTRAG_OFFLINE_STARTEN.cmd` doppelklicken.
3. Die App öffnet sich unter `http://localhost:4173/`.
4. Das schwarze Serverfenster während des Vortrags offen lassen. Mit `Strg+C` wird es beendet.

Der Starter ruft direkt `node.exe` auf. Er führt **kein** `npm`, `npx`, `npm install` oder `npm ci` aus und braucht keine Internetverbindung.

## Was getrennt gespeichert wird

- Der Service Worker speichert alle gebauten App-Dateien in einem Cache namens `graphrag-app-shell-<Build-ID>`.
- Bei einem neuen Build entfernt er nur ältere Caches mit dem Präfix `graphrag-app-shell-`.
- WebLLM und Transformers.js verwalten ihre Modellartefakte in eigenen Caches beziehungsweise Browser-Speichern.
- Der Service Worker löscht, leert oder überschreibt diese fremden Modell-Caches niemals.

Der lokale Server liefert die App auch dann aus `app/dist`, wenn ein Service Worker im Browser noch nicht aktiv ist. Der Precache ist zusätzlich wichtig, wenn die Produktions-App später über eine statische Website besucht und danach ohne Netz erneut geöffnet wird.

## Technischer Bereitschaftstest

Der Service Worker beantwortet die Nachricht `GET_OFFLINE_STATUS`. Zum manuellen Prüfen kann in den Browser-Entwicklertools auf der App-Seite Folgendes ausgeführt werden:

```js
const channel = new MessageChannel()
channel.port1.onmessage = ({ data }) => console.table(data)
navigator.serviceWorker.controller?.postMessage(
  { type: 'GET_OFFLINE_STATUS', requestId: 'vortrag-check' },
  [channel.port2],
)
```

`ready: true` bedeutet, dass jede Datei aus dem Build-Manifest in der App-Shell liegt. Dieser Status prüft absichtlich nicht, ob ein bestimmtes WebLLM-Modell geladen wurde; das muss mit einer echten Antwort im Offline-Modus getestet werden.

## Fehlerbehebung

### „Der Vortrag-Build fehlt“

Vorher `VORTRAG_OFFLINE_VORBEREITEN.cmd` ausführen. Diese Vorbereitung benötigt vorhandene `node_modules`, der spätere Start nicht.

### „Port 4173 ist bereits belegt“

Möglicherweise läuft die App schon. `http://localhost:4173/` öffnen. Falls dort etwas anderes erscheint, den anderen lokalen Server beenden und den Starter erneut ausführen.

### App startet, aber das LLM will herunterladen

Der Browser findet die Modellgewichte unter diesem Ursprung und Profil nicht. Wieder online gehen, exakt `http://localhost:4173/` verwenden, das Modell vollständig laden und anschließend den Flugmodus-Test wiederholen.

### Nach einem Browser-Reset ist das Modell weg

Browserdaten, Speicherdruck, ein privates Fenster oder ein Profilwechsel können Modell-Caches entfernen. Deshalb gehört der Flugmodus-Test unmittelbar vor dem Vortrag zur verbindlichen Checkliste. Das Modell wird wegen Größe und Lizenz nicht in das Git-Repository oder in `app/dist` kopiert.
