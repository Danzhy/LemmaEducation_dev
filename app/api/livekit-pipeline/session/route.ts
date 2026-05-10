import { NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { RoomAgentDispatch, RoomConfiguration, TrackSource } from '@livekit/protocol'
import { getRequiredInstructionEnv } from '@/lib/tutor/tutor-env'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById, getQuotaSnapshot, pauseSessionById } from '@/lib/tutor/quota'
import { TUTOR_INACTIVITY_PAUSE_SECONDS } from '@/lib/tutor/constants'
import { createTutorDbTimeout } from '@/lib/tutor/db-timeout'
import {
  buildLiveKitRoomName,
  buildLiveKitStudentIdentity,
  getLiveKitServerConfig,
} from '@/lib/livekit/config'
import { buildLiveKitTutorInstructions } from '@/lib/livekit/agent-instructions'
import { getLabTutorCurriculumContextForUser } from '@/lib/curriculum/context'
import {
  getLiveKitPipelineAgentName,
  resolveLiveKitPipelineModel,
} from '@/lib/livekit/pipeline-models'
import { resolveLiveKitPipelineSelection } from '@/lib/livekit/pipeline-config'

function parseString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : ''
}

export async function POST(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' },
      { status: 401 }
    )
  }

  const config = getLiveKitServerConfig()
  if (!config.configured) {
    return NextResponse.json(
      {
        ok: false,
        code: 'LIVEKIT_NOT_CONFIGURED',
        message: 'LiveKit is not configured for this environment yet.',
        missing: config.missing,
      },
      { status: 503 }
    )
  }

  const baseInstructions = getRequiredInstructionEnv(process.env.OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS)
  if (!baseInstructions) {
    return NextResponse.json(
      { ok: false, code: 'INSTRUCTIONS_NOT_CONFIGURED', message: 'Tutor instructions are not configured.' },
      { status: 500 }
    )
  }

  let sessionId = ''
  let language = 'en'
  let gradeLevel = ''
  let audioMode: 'microphone' | 'silent' = 'microphone'
  let pipelineModelId = ''

  try {
    const body = (await request.json()) as {
      sessionId?: unknown
      language?: unknown
      gradeLevel?: unknown
      audioMode?: unknown
      liveKitModelId?: unknown
      pipelineModelId?: unknown
    }
    sessionId = parseString(body.sessionId, 80)
    language = parseString(body.language, 16) || 'en'
    gradeLevel = parseString(body.gradeLevel, 40)
    audioMode = body.audioMode === 'silent' ? 'silent' : 'microphone'
    pipelineModelId =
      parseString(body.pipelineModelId, 80) ||
      parseString(body.liveKitModelId, 80) ||
      resolveLiveKitPipelineModel(null).id
  } catch {
    pipelineModelId = resolveLiveKitPipelineModel(null).id
  }

  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: 'SESSION_ID_REQUIRED', message: 'Start a tutor session before connecting.' },
      { status: 400 }
    )
  }

  const pipeline = resolveLiveKitPipelineSelection(pipelineModelId)
  if (!pipeline.configured) {
    return NextResponse.json(
      {
        ok: false,
        code: 'PIPELINE_MODEL_NOT_CONFIGURED',
        message: 'The selected LiveKit pipeline model is not configured yet.',
        missing: pipeline.missing,
        selectedModel: pipeline.model.id,
      },
      { status: 503 }
    )
  }

  const dbTimeout = createTutorDbTimeout()
  try {
    const sql = getNeonSql({ signal: dbTimeout.signal })
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'livekit-pipeline-session',
      userId,
      sessionId,
      maxHits: 36,
      windowSeconds: 60 * 60,
      sql,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'RATE_LIMITED',
          message: 'Too many LiveKit pipeline connection attempts. Please try again later.',
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

    if (!quota.activeSessionId || quota.activeSessionId !== sessionId) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SESSION_REQUIRED',
          message: 'Start a tutor session before connecting to LiveKit.',
        },
        { status: 409 }
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
    const databaseTimedOut = dbTimeout.timedOut()
    console.error('[livekit-pipeline/session] quota check', error)
    return NextResponse.json(
      {
        ok: false,
        code: databaseTimedOut ? 'DATABASE_TIMEOUT' : 'QUOTA_CHECK_FAILED',
        message: databaseTimedOut
          ? 'Could not reach the session database quickly enough. Please try again.'
          : 'Could not verify quota.',
      },
      { status: 503 }
    )
  } finally {
    dbTimeout.clear()
  }

  const roomName = buildLiveKitRoomName(sessionId)
  const identity = buildLiveKitStudentIdentity(userId, sessionId)
  const agentName = getLiveKitPipelineAgentName()
  const curriculumContext = await getLabTutorCurriculumContextForUser(userId).catch((error) => {
    console.error('[livekit-pipeline/session] curriculum context', error)
    return ''
  })
  const instructions = buildLiveKitTutorInstructions({
    baseInstructions: [baseInstructions, curriculumContext].filter(Boolean).join('\n\n'),
    gradeLevel,
    language,
  })
  const metadata = JSON.stringify({
    product: 'lemma',
    lab: 'livekit-pipeline-agent',
    sessionId,
    gradeLevel,
    language,
    audioMode,
    toolRpc: 'lemma_tool_call',
    canvasRpc: 'lemma_canvas_action',
    pipelineModelId: pipeline.model.id,
    pipelineProvider: pipeline.model.provider,
    pipelineModel: pipeline.model.model,
    sttModel: pipeline.voice.sttModel,
    ttsModel: pipeline.voice.ttsModel,
  })

  try {
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity,
      name: 'Lemma student',
      ttl: '10m',
      metadata,
      attributes: {
        lab: 'livekit-pipeline-agent',
        sessionId,
        gradeLevel,
      },
    })

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: audioMode === 'microphone',
      canPublishSources: audioMode === 'microphone' ? [TrackSource.MICROPHONE] : [],
      canPublishData: true,
      canSubscribe: true,
    })

    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName,
          metadata,
        }),
      ],
    })

    return NextResponse.json({
      ok: true,
      token: await token.toJwt(),
      url: config.url,
      roomName,
      identity,
      agentName,
      pipelineModelId: pipeline.model.id,
      pipelineProvider: pipeline.model.provider,
      pipelineModel: pipeline.model.model,
      sttModel: pipeline.voice.sttModel,
      ttsModel: pipeline.voice.ttsModel,
      instructions,
      expiresInSeconds: 600,
    })
  } catch (error) {
    console.error('[livekit-pipeline/session] token generation', error)
    return NextResponse.json(
      { ok: false, code: 'TOKEN_GENERATION_FAILED', message: 'Could not create LiveKit pipeline token.' },
      { status: 500 }
    )
  }
}
