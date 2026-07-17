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
