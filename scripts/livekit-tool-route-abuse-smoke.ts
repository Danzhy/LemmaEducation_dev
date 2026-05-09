import assert from 'node:assert/strict'
import {
  handleLiveKitToolRequest,
  LIVEKIT_TOOL_ENDPOINT_CONFIGS,
  type LiveKitToolEndpointConfig,
  type LiveKitToolRouteDependencies,
} from '@/lib/livekit/tool-api-route'

type EndpointConfig = LiveKitToolEndpointConfig
type QuotaSnapshot = Awaited<ReturnType<LiveKitToolRouteDependencies['getQuotaSnapshot']>>
type RateLimitOptions = Parameters<LiveKitToolRouteDependencies['takeTutorApiRateLimit']>[1]
type ToolContext = Parameters<LiveKitToolRouteDependencies['runLiveKitTutorToolWithMetrics']>[2]

const activeQuota = {
  quotaSeconds: 14_400,
  maxSessionSeconds: 3_600,
  maxCompletedSessions: 4,
  inactivityPauseSeconds: 300,
  persistedActiveSeconds: 0,
  totalCompletedSessions: 0,
  liveSessionSeconds: 12,
  totalActiveSeconds: 12,
  remainingSeconds: 600,
  usedSessionCount: 1,
  remainingSessionCount: 3,
  activeSessionId: 'session-1',
  activeSessionState: 'active',
  activeSessionSeconds: 12,
  inactivitySeconds: 2,
} satisfies QuotaSnapshot

type HarnessOptions = {
  userId?: string | null
  rateLimitAllowed?: boolean
  retryAfterSeconds?: number
  quota?: Partial<QuotaSnapshot>
  quotaThrows?: boolean
  timedOut?: boolean
  toolThrows?: boolean
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/livekit/tool-preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function rawRequest(body: string) {
  return new Request('http://localhost/api/livekit/tool-preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

function createHarness(options: HarnessOptions = {}) {
  const calls = {
    clearTimeout: 0,
    consoleErrors: 0,
    getSql: 0,
    quota: 0,
    rateLimit: [] as RateLimitOptions[],
    tool: [] as Array<{ toolName: string; input: unknown; context: ToolContext }>,
    canvasParser: [] as Array<{ toolName: string; output: unknown; maxActions: number }>,
  }
  const controller = new AbortController()
  const fakeSql = (() => []) as unknown as ReturnType<LiveKitToolRouteDependencies['getNeonSql']>

  const deps: LiveKitToolRouteDependencies = {
    getSessionUserId: async () =>
      Object.prototype.hasOwnProperty.call(options, 'userId') ? options.userId ?? null : 'student-1',
    getNeonSql: (() => {
      calls.getSql += 1
      return fakeSql
    }) as LiveKitToolRouteDependencies['getNeonSql'],
    takeTutorApiRateLimit: async (_request, rateLimitOptions) => {
      calls.rateLimit.push(rateLimitOptions)
      return {
        allowed: options.rateLimitAllowed ?? true,
        hits: options.rateLimitAllowed === false ? rateLimitOptions.maxHits + 1 : 1,
        retryAfterSeconds: options.retryAfterSeconds ?? 42,
      }
    },
    getQuotaSnapshot: async () => {
      calls.quota += 1
      if (options.quotaThrows) {
        throw new Error('quota database unavailable')
      }
      return { ...activeQuota, ...options.quota }
    },
    createTutorDbTimeout: () => ({
      signal: controller.signal,
      clear: () => {
        calls.clearTimeout += 1
      },
      timedOut: () => Boolean(options.timedOut),
    }),
    runLiveKitTutorToolWithMetrics: async (toolName, input, context) => {
      calls.tool.push({ toolName, input, context })
      if (options.toolThrows) {
        throw new Error('schema rejected hidden field')
      }
      return {
        output: { checked: true, toolName },
        metrics: {
          durationMs: 7,
          inputBytes: 11,
          outputBytes: 19,
        },
      }
    },
    extractCanvasActionsFromToolResult: ((toolName: string, output: unknown, maxActions: number) => {
      calls.canvasParser.push({ toolName, output, maxActions })
      return [{ id: 'mock-action-1', type: 'place_text_label', x: 10, y: 20, text: 'checked' }]
    }) as LiveKitToolRouteDependencies['extractCanvasActionsFromToolResult'],
    consoleError: () => {
      calls.consoleErrors += 1
    },
  }

  return { calls, deps }
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

async function expectFailure(
  name: string,
  request: Request,
  config: EndpointConfig,
  options: HarnessOptions,
  expectedStatus: number,
  expectedCode: string
) {
  const harness = createHarness(options)
  const response = await handleLiveKitToolRequest(request, config, harness.deps)
  const body = await readJson(response)
  assert.equal(response.status, expectedStatus, `${name}: status`)
  assert.equal(body.code, expectedCode, `${name}: code`)
  return { response, body, ...harness }
}

async function main() {
  const validBody = {
    sessionId: 'session-1',
    toolName: 'math_check_step',
    input: { previousStep: '3 + 4 * 2', nextStep: '14' },
  }

  const unauth = await expectFailure(
    'unauthenticated requests stop before parsing tool work',
    jsonRequest(validBody),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    { userId: null },
    401,
    'UNAUTHORIZED'
  )
  assert.equal(unauth.calls.getSql, 0)
  assert.equal(unauth.calls.tool.length, 0)

  const invalidJson = await expectFailure(
    'invalid JSON is rejected before quota checks',
    rawRequest('{'),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    {},
    400,
    'INVALID_JSON'
  )
  assert.equal(invalidJson.calls.getSql, 0)

  const missingFields = await expectFailure(
    'missing session/tool fields are rejected',
    jsonRequest({ sessionId: 'session-1' }),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    {},
    400,
    'MISSING_FIELDS'
  )
  assert.equal(missingFields.calls.getSql, 0)

  const unsupportedTool = await expectFailure(
    'unsupported tools are rejected before database work',
    jsonRequest({ ...validBody, toolName: 'raw_tldraw_editor' }),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    {},
    400,
    'UNSUPPORTED_TOOL'
  )
  assert.equal(unsupportedTool.calls.getSql, 0)

  const oversizedInput = await expectFailure(
    'oversized tool input is rejected before database work',
    jsonRequest({ ...validBody, input: { text: 'x'.repeat(13_000) } }),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    {},
    413,
    'TOOL_INPUT_TOO_LARGE'
  )
  assert.equal(oversizedInput.calls.getSql, 0)

  const rateLimited = await expectFailure(
    'rate limits stop worker tool execution',
    jsonRequest(validBody),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.worker,
    { rateLimitAllowed: false, retryAfterSeconds: 55 },
    429,
    'RATE_LIMITED'
  )
  assert.equal(rateLimited.response.headers.get('Retry-After'), '55')
  assert.equal(rateLimited.calls.rateLimit[0]?.endpoint, 'livekit-tool')
  assert.equal(rateLimited.calls.rateLimit[0]?.maxHits, 240)
  assert.equal(rateLimited.calls.rateLimit[0]?.windowSeconds, 3600)
  assert.equal(rateLimited.calls.quota, 0)
  assert.equal(rateLimited.calls.tool.length, 0)

  const inactiveSession = await expectFailure(
    'inactive sessions cannot execute tools',
    jsonRequest(validBody),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    { quota: { activeSessionId: 'other-session' } },
    409,
    'SESSION_REQUIRED'
  )
  assert.equal(inactiveSession.calls.quota, 1)
  assert.equal(inactiveSession.calls.tool.length, 0)

  const exhaustedQuota = await expectFailure(
    'exhausted tutor quota blocks tool execution',
    jsonRequest(validBody),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    { quota: { remainingSeconds: 0 } },
    429,
    'QUOTA_EXCEEDED'
  )
  assert.equal(exhaustedQuota.calls.tool.length, 0)

  const timedOutQuota = await expectFailure(
    'database timeouts return a generic session-verification error',
    jsonRequest(validBody),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    { quotaThrows: true, timedOut: true },
    503,
    'DATABASE_TIMEOUT'
  )
  assert.equal(timedOutQuota.calls.consoleErrors, 1)
  assert.equal(timedOutQuota.calls.clearTimeout, 1)
  assert.equal(timedOutQuota.calls.tool.length, 0)

  const toolFailure = await expectFailure(
    'tool execution errors are contained after quota passes',
    jsonRequest(validBody),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    { toolThrows: true },
    400,
    'TOOL_FAILED'
  )
  assert.equal(toolFailure.calls.rateLimit[0]?.endpoint, 'livekit-tool-preview')
  assert.equal(toolFailure.calls.tool.length, 1)

  const previewHarness = createHarness()
  const previewResponse = await handleLiveKitToolRequest(
    jsonRequest(validBody),
    LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview,
    previewHarness.deps
  )
  const previewBody = await readJson(previewResponse)
  assert.equal(previewResponse.status, 200)
  assert.equal(previewBody.ok, true)
  assert.equal(previewHarness.calls.rateLimit[0]?.endpoint, 'livekit-tool-preview')
  assert.equal(previewHarness.calls.rateLimit[0]?.maxHits, 120)
  assert.deepEqual(previewHarness.calls.tool[0]?.context, { userId: 'student-1', sessionId: 'session-1' })
  assert.equal(previewHarness.calls.canvasParser[0]?.maxActions, 80)
  assert.deepEqual((previewBody.toolMeta as Record<string, unknown>).canvasActionCount, 1)

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedRouteAbuseCases: 11,
        checkedEndpoints: ['livekit-tool', 'livekit-tool-preview'],
      },
      null,
      2
    )
  )
}

main()
