import assert from 'node:assert/strict'
import {
  handleVoiceAgentSessionRequest,
  type VoiceAgentSessionRouteDependencies,
  type VoiceAgentSessionRouteEnv,
} from '@/lib/voice-agent/session-api-route'

type QuotaSnapshot = Awaited<ReturnType<VoiceAgentSessionRouteDependencies['getQuotaSnapshot']>>
type RateLimitOptions = Parameters<VoiceAgentSessionRouteDependencies['takeTutorApiRateLimit']>[1]

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
  env?: Partial<VoiceAgentSessionRouteEnv>
  rateLimitAllowed?: boolean
  retryAfterSeconds?: number
  quota?: Partial<QuotaSnapshot>
  quotaThrows?: boolean
  timedOut?: boolean
  openAIStatus?: number
  openAIThrows?: boolean
  missingClientSecret?: boolean
  curriculumContext?: string
  curriculumThrows?: boolean
}

function defaultEnv(overrides: Partial<VoiceAgentSessionRouteEnv> = {}): VoiceAgentSessionRouteEnv {
  return {
    openAIApiKey: 'sk-test',
    openAIRealtimeModel: 'gpt-realtime-mini',
    openAIRealtimeTranscriptionModel: 'gpt-4o-transcribe',
    openAISocraticTutorInstructions: 'Base Socratic tutor instructions.',
    ...overrides,
  }
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/voice-agent/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function rawRequest(body: string) {
  return new Request('http://localhost/api/voice-agent/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

function createHarness(options: HarnessOptions = {}) {
  const calls = {
    clearTimeout: 0,
    consoleErrors: 0,
    curriculumContext: [] as string[],
    env: 0,
    fetch: [] as Array<{ url: string; init?: RequestInit }>,
    finalize: [] as string[],
    getSql: 0,
    pause: [] as string[],
    quota: 0,
    rateLimit: [] as RateLimitOptions[],
  }
  const controller = new AbortController()
  const fakeSql = (() => []) as unknown as ReturnType<VoiceAgentSessionRouteDependencies['getNeonSql']>

  const deps: VoiceAgentSessionRouteDependencies = {
    readEnv: () => {
      calls.env += 1
      return defaultEnv(options.env)
    },
    getSessionUserId: async () =>
      Object.prototype.hasOwnProperty.call(options, 'userId') ? options.userId ?? null : 'student-1',
    getNeonSql: (() => {
      calls.getSql += 1
      return fakeSql
    }) as VoiceAgentSessionRouteDependencies['getNeonSql'],
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
    pauseSessionById: async (_sql, _userId, sessionId) => {
      calls.pause.push(sessionId)
      return { status: 'paused', activeSeconds: 12, sessionLimitReached: false }
    },
    finalizeSessionById: async (_sql, _userId, sessionId, endedReason) => {
      calls.finalize.push(sessionId)
      return {
        status: 'ended',
        appliedSeconds: 12,
        endedReason,
        quotaExceeded: endedReason === 'quota',
        sessionLimitReached: endedReason === 'session_limit',
        remainingSeconds: 0,
      }
    },
    createTutorDbTimeout: () => ({
      signal: controller.signal,
      clear: () => {
        calls.clearTimeout += 1
      },
      timedOut: () => Boolean(options.timedOut),
    }),
    getLabTutorCurriculumContextForUser: async (userId) => {
      calls.curriculumContext.push(userId)
      if (options.curriculumThrows) {
        throw new Error('curriculum lookup failed')
      }
      return options.curriculumContext ?? ''
    },
    resolveOpenAIRealtimeModel: (requested) => ({
      id: requested === 'gpt-realtime-mini' ? 'gpt-realtime-mini' : 'gpt-realtime-2',
      label: requested === 'gpt-realtime-mini' ? 'GPT Realtime mini' : 'GPT Realtime 2',
      role: requested === 'gpt-realtime-mini' ? 'low_cost' : 'best_tool_use',
      notes: 'test model policy',
      requested: requested?.trim() || null,
      usedFallback: false,
    }),
    fetchOpenAIClientSecret: async (url, init) => {
      calls.fetch.push({ url: String(url), init })
      if (options.openAIThrows) {
        throw new Error('network down')
      }
      if (options.openAIStatus && options.openAIStatus >= 400) {
        return new Response('provider stack trace with sk-provider-secret', { status: options.openAIStatus })
      }
      return new Response(
        JSON.stringify(options.missingClientSecret ? { id: 'missing' } : { value: 'ek_test_client_secret' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    },
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
  options: HarnessOptions,
  expectedStatus: number,
  expectedCode: string
) {
  const harness = createHarness(options)
  const response = await handleVoiceAgentSessionRequest(request, harness.deps)
  const body = await readJson(response)
  assert.equal(response.status, expectedStatus, `${name}: status`)
  assert.equal(body.code, expectedCode, `${name}: code`)
  return { response, body, ...harness }
}

async function main() {
  const validBody = {
    sessionId: 'session-1',
    language: 'es',
    gradeLevel: 'Grade 6',
  }

  const unauth = await expectFailure(
    'unauthenticated requests stop before environment checks',
    jsonRequest(validBody),
    { userId: null, env: { openAIApiKey: undefined, openAISocraticTutorInstructions: undefined } },
    401,
    'UNAUTHORIZED'
  )
  assert.equal(unauth.calls.env, 0)
  assert.equal(unauth.calls.getSql, 0)
  assert.equal(unauth.calls.fetch.length, 0)

  const missingApiKey = await expectFailure(
    'missing OpenAI API key is contained after auth',
    jsonRequest(validBody),
    { env: { openAIApiKey: ' ' } },
    500,
    'OPENAI_API_KEY_MISSING'
  )
  assert.equal(missingApiKey.calls.getSql, 0)
  assert.equal(missingApiKey.calls.fetch.length, 0)

  const missingInstructions = await expectFailure(
    'missing lab instructions are contained before quota checks',
    jsonRequest(validBody),
    { env: { openAISocraticTutorInstructions: '' } },
    500,
    'INSTRUCTIONS_NOT_CONFIGURED'
  )
  assert.equal(missingInstructions.calls.getSql, 0)

  const invalidJson = await expectFailure(
    'invalid JSON is rejected before quota checks',
    rawRequest('{'),
    {},
    400,
    'INVALID_JSON'
  )
  assert.equal(invalidJson.calls.getSql, 0)

  const rateLimited = await expectFailure(
    'rate limits stop voice client-secret minting',
    jsonRequest(validBody),
    { rateLimitAllowed: false, retryAfterSeconds: 55 },
    429,
    'RATE_LIMITED'
  )
  assert.equal(rateLimited.response.headers.get('Retry-After'), '55')
  assert.equal(rateLimited.calls.rateLimit[0]?.endpoint, 'voice-agent-session')
  assert.equal(rateLimited.calls.rateLimit[0]?.sessionId, 'session-1')
  assert.equal(rateLimited.calls.quota, 0)
  assert.equal(rateLimited.calls.fetch.length, 0)

  const inactiveSession = await expectFailure(
    'requested session id must match the active quota-tracked session',
    jsonRequest(validBody),
    { quota: { activeSessionId: 'other-session' } },
    409,
    'SESSION_REQUIRED'
  )
  assert.equal(inactiveSession.calls.fetch.length, 0)

  const exhaustedQuota = await expectFailure(
    'exhausted tutor quota blocks client-secret minting',
    jsonRequest(validBody),
    { quota: { remainingSeconds: 0 } },
    429,
    'QUOTA_EXCEEDED'
  )
  assert.deepEqual(exhaustedQuota.calls.finalize, ['session-1'])
  assert.equal(exhaustedQuota.calls.fetch.length, 0)

  const pausedSession = await expectFailure(
    'paused sessions cannot mint a fresh voice-agent client secret',
    jsonRequest(validBody),
    { quota: { activeSessionState: 'paused' } },
    409,
    'SESSION_PAUSED'
  )
  assert.equal(pausedSession.calls.fetch.length, 0)

  const timedOutQuota = await expectFailure(
    'database timeouts return a generic quota verification error',
    jsonRequest(validBody),
    { quotaThrows: true, timedOut: true },
    503,
    'DATABASE_TIMEOUT'
  )
  assert.equal(timedOutQuota.calls.consoleErrors, 1)
  assert.equal(timedOutQuota.calls.clearTimeout, 1)

  const openAiFailure = await expectFailure(
    'OpenAI provider errors stay generic at the browser boundary',
    jsonRequest(validBody),
    { openAIStatus: 429 },
    400,
    'OPENAI_SESSION_FAILED'
  )
  assert.equal(openAiFailure.calls.fetch.length, 1)
  assert.equal(JSON.stringify(openAiFailure.body).includes('sk-provider-secret'), false)

  const missingClientSecret = await expectFailure(
    'OpenAI responses without a client secret are rejected',
    jsonRequest(validBody),
    { missingClientSecret: true },
    502,
    'OPENAI_CLIENT_SECRET_MISSING'
  )
  assert.equal(missingClientSecret.calls.fetch.length, 1)

  const successHarness = createHarness({ curriculumContext: 'Class unit on ratios and rates.' })
  const successResponse = await handleVoiceAgentSessionRequest(jsonRequest(validBody), successHarness.deps)
  const successBody = await readJson(successResponse)
  assert.equal(successResponse.status, 200)
  assert.equal(successBody.ok, true)
  assert.equal(successBody.value, 'ek_test_client_secret')
  assert.equal(successBody.model, 'gpt-realtime-mini')
  assert.equal(successBody.modelProfile, 'low_cost')
  assert.equal(successBody.voice, 'marin')
  assert.equal(successBody.language, 'es')
  assert.equal(successHarness.calls.curriculumContext[0], 'student-1')
  assert.equal(successHarness.calls.fetch.length, 1)

  const fetchInit = successHarness.calls.fetch[0]?.init
  assert.equal((fetchInit?.headers as Record<string, string>).Authorization, 'Bearer sk-test')
  const fetchBody = JSON.parse(String(fetchInit?.body)) as {
    session: { model: string; audio: { input: { transcription: { model: string; language: string } } } }
  }
  assert.equal(fetchBody.session.model, 'gpt-realtime-mini')
  assert.equal(fetchBody.session.audio.input.transcription.model, 'gpt-4o-transcribe')
  assert.equal(fetchBody.session.audio.input.transcription.language, 'es')
  assert.match(String(successBody.instructions), /Grade 6/)
  assert.match(String(successBody.instructions), /Class unit on ratios and rates/)
  assert.equal(String(successBody.instructions).includes('sk-test'), false)

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedRouteAbuseCases: 12,
        checkedEndpoint: 'voice-agent-session',
      },
      null,
      2
    )
  )
}

main()
