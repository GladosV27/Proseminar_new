function compactCommand(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanCommandTopic(value: string): string {
  return compactCommand(value)
    .replace(/^[„“”"'‚‘’]+|[„“”"'‚‘’]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim()
}

export function comparableKnowledgeTitle(value: string): string {
  return cleanCommandTopic(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
}

/**
 * Erkennt nur klar formulierte Schreibbefehle. Normale Fragen bleiben damit
 * unverändert im RAG-/Modellpfad; der Import hängt nicht von der Fähigkeit
 * des gerade geladenen Sprachmodells ab.
 */
export function parseKnowledgeAddCommand(raw: string): string | null {
  const command = compactCommand(raw)
  const patterns = [
    /^\/(?:wissen|knowledge)\s+(.+)$/i,
    /^(?:bitte\s+)?füge\s+(?:bitte\s+)?(?:in|zu)\s+(?:deinen|meinen|den|dem)\s+wissens(?:baum|graph(?:en)?)\s+(.+?)\s+hinzu[.!?]?$/i,
    /^(?:bitte\s+)?füge\s+(?:bitte\s+)?(.+?)\s+(?:in|zu)\s+(?:deinen|meinen|den|dem)\s+wissens(?:baum|graph(?:en)?)\s+hinzu[.!?]?$/i,
    /^(?:bitte\s+)?nimm\s+(.+?)\s+in\s+(?:deinen|meinen|den)\s+wissens(?:baum|graph(?:en)?)\s+auf[.!?]?$/i,
    /^(?:bitte\s+)?ergänze\s+(?:deinen|meinen|den)\s+wissens(?:baum|graph(?:en)?)\s+um\s+(.+?)[.!?]?$/i,
    /^(?:bitte\s+)?speichere\s+(.+?)\s+(?:im|in\s+(?:deinem|meinem|dem))\s+wissens(?:baum|graph(?:en)?)[.!?]?$/i,
  ]
  for (const pattern of patterns) {
    const match = command.match(pattern)
    if (!match) continue
    const topic = cleanCommandTopic(match[1])
    return topic.length >= 2 && topic.length <= 160 ? topic : null
  }
  return null
}

export type NoesisAction =
  | { kind: 'add-wikipedia'; topic: string }
  | { kind: 'open-view'; view: 'explorer' | 'arena' }

/** Kleine, validierbare Aktionsschicht statt freier LLM-Toolausführung. */
export function parseNoesisAction(raw: string): NoesisAction | null {
  const topic = parseKnowledgeAddCommand(raw)
  if (topic) return { kind: 'add-wikipedia', topic }
  const command = compactCommand(raw).replace(/[.!?]+$/g, '')
  if (/^(?:öffne|zeige)(?:\s+mir)?\s+(?:den|meinen)?\s*(?:wissensraum|wissensbaum|graph(?:en)?|graph-explorer)$/i.test(command)) {
    return { kind: 'open-view', view: 'explorer' }
  }
  if (/^(?:öffne|zeige)(?:\s+mir)?\s+(?:die\s+)?(?:live-)?arena$/i.test(command) ||
      /^(?:vergleiche|vergleich)\s+(?:vektor-rag\s+(?:und|mit)\s+graph-rag|graph-rag\s+(?:und|mit)\s+vektor-rag)$/i.test(command)) {
    return { kind: 'open-view', view: 'arena' }
  }
  return null
}
