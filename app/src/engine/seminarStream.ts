export interface SeminarStreamResult {
  text: string
}

export interface SeminarStreamOptions {
  /** Begrenzte UI-Aktualisierungen verhindern hunderte React-Renders pro Sekunde. */
  throttleMs?: number
  signal?: AbortSignal
}

interface DeltaPayload {
  text?: unknown
  error?: unknown
}

function abortError(): Error {
  return new DOMException('Der Antwortstream wurde abgebrochen.', 'AbortError')
}

function createPartialEmitter(
  onPartial: ((partial: string) => void) | undefined,
  throttleMs: number,
): { update: (partial: string) => void; flush: () => void; cancel: () => void } {
  let latest = ''
  let lastEmitted = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const emit = () => {
    timer = null
    if (!onPartial || latest === lastEmitted) return
    lastEmitted = latest
    onPartial(latest)
  }

  return {
    update(partial) {
      latest = partial
      if (!onPartial || timer !== null) return
      timer = setTimeout(emit, throttleMs)
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      emit()
    },
    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}

function eventData(block: string): string | null {
  const lines = block
    .split('\n')
    .map((line) => line.endsWith('\r') ? line.slice(0, -1) : line)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
  return lines.length ? lines.join('\n').trim() : null
}

/**
 * Liest den von der Edge Function bewusst reduzierten SSE-Dialekt:
 * `data: {"text":"…"}` fuer Text und `data: [DONE]` als Pflichtabschluss.
 * Provider-Metadaten oder Reasoning gelangen dadurch nicht in die App.
 */
export async function consumeSeminarSse(
  stream: ReadableStream<Uint8Array>,
  onPartial?: (partial: string) => void,
  options: SeminarStreamOptions = {},
): Promise<SeminarStreamResult> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const emitter = createPartialEmitter(onPartial, Math.max(16, options.throttleMs ?? 40))
  let buffer = ''
  let text = ''
  let sawDone = false

  const processBlock = (rawBlock: string) => {
    const data = eventData(rawBlock)
    if (!data || sawDone) return
    if (data === '[DONE]') {
      sawDone = true
      return
    }

    let payload: DeltaPayload
    try {
      payload = JSON.parse(data) as DeltaPayload
    } catch {
      throw new Error('Der Seminar-Server lieferte einen ungültigen Antwortstream.')
    }
    if (typeof payload.error === 'string' && payload.error.trim()) throw new Error(payload.error.trim())
    if (typeof payload.text !== 'string') {
      throw new Error('Der Seminar-Server lieferte einen ungültigen Antwortstream.')
    }
    if (!payload.text) return
    text += payload.text
    emitter.update(text)
  }

  const drain = (flush = false) => {
    // Erst CRLF normalisieren, nachdem eventuell getrennt eingetroffene \r/\n
    // wieder gemeinsam im Puffer stehen.
    buffer = buffer.replace(/\r\n/g, '\n')
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) processBlock(block)
    if (flush && buffer.trim()) {
      processBlock(buffer)
      buffer = ''
    }
  }

  const abort = () => {
    void reader.cancel(options.signal?.reason).catch(() => undefined)
  }
  options.signal?.addEventListener('abort', abort, { once: true })

  try {
    if (options.signal?.aborted) {
      await reader.cancel(options.signal.reason).catch(() => undefined)
      throw abortError()
    }
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      drain()
    }
    buffer += decoder.decode()
    drain(true)
    if (options.signal?.aborted) throw abortError()
    if (!sawDone) throw new Error('Der Antwortstream wurde vorzeitig beendet. Bitte erneut versuchen.')
    emitter.flush()
    return { text }
  } finally {
    options.signal?.removeEventListener('abort', abort)
    emitter.cancel()
    reader.releaseLock()
  }
}
