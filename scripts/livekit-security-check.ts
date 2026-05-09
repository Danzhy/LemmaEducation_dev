import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  coerceLiveKitAssistantText,
  decodeLiveKitPayload,
  encodeLiveKitPayload,
  type LiveKitTutorPayload,
} from '@/lib/livekit/messages'
import { buildSilentTutorBoardContext } from '@/lib/tutor/silent-board-context'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function assertIncludes(path: string, expected: string) {
  const content = read(path)
  if (!content.includes(expected)) {
    throw new Error(`${path} is missing expected guard: ${expected}`)
  }
}

function assertExcludes(path: string, forbidden: string) {
  const content = read(path)
  if (content.includes(forbidden)) {
    throw new Error(`${path} exposes forbidden server-only value: ${forbidden}`)
  }
}

function main() {
  const clientFiles = [
    'hooks/useLiveKitTutor.ts',
    'app/tutor-livekit-lab/page.tsx',
    'components/tutor/TutorWorkspace.tsx',
  ]

  for (const file of clientFiles) {
    assertExcludes(file, 'LIVEKIT_API_SECRET')
    assertExcludes(file, 'LIVEKIT_API_KEY')
    assertExcludes(file, 'OPENAI_API_KEY')
  }

  assertExcludes('hooks/useLiveKitTutor.ts', '@/lib/livekit/tool-runner')
  assertIncludes('hooks/useLiveKitTutor.ts', 'coerceLiveKitAssistantText')
  assertIncludes('app/api/livekit/session/route.ts', 'getSessionUserId()')
  assertIncludes('app/api/livekit/session/route.ts', 'takeTutorApiRateLimit')
  assertIncludes('app/api/livekit/session/route.ts', "ttl: '10m'")
  assertIncludes('app/api/livekit/session/route.ts', 'RoomAgentDispatch')
  assertIncludes('app/api/livekit/session/route.ts', 'canPublishSources')
  assertIncludes('app/api/livekit/session/route.ts', 'canPublishData: true')
  assertIncludes('app/api/livekit/tool/route.ts', 'handleLiveKitToolRequest')
  assertIncludes('app/api/livekit/tool/route.ts', 'LIVEKIT_TOOL_ENDPOINT_CONFIGS.worker')
  assertIncludes('app/api/livekit/tool-preview/route.ts', 'handleLiveKitToolRequest')
  assertIncludes('app/api/livekit/tool-preview/route.ts', 'LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview')
  assertIncludes('lib/livekit/tool-api-route.ts', 'getSessionUserIdDefault')
  assertIncludes('lib/livekit/tool-api-route.ts', 'takeTutorApiRateLimitDefault')
  assertIncludes('lib/livekit/tool-api-route.ts', 'getQuotaSnapshotDefault')
  assertIncludes('lib/livekit/tool-api-route.ts', 'sessionId and toolName are required')
  assertIncludes('lib/livekit/tool-api-route.ts', 'SESSION_REQUIRED')
  assertIncludes('lib/livekit/tool-api-route.ts', 'QUOTA_EXCEEDED')
  assertIncludes('lib/livekit/tool-api-route.ts', 'LIVEKIT_TUTOR_TOOL_NAMES')
  assertIncludes('lib/livekit/tool-api-route.ts', 'MAX_TOOL_INPUT_BYTES')
  assertIncludes('lib/livekit/tool-api-route.ts', 'includeRetryAfterHeader')
  assertIncludes('scripts/livekit-tool-route-abuse-smoke.ts', 'RATE_LIMITED')
  assertIncludes('scripts/livekit-tool-route-abuse-smoke.ts', 'SESSION_REQUIRED')
  assertIncludes('scripts/livekit-tool-route-abuse-smoke.ts', 'QUOTA_EXCEEDED')
  assertIncludes('scripts/livekit-tool-route-abuse-smoke.ts', 'TOOL_INPUT_TOO_LARGE')
  assertIncludes('hooks/useLiveKitTutor.ts', 'const startedSessionId = await startServerTutorSession(options)')
  assertIncludes('hooks/useLiveKitTutor.ts', 'startedSessionId = await startLocalTypedLabSession(options)')
  assertIncludes('hooks/useLiveKitTutor.ts', 'callServerLiveKitTool(sessionIdRef.current, plan.toolName, input, {')
  assertIncludes('hooks/useLiveKitTutor.ts', 'preview: true')
  assertIncludes('lib/livekit/tool-runner.ts', 'assertAllowedToolInputProperties')
  assertIncludes('lib/livekit/tool-runner.ts', 'assertAllowedSchemaProperties')
  assertIncludes('lib/livekit/tool-runner.ts', 'schema.additionalProperties === false')
  assertIncludes('lib/livekit/tool-runner.ts', 'schema.required')
  assertIncludes('lib/livekit/tool-runner.ts', 'MAX_SCHEMA_ARRAY_ITEMS')
  assertIncludes('lib/livekit/tool-runner.ts', 'Number.isFinite')
  assertIncludes('lib/livekit/tool-runner.ts', 'schema.enum')
  assertIncludes('lib/livekit/tool-runner.ts', 'schema.minimum')
  assertIncludes('lib/livekit/tool-runner.ts', 'schema.maxLength')
  assertIncludes('lib/livekit/tool-runner.ts', 'schema.minItems')
  assertIncludes('scripts/livekit-agent-smoke.ts', 'start: { x: 20, y: 40, hiddenInstruction')
  assertIncludes('scripts/livekit-agent-smoke.ts', "start: { x: '20', y: 40 }")
  assertIncludes('scripts/livekit-agent-smoke.ts', 'Array.from({ length: 65 }')
  assertIncludes('scripts/livekit-agent-smoke.ts', 'points: [{ x: 0, y: 0 }]')
  assertIncludes('scripts/livekit-agent-smoke.ts', 'start: { x: 1000000, y: 40 }')
  assertIncludes('scripts/livekit-agent-smoke.ts', "text: 'x'.repeat(121)")
  assertIncludes('scripts/livekit-agent-smoke.ts', 'smoke-missing-required-tool-field-rejection')
  assertIncludes('scripts/livekit-agent-smoke.ts', 'missing required field\\.pointB\\.y')
  assertIncludes('workers/livekit-tutor-agent.ts', 'AutoSubscribe.AUDIO_ONLY')
  assertIncludes('workers/livekit-tutor-agent.ts', 'maxToolSteps: 6')
  assertIncludes('lib/livekit/worker-tools.ts', 'DEFAULT_MAX_TOOL_CALLS_PER_SESSION')
  assertIncludes('lib/livekit/worker-tools.ts', 'DEFAULT_MAX_CANVAS_ACTIONS_PER_SESSION')
  assertIncludes('app/api/voice-agent/tool-log/route.ts', 'getSessionUserId()')
  assertIncludes('app/api/voice-agent/tool-log/route.ts', 'takeTutorApiRateLimit')
  assertIncludes('app/api/voice-agent/tool-log/route.ts', 'MAX_TOOL_LOG_JSON_BYTES')
  assertIncludes('app/api/voice-agent/tool-log/route.ts', 'MAX_TOOL_LOG_METADATA_BYTES')
  assertIncludes('app/api/voice-agent/tool-log/route.ts', 'PAYLOAD_TOO_LARGE')

  const visibleAssistantPayload = {
    type: 'assistant_text',
    text: 'I put the graph on the board. Which point should we check first?',
    final: true,
    createdAt: Date.now(),
  } satisfies LiveKitTutorPayload
  assert.equal(
    coerceLiveKitAssistantText(decodeLiveKitPayload(encodeLiveKitPayload(visibleAssistantPayload)), ''),
    visibleAssistantPayload.text
  )

  const visibleChatPayload = {
    type: 'chat_message',
    message: {
      role: 'assistant',
      content: 'I checked the visible board first. What label should we confirm?',
      source: 'assistant',
    },
    createdAt: Date.now(),
  } satisfies LiveKitTutorPayload
  assert.equal(
    coerceLiveKitAssistantText(decodeLiveKitPayload(encodeLiveKitPayload(visibleChatPayload)), ''),
    visibleChatPayload.message.content
  )

  const hiddenBoardContext = buildSilentTutorBoardContext(
    'Visible board summary: triangle with base 8 and height 5. Tool visuals: geometry figure.'
  )
  assert.equal(
    coerceLiveKitAssistantText(
      {
        type: 'assistant_text',
        text: hiddenBoardContext,
        createdAt: Date.now(),
      },
      hiddenBoardContext
    ),
    ''
  )

  const toolEventPayload = {
    type: 'tool_event',
    event: {
      type: 'tool_completed',
      toolName: 'board_state_summarizer',
      output: {
        boardDescription: 'Visible board summary: triangle with labels.',
      },
    },
  } satisfies LiveKitTutorPayload
  assert.equal(
    coerceLiveKitAssistantText(
      decodeLiveKitPayload(encodeLiveKitPayload(toolEventPayload)),
      JSON.stringify(toolEventPayload)
    ),
    ''
  )

  const canvasContextPayload = {
    type: 'canvas_context',
    mimeType: 'image/png',
    dataBase64: 'abc123',
    sessionId: null,
    createdAt: Date.now(),
  } satisfies LiveKitTutorPayload
  assert.equal(
    coerceLiveKitAssistantText(
      decodeLiveKitPayload(encodeLiveKitPayload(canvasContextPayload)),
      JSON.stringify(canvasContextPayload)
    ),
    ''
  )

  assert.equal(
    coerceLiveKitAssistantText(
      null,
      '{"type":"tool_event","event":{"toolName":"board_state_summarizer","output":{"boardDescription":"Visible board summary: hidden"}}}'
    ),
    ''
  )

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedClientFiles: clientFiles.length,
        checkedServerGuards: 53,
        checkedStudentVisibleLiveKitMessages: 6,
      },
      null,
      2
    )
  )
}

main()
