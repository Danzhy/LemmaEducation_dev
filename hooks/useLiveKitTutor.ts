'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RpcInvocationData,
} from 'livekit-client'
import type { TutorState } from '@/components/TutorAvatar'
import { TUTOR_INACTIVITY_PAUSE_SECONDS } from '@/lib/tutor/constants'
import {
  LIVEKIT_TOPICS,
  decodeLiveKitPayload,
  type LiveKitTutorPayload,
} from '@/lib/livekit/messages'
import {
  LIVEKIT_TUTOR_CANVAS_ACTION_NAMES,
  LIVEKIT_TUTOR_TOOL_NAMES,
} from '@/lib/livekit/tool-catalog'
import {
  buildCanvasActionFromPayload,
  parseJsonSafely,
} from '@/lib/tutor/canvas-action-parser'
import type {
  TutorCanvasAction,
  TutorChatMessage,
  TutorConnectOptions,
  TutorSessionAdapter,
  TutorToolEvent,
} from '@/lib/tutor/session-adapter'

type UseLiveKitTutorOptions = {
  onError?: (userMessage: string, rawError?: string) => void
}

type LiveKitSessionBootstrap = {
  ok?: boolean
  token?: string
  url?: string
  roomName?: string
  identity?: string
  agentName?: string
  instructions?: string
  code?: string
  message?: string
  missing?: string[]
}

const MAX_TOOL_EVENTS = 100
const MAX_PENDING_CANVAS_ACTIONS = 180
const MAX_CANVAS_ACTIONS_PER_RESULT = 80

type LocalToolPlan = {
  toolName: string
  input: Record<string, unknown>
}

function logErrorToServer(source: string, rawError?: string) {
  void fetch('/api/realtime/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, rawError: rawError ?? source }),
  }).catch(() => {})
}

function withConnectionTimeout<T>(promise: Promise<T>, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Connection timed out. Please try again.'))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

function parseRpcPayload(data: RpcInvocationData) {
  const parsed = parseJsonSafely(data.payload)
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : null
}

async function sendLiveKitText(room: Room | null, topic: string, payload: LiveKitTutorPayload) {
  if (!room || room.state !== ConnectionState.Connected) return
  await room.localParticipant.sendText(JSON.stringify(payload), { topic })
}

function coerceAssistantText(parsed: LiveKitTutorPayload | null, rawText: string) {
  if (parsed?.type === 'assistant_text') return parsed.text
  if (parsed?.type === 'chat_message' && parsed.message.role === 'assistant') return parsed.message.content
  return rawText
}

function formatToolNameForStudent(toolName: string) {
  return toolName.replace(/_/g, ' ')
}

function extractNumbers(text: string) {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
}

function extractFractions(text: string) {
  return [...text.matchAll(/(-?\d+)\s*\/\s*(-?\d+)/g)].map((match) => ({
    numerator: Number(match[1]),
    denominator: Number(match[2]),
  }))
}

function extractGraphExpression(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const equationMatch = normalized.match(/(?:graph|plot|draw)\s+(?:the\s+)?(?:function\s+)?(?:y\s*=\s*)?([^.,;\n]+?)(?:\s+from|\s+for|\s+and|\s+with|$)/i)
  const yEqualsMatch = normalized.match(/y\s*=\s*([^.,;\n]+)/i)
  const rawExpression = (yEqualsMatch?.[1] ?? equationMatch?.[1] ?? '')
    .split(/\s+(?:from|for|and|with|where|between|over)\b/i)[0]
    .trim()
  return rawExpression.replace(/^y\s*=\s*/i, '').replace(/\s+/g, ' ').trim()
}

function extractGraphDomain(text: string) {
  const domainMatch = text.match(/x\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:to|through|until|\.{2}|-)\s*(-?\d+(?:\.\d+)?)/i)
  if (!domainMatch) return null
  const start = Number(domainMatch[1])
  const end = Number(domainMatch[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

function planLocalToolTurn(prompt: string, gradeLevel: string): LocalToolPlan[] {
  const lower = prompt.toLowerCase()
  const fractions = extractFractions(prompt)
  const numbers = extractNumbers(prompt)
  const plans: LocalToolPlan[] = []

  if (/\b(graph|plot|parabola|function)\b/i.test(prompt)) {
    const expression = extractGraphExpression(prompt) || 'x'
    const domain = extractGraphDomain(prompt)
    plans.push({
      toolName: 'graph_function',
      input: {
        expression,
        domainStart: domain?.start ?? -5,
        domainEnd: domain?.end ?? 5,
        graphType: 'cartesian',
        title: `Graph of y = ${expression}`,
        showXIntercepts: /intercept|root|zero/.test(lower),
        showYIntercept: /intercept|y-axis|where it starts/.test(lower),
        showVertex: /vertex|parabola|\^2|squared/.test(lower),
      },
    })
    return plans
  }

  if (/common denominator|denominator/.test(lower) && fractions.length >= 2) {
    plans.push({
      toolName: 'common_denominator',
      input: {
        leftNumerator: fractions[0].numerator,
        leftDenominator: fractions[0].denominator,
        rightNumerator: fractions[1].numerator,
        rightDenominator: fractions[1].denominator,
        purpose: /add|subtract|\+|-/.test(lower) ? 'add_subtract' : 'compare',
      },
    })
    return plans
  }

  if (/compare/.test(lower) && fractions.length >= 2) {
    plans.push({
      toolName: 'fraction_compare',
      input: {
        leftNumerator: fractions[0].numerator,
        leftDenominator: fractions[0].denominator,
        rightNumerator: fractions[1].numerator,
        rightDenominator: fractions[1].denominator,
        title: 'Compare the fractions',
      },
    })
    return plans
  }

  if (/simplify|reduce|equivalent fraction/.test(lower) && fractions.length >= 1) {
    plans.push({
      toolName: 'fraction_simplify',
      input: {
        numerator: fractions[0].numerator,
        denominator: fractions[0].denominator,
      },
    })
    return plans
  }

  if (/percent bar|out of/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'percent_bar',
      input: {
        part: numbers[0],
        total: numbers[1],
        title: 'Percent bar',
        label: `${numbers[0]} out of ${numbers[1]}`,
      },
    })
    return plans
  }

  if (/%\s*of|percent of/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'percent_of_number',
      input: {
        percent: numbers[0],
        whole: numbers[1],
      },
    })
    plans.push({
      toolName: 'percent_bar',
      input: {
        part: numbers[0],
        total: 100,
        title: `${numbers[0]}% of ${numbers[1]}`,
        label: `${numbers[0]}%`,
      },
    })
    return plans
  }

  if (/decimal|compare/.test(lower) && numbers.length >= 2 && numbers.some((number) => !Number.isInteger(number))) {
    plans.push({
      toolName: 'decimal_compare',
      input: {
        left: numbers[0],
        right: numbers[1],
      },
    })
    return plans
  }

  if (/round/.test(lower) && numbers.length >= 1) {
    const place = lower.includes('hundredth')
      ? 'hundredths'
      : lower.includes('tenth')
      ? 'tenths'
      : lower.includes('thousand')
      ? 'thousands'
      : lower.includes('hundred')
      ? 'hundreds'
      : 'tens'
    plans.push({
      toolName: 'round_number',
      input: {
        value: numbers[0],
        place,
      },
    })
    return plans
  }

  if (/double number line|unit rate|cost|ratio|notebook|recipe|muffin/.test(lower) && numbers.length >= 2) {
    const quantity = numbers[0]
    const value = numbers[1]
    const target = numbers[2]
    if (/unit rate|cost/.test(lower)) {
      plans.push({
        toolName: 'unit_rate',
        input: {
          quantity,
          value,
          quantityLabel: /notebook/.test(lower) ? 'notebooks' : 'units',
          valueLabel: /\$|cost/.test(lower) ? 'dollars' : 'value',
        },
      })
    }
    plans.push({
      toolName: 'double_number_line',
      input: {
        topLabel: /notebook/.test(lower) ? 'notebooks' : 'quantity',
        bottomLabel: /\$|cost/.test(lower) ? 'cost' : 'value',
        pairs: [
          { top: 0, bottom: 0, label: 'start' },
          { top: quantity, bottom: value, label: 'given' },
          ...(typeof target === 'number'
            ? [{ top: target, bottom: (value / quantity) * target, label: 'target' }]
            : []),
        ],
        title: 'Double number line',
      },
    })
    return plans
  }

  if (/linear|equation|solve|x\s*=|[+-]?\d*x\s*[+-]\s*\d+\s*=/.test(lower) && /x/.test(lower) && /=/.test(prompt)) {
    const equation = prompt.match(/([+-]?\d*\s*x\s*(?:[+-]\s*\d+)?\s*=\s*-?\d+(?:\.\d+)?)/i)?.[1] ?? prompt
    plans.push({
      toolName: 'solve_linear_on_canvas',
      input: {
        problem: equation.trim(),
        maxSteps: 2,
      },
    })
    return plans
  }

  if (/area|perimeter|rectangle/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'area_perimeter_model',
      input: {
        widthUnits: numbers[0],
        heightUnits: numbers[1],
        unitLabel: 'units',
        title: 'Area and perimeter model',
        showUnitSquares: true,
      },
    })
    return plans
  }

  if (/word problem|plan|recipe|muffin/.test(lower)) {
    plans.push({
      toolName: 'word_problem_plan',
      input: {
        problemText: prompt,
        gradeLevel,
      },
    })
    return plans
  }

  plans.push({
    toolName: 'socratic_move_planner',
    input: {
      topic: prompt.slice(0, 180),
      gradeLevel,
      studentWork: prompt,
      tutorGoal: 'unstick',
    },
  })
  plans.push({
    toolName: 'write_on_canvas',
    input: {
      title: 'Let us set this up',
      textLines: ['Tell me what you tried first.', 'Then we can check the step where it got confusing.'],
      clearExisting: true,
    },
  })
  return plans
}

function buildLocalAssistantReply(prompt: string, plans: LocalToolPlan[], outputs: unknown[]) {
  const firstTool = plans[0]?.toolName
  if (!firstTool) {
    return 'I am ready. Type a math problem and I will help you reason through it.'
  }

  if (firstTool === 'graph_function') {
    return 'I put the graph on the board. Start by reading the key points, then tell me which part you want to reason through first.'
  }

  if (firstTool === 'solve_linear_on_canvas') {
    return 'I wrote the next algebra steps on the board. Before going further, check which operation undoes the last change.'
  }

  if (firstTool === 'percent_bar') {
    return 'I drew a percent bar so the part and whole are visible. Use the shaded part to explain the percent before jumping to the answer.'
  }

  if (firstTool === 'double_number_line' || firstTool === 'unit_rate') {
    return 'I set up the rate visually. Look for the value per 1 unit first, then scale from there.'
  }

  if (firstTool.includes('fraction') || firstTool === 'common_denominator') {
    return 'I added a fraction visual or checked fraction step on the board. Focus on the size of the parts before calculating.'
  }

  const summary = outputs
    .map((output) => {
      if (!output || typeof output !== 'object') return null
      const record = output as Record<string, unknown>
      if (typeof record.summary === 'string') return record.summary
      if (typeof record.suggestedQuestion === 'string') return record.suggestedQuestion
      if (typeof record.reason === 'string') return record.reason
      return null
    })
    .find(Boolean)

  return summary ?? `I used the ${formatToolNameForStudent(firstTool)} tool and put the useful structure on the board. What should we check next?`
}

async function callServerLiveKitTool(sessionId: string | null, toolName: string, input: unknown) {
  const response = await fetch(sessionId ? '/api/livekit/tool' : '/api/livekit/tool-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionId ? { sessionId, toolName, input } : { toolName, input }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    output?: unknown
    canvasActions?: TutorCanvasAction[]
    message?: string
  }

  if (!response.ok || !body.ok) {
    throw new Error(body.message || 'Tool failed.')
  }

  return {
    output: body.output,
    canvasActions: Array.isArray(body.canvasActions) ? body.canvasActions : [],
  }
}

async function startServerTutorSession(options?: TutorConnectOptions) {
  const startSessionRes = await fetch('/api/tutor/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: options?.language ?? 'en',
      gradeLevel: options?.gradeLevel ?? '',
      modelSnapshot: 'livekit-agent-lab',
    }),
  })
  const startSessionData = await startSessionRes.json().catch(() => ({}))
  const code = (startSessionData as { code?: string }).code

  if (!startSessionRes.ok) {
    if (startSessionRes.status === 401 || code === 'UNAUTHORIZED') {
      throw new Error('Please sign in again.')
    }
    if (startSessionRes.status === 403 || code === 'QUOTA_EXCEEDED') {
      throw new Error('Your tutoring time limit has been reached.')
    }
    if (code === 'SESSION_LIMIT_REACHED') {
      throw new Error('You have used all 4 pilot tutoring sessions.')
    }
    if (startSessionRes.status === 429 || code === 'RATE_LIMITED') {
      throw new Error('Too many session attempts. Please wait a moment and try again.')
    }
    throw new Error('Something went wrong. Please try again.')
  }

  const sessionId = (startSessionData as { sessionId?: string }).sessionId ?? null
  if (!sessionId) {
    throw new Error('Something went wrong. Please try again.')
  }

  return sessionId
}

export function useLiveKitTutor({
  onError,
}: UseLiveKitTutorOptions = {}): TutorSessionAdapter {
  const [state, setState] = useState<TutorState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [lastPauseReason, setLastPauseReason] = useState<'manual' | 'inactivity' | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [supportsLiveMic, setSupportsLiveMic] = useState(true)
  const [connectionMode, setConnectionMode] = useState<'voice' | 'typed'>('voice')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentUserTranscript, setCurrentUserTranscript] = useState('')
  const [transcript, setTranscript] = useState('')
  const [chatHistory, setChatHistory] = useState<TutorChatMessage[]>([])
  const [toolEvents, setToolEvents] = useState<TutorToolEvent[]>([])
  const [pendingCanvasActions, setPendingCanvasActions] = useState<TutorCanvasAction[]>([])

  const roomRef = useRef<Room | null>(null)
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null)
  const remoteAudioElementsRef = useRef<HTMLMediaElement[]>([])
  const usageIntervalRef = useRef<number | null>(null)
  const inactivityTimeoutRef = useRef<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const connectedRef = useRef(false)
  const pausedRef = useRef(false)
  const mutedRef = useRef(false)
  const agentNameRef = useRef('lemma-livekit-tutor')
  const autoPauseRef = useRef<() => void>(() => {})
  const localToolModeRef = useRef(false)
  const gradeLevelRef = useRef('Grade 6')

  const clearUsageInterval = useCallback(() => {
    if (usageIntervalRef.current !== null) {
      window.clearInterval(usageIntervalRef.current)
      usageIntervalRef.current = null
    }
  }, [])

  const clearInactivityTimeout = useCallback(() => {
    if (inactivityTimeoutRef.current !== null) {
      window.clearTimeout(inactivityTimeoutRef.current)
      inactivityTimeoutRef.current = null
    }
  }, [])

  const appendToolEvent = useCallback((event: Omit<TutorToolEvent, 'id' | 'createdAt'> & { id?: string }) => {
    setToolEvents((prev) =>
      [
        ...prev,
        {
          id: event.id ?? crypto.randomUUID(),
          createdAt: Date.now(),
          ...event,
        },
      ].slice(-MAX_TOOL_EVENTS)
    )
  }, [])

  const queueCanvasActions = useCallback(
    (actions: TutorCanvasAction[], sourceToolName = 'livekit_canvas') => {
      if (actions.length === 0) return
      const shouldReplaceQueue = actions.some((action) => action.type === 'clear_tool_layer')
      setPendingCanvasActions((prev) => {
        const nextActions = shouldReplaceQueue ? actions : [...prev, ...actions]
        return nextActions.slice(-MAX_PENDING_CANVAS_ACTIONS)
      })
      appendToolEvent({
        type: 'canvas_action',
        toolName: sourceToolName,
        output: actions,
      })
    },
    [appendToolEvent]
  )

  const touchServerSessionActivity = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return

    try {
      await fetch('/api/tutor/session/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      // Best-effort only.
    }
  }, [])

  const registerLocalActivity = useCallback(
    (shouldPingServer = false) => {
      if (!connectedRef.current || pausedRef.current) return

      clearInactivityTimeout()
      inactivityTimeoutRef.current = window.setTimeout(() => {
        autoPauseRef.current()
      }, TUTOR_INACTIVITY_PAUSE_SECONDS * 1000)

      if (shouldPingServer) {
        void touchServerSessionActivity()
      }
    },
    [clearInactivityTimeout, touchServerSessionActivity]
  )

  const finalizeTutorSession = useCallback(
    (endedReason: 'user' | 'error' | 'quota') => {
      clearUsageInterval()
      clearInactivityTimeout()
      const sessionId = sessionIdRef.current
      sessionIdRef.current = null
      if (!sessionId) return

      void fetch('/api/tutor/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, endedReason }),
      }).catch(() => {})
    },
    [clearInactivityTimeout, clearUsageInterval]
  )

  const cleanupLiveKitMedia = useCallback(() => {
    localAudioTrackRef.current?.stop()
    localAudioTrackRef.current = null

    remoteAudioElementsRef.current.forEach((element) => {
      element.pause()
      element.srcObject = null
      element.remove()
    })
    remoteAudioElementsRef.current = []
  }, [])

  const disconnect = useCallback(
    (endedReason: 'user' | 'error' | 'quota' = 'user') => {
      finalizeTutorSession(endedReason)

      const room = roomRef.current
      if (room) {
        try {
          room.unregisterRpcMethod('lemma_tool_call')
          room.unregisterRpcMethod('lemma_canvas_action')
          room.unregisterRpcMethod('lemma_client_status')
        } catch {
          // Handlers may already be gone during reconnect cleanup.
        }
        void room.disconnect(true)
      }
      roomRef.current = null
      cleanupLiveKitMedia()

      connectedRef.current = false
      pausedRef.current = false
      mutedRef.current = false
      localToolModeRef.current = false

      setCurrentSessionId(null)
      setIsConnected(false)
      setIsPaused(false)
      setLastPauseReason(null)
      setIsMuted(false)
      setIsSpeakerMuted(false)
      setSupportsLiveMic(true)
      setConnectionMode('voice')
      setCurrentUserTranscript('')
      setTranscript('')
      setPendingCanvasActions([])
      setState('idle')
    },
    [cleanupLiveKitMedia, finalizeTutorSession]
  )

  const pause = useCallback(
    async (reason: 'manual' | 'inactivity' = 'manual', skipServerSync = false) => {
      clearInactivityTimeout()
      pausedRef.current = true
      setIsPaused(true)
      setLastPauseReason(reason)
      setState('idle')
      await localAudioTrackRef.current?.mute().catch(() => undefined)

      if (!skipServerSync) {
        const sessionId = sessionIdRef.current
        if (!sessionId) return

        try {
          await fetch('/api/tutor/session/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          })
        } catch {
          // Local pause still protects the session UX.
        }
      }
    },
    [clearInactivityTimeout]
  )

  const resume = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId && localToolModeRef.current) {
      pausedRef.current = false
      setIsPaused(false)
      setLastPauseReason(null)
      registerLocalActivity(false)
      setState('listening')
      return
    }
    if (!sessionId) return

    try {
      const res = await fetch('/api/tutor/session/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      const code = (data as { code?: string }).code

      if (!res.ok) {
        if (res.status === 403 && code === 'QUOTA_EXCEEDED') {
          onError?.('Your tutoring time limit has been reached.', code)
          disconnect('quota')
          return
        }
        if (res.status === 403 && code === 'SESSION_LIMIT_REACHED') {
          onError?.('This tutoring session reached its 1 hour limit.', code)
          disconnect('quota')
          return
        }
        if (res.status === 429 && code === 'RATE_LIMITED') {
          onError?.('Too many tutor requests. Please wait a moment and try again.', code)
          return
        }
        onError?.('Could not resume the session. Please try again.', code)
        return
      }

      pausedRef.current = false
      setIsPaused(false)
      setLastPauseReason(null)
      if (!mutedRef.current) {
        await localAudioTrackRef.current?.unmute().catch(() => undefined)
      }
      registerLocalActivity(false)
      setState('listening')
    } catch {
      onError?.('Could not resume the session. Please try again.')
    }
  }, [disconnect, onError, registerLocalActivity])

  const startUsageTicker = useCallback(() => {
    clearUsageInterval()
    usageIntervalRef.current = window.setInterval(async () => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return

      try {
        const res = await fetch('/api/tutor/usage/tick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })

        const data = await res.json().catch(() => ({}))
        const code = (data as { code?: string }).code
        if (res.status === 403 && code === 'QUOTA_EXCEEDED') {
          onError?.('Your tutoring time limit has been reached.', code)
          disconnect('quota')
          return
        }
        if (res.status === 403 && code === 'SESSION_LIMIT_REACHED') {
          onError?.('This tutoring session reached its 1 hour limit.', code)
          disconnect('quota')
          return
        }
        if (res.status === 429 && code === 'RATE_LIMITED') {
          onError?.('Too many tutor requests. Please wait a moment and try again.', code)
          return
        }

        const tickData = data as { paused?: boolean; inactivityPaused?: boolean }
        if (tickData.paused && tickData.inactivityPaused && !pausedRef.current) {
          void pause('inactivity', true)
        }
      } catch {
        // Best-effort only.
      }
    }, 25000)
  }, [clearUsageInterval, disconnect, onError, pause])

  const startLocalTypedLabSession = useCallback(
    async (options?: TutorConnectOptions) => {
      gradeLevelRef.current = options?.gradeLevel || gradeLevelRef.current
      sessionIdRef.current = null
      localToolModeRef.current = true
      connectedRef.current = true
      pausedRef.current = false
      mutedRef.current = true

      setCurrentSessionId(null)
      setSupportsLiveMic(false)
      setConnectionMode('typed')
      setIsMuted(true)
      setIsSpeakerMuted(false)
      setIsConnected(true)
      setIsPaused(false)
      setLastPauseReason(null)
      setState('listening')
      setChatHistory([
        {
          role: 'assistant',
          content:
            'I am ready. Type a math problem or ask me to draw a visual on the board, and we will work through it step by step.',
          source: 'assistant',
        },
      ])

      registerLocalActivity(false)
      appendToolEvent({
        type: 'tool_completed',
        toolName: 'livekit_local_tool_mode',
        output: {
          mode: 'typed',
          reason: 'LiveKit room not configured locally. Deterministic preview tools are active.',
        },
      })
    },
    [appendToolEvent, registerLocalActivity]
  )

  const runLocalToolTurn = useCallback(
    async (text: string) => {
      setState('thinking')
      setTranscript('Choosing the right math tool...')
      const plans = planLocalToolTurn(text, gradeLevelRef.current)
      const outputs: unknown[] = []

      try {
        for (const plan of plans.slice(0, 3)) {
          const callId = crypto.randomUUID()
          appendToolEvent({
            type: 'tool_started',
            toolName: plan.toolName,
            input: plan.input,
            metadata: { callId, source: 'local-typed-lab' },
          })

          const result = await callServerLiveKitTool(sessionIdRef.current, plan.toolName, plan.input)
          outputs.push(result.output)
          appendToolEvent({
            type: 'tool_completed',
            toolName: plan.toolName,
            input: plan.input,
            output: result.output,
            metadata: { callId, source: 'local-typed-lab' },
          })
          queueCanvasActions(result.canvasActions.slice(0, MAX_CANVAS_ACTIONS_PER_RESULT), plan.toolName)
        }

        const reply = buildLocalAssistantReply(text, plans, outputs)
        setState('speaking')
        setTranscript(reply)
        window.setTimeout(() => {
          setChatHistory((prev) => [...prev, { role: 'assistant', content: reply, source: 'assistant' }])
          setTranscript('')
          if (!pausedRef.current) setState('listening')
        }, 350)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool failed.'
        appendToolEvent({
          type: 'tool_failed',
          toolName: plans[0]?.toolName ?? 'local_tool_turn',
          input: { text },
          output: message,
          metadata: { source: 'local-typed-lab' },
        })
        setTranscript('')
        setState('listening')
        onError?.('That tool did not run cleanly. Try a simpler prompt or different visual.', message)
      }
    },
    [appendToolEvent, onError, queueCanvasActions]
  )

  autoPauseRef.current = () => {
    void pause('inactivity')
  }

  const registerRoomHandlers = useCallback(
    (room: Room) => {
      room.registerRpcMethod('lemma_tool_call', async (data) => {
        const payload = parseRpcPayload(data)
        const toolName = typeof payload?.toolName === 'string' ? payload.toolName : ''
        const input = payload?.input ?? {}
        const callId = typeof payload?.callId === 'string' ? payload.callId : crypto.randomUUID()

        if (!toolName) {
          throw new Error('Tool name is required.')
        }

        appendToolEvent({
          type: 'tool_started',
          toolName,
          input,
          metadata: { callId, source: 'livekit-rpc' },
        })

        try {
          const result = await callServerLiveKitTool(sessionIdRef.current, toolName, input)
          appendToolEvent({
            type: 'tool_completed',
            toolName,
            input,
            output: result.output,
            metadata: { callId, source: 'livekit-rpc' },
          })

          const actions = result.canvasActions.slice(0, MAX_CANVAS_ACTIONS_PER_RESULT)
          queueCanvasActions(actions, toolName)

          return JSON.stringify({ ok: true, output: result.output, canvasActions: actions })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool failed.'
          appendToolEvent({
            type: 'tool_failed',
            toolName,
            input,
            output: message,
            metadata: { callId, source: 'livekit-rpc' },
          })
          return JSON.stringify({ ok: false, error: message })
        }
      })

      room.registerRpcMethod('lemma_canvas_action', async (data) => {
        const payload = parseRpcPayload(data)
        const rawActions = Array.isArray(payload?.actions)
          ? payload.actions
          : typeof payload?.actionType === 'string'
          ? [payload]
          : []
        const actions = rawActions
          .map((action: Record<string, any>) => {
            const actionType = typeof action.type === 'string' ? action.type : action.actionType
            return typeof actionType === 'string' ? buildCanvasActionFromPayload(actionType, action) : null
          })
          .filter(Boolean)
          .slice(0, MAX_CANVAS_ACTIONS_PER_RESULT) as TutorCanvasAction[]

        queueCanvasActions(actions, 'livekit_canvas_action')
        return JSON.stringify({ ok: true, accepted: actions.length })
      })

      room.registerRpcMethod('lemma_client_status', async () =>
        JSON.stringify({
          ok: true,
          sessionId: sessionIdRef.current,
          connected: connectedRef.current,
          paused: pausedRef.current,
          availableTools: LIVEKIT_TUTOR_TOOL_NAMES,
          canvasActions: LIVEKIT_TUTOR_CANVAS_ACTION_NAMES,
        })
      )

      room.registerTextStreamHandler(LIVEKIT_TOPICS.assistantText, async (reader) => {
        let rawText = ''
        for await (const chunk of reader) {
          rawText += chunk
          setTranscript(rawText)
          setState('speaking')
        }
        const parsed = parseJsonSafely(rawText) as LiveKitTutorPayload | null
        const content = coerceAssistantText(parsed, rawText).trim()
        if (content) {
          setChatHistory((prev) => [...prev, { role: 'assistant', content, source: 'assistant' }])
        }
        setTranscript('')
        setState('listening')
      })

      room.registerTextStreamHandler(LIVEKIT_TOPICS.toolEvent, async (reader) => {
        const rawText = await reader.readAll()
        const parsed = parseJsonSafely(rawText) as LiveKitTutorPayload | null
        if (parsed?.type === 'tool_event') {
          appendToolEvent(parsed.event)
        }
      })

      room.registerTextStreamHandler(LIVEKIT_TOPICS.canvasAction, async (reader) => {
        const rawText = await reader.readAll()
        const parsed = parseJsonSafely(rawText) as { actions?: unknown[]; actionType?: string } | null
        if (!parsed || typeof parsed !== 'object') return
        const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [parsed]
        const actions = rawActions
          .map((action: any) => {
            const actionType = typeof action.type === 'string' ? action.type : action.actionType
            return typeof actionType === 'string' ? buildCanvasActionFromPayload(actionType, action) : null
          })
          .filter(Boolean)
          .slice(0, MAX_CANVAS_ACTIONS_PER_RESULT) as TutorCanvasAction[]
        queueCanvasActions(actions, 'livekit_canvas_stream')
      })

      room.on(RoomEvent.Connected, () => {
        setState('listening')
      })

      room.on(RoomEvent.Reconnecting, () => {
        setState('thinking')
      })

      room.on(RoomEvent.Reconnected, () => {
        if (!pausedRef.current) setState('listening')
      })

      room.on(RoomEvent.Disconnected, () => {
        setState('idle')
      })

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        if (participant.identity === agentNameRef.current || participant.identity.includes('agent')) {
          appendToolEvent({
            type: 'tool_completed',
            toolName: 'livekit_agent_connected',
            output: participant.identity,
          })
        }
      })

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Audio) return
          const element = track.attach()
          element.autoplay = true
          element.muted = isSpeakerMuted
          remoteAudioElementsRef.current.push(element)
        }
      )

      room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant, _kind, topic) => {
        const parsed = decodeLiveKitPayload(payload)
        if (topic === LIVEKIT_TOPICS.assistantText) {
          const content = coerceAssistantText(parsed, new TextDecoder().decode(payload)).trim()
          if (content) {
            setChatHistory((prev) => [...prev, { role: 'assistant', content, source: 'assistant' }])
          }
        }
        if (parsed?.type === 'tool_event') {
          appendToolEvent(parsed.event)
        }
      })
    },
    [appendToolEvent, isSpeakerMuted, queueCanvasActions]
  )

  const connect = useCallback(
    async (options?: TutorConnectOptions) => {
      let startedSessionId: string | null = null

      try {
        setChatHistory([])
        setToolEvents([])
        setPendingCanvasActions([])
        setState('thinking')
        gradeLevelRef.current = options?.gradeLevel || 'Grade 6'
        const audioMode = options?.audioMode === 'silent' ? 'silent' : 'microphone'

        const statusRes = await fetch('/api/livekit/status')
        const status = await statusRes.json().catch(() => ({}))
        if (!statusRes.ok) {
          const code = (status as { code?: string }).code
          throw new Error(code === 'UNAUTHORIZED' ? 'Please sign in again.' : 'Could not check LiveKit setup.')
        }
        if (!(status as { configured?: boolean }).configured) {
          const missing = ((status as { missing?: string[] }).missing ?? []).join(', ')
          const workerCommand =
            typeof (status as { workerCommand?: unknown }).workerCommand === 'string'
              ? (status as { workerCommand: string }).workerCommand
              : 'npm run dev:livekit-agent'
          if (audioMode === 'silent') {
            await startLocalTypedLabSession(options)
            return
          }
          throw new Error(
            missing
              ? `LiveKit lab is not configured yet. Missing: ${missing}. Then start the worker with ${workerCommand}.`
              : `LiveKit lab is not configured yet. Start the worker with ${workerCommand}.`
          )
        }

        let localAudioTrack: LocalAudioTrack | null = null

        if (audioMode === 'microphone') {
          localAudioTrack = await createLocalAudioTrack()
          localAudioTrackRef.current = localAudioTrack
          setSupportsLiveMic(true)
          setConnectionMode('voice')
          setIsMuted(false)
          mutedRef.current = false
        } else {
          setSupportsLiveMic(false)
          setConnectionMode('typed')
          setIsMuted(true)
          mutedRef.current = true
        }

        startedSessionId = await startServerTutorSession(options)
        sessionIdRef.current = startedSessionId
        setCurrentSessionId(startedSessionId)

        const liveKitRes = await fetch('/api/livekit/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: startedSessionId,
            language: options?.language ?? 'en',
            gradeLevel: options?.gradeLevel ?? '',
            audioMode,
          }),
        })
        const liveKitData = (await liveKitRes.json().catch(() => ({}))) as LiveKitSessionBootstrap
        if (!liveKitRes.ok) {
          if (liveKitData.code === 'LIVEKIT_NOT_CONFIGURED') {
            throw new Error('LiveKit lab is not configured yet.')
          }
          if (liveKitData.code === 'RATE_LIMITED') {
            throw new Error('Too many connection attempts. Please wait a moment and try again.')
          }
          if (liveKitData.code === 'QUOTA_EXCEEDED') {
            throw new Error('Your tutoring time limit has been reached.')
          }
          throw new Error(liveKitData.message || 'Something went wrong. Please try again.')
        }
        if (!liveKitData.token || !liveKitData.url || !liveKitData.roomName) {
          throw new Error('LiveKit session did not include connection details.')
        }

        agentNameRef.current = liveKitData.agentName || 'lemma-livekit-tutor'

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        })
        roomRef.current = room
        registerRoomHandlers(room)

        await withConnectionTimeout(room.connect(liveKitData.url, liveKitData.token, { autoSubscribe: true }))

        if (localAudioTrack) {
          await room.localParticipant.publishTrack(localAudioTrack, {
            source: Track.Source.Microphone,
          })
        }

        connectedRef.current = true
        pausedRef.current = false
        setIsConnected(true)
        setIsPaused(false)
        setLastPauseReason(null)
        setState('listening')
        registerLocalActivity(false)

        appendToolEvent({
          type: 'tool_completed',
          toolName: 'livekit_room_connected',
          output: {
            roomName: liveKitData.roomName,
            agentName: liveKitData.agentName,
            mode: audioMode,
          },
        })

        startUsageTicker()
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err)
        const isMicPermissionError =
          err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
        const isMicMissingError = err instanceof DOMException && err.name === 'NotFoundError'
        const userMsg =
          isMicPermissionError
            ? 'Allow microphone access to start tutoring, or use the typed lab start instead.'
            : isMicMissingError
            ? 'No microphone was found. Connect one and try again.'
            : rawMsg.includes('LiveKit lab is not configured')
            ? rawMsg
            : rawMsg === 'Please sign in again.' || rawMsg === 'Your tutoring time limit has been reached.'
            ? rawMsg
            : rawMsg.includes('try again')
            ? rawMsg
            : 'Something went wrong. Please try again.'

        console.error('[Lemma LiveKit Lab] Connection error:', rawMsg)
        logErrorToServer('livekit-lab-connection', rawMsg)
        onError?.(userMsg, rawMsg)
        setState('idle')

        if (startedSessionId) {
          disconnect(rawMsg === 'Your tutoring time limit has been reached.' ? 'quota' : 'error')
        } else {
          disconnect('error')
        }

        throw new Error(userMsg)
      }
    },
    [
      appendToolEvent,
      disconnect,
      onError,
      registerLocalActivity,
      registerRoomHandlers,
      startLocalTypedLabSession,
      startUsageTicker,
    ]
  )

  const publishUserPayload = useCallback(
    async (topic: string, payload: LiveKitTutorPayload) => {
      try {
        await sendLiveKitText(roomRef.current, topic, payload)
      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : String(error)
        logErrorToServer('livekit-lab-send', rawMsg)
        onError?.('Could not send that to the LiveKit agent. Please try again.', rawMsg)
      }
    },
    [onError]
  )

  const sendText = useCallback(
    (text: string) => {
      if (pausedRef.current || !text.trim()) return
      registerLocalActivity(true)
      const message: TutorChatMessage = { role: 'user', content: text, source: 'text' }
      setChatHistory((prev) => [...prev, message])
      setCurrentUserTranscript('')

      if (localToolModeRef.current) {
        void runLocalToolTurn(text)
        return
      }

      if (!roomRef.current) return
      setState('thinking')
      void publishUserPayload(LIVEKIT_TOPICS.userText, {
        type: 'user_text',
        text,
        sessionId: sessionIdRef.current,
        createdAt: Date.now(),
      })
    },
    [publishUserPayload, registerLocalActivity, runLocalToolTurn]
  )

  const sendImage = useCallback(
    (base64Data: string, mimeType: string) => {
      if (pausedRef.current) return
      registerLocalActivity(true)
      setChatHistory((prev) => [...prev, { role: 'user', content: '[Sent an image]', source: 'image_only' }])

      if (localToolModeRef.current) {
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Image uploads need the full LiveKit voice room. In local typed mode, describe the problem or ask for a specific visual and I can still use the math tools.',
            source: 'assistant',
          },
        ])
        return
      }

      if (!roomRef.current) return
      setState('thinking')
      void publishUserPayload(LIVEKIT_TOPICS.userImage, {
        type: 'user_image',
        mimeType,
        dataBase64: base64Data,
        sessionId: sessionIdRef.current,
        createdAt: Date.now(),
      })
    },
    [publishUserPayload, registerLocalActivity]
  )

  const sendTextWithImage = useCallback(
    (text: string, base64Data: string, mimeType: string) => {
      if (pausedRef.current) return
      registerLocalActivity(true)
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', content: text || '[Sent an image]', source: 'text_with_image' },
      ])

      if (localToolModeRef.current) {
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: text.trim()
              ? 'I can use your typed description in local mode, but the uploaded image needs the full LiveKit voice room. I will work from the text you gave me.'
              : 'Image uploads need the full LiveKit voice room. Type the math problem here and I can use the local tool lab.',
            source: 'assistant',
          },
        ])
        if (text.trim()) void runLocalToolTurn(text)
        return
      }

      if (!roomRef.current) return
      setState('thinking')
      void publishUserPayload(LIVEKIT_TOPICS.userImage, {
        type: 'user_image',
        text,
        mimeType,
        dataBase64: base64Data,
        sessionId: sessionIdRef.current,
        createdAt: Date.now(),
      })
    },
    [publishUserPayload, registerLocalActivity, runLocalToolTurn]
  )

  const sendCanvasImage = useCallback(
    (base64: string, mimeType: string = 'image/jpeg') => {
      if (pausedRef.current || localToolModeRef.current || !roomRef.current) return
      registerLocalActivity(false)
      void publishUserPayload(LIVEKIT_TOPICS.canvasContext, {
        type: 'canvas_context',
        mimeType,
        dataBase64: base64,
        sessionId: sessionIdRef.current,
        createdAt: Date.now(),
      })
    },
    [publishUserPayload, registerLocalActivity]
  )

  const mute = useCallback(() => {
    mutedRef.current = true
    setIsMuted(true)
    void localAudioTrackRef.current?.mute().catch(() => undefined)
  }, [])

  const unmute = useCallback(() => {
    if (!supportsLiveMic) {
      onError?.('This LiveKit lab session started without microphone input. Restart with mic to speak out loud.')
      return
    }
    mutedRef.current = false
    setIsMuted(false)
    if (!pausedRef.current) {
      void localAudioTrackRef.current?.unmute().catch(() => undefined)
    }
  }, [onError, supportsLiveMic])

  const muteSpeaker = useCallback(() => {
    setIsSpeakerMuted(true)
    remoteAudioElementsRef.current.forEach((element) => {
      element.muted = true
    })
  }, [])

  const unmuteSpeaker = useCallback(() => {
    setIsSpeakerMuted(false)
    remoteAudioElementsRef.current.forEach((element) => {
      element.muted = false
    })
  }, [])

  const acknowledgeCanvasAction = useCallback((actionId: string) => {
    setPendingCanvasActions((prev) => prev.filter((action) => action.id !== actionId))
  }, [])

  useEffect(() => {
    return () => {
      disconnect('user')
    }
  }, [disconnect])

  return {
    state,
    isConnected,
    isPaused,
    lastPauseReason,
    isMuted,
    isSpeakerMuted,
    supportsLiveMic,
    connectionMode,
    currentSessionId,
    currentUserTranscript,
    transcript,
    chatHistory,
    toolEvents,
    pendingCanvasActions,
    connect,
    disconnect,
    sendText,
    sendImage,
    sendTextWithImage,
    sendCanvasImage,
    mute,
    unmute,
    pause,
    resume,
    muteSpeaker,
    unmuteSpeaker,
    acknowledgeCanvasAction,
  }
}
