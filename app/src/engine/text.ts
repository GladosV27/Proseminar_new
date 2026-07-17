/** Textverarbeitung: Normalisierung, Tokenisierung, Stoppwörter (Deutsch). */

const STOPWORDS = new Set(
  `aber alle allem allen aller alles als also am an ander andere anderem anderen anderer anderes auch auf aus bei bin bis bist da damit dann das dass dein deine dem den denn der des dessen die dies diese diesem diesen dieser dieses doch dort du durch ein eine einem einen einer eines er es etwas für gegen gewesen hab habe haben hat hatte hatten hier hin hinter ich ihr ihre im in indem ins ist ja jede jedem jeden jeder jedes kann kein keine können könnte machen man mehr mein meine mit muss musste nach nicht nichts noch nun nur ob oder ohne sehr sein seine sich sie sind so über um und uns unser unter vom von vor war waren was weiter welche welchem welchen welcher welches wenn werde werden wie wieder will wir wird wirst wo wurde wurden zu zum zur zwar zwischen wer wessen welch nenne`.split(
    /\s+/,
  ),
)

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/** Einfache Stammform-Annäherung für Deutsch (Suffix-Stripping). */
export function stem(t: string): string {
  for (const suf of ['ungen', 'heiten', 'keiten', 'ung', 'heit', 'keit', 'isch', 'lich', 'ern', 'en', 'er', 'es', 'em', 'e', 's', 'n']) {
    if (t.length - suf.length >= 4 && t.endsWith(suf)) return t.slice(0, -suf.length)
  }
  return t
}

export function terms(s: string): string[] {
  return tokenize(s).map(stem)
}

export function splitSentences(s: string): string[] {
  return s
    .split(/(?<=[.!?»])\s+(?=[A-ZÄÖÜ»0-9])/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}
