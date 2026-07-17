const EXPLICIT_FOLLOW_UP = /^(?:und|aber|warum|wieso|wie genau|wann|wo|welche davon|wer davon|was bedeutet das|was geschah dann)\b/i
const REFERENTIAL_PHRASE = /\b(?:dessen|deren|dieses werk|dieser philosoph|diese person|der genannte|die genannte|dort|davon|dabei|damit|ihm|ihn)\b/i
const PRONOUN_FOLLOW_UP = /^(?:was|wer|warum|wieso|wie|wann|wo|welche)\b[^?!.]*\b(?:er|sie)\b/i
const FALLBACK_INSTRUCTION = /[,.;]?\s*falls\s+du\s+(?:es\s+)?nicht\s+wei(?:ß|sst|ßt)[^.!?]*(?:wissensbaum|wissensgraph(?:en)?)[^.!?]*[.!?]?$/i

/** Deliberately excludes the generic pronoun “es”; it appears in many new questions. */
export function isFollowUpQuestion(question: string): boolean {
  const clean = question.trim()
  return EXPLICIT_FOLLOW_UP.test(clean) || REFERENTIAL_PHRASE.test(clean) || PRONOUN_FOLLOW_UP.test(clean)
}

export function requestsKnowledgeFallback(question: string): boolean {
  return FALLBACK_INSTRUCTION.test(question.trim())
}

export function stripKnowledgeFallbackInstruction(question: string): string {
  const stripped = question.replace(FALLBACK_INSTRUCTION, '')
  if (stripped === question) return question.trim()
  return stripped.replace(/[\s,;:.!?]+$/g, '').trim()
}

export function contextualizeRetrievalQuestion(question: string, previous: string | null): string {
  const clean = stripKnowledgeFallbackInstruction(question)
  return previous && isFollowUpQuestion(clean) ? `${previous}\nAnschlussfrage: ${clean}` : clean
}
