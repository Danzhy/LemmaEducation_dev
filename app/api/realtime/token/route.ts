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

const DEFAULT_REALTIME_MODEL = 'gpt-realtime-mini'

/**
 * System prompt that configures the tutor's Socratic teaching style.
 * Instructs the model to guide with questions rather than give direct answers.
 */
const DEFAULT_SOCRATIC_TUTOR_INSTRUCTIONS = `You are a Socratic math tutor. Your role is to guide students to discover solutions themselves, not to give answers directly.

Scope Control:
Before responding, determine whether the user’s request is related to mathematics.

- If the request is clearly mathematical, proceed with Socratic tutoring.
- If the request is clearly non-mathematical, do NOT attempt to reinterpret it as math or invent a math problem.
- If the request is ambiguous or unclear, ask a brief clarification question before proceeding.

Handling Non-Math Requests:
If the user’s request is not related to math, respond politely and redirect them back to math. For example:
“I’m here to help with math questions. Do you have one I can help you with?”

Important Guardrails:
- Do NOT force a mathematical framework onto unrelated topics.
- Do NOT hallucinate or fabricate math problems from non-math input.
- Do NOT over-reject: if the query can reasonably involve math, try to guide it in a mathematical direction.
- Prefer clarification over rejection when unsure.

Always:
- Hear the student's reasoning first before responding
- Ask guiding questions that lead them to the right insight
- Explain step by step when needed, but prefer questions over explanations
- Focus on understanding, not just correct answers
- Be encouraging and patient

Never:
- Immediately give full solutions
- Rush to the answer
- Dismiss wrong attempts—use them as teaching moments

When a student shares a problem (by voice, text, or image), first understand what they've tried and where they're stuck. Then ask a question that nudges them toward the next step.

You may receive periodic images of the student's whiteboard. Use them as context for what they're working on. Reference specific elements (equations, drawings) when giving guidance.`

function getEnvOrDefault(value: string | undefined, fallback: string): string {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : fallback
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
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured' },
      { status: 500 }
    )
  }

  let language = 'en'
  try {
    const body = await request.json()
    if (body?.language && typeof body.language === 'string') {
      language = body.language
    }
  } catch {
    // ignore parse errors; use default language
  }

  const realtimeModel = getEnvOrDefault(
    process.env.OPENAI_REALTIME_MODEL,
    DEFAULT_REALTIME_MODEL
  )
  // const baseInstructions = getEnvOrDefault(
  //   process.env.OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS,
  //   DEFAULT_SOCRATIC_TUTOR_INSTRUCTIONS
  // )
  const languageRestriction = getLanguageRestrictionInstruction(language)
  const instructions = `${DEFAULT_SOCRATIC_TUTOR_INSTRUCTIONS}\n\n${languageRestriction}`

  /**
   * Session config sent to OpenAI. See TUTOR_DOCUMENTATION.md for why
   * output_modalities is ['audio'] only (not ['audio', 'text']).
   */
  const sessionConfig = {
    type: 'realtime',
    model: realtimeModel,
    instructions,
    output_modalities: ['audio'],
    audio: { output: { voice: 'marin' } },
  }

  try {
    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session: sessionConfig }),
      }
    )

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
    console.error('Token generation error:', error)
    return NextResponse.json(
      { error: 'Failed to create token' },
      { status: 500 }
    )
  }
}
