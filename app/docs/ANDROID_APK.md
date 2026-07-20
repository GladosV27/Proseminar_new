# Noesis als echte Android-App

Die APK führt das lokale Sprachmodell über **LiteRT-LM 0.14.0 auf der CPU mit maximal vier Threads** aus. Damit umgeht sie den fehlerhaften WebGPU-/Dawn-/Vulkan-Pfad, der auf einigen Android-Geräten `VK_ERROR_UNKNOWN` auslöst. Die React-Oberfläche bleibt in Capacitor eingebettet; Download, Inferenz und der Sprachaufnahme-Fallback laufen nativ in Kotlin.

## Unterstützte Geräte

- technische Mindestversion: Android 7.0 / API 24
- Architektur: 64-Bit ARM (`arm64-v8a`)
- sinnvoller Zielbereich: aktuelle Android-Geräte; Geschwindigkeit hängt von RAM, CPU und Temperatur ab
- Gemma 4 E2B IT: etwa 2,59 GB Download, mindestens 7 GB gemeldeter RAM und 5–6 GB freier Speicher empfohlen
- Qwen3 0.6B Mobile No-Think INT4: etwa 348 MB Download, für physische 4–6-GB-Geräte als schneller kompatibler Fallback (Android meldet davon typischerweise weniger als den beworbenen Nennwert)

Eine ehrliche Garantie für jedes Android-Handy ist bei lokalen LLMs nicht möglich. 32-Bit-Geräte und sehr speicherarme Handys werden bewusst nicht unterstützt. Ein Samsung S23+ liegt im vorgesehenen Zielbereich.

## Sicherheits- und Offline-Eigenschaften

Die Modelle sind nicht in der APK enthalten. Nach der Installation werden sie einmalig in das app-private Modellverzeichnis geladen. Der Downloader setzt eine abgebrochene `.part`-Datei beim nächsten Antippen fort, folgt HTTP-Weiterleitungen, prüft Dateigröße und SHA-256 und benennt die Datei erst danach atomar um. Die URLs sind auf unveränderliche Hugging-Face-Revisionen statt `main` gepinnt. Danach funktioniert die Inferenz ohne Internet.

| Modell | SHA-256 |
| --- | --- |
| Gemma 4 E2B IT | `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c` |
| Qwen3 0.6B Mobile No-Think | `2df6821ec12702dafd33915e7a1a1adc7c4b053f3672fd9555dfaf3a114c4139` |

Der Download läuft innerhalb des App-Prozesses. Beendet Android die App vollständig, bleibt der Teilstand erhalten; nach erneutem Öffnen muss der Download noch einmal angetippt werden. Ein dauerhafter Foreground-Service ist in der Seminarversion nicht enthalten.

## APK über GitHub Actions bauen

1. Im Repository den Tab **Actions** öffnen.
2. Den Workflow **Android APK bauen** auswählen und mit **Run workflow** starten.
3. Nach dem grünen Lauf das Artifact `noesis-android-<commit>` herunterladen und entpacken.
4. `noesis-android.apk` auf das Handy kopieren, öffnen und die Installation aus unbekannter Quelle für den verwendeten Browser/Dateimanager einmal erlauben.

Der Workflow verwendet einen stabilen, nur als GitHub-Secret hinterlegten Release-Key. Damit kann eine spätere APK als Update installiert werden, ohne lokales Wissen oder Modelldateien durch eine Deinstallation zu verlieren. Ein `android-v*`-Tag stellt denselben geprüften Build dauerhaft als `Noesis-Android.apk` im GitHub Release bereit. Für den Play Store wären später noch ein Android App Bundle und der Store-Prozess erforderlich.

Für einen neuen Fork müssen vor dem ersten dauerhaften Release alle vier Repository-Secrets gemeinsam gesetzt werden: `NOESIS_KEYSTORE_BASE64` (Base64-Inhalt des JKS), `NOESIS_KEYSTORE_PASSWORD`, `NOESIS_KEY_ALIAS` und `NOESIS_KEY_PASSWORD`. Fehlt alles, erzeugt der Workflow nur ein kurzlebiges Debug-Artifact; ist die Konfiguration nur teilweise vorhanden, bricht er absichtlich ab. Der Keystore selbst ist durch `.gitignore` vom Repository ausgeschlossen und muss separat sicher aufbewahrt werden.

## Lokal bauen

Voraussetzungen sind Node.js 22, JDK 21 sowie Android Studio mit Android SDK/API 36. Danach aus dem Ordner `app`:

```powershell
npm.cmd ci
npm.cmd run build
npx.cmd cap sync android
cd android
.\gradlew.bat :app:assembleDebug
```

Die Debug-APK liegt unter `app/android/app/build/outputs/apk/debug/app-debug.apk`. Sie ist für Entwicklung gedacht. Die öffentlich weitergegebene Datei stammt aus `assembleRelease` und wird mit demselben stabilen Key wie künftige Updates signiert.

## Native Bridges

`NoesisNativeLlm` stellt `capabilities`, Modellstatus, resumierbaren Download, Laden, Generieren, Unterbrechen und modellgebundenes Entsorgen bereit. Fortschritt kommt über `nativeLlmDownloadProgress`, gestreamte Textteile über `nativeLlmToken`.

`NoesisSpeech` fragt `RECORD_AUDIO` erst beim ersten Sprechversuch ab und verwendet Androids nativen `SpeechRecognizer`, falls die WebView keine Web Speech API anbietet. Ob die Erkennung lokal oder über einen Herstellerdienst erfolgt, entscheidet Android; der Datenschutzhinweis in der App bleibt deshalb notwendig.

Im deterministischen Experiment gelten `topK=1`, `temperature=0`, `seed=42`. Im normalen Chat nutzt Qwen No-Think-Sampling und Gemma natürlichere Einstellungen. Weil LiteRT-LM 0.14 kein verlässliches Ausgabe-Tokenlimit pro Anfrage anbietet, setzt die Bridge zusätzlich eine konservative Zeichenbegrenzung und bricht lange Ausgaben nativ ab.

Die nativen Mobilmodelle sind bewusst als Produktdemo beziehungsweise Pilot markiert und nicht für die konfirmatorische Hauptmessung freigeschaltet: Ihr kleineres Kontextfenster und abweichendes Ausgabelimit würden sonst Retrieval und Modellkonfiguration gleichzeitig verändern. Der Hauptvergleich bleibt auf einer identischen Desktop-/WebLLM-Engine über alle Bedingungen.

## Noch auf echten Handys prüfen

- Erststart und Modellinitialisierung auf dem Samsung S23+
- Abbruch und Wiederaufnahme beider Modelldownloads
- Flugmodus nach erfolgreichem Download
- Mikrofonberechtigung, Spracheingabe und Systemstimme
- lange Antworten, Unterbrechen und erneutes Generieren
- Speicherverbrauch und thermische Drosselung nach mehreren Antworten

Der komplette Build wurde lokal mit JDK 21, Android SDK 36 und LiteRT-LM 0.14.0 bis zur installierbaren APK verifiziert. Unterschiedliche RAM-, Temperatur- und Herstellerbedingungen erfordern trotzdem reale Gerätetests.
