import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { listLiveKitPipelineModelOptions } from '@/lib/livekit/pipeline-models'
import { resolveLiveKitPipelineVoiceConfig } from '@/lib/livekit/pipeline-config'
import {
  schoolRateLimitResponse,
  takeSchoolWorkflowRateLimit,
} from '@/lib/school/workflow-rate-limit'

export async function GET(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' },
      { status: 401 }
    )
  }

  const rateLimit = await takeSchoolWorkflowRateLimit(request, {
    endpoint: 'livekit-pipeline-models',
    userId,
    maxHits: 180,
    windowSeconds: 60 * 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      schoolRateLimitResponse('Too many model-list requests. Please try again later.', rateLimit.retryAfterSeconds),
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
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
