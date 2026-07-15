/**
 * Sprachmodus: Diktat (SpeechRecognition) und Vorlesen (speechSynthesis).
 * Beides sind Browser-APIs – keine Cloud, kein zusätzliches Modell.
 * (Hinweis: Die Erkennung nutzt je nach Browser ggf. einen Online-Dienst
 * des Browserherstellers; das Vorlesen ist immer lokal.)
 */

type RecognitionCtor = new () => {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { [i: number]: { isFinal: boolean } } }) => void) | null
  onend: (() => void) | null
  onerror: ((ev: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechRecognitionAvailable(): boolean {
  return getRecognitionCtor() !== null
}

/** Startet eine einmalige Diktat-Sitzung; liefert das finale Transkript. */
export function dictate(onInterim: (text: string) => void): { promise: Promise<string>; cancel: () => void } {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    return { promise: Promise.reject(new Error('Spracherkennung wird von diesem Browser nicht unterstützt.')), cancel: () => {} }
  }
  const rec = new Ctor()
  rec.lang = 'de-DE'
  rec.interimResults = true
  rec.maxAlternatives = 1

  let final = ''
  const promise = new Promise<string>((resolve, reject) => {
    rec.onresult = (ev) => {
      let interim = ''
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i] as unknown as { isFinal: boolean; 0: { transcript: string } }
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      onInterim(final + interim)
    }
    rec.onerror = (ev) => reject(new Error(`Spracherkennung: ${ev.error}`))
    rec.onend = () => resolve(final.trim())
    rec.start()
  })
  return { promise, cancel: () => rec.abort() }
}

export function speak(text: string): void {
  stopSpeaking()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'de-DE'
  u.rate = 1.05
  const german = speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'))
  if (german) u.voice = german
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  try {
    speechSynthesis.cancel()
  } catch {
    /* optional */
  }
}

export function speaking(): boolean {
  try {
    return speechSynthesis.speaking
  } catch {
    return false
  }
}

export function ttsAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined'
}
