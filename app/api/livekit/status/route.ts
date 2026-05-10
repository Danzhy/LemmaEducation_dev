import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getLiveKitServerConfig } from '@/lib/livekit/config'
import { LIVEKIT_TUTOR_TOOL_NAMES } from '@/lib/livekit/tool-catalog'
import { resolveOpenAIRealtimeModel } from '@/lib/tutor/realtime-model-policy'

function liveKitEnvValue(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback
}

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' },
      { status: 401 }
    )
  }

  const config = getLiveKitServerConfig()
  const realtimeModel = resolveOpenAIRealtimeModel(process.env.OPENAI_LIVEKIT_REALTIME_MODEL)
  return NextResponse.json({
    ok: true,
    configured: config.configured,
    missing: config.configured ? [] : config.missing,
    agentName: config.agentName,
    model: realtimeModel.id,
    realtimeModel: realtimeModel.id,
    realtimeModelProfile: realtimeModel.role,
    requestedRealtimeModel: realtimeModel.requested,
    usedRealtimeModelFallback: realtimeModel.usedFallback,
    transcriptionModel: liveKitEnvValue('OPENAI_LIVEKIT_TRANSCRIPTION_MODEL', 'gpt-realtime-whisper'),
    voice: liveKitEnvValue('OPENAI_LIVEKIT_VOICE', 'marin'),
    turnEagerness: liveKitEnvValue('OPENAI_LIVEKIT_TURN_EAGERNESS', 'high'),
    toolCount: LIVEKIT_TUTOR_TOOL_NAMES.length,
    workerCommand: 'npm run dev:livekit-agent',
  })
}
