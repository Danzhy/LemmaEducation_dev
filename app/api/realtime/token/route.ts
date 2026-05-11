/**
 * Realtime API Token Route
 *
 * Mints ephemeral client secrets for the OpenAI Realtime API. The browser uses
 * these short-lived tokens to connect directly to OpenAI's WebRTC endpoint,
 * keeping our main API key secure on the server.
 *
 * Why ephemeral tokens instead of proxying SDP through our server?
 * - Proxying the WebRTC SDP exchange caused 504 Gateway Timeout (~16s)
 * - Token minting is fast (~1s); WebRTC negotiation happens client↔OpenAI
 */

import { NextResponse } from 'next/server'
import { getLanguageRestrictionInstruction } from '@/lib/languageInstructions'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById, getQuotaSnapshot, pauseSessionById } from '@/lib/tutor/quota'
import { TUTOR_INACTIVITY_PAUSE_SECONDS } from '@/lib/tutor/constants'
import { resolveOpenAIRealtimeModel } from '@/lib/tutor/realtime-model-policy'

function getRequiredEnv(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function getRequiredInstructionEnv(value: string | undefined): string | null {
  const normalized = getRequiredEnv(value)
  if (!normalized) return null
  return normalized.replace(/\\n/g, '\n')
}

function getGradeLevelInstruction(gradeLevel: string): string {
  const normalized = gradeLevel.trim()
  if (!normalized) return ''

  return `Student context: The student is working at ${normalized}. Match the level of explanation, vocabulary, examples, pacing, and question difficulty to ${normalized}. Keep the math accessible for that exact level, and do not jump to more advanced methods unless the student asks or it is clearly necessary.`
}

/**
 * POST /api/realtime/token
 *
 * Creates an ephemeral token for the Realtime API. Called by the client
 * before establishing the WebRTC connection.
 *
 * Body: { language?: string } - optional; defaults to 'en'
 *
 * @returns { value: string } - Ephemeral token (e.g. "ek_...") for Authorization header
 */
export async function POST(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Please sign in again.',
      },
      { status: 401 }
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured' },
      { status: 500 }
    )
  }

  try {
    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'realtime-token',
      userId,
      maxHits: 48,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'RATE_LIMITED',
          message: 'Too many connection attempts. Please try again later.',
        },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    let quota = await getQuotaSnapshot(sql, userId)
    if (
      quota.activeSessionId &&
      quota.activeSessionState === 'active' &&
      quota.inactivitySeconds >= TUTOR_INACTIVITY_PAUSE_SECONDS
    ) {
      await pauseSessionById(sql, userId, quota.activeSessionId)
      quota = await getQuotaSnapshot(sql, userId)
    }
    if (
      quota.activeSessionId &&
      (quota.remainingSeconds <= 0 || quota.activeSessionSeconds >= quota.maxSessionSeconds)
    ) {
      await finalizeSessionById(
        sql,
        userId,
        quota.activeSessionId,
        quota.activeSessionSeconds >= quota.maxSessionSeconds ? 'session_limit' : 'quota'
      )
      quota = await getQuotaSnapshot(sql, userId)
    }

    if (!quota.activeSessionId) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SESSION_REQUIRED',
          message: 'Start a tutor session before connecting.',
        },
        { status: 400 }
      )
    }

    if (quota.remainingSeconds <= 0) {
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          message: 'Tutoring time limit reached.',
          remainingSeconds: 0,
        },
        { status: 429 }
      )
    }

    if (quota.activeSessionState === 'paused') {
      return NextResponse.json(
        {
          ok: false,
          code: 'SESSION_PAUSED',
          message: 'Resume the tutor session before reconnecting.',
        },
        { status: 409 }
      )
    }
  } catch (error) {
    console.error('[realtime/token] quota check', error)
    return NextResponse.json(
      {
        ok: false,
        code: 'QUOTA_CHECK_FAILED',
        message: 'Could not verify quota.',
      },
      { status: 503 }
    )
  }

  const realtimeModel = resolveOpenAIRealtimeModel(process.env.OPENAI_REALTIME_MODEL).id

  const baseInstructions = getRequiredInstructionEnv(
    process.env.OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS
  )
  if (!baseInstructions) {
    return NextResponse.json(
      { error: 'OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS is not configured' },
      { status: 500 }
    )
  }

  const realtimeTranscriptionModel = getRequiredEnv(
    process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL
  )
  if (!realtimeTranscriptionModel) {
    return NextResponse.json(
      { error: 'OPENAI_REALTIME_TRANSCRIPTION_MODEL is not configured' },
      { status: 500 }
    )
  }

  let language = 'en'
  let gradeLevel = ''
  try {
    const body = await request.json()
    if (body?.language && typeof body.language === 'string') {
      language = body.language
    }
    if (body?.gradeLevel && typeof body.gradeLevel === 'string') {
      gradeLevel = body.gradeLevel
    }
  } catch {
    // ignore parse errors; use default language
  }

  const languageRestriction = getLanguageRestrictionInstruction(language)
  const gradeLevelInstruction = getGradeLevelInstruction(gradeLevel)
  const instructions = [baseInstructions, gradeLevelInstruction, languageRestriction]
    .filter(Boolean)
    .join('\n\n')

  /**
   * Session config sent to OpenAI. See docs/TUTOR_DOCUMENTATION.md for why
   * output_modalities is ['audio'] only (not ['audio', 'text']).
   */
  const sessionConfig = {
    type: 'realtime',
    model: realtimeModel,
    instructions,
    output_modalities: ['audio'],
    audio: {
      input: {
        transcription: {
          model: realtimeTranscriptionModel,
          language,
        },
      },
      output: { voice: 'marin' },
    },
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)
    let response: Response
    try {
      response = await fetch(
        'https://api.openai.com/v1/realtime/client_secrets',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session: sessionConfig }),
          signal: controller.signal,
        }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI client_secrets error:', err)
      return NextResponse.json(
        { error: 'Failed to create token' },
        { status: response.status }
      )
    }

    const data = (await response.json()) as { value?: string }
    if (!data.value) {
      return NextResponse.json(
        { error: 'No token in response' },
        { status: 500 }
      )
    }

    return NextResponse.json({ value: data.value })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Token generation timed out')
      return NextResponse.json(
        { ok: false, code: 'OPENAI_TIMEOUT', error: 'Token generation timed out' },
        { status: 504 }
      )
    }

    console.error('Token generation error:', error)
    return NextResponse.json(
      { error: 'Failed to create token' },
      { status: 500 }
    )
  }
}
