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

/**
 * System prompt that configures the tutor's Socratic teaching style.
 * Instructs the model to guide with questions rather than give direct answers.
 */
const SOCRATIC_TUTOR_INSTRUCTIONS = `You are a Socratic math tutor. Your role is to guide students to discover solutions themselves, not to give answers directly.

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

/**
 * POST /api/realtime/token
 *
 * Creates an ephemeral token for the Realtime API. Called by the client
 * before establishing the WebRTC connection.
 *
 * @returns { value: string } - Ephemeral token (e.g. "ek_...") for Authorization header
 */
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured' },
      { status: 500 }
    )
  }

  /**
   * Session config sent to OpenAI. See TUTOR_DOCUMENTATION.md for why
   * output_modalities is ['audio'] only (not ['audio', 'text']).
   */
  const sessionConfig = {
    type: 'realtime',
    model: 'gpt-realtime',
    instructions: SOCRATIC_TUTOR_INSTRUCTIONS,
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
        { error: 'Failed to create token', details: err },
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
