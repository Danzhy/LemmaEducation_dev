import { sanitizeCurriculumText } from '@/lib/curriculum/rag'

export const MAX_CURRICULUM_PDF_BYTES = 4_000_000
export const MAX_CURRICULUM_PDF_PAGES = 40

export type CurriculumPdfTextResult = {
  text: string
  pagesRead: number
  totalPages: number
}

type PdfTextItem = {
  str?: unknown
  hasEOL?: unknown
}

function normalizePageText(items: PdfTextItem[]) {
  const parts: string[] = []
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    parts.push(item.str)
    if (item.hasEOL === true) parts.push('\n')
  }
  return parts.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\s{2,}/g, ' ').trim()
}

export function looksLikePdf(data: Uint8Array) {
  if (data.length < 5) return false
  return String.fromCharCode(...data.slice(0, 5)) === '%PDF-'
}

export async function extractCurriculumPdfText(data: Uint8Array): Promise<CurriculumPdfTextResult> {
  if (data.byteLength > MAX_CURRICULUM_PDF_BYTES) {
    throw new Error('PDF is too large for the curriculum lab.')
  }
  if (!looksLikePdf(data)) {
    throw new Error('That file does not look like a PDF.')
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  } as Parameters<typeof pdfjs.getDocument>[0] & { disableWorker: boolean })

  const pdf = await loadingTask.promise
  const totalPages = pdf.numPages
  const pagesRead = Math.min(totalPages, MAX_CURRICULUM_PDF_PAGES)
  const pageTexts: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pagesRead; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = normalizePageText(content.items as PdfTextItem[])
      if (text) pageTexts.push(text)
    }
  } finally {
    await pdf.destroy()
  }

  return {
    text: sanitizeCurriculumText(pageTexts.join('\n\n')),
    pagesRead,
    totalPages,
  }
}
