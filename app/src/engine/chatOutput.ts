export interface CompletedChatAnswer {
  text: string
  trimmed: boolean
}

const COMPLETE_END = /[.!?…](?:["'»”\)\]]*)$/
const SENTENCE_BOUNDARY = /[.!?…](?:["'»”\)\]]*)?(?=\s+(?:[A-ZÄÖÜ0-9„“"'])|$)/g

/**
 * A token budget can stop a local model in the middle of a sentence. Keep
 * the last complete sentence instead of presenting that fragment as final.
 */
export function completeChatAnswer(raw: string): CompletedChatAnswer {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text || COMPLETE_END.test(text)) return { text, trimmed: false }

  const boundaries = [...text.matchAll(SENTENCE_BOUNDARY)]
  const last = boundaries.at(-1)
  if (last?.index !== undefined) {
    const completed = text.slice(0, last.index + last[0].length).trim()
    if (completed.length >= 24) return { text: completed, trimmed: true }
  }

  return {
    text: 'Die lokale Antwort konnte innerhalb des Ausgabelimits nicht vollständig formuliert werden. Bitte frage etwas gezielter nach.',
    trimmed: true,
  }
}
