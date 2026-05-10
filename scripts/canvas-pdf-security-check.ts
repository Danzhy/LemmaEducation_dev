import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIncludes(path: string, needle: string) {
  assert(read(path).includes(needle), `${path} should include ${needle}`)
}

function assertExcludes(path: string, needle: string) {
  assert(!read(path).includes(needle), `${path} should not include ${needle}`)
}

const canvasPdf = 'lib/tutor/canvas-pdf.ts'
const embeddedBoard = 'components/EmbeddedBoard.tsx'
const tutorWorkspace = 'components/tutor/TutorWorkspace.tsx'
const boardStateSerialization = 'lib/tutor/board-state-serialization.ts'

assertIncludes(canvasPdf, 'MAX_CANVAS_PDF_BYTES = 10_000_000')
assertIncludes(canvasPdf, 'MAX_CANVAS_PDF_PAGES = 8')
assertIncludes(canvasPdf, 'MAX_CANVAS_PDF_TEXT_BYTES = 2_500_000')
assertIncludes(canvasPdf, 'MAX_CANVAS_PDF_META_EXCERPT_CHARS = 900')
assertIncludes(canvasPdf, "disableWorker: true")
assertIncludes(canvasPdf, "fetch('/api/curriculum/extract'")
assertIncludes(canvasPdf, 'sourceDocumentTextExcerpt')
assertExcludes(canvasPdf, 'process.env.')
assertExcludes(canvasPdf, 'OPENAI_API_KEY')
assertExcludes(canvasPdf, 'NEON_DATABASE_URL')

assertIncludes(embeddedBoard, 'pdfToolsEnabled')
assertIncludes(embeddedBoard, 'extractPdfTextContextForCanvas(file).catch(() => null)')
assertIncludes(embeddedBoard, 'accept="application/pdf,.pdf"')
assertIncludes(tutorWorkspace, "pdfToolsEnabled={mode === 'agent-lab' || mode === 'livekit-lab'}")
assertIncludes(boardStateSerialization, 'Imported PDF pages visible')
assertIncludes(boardStateSerialization, 'Imported PDF text excerpt')

console.log(JSON.stringify({ ok: true, checked: 16 }))
