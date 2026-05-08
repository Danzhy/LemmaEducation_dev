import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getLiveKitServerConfig } from '@/lib/livekit/config'
import { getLiveKitToolNames } from '@/lib/livekit/tool-runner'

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
    toolCount: getLiveKitToolNames().length,
    workerCommand: 'npm run dev:livekit-agent',
  })
}
