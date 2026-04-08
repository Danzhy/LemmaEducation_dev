import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getClientIp, isFeedbackRateLimited } from '@/lib/feedback-rate-limit'

const MAX_MESSAGE = 8000
const MAX_EMAIL = 320

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    if (isFeedbackRateLimited(ip)) {
      return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
    }

    let body: {
      message?: string
      email?: string
      rating?: number
      pageContext?: string
      website?: string
    }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
    }

    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      return NextResponse.json({ ok: true })
    }

    const message =
      typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : ''
    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 })
    }

    const emailRaw = typeof body.email === 'string' ? body.email.trim().slice(0, MAX_EMAIL) : ''
    const email = emailRaw || null

    let rating: number | null = null
    if (typeof body.rating === 'number' && Number.isFinite(body.rating)) {
      const r = Math.round(body.rating)
      if (r >= 1 && r <= 5) rating = r
    }

    const pageContext =
      typeof body.pageContext === 'string' ? body.pageContext.trim().slice(0, 64) : null

    const userId = await getSessionUserId()
    const id = randomUUID()

    const sql = getNeonSql()
    await sql`
      INSERT INTO feedback (id, user_id, email, message, rating, page_context)
      VALUES (
        ${id}::uuid,
        ${userId},
        ${email},
        ${message},
        ${rating},
        ${pageContext}
      )
    `

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[feedback]', e)
    return NextResponse.json({ ok: false, error: 'Could not save feedback' }, { status: 500 })
  }
}
