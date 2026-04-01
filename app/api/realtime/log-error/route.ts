/**
 * Client-side error logging endpoint.
 * Receives errors from the browser and logs them server-side for debugging.
 * Does not expose errors to the client response.
 */

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const source = typeof body?.source === 'string' ? body.source : 'unknown'
    const rawError = typeof body?.rawError === 'string' ? body.rawError : String(body?.rawError ?? source)
    console.error(`[Lemma Tutor] [${source}]`, rawError)
  } catch {
    console.error('[Lemma Tutor] [log-error] Failed to parse error payload')
  }
  return NextResponse.json({ ok: true })
}
