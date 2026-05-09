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
  coerceLiveKitAssistantText,
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
import { planCanvasActionReveal } from '@/lib/tutor/canvas-action-reveal'
import {
  buildLocalAssistantReply,
  hydrateLocalToolPlanInput,
  planLocalToolTurn,
} from '@/lib/livekit/local-tool-planner'
import type {
  TutorCanvasAction,
  TutorChatMessage,
  TutorConnectOptions,
  TutorSendTextOptions,
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
const LIVEKIT_TRANSCRIPTION_FINAL_ATTRIBUTE = 'lk.transcription_final'
const LIVEKIT_TRANSCRIBED_TRACK_ATTRIBUTE = 'lk.transcribed_track_id'
const LIVEKIT_SEGMENT_ID_ATTRIBUTE = 'lk.segment_id'

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

function getParticipantIdentity(participantInfo: unknown) {
  if (typeof participantInfo === 'string') return participantInfo
  if (participantInfo && typeof participantInfo === 'object') {
    const identity = (participantInfo as { identity?: unknown }).identity
    return typeof identity === 'string' ? identity : ''
  }
  return ''
}

function normalizeLiveKitTranscriptText(rawText: string) {
  const trimmed = rawText.trim()
  if (!trimmed) return ''

  const jsonLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (jsonLines.length > 0 && jsonLines.every((line) => line.startsWith('{') && line.endsWith('}'))) {
    const text = jsonLines
      .map((line) => {
        const parsed = parseJsonSafely(line) as { text?: unknown } | null
        return typeof parsed?.text === 'string' ? parsed.text : ''
      })
      .join('')
      .trim()
    if (text) return text
  }

  return trimmed
}

async function callServerLiveKitTool(
  sessionId: string | null,
  toolName: string,
  input: unknown,
  options: { preview?: boolean } = {}
) {
  if (!sessionId) {
    throw new Error('Start a tutor session before using lab tools.')
  }

  const response = await fetch(options.preview ? '/api/livekit/tool-preview' : '/api/livekit/tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, toolName, input }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    output?: unknown
    canvasActions?: TutorCanvasAction[]
    toolMeta?: Record<string, unknown>
    message?: string
  }

  if (!response.ok || !body.ok) {
    throw new Error(body.message || 'Tool failed.')
  }

  return {
    output: body.output,
    canvasActions: Array.isArray(body.canvasActions) ? body.canvasActions : [],
    toolMeta: body.toolMeta && typeof body.toolMeta === 'object' ? body.toolMeta : {},
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
      throw new Error('This tutoring session reached its 1 hour limit.')
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
  const transcriptSettleTimeoutRef = useRef<number | null>(null)
  const canvasRevealTimeoutsRef = useRef<number[]>([])
  const sessionIdRef = useRef<string | null>(null)
  const connectedRef = useRef(false)
  const pausedRef = useRef(false)
  const mutedRef = useRef(false)
  const agentNameRef = useRef('lemma-livekit-tutor')
  const agentReadyRef = useRef(false)
  const liveKitAudioModeRef = useRef<'microphone' | 'silent'>('microphone')
  const liveKitIdentityRef = useRef('')
  const autoPauseRef = useRef<() => void>(() => {})
  const localToolModeRef = useRef(false)
  const gradeLevelRef = useRef('Grade 6')
  const finalTranscriptSegmentsRef = useRef<Set<string>>(new Set())

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

  const clearTranscriptSettleTimeout = useCallback(() => {
    if (transcriptSettleTimeoutRef.current !== null) {
      window.clearTimeout(transcriptSettleTimeoutRef.current)
      transcriptSettleTimeoutRef.current = null
    }
  }, [])

  const scheduleTranscriptSettle = useCallback(
    (delayMs = 2200) => {
      clearTranscriptSettleTimeout()
      transcriptSettleTimeoutRef.current = window.setTimeout(() => {
        transcriptSettleTimeoutRef.current = null
        setTranscript('')
        if (connectedRef.current && !pausedRef.current) {
          setState('listening')
        }
      }, delayMs)
    },
    [clearTranscriptSettleTimeout]
  )

  const clearCanvasRevealTimers = useCallback(() => {
    canvasRevealTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    canvasRevealTimeoutsRef.current = []
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

  const appendChatMessage = useCallback((message: TutorChatMessage) => {
    const content = message.content.trim()
    if (!content) return

    setChatHistory((prev) => {
      const duplicateRecentMessage = prev
        .slice(-4)
        .some((recentMessage) => recentMessage.role === message.role && recentMessage.content.trim() === content)
      if (duplicateRecentMessage) {
        return prev
      }

      return [
        ...prev,
        {
          ...message,
          content,
        },
      ]
    })
  }, [])

  const markLiveKitAgentReady = useCallback(
    (audioMode: 'microphone' | 'silent' = liveKitAudioModeRef.current) => {
      if (agentReadyRef.current) return
      agentReadyRef.current = true
      if (!pausedRef.current) setState('listening')
      if (audioMode === 'silent') {
        appendChatMessage({
          role: 'assistant',
          content: 'I am ready. Type a math problem or ask me to draw something on the board.',
          source: 'assistant',
        })
      }
    },
    [appendChatMessage]
  )

  const queueCanvasActions = useCallback(
    (actions: TutorCanvasAction[], sourceToolName = 'livekit_canvas') => {
      if (actions.length === 0) return
      clearCanvasRevealTimers()

      const enqueueActions = (nextBatch: TutorCanvasAction[]) => {
        const shouldReplaceQueue = nextBatch.some((action) => action.type === 'clear_tool_layer')
        setPendingCanvasActions((prev) => {
          const nextActions = shouldReplaceQueue ? nextBatch : [...prev, ...nextBatch]
          return nextActions.slice(-MAX_PENDING_CANVAS_ACTIONS)
        })
      }

      const revealBatches = planCanvasActionReveal(actions, { sourceToolName })
      revealBatches.forEach((batch) => {
        if (batch.delayMs === 0) {
          enqueueActions(batch.actions)
          return
        }
        const timeoutId = window.setTimeout(() => {
          canvasRevealTimeoutsRef.current = canvasRevealTimeoutsRef.current.filter((id) => id !== timeoutId)
          enqueueActions(batch.actions)
        }, batch.delayMs)
        canvasRevealTimeoutsRef.current.push(timeoutId)
      })

      appendToolEvent({
        type: 'canvas_action',
        toolName: sourceToolName,
        output: actions,
        metadata: {
          revealMode: revealBatches.length > 1 ? 'staged' : 'instant',
          revealBatches: revealBatches.length,
        },
      })
    },
    [appendToolEvent, clearCanvasRevealTimers]
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
      clearCanvasRevealTimers()
      const sessionId = sessionIdRef.current
      sessionIdRef.current = null
      if (!sessionId) return

      void fetch('/api/tutor/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, endedReason }),
      }).catch(() => {})
    },
    [clearCanvasRevealTimers, clearInactivityTimeout, clearUsageInterval]
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

      clearTranscriptSettleTimeout()
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
      agentReadyRef.current = false
      liveKitAudioModeRef.current = 'microphone'
      liveKitIdentityRef.current = ''
      finalTranscriptSegmentsRef.current.clear()

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
    [cleanupLiveKitMedia, clearTranscriptSettleTimeout, finalizeTutorSession]
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
      const startedSessionId = await startServerTutorSession(options)
      gradeLevelRef.current = options?.gradeLevel || gradeLevelRef.current
      sessionIdRef.current = startedSessionId
      localToolModeRef.current = true
      connectedRef.current = true
      pausedRef.current = false
      mutedRef.current = true

      setCurrentSessionId(startedSessionId)
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
      startUsageTicker()
      return startedSessionId
    },
    [appendToolEvent, registerLocalActivity, startUsageTicker]
  )

  const runLocalToolTurn = useCallback(
    async (text: string, options?: TutorSendTextOptions) => {
      setState('thinking')
      setTranscript('Choosing the right math tool...')
      const plans = planLocalToolTurn(text, gradeLevelRef.current, {
        boardDescription: options?.boardDescription,
      })
      const outputs: unknown[] = []

      try {
        for (const plan of plans.slice(0, 3)) {
          const input = hydrateLocalToolPlanInput(plan, outputs, text, gradeLevelRef.current)
          const callId = crypto.randomUUID()
          appendToolEvent({
            type: 'tool_started',
            toolName: plan.toolName,
            input,
            metadata: { callId, source: 'local-typed-lab' },
          })

          const result = await callServerLiveKitTool(sessionIdRef.current, plan.toolName, input, {
            preview: true,
          })
          outputs.push(result.output)
          appendToolEvent({
            type: 'tool_completed',
            toolName: plan.toolName,
            input,
            output: result.output,
            metadata: { callId, source: 'local-typed-lab', ...result.toolMeta },
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
            metadata: { callId, source: 'livekit-rpc', ...result.toolMeta },
          })

          const actions = result.canvasActions.slice(0, MAX_CANVAS_ACTIONS_PER_RESULT)
          queueCanvasActions(actions, toolName)

          return JSON.stringify({
            ok: true,
            output: result.output,
            canvasActions: actions,
            toolMeta: result.toolMeta,
          })
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
          if (!rawText.trimStart().startsWith('{')) {
            setTranscript(rawText)
            setState('speaking')
            scheduleTranscriptSettle()
          }
        }
        const parsed = parseJsonSafely(rawText) as LiveKitTutorPayload | null
        if (parsed?.type === 'chat_message') {
          appendChatMessage(parsed.message)
          if (parsed.message.role === 'user') {
            setCurrentUserTranscript('')
          }
          setTranscript('')
          clearTranscriptSettleTimeout()
          setState('listening')
          return
        }
        const content = coerceLiveKitAssistantText(parsed, rawText).trim()
        if (content) {
          appendChatMessage({ role: 'assistant', content, source: 'assistant' })
        }
        setTranscript('')
        clearTranscriptSettleTimeout()
        setState('listening')
      })

      room.registerTextStreamHandler(LIVEKIT_TOPICS.transcription, async (reader, participantInfo) => {
        const attributes = reader.info?.attributes ?? {}
        const segmentId =
          typeof attributes[LIVEKIT_SEGMENT_ID_ATTRIBUTE] === 'string'
            ? attributes[LIVEKIT_SEGMENT_ID_ATTRIBUTE]
            : crypto.randomUUID()
        const isFinal = attributes[LIVEKIT_TRANSCRIPTION_FINAL_ATTRIBUTE] === 'true'
        const isTranscription = Boolean(attributes[LIVEKIT_TRANSCRIBED_TRACK_ATTRIBUTE])
        const participantIdentity = getParticipantIdentity(participantInfo)
        const localIdentity = liveKitIdentityRef.current || room.localParticipant.identity
        const isUser =
          participantIdentity === localIdentity ||
          participantIdentity.startsWith('student-') ||
          (isTranscription && participantIdentity !== agentNameRef.current && !participantIdentity.includes('agent'))

        let rawText = ''
        for await (const chunk of reader) {
          rawText += chunk
          const partial = normalizeLiveKitTranscriptText(rawText)
          if (!partial) continue

          if (isUser) {
            setCurrentUserTranscript(partial)
            setState('listening')
          } else {
            setTranscript(partial)
            setState('speaking')
            scheduleTranscriptSettle()
          }
        }

        const content = normalizeLiveKitTranscriptText(rawText)
        if (!content) return

        const segmentKey = `${isUser ? 'user' : 'assistant'}:${segmentId}:${content}`
        if (isFinal && finalTranscriptSegmentsRef.current.has(segmentKey)) {
          return
        }
        if (isFinal) {
          finalTranscriptSegmentsRef.current.add(segmentKey)
          appendChatMessage({
            role: isUser ? 'user' : 'assistant',
            content,
            source: isUser ? 'speech' : 'assistant',
          })
          if (isUser) {
            setCurrentUserTranscript('')
          } else {
            setTranscript('')
            clearTranscriptSettleTimeout()
          }
          if (!pausedRef.current) setState('listening')
          return
        }

        if (isUser) {
          setCurrentUserTranscript(content)
        } else {
          setTranscript(content)
          scheduleTranscriptSettle()
        }
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

      room.registerTextStreamHandler(LIVEKIT_TOPICS.control, async (reader) => {
        const rawText = await reader.readAll()
        const parsed = parseJsonSafely(rawText) as LiveKitTutorPayload | null
        if (parsed?.type === 'session_ready') {
          markLiveKitAgentReady(parsed.audioMode)
        }
      })

      room.on(RoomEvent.Connected, () => {
        setState(agentReadyRef.current ? 'listening' : 'thinking')
      })

      room.on(RoomEvent.Reconnecting, () => {
        setState('thinking')
      })

      room.on(RoomEvent.Reconnected, () => {
        if (!pausedRef.current) setState(agentReadyRef.current ? 'listening' : 'thinking')
      })

      room.on(RoomEvent.Disconnected, () => {
        agentReadyRef.current = false
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
          const content = coerceLiveKitAssistantText(parsed, new TextDecoder().decode(payload)).trim()
          if (content) {
            appendChatMessage({ role: 'assistant', content, source: 'assistant' })
          }
        }
        if (parsed?.type === 'tool_event') {
          appendToolEvent(parsed.event)
        }
      })
    },
    [
      appendChatMessage,
      appendToolEvent,
      clearTranscriptSettleTimeout,
      isSpeakerMuted,
      markLiveKitAgentReady,
      queueCanvasActions,
      scheduleTranscriptSettle,
    ]
  )

  const connect = useCallback(
    async (options?: TutorConnectOptions) => {
      let startedSessionId: string | null = null

      try {
        setChatHistory([])
        setToolEvents([])
        setPendingCanvasActions([])
        setState('thinking')
        agentReadyRef.current = false
        gradeLevelRef.current = options?.gradeLevel || 'Grade 6'
        const audioMode = options?.audioMode === 'silent' ? 'silent' : 'microphone'
        liveKitAudioModeRef.current = audioMode

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
            startedSessionId = await startLocalTypedLabSession(options)
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
        liveKitIdentityRef.current = liveKitData.identity || ''

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
        setState(agentReadyRef.current ? 'listening' : 'thinking')
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
    (text: string, options?: TutorSendTextOptions) => {
      if (pausedRef.current || !text.trim()) return
      registerLocalActivity(true)
      const message: TutorChatMessage = { role: 'user', content: text, source: 'text' }
      appendChatMessage(message)
      setCurrentUserTranscript('')

      if (localToolModeRef.current) {
        void runLocalToolTurn(text, options)
        return
      }

      if (!roomRef.current) return
      setState('thinking')
      void publishUserPayload(LIVEKIT_TOPICS.chat, {
        type: 'user_text',
        text,
        boardDescription: options?.boardDescription,
        sessionId: sessionIdRef.current,
        createdAt: Date.now(),
      })
    },
    [appendChatMessage, publishUserPayload, registerLocalActivity, runLocalToolTurn]
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
