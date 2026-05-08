import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import {
  extractCurriculumPdfText,
  MAX_CURRICULUM_PDF_BYTES,
} from '@/lib/curriculum/pdf'

export const runtime = 'nodejs'

const MAX_BASE64_CHARS = Math.ceil((MAX_CURRICULUM_PDF_BYTES * 4) / 3) + 128

function parseString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : ''
}

function decodeBase64Pdf(dataBase64: string) {
  const normalized = dataBase64.includes(',') ? dataBase64.split(',').pop() ?? '' : dataBase64
  if (!normalized || normalized.length > MAX_BASE64_CHARS) {
    throw new Error('PDF is too large for the curriculum lab.')
  }
  return new Uint8Array(Buffer.from(normalized, 'base64'))
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'curriculum-extract',
      userId: user.id,
      maxHits: 20,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many document extraction attempts.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const body = (await request.json().catch(() => null)) as {
      fileName?: unknown
      mimeType?: unknown
      dataBase64?: unknown
    } | null
    const fileName = parseString(body?.fileName, 180)
    const mimeType = parseString(body?.mimeType, 120)
    const dataBase64 = parseString(body?.dataBase64, MAX_BASE64_CHARS)

    if (!dataBase64) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'PDF data is required.' }, { status: 400 })
    }
    if (mimeType && mimeType !== 'application/pdf') {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Only PDF extraction is supported here.' }, { status: 400 })
    }

    const data = decodeBase64Pdf(dataBase64)
    const result = await extractCurriculumPdfText(data)
    if (result.text.length < 20) {
      return NextResponse.json(
        {
          ok: false,
          code: 'NO_TEXT_FOUND',
          message: 'Could not find readable text in this PDF. Try pasting the worksheet text instead.',
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      ok: true,
      fileName,
      text: result.text,
      pagesRead: result.pagesRead,
      totalPages: result.totalPages,
      chars: result.text.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not extract this PDF.'
    if (/too large|does not look like a PDF/i.test(message)) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message }, { status: 400 })
    }
    console.error('[curriculum/extract]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not extract this document.' },
      { status: 500 }
    )
  }
}
