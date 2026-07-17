/**
 * Lokales PDF-Lesen mit Mozilla PDF.js. Die Datei bleibt im Browser: Es gibt
 * weder Upload noch Server-Anfrage. Begrenzungen halten Speicher und
 * localStorage fuer mobile Geraete beherrschbar.
 */

const MAX_FILE_BYTES = 30 * 1024 * 1024
const MAX_PAGES = 80
const MAX_TEXT_CHARS = 140_000

export interface PdfReadProgress {
  page: number
  totalPages: number
}

export interface PdfReadResult {
  text: string
  pagesRead: number
  totalPages: number
  truncated: boolean
}

export async function readPdfText(file: File, onProgress?: (progress: PdfReadProgress) => void): Promise<PdfReadResult> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Bitte wähle eine PDF-Datei aus.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Die PDF ist größer als 30 MB. Bitte verwende eine kleinere oder gekürzte Datei.')
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const document = await pdfjs.getDocument({ data: bytes }).promise
  const pagesRead = Math.min(document.numPages, MAX_PAGES)
  const pages: string[] = []
  let charCount = 0

  try {
    for (let pageNumber = 1; pageNumber <= pagesRead; pageNumber++) {
      onProgress?.({ page: pageNumber, totalPages: document.numPages })
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = (content.items as Array<{ str?: string; hasEOL?: boolean }>)
        .map((item) => `${item.str ?? ''}${item.hasEOL ? '\n' : ' '}`)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      if (!pageText) continue
      const remaining = MAX_TEXT_CHARS - charCount
      if (remaining <= 0) break
      pages.push(pageText.slice(0, remaining))
      charCount += Math.min(pageText.length, remaining)
      if (pageText.length > remaining) break
    }
  } finally {
    await document.cleanup()
  }

  const text = pages.join('\n\n').trim()
  if (!text) {
    throw new Error('Die PDF enthält keinen auswählbaren Text. Eingescannte PDFs benötigen lokale OCR, die diese App bewusst nicht nachlädt.')
  }
  return {
    text,
    pagesRead,
    totalPages: document.numPages,
    truncated: document.numPages > MAX_PAGES || charCount >= MAX_TEXT_CHARS,
  }
}
