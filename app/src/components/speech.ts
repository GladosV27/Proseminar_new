/**
 * Kompatibilitätsschicht für den technischen Studien-Assistenten.
 *
 * Spracherkennung und Vorlesen stammen aus Browser beziehungsweise
 * Betriebssystem. Je nach Gerät können die Anbieter dafür Online-Dienste
 * verwenden; eine vollständig lokale Verarbeitung wird hier nicht behauptet.
 */

import {
  cancelAllSpeech,
  speechSynthesisAvailable,
  startRecognitionSession,
  startSpeechPlayback,
  voiceRecognitionAvailable,
  type SpeakOptions,
  type SpeechPlayback,
} from '../engine/liveVoice'

export { listGermanVoices } from '../engine/liveVoice'
export type { GermanVoiceInfo, SpeakOptions, VoicePlaybackPreferences } from '../engine/liveVoice'

let activePlayback: SpeechPlayback | null = null

export function speechRecognitionAvailable(): boolean {
  return voiceRecognitionAvailable()
}

/** Startet eine einmalige Diktat-Sitzung; liefert das beste Endtranskript. */
export function dictate(onInterim: (text: string) => void): { promise: Promise<string>; cancel: () => void } {
  const session = startRecognitionSession({
    lang: 'de-DE',
    continuous: false,
    interimResults: true,
    onTranscript: (transcript) => onInterim(transcript.combined),
  })
  return { promise: session.result, cancel: () => session.abort() }
}

export function speak(text: string, options: SpeakOptions = {}): SpeechPlayback {
  stopSpeaking()
  const playback = startSpeechPlayback(text, { lang: 'de-DE', rate: 1, ...options })
  activePlayback = playback
  void playback.done
    .catch(() => undefined)
    .finally(() => {
      if (activePlayback === playback) activePlayback = null
    })
  return playback
}

export function stopSpeaking(): void {
  activePlayback?.cancel()
  activePlayback = null
  cancelAllSpeech()
}

export function speaking(): boolean {
  try {
    return Boolean(activePlayback) || (speechSynthesisAvailable() && window.speechSynthesis.speaking)
  } catch {
    return Boolean(activePlayback)
  }
}

export function ttsAvailable(): boolean {
  return speechSynthesisAvailable()
}
