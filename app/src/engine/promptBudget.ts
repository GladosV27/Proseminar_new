/**
 * Harter Zeichenrahmen für native Modelle ohne im Web-Bundle verfügbaren
 * Tokenizer. Der Anfang behält Instruktionen/Kontext, das Ende die aktuelle
 * Frage. Auch eine extrem lange Frage kann den Rahmen nie überschreiten.
 */
export function compactPromptToCharacterBudget(user: string, requestedBudget: number): string {
  const budget = Math.max(256, Math.floor(requestedBudget))
  if (user.length <= budget) return user

  const notice = '\n\n[… Kontext passend zum lokalen Modellfenster gekürzt …]\n\n'
  const questionAt = user.lastIndexOf('\n\nFRAGE:')
  const tailRaw = questionAt >= 0 ? user.slice(questionAt) : user.slice(-Math.floor(budget * 0.45))
  const available = Math.max(1, budget - notice.length)
  const tailBudget = Math.min(tailRaw.length, Math.max(96, Math.floor(available * 0.48)))
  const headBudget = Math.max(1, available - tailBudget)

  let tail = tailRaw
  if (tail.length > tailBudget) {
    const first = Math.max(32, Math.floor((tailBudget - 1) * 0.6))
    tail = `${tail.slice(0, first)}…${tail.slice(-(tailBudget - first - 1))}`
  }
  return `${user.slice(0, headBudget)}${notice}${tail}`.slice(0, budget)
}
