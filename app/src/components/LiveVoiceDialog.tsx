export type LiveVoiceStage =
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'error'
  | 'offline'
  | 'unsupported'

interface LiveVoiceDialogProps {
  open: boolean
  stage: LiveVoiceStage
  transcript: string
  lastQuestion: string
  lastAnswer: string
  error: string | null
  muted: boolean
  speechOutputAvailable: boolean
  engineLabel: string
  remoteAnswer: boolean
  onClose: () => void
  onPrimaryAction: () => void
  onStopTurn: () => void
  onToggleMuted: () => void
}

function MicrophoneIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75v-5a3.75 3.75 0 0 0-7.5 0v5A3.75 3.75 0 0 0 12 15.25Z" />
      <path d="M5.75 10.75v.75a6.25 6.25 0 0 0 12.5 0v-.75M12 17.75v3M8.75 20.75h6.5" />
      {muted && <path d="m4.25 4.25 15.5 15.5" />}
    </svg>
  )
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.25 9.25v5.5h3.5l4.5 3.75v-13l-4.5 3.75h-3.5Z" />
      {muted ? (
        <path d="m16 9 4 6m0-6-4 6" />
      ) : (
        <path d="M16 8.25a5 5 0 0 1 0 7.5M18.5 5.75a8.4 8.4 0 0 1 0 12.5" />
      )}
    </svg>
  )
}

function stageCopy(stage: LiveVoiceStage): { eyebrow: string; heading: string; detail: string } {
  if (stage === 'listening') {
    return {
      eyebrow: 'Mikrofon aktiv',
      heading: 'Ich höre dir zu',
      detail: 'Sprich einfach los. Nach einer kurzen Pause wird deine Frage automatisch gesendet.',
    }
  }
  if (stage === 'thinking') {
    return {
      eyebrow: 'Frage verstanden',
      heading: 'Noesis denkt nach',
      detail: 'Passendes Wissen und seine Beziehungen werden gerade zusammengestellt.',
    }
  }
  if (stage === 'speaking') {
    return {
      eyebrow: 'Antwort',
      heading: 'Noesis spricht',
      detail: 'Du kannst die Antwort jederzeit unterbrechen und direkt weiterfragen.',
    }
  }
  if (stage === 'paused') {
    return {
      eyebrow: 'Mikrofon pausiert',
      heading: 'Bereit, wenn du es bist',
      detail: 'Tippe auf das Mikrofon, um das Gespräch fortzusetzen.',
    }
  }
  if (stage === 'error') {
    return {
      eyebrow: 'Sprachmodus pausiert',
      heading: 'Das hat noch nicht geklappt',
      detail: 'Prüfe die Mikrofonfreigabe und versuche es anschließend erneut.',
    }
  }
  if (stage === 'offline') {
    return {
      eyebrow: 'Noesis ist offline',
      heading: 'Sprache bleibt ausgeschaltet',
      detail: 'Die Browser-Spracherkennung ist nicht garantiert lokal. Schließe diesen Dialog und aktiviere Online erst, wenn du diesen möglichen Browserdienst bewusst erlauben möchtest.',
    }
  }
  if (stage === 'unsupported') {
    return {
      eyebrow: 'Nicht verfügbar',
      heading: 'Dieser Browser kann Sprache nicht erkennen',
      detail: 'Der normale Textchat bleibt vollständig nutzbar. Auf Android funktioniert der Modus am zuverlässigsten in Chrome.',
    }
  }
  return {
    eyebrow: 'Live-Gespräch',
    heading: 'Sprich mit Noesis',
    detail: 'Tippe bewusst auf das Mikrofon. Die Erkennung stammt aus dem Browser und kann dafür einen Onlinedienst verwenden.',
  }
}

export default function LiveVoiceDialog({
  open,
  stage,
  transcript,
  lastQuestion,
  lastAnswer,
  error,
  muted,
  speechOutputAvailable,
  engineLabel,
  remoteAnswer,
  onClose,
  onPrimaryAction,
  onStopTurn,
  onToggleMuted,
}: LiveVoiceDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    dialog?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not(:disabled), details > summary, [tabindex]:not([tabindex="-1"])'),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null
  const copy = stageCopy(stage)
  const primaryDisabled = stage === 'thinking' || stage === 'unsupported' || stage === 'offline'
  const primaryLabel = stage === 'listening'
    ? 'Mikrofon pausieren'
    : stage === 'speaking'
      ? 'Antwort unterbrechen und sprechen'
      : stage === 'error'
        ? 'Erneut versuchen'
        : stage === 'offline'
          ? 'Im Offline-Modus gesperrt'
          : stage === 'unsupported'
            ? 'Spracherkennung nicht verfügbar'
            : 'Mikrofon einschalten'

  return (
    <div className="live-voice-backdrop">
      <section
        ref={dialogRef}
        className="live-voice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-voice-title"
        aria-describedby="live-voice-description"
        tabIndex={-1}
      >
        <header className="live-voice-header">
          <div className="live-voice-brand">
            <span className="live-voice-brand-mark" aria-hidden="true">N</span>
            <span>
              <strong>Noesis</strong>
              <small>Live-Gespräch · {engineLabel}</small>
            </span>
          </div>
          <button type="button" className="live-voice-close" onClick={onClose} aria-label="Live-Gespräch beenden">
            ×
          </button>
        </header>

        <div className="live-voice-route" aria-label="Verarbeitungshinweis">
          <span><i className="live-voice-route-dot mic" /> Spracheingabe: Browserdienst, je nach Gerät online</span>
          <span><i className={`live-voice-route-dot ${remoteAnswer ? 'cloud' : 'local'}`} /> Antwort: {remoteAnswer ? 'Seminar-Modell online' : 'gewählte Noesis-Engine'}</span>
        </div>

        <div className="live-voice-stage" data-stage={stage}>
          <div className="live-voice-orbit live-voice-orbit-one" aria-hidden="true" />
          <div className="live-voice-orbit live-voice-orbit-two" aria-hidden="true" />
          <div className="live-voice-orb" aria-hidden="true">
            <span className="live-voice-wave">
              {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
            </span>
          </div>
        </div>

        <div className="live-voice-copy" aria-live="polite">
          <div className="eyebrow">{copy.eyebrow}</div>
          <h2 id="live-voice-title">{copy.heading}</h2>
          <p id="live-voice-description">{error || copy.detail}</p>
        </div>

        <div className="live-voice-transcript">
          {stage === 'listening' && transcript ? (
            <p><strong>Du:</strong> {transcript}</p>
          ) : lastQuestion ? (
            <>
              <p><strong>Du:</strong> {lastQuestion}</p>
              {lastAnswer && <p className="live-voice-answer"><strong>Noesis:</strong> {lastAnswer}</p>}
            </>
          ) : (
            <p className="live-voice-transcript-empty">Dein gesprochenes Gespräch erscheint zusätzlich im normalen Chat.</p>
          )}
        </div>

        <footer className="live-voice-controls">
          <button
            type="button"
            className="live-voice-control secondary"
            onClick={onToggleMuted}
            aria-pressed={muted}
            disabled={!speechOutputAvailable}
          >
            <SpeakerIcon muted={muted} />
            <span>
              {speechOutputAvailable
                ? muted
                  ? 'Ton an'
                  : stage === 'speaking'
                    ? 'Stumm & weiter'
                    : 'Stumm'
                : 'Kein Ton'}
            </span>
          </button>

          <button
            type="button"
            className="live-voice-control primary"
            onClick={onPrimaryAction}
            disabled={primaryDisabled}
            aria-label={primaryLabel}
          >
            <MicrophoneIcon muted={stage === 'paused' || stage === 'error'} />
          </button>

          <button
            type="button"
            className="live-voice-control secondary"
            onClick={stage === 'thinking' ? onStopTurn : onClose}
          >
            <span className="live-voice-stop-icon" aria-hidden="true">■</span>
            <span>{stage === 'thinking' ? 'Stoppen' : 'Beenden'}</span>
          </button>
        </footer>

        <details className="live-voice-privacy">
          <summary>Was geschieht mit meiner Stimme?</summary>
          <p>
            Diese App selbst speichert keine Audiodatei. Die Web-Spracherkennung wird jedoch vom Browser bereitgestellt
            und kann Ton zur Erkennung an dessen Anbieter übertragen; über eine dortige Speicherung kann Noesis keine
            Aussage treffen. Das erkannte Transkript wird wie eine getippte Frage verarbeitet. Die Vorlesestimme stammt
            ebenfalls aus dem Browser beziehungsweise Betriebssystem.
          </p>
        </details>
      </section>
    </div>
  )
}
import { useEffect, useRef } from 'react'
