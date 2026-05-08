import assert from 'node:assert/strict'
import { extractCurriculumPdfText, looksLikePdf } from '@/lib/curriculum/pdf'

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildSimplePdf(text: string) {
  const stream = `BT /F1 16 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += object
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return new Uint8Array(Buffer.from(pdf, 'latin1'))
}

async function main() {
  const pdfData = buildSimplePdf(
    'Equivalent fractions lesson: use fraction strips to show 1/2 and 2/4 cover the same amount.'
  )

  assert.equal(looksLikePdf(pdfData), true)
  const result = await extractCurriculumPdfText(pdfData)
  assert.equal(result.pagesRead, 1)
  assert.equal(result.totalPages, 1)
  assert.match(result.text, /Equivalent fractions lesson/i)
  assert.match(result.text, /fraction strips/i)

  console.log(JSON.stringify({ ok: true, pagesRead: result.pagesRead, chars: result.text.length }))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
