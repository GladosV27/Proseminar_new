/**
 * Lokales PDF-Lesen mit Mozilla PDF.js. Die Datei bleibt im Browser: Es gibt
 * weder Upload noch Server-Anfrage. Begrenzungen halten Speicher und
 * localStorage für mobile Geräte beherrschbar.
 */

import { stableHash } from './knowledge'

export const PDF_IMPORT_LIMITS = {
  maxFileBytes: 30 * 1024 * 1024,
  maxPages: 80,
  maxTextChars: 140_000,
} as const

export interface PdfReadProgress {
  page: number
  totalPages: number
}

export interface PdfPageText {
  page: number
  text: string
  /** Zeichenpositionen innerhalb von `PdfReadResult.text`. */
  charStart: number
  charEnd: number
  truncated: boolean
}

export interface PdfReadResult {
  /** Rückwärtskompatibler Gesamttext aller gelesenen Seiten. */
  text: string
  /** Tatsächlich extrahierte Seiten, nicht nur das vorab berechnete Limit. */
  pagesRead: number
  totalPages: number
  truncated: boolean
  /** Seitenweise Segmente für nachvollziehbare Chunk-Provenienz. */
  pages: PdfPageText[]
  fileName: string
  fileBytes: number
  /** SHA-256 im sicheren Browserkontext, sonst ein klar markierter Fallback. */
  fingerprint: string
}

interface PdfTextItem {
  str?: string
  hasEOL?: boolean
}

function pageItemsToText(items: PdfTextItem[]): string {
  let text = ''
  for (const item of items) {
    const value = item.str ?? ''
    if (value) {
      const last = text.at(-1) ?? ''
      const first = value[0] ?? ''
      const needsSpace = Boolean(text && !/\s|-/.test(last) && !/^[,.;:!?»)%\]}]/.test(first))
      if (needsSpace) text += ' '
      text += value
    }
    if (item.hasEOL && !text.endsWith('\n')) text += '\n'
  }

  return text
    // PDF-Zeilenumbruch mitten in einem getrennten Wort reparieren.
    .replace(/([\p{L}])-\n(?=[\p{Ll}])/gu, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fileFingerprint(bytes: Uint8Array): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const exact = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      const digest = await crypto.subtle.digest('SHA-256', exact)
      return `sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')}`
    }
  } catch {
    // Der Fallback bleibt deterministisch, wird aber nicht als SHA-256 ausgegeben.
  }
  const sampleSize = Math.min(bytes.length, 64 * 1024)
  let sample = ''
  for (let index = 0; index < sampleSize; index++) sample += String.fromCharCode(bytes[index])
  return `fnv1a:${bytes.length}:${stableHash(sample)}`
}

export async function readPdfText(file: File, onProgress?: (progress: PdfReadProgress) => void): Promise<PdfReadResult> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Bitte wähle eine PDF-Datei aus.')
  }
  if (file.size > PDF_IMPORT_LIMITS.maxFileBytes) {
    throw new Error('Die PDF ist größer als 30 MB. Bitte verwende eine kleinere oder gekürzte Datei.')
  }
  if (file.size === 0) throw new Error('Die PDF-Datei ist leer.')

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fingerprint = await fileFingerprint(bytes)

  let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | undefined
  try {
    document = await pdfjs.getDocument({ data: bytes }).promise
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (/password/i.test(detail)) throw new Error('Die PDF ist passwortgeschützt und kann lokal nicht gelesen werden.')
    throw new Error(`Die PDF konnte lokal nicht geöffnet werden: ${detail}`)
  }

  const totalPages = document.numPages
  const pageLimit = Math.min(totalPages, PDF_IMPORT_LIMITS.maxPages)
  const pages: PdfPageText[] = []
  const combined: string[] = []
  let charCount = 0
  let contentTruncated = false
  let processedPages = 0

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const remaining = PDF_IMPORT_LIMITS.maxTextChars - charCount
      if (remaining <= 0) {
        contentTruncated = true
        break
      }

      onProgress?.({ page: pageNumber, totalPages })
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      processedPages++
      const extracted = pageItemsToText(content.items as PdfTextItem[])
      if (!extracted) continue

      const pageText = extracted.slice(0, remaining)
      const separatorLength = combined.length > 0 ? 2 : 0
      const charStart = charCount + separatorLength
      const charEnd = charStart + pageText.length
      combined.push(pageText)
      pages.push({
        page: pageNumber,
        text: pageText,
        charStart,
        charEnd,
        truncated: pageText.length < extracted.length,
      })
      charCount = charEnd
      if (pageText.length < extracted.length) {
        contentTruncated = true
        break
      }
    }
  } finally {
    await document.cleanup()
  }

  const text = combined.join('\n\n').trim()
  if (!text) {
    throw new Error('Die PDF enthält keinen auswählbaren Text. Eingescannte PDFs benötigen lokale OCR, die diese App bewusst nicht nachlädt.')
  }

  return {
    text,
    pagesRead: processedPages,
    totalPages,
    truncated: totalPages > PDF_IMPORT_LIMITS.maxPages || contentTruncated || processedPages < pageLimit,
    pages,
    fileName: file.name,
    fileBytes: file.size,
    fingerprint,
  }
}
