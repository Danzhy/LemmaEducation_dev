import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { listLiveKitPipelineModelOptions } from '@/lib/livekit/pipeline-models'
import { resolveLiveKitPipelineVoiceConfig } from '@/lib/livekit/pipeline-config'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' },
      { status: 401 }
    )
  }

  const voice = resolveLiveKitPipelineVoiceConfig()
  return NextResponse.json({
    ok: true,
    models: listLiveKitPipelineModelOptions(),
    voice: {
      configured: voice.configured,
      missing: voice.missing,
      sttModel: voice.sttModel,
      ttsModel: voice.ttsModel,
      ttsVoice: voice.ttsVoice,
    },
  })
}
