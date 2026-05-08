import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getLiveKitServerConfig } from '@/lib/livekit/config'
import { LIVEKIT_TUTOR_TOOL_NAMES } from '@/lib/livekit/tool-catalog'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' },
      { status: 401 }
    )
  }

  const config = getLiveKitServerConfig()
  return NextResponse.json({
    ok: true,
    configured: config.configured,
    missing: config.configured ? [] : config.missing,
    agentName: config.agentName,
    model: process.env.OPENAI_LIVEKIT_REALTIME_MODEL || 'gpt-realtime-1.5',
    toolCount: LIVEKIT_TUTOR_TOOL_NAMES.length,
    workerCommand: 'npm run dev:livekit-agent',
  })
}
