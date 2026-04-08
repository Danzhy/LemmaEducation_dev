/**
 * Tutor Page
 *
 * Main UI for the real-time math tutor. Implements Phases 1.1, 1.2, 1.3:
 * - 1.1: Voice-only (connect, speak, tutor responds)
 * - 1.2: File upload (images/PDFs as problem context)
 * - 1.3: Text input (equations, steps, clarifications)
 *
 * All three input modes work independently or in combination. The user can
 * use voice only, text only, file only, or any combination.
 */

'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
// @ts-expect-error - Editor is exported at runtime but TypeScript definitions may be incomplete
import type { Editor } from 'tldraw'
import TutorChatWindow from '@/components/TutorChatWindow'
import FileUpload from '@/components/FileUpload'
import TextInput from '@/components/TextInput'
import EmbeddedBoard, { type EmbeddedBoardRef } from '@/components/EmbeddedBoard'
import GuidedTutorialOverlay, { type TutorialStep } from '@/components/GuidedTutorialOverlay'
import { useRealtimeTutor, type TutorUserMessageSource } from '@/hooks/useRealtimeTutor'
import { useCanvasChangeDetection } from '@/hooks/useCanvasChangeDetection'
import Link from 'next/link'
import { TUTOR_QUOTA_SECONDS, TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST } from '@/lib/tutor/constants'

function formatRemain(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const ICON_BTN =
  'p-2 rounded-sm transition-colors inline-flex items-center justify-center border disabled:opacity-50 disabled:cursor-not-allowed'
const ICON_BTN_IDLE = 'border-[#A3B8B2] text-[#3F524C] hover:border-[#16423C] hover:text-[#16423C]'
const ICON_BTN_ACTIVE = 'bg-[#16423C] text-white border-[#16423C]'

function MicGlyph({ muted, className }: { muted: boolean; className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {muted ? (
        <>
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M18.8 18.8a9 9 0 0 0-5.2-2.6 2 2 0 0 0-1.4-1.4" />
          <path d="M9 9v3a3 3 0 0 0 5.1 2.1" />
          <path d="M12 19v3M8 22h8M5 10H3a2 2 0 0 0 2 2h1" />
          <path d="M17.1 14.1A6 6 0 0 0 19 9V7a2 2 0 0 0-2-2h-1" />
        </>
      ) : (
        <>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 22h8" />
        </>
      )}
    </svg>
  )
}

function SpeakerGlyph({ muted, className }: { muted: boolean; className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {muted ? (
        <>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07M17.66 6.34a8 8 0 0 1 0 11.32" />
        </>
      )}
    </svg>
  )
}

export default function TutorPage() {
  const [error, setError] = useState<string | null>(null)
  const [streamCanvas, setStreamCanvas] = useState(true)
  const [language, setLanguage] = useState<string>('en')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [isTutorialOpen, setIsTutorialOpen] = useState(false)
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const embeddedBoardRef = useRef<EmbeddedBoardRef>(null)
  const sendCanvasToTutorRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const lastSentCanvasHashRef = useRef<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const lastActiveAnchorRef = useRef<number | null>(null)
  const prevConnectedRef = useRef(false)
  const wasPausedRef = useRef(false)
  /** Last authoritative remaining seconds from the server, with local sync time for smooth countdown. */
  const lastQuotaServerRef = useRef<{ rem: number; at: number } | null>(null)
  /** Prevents double-submit: two /session/start calls before React disables the button. */
  const startSessionInFlightRef = useRef(false)

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  /** Bumps every 1s while an active session is counting down so the label updates smoothly. */
  const [remainClock, setRemainClock] = useState(0)
  const [quotaLoaded, setQuotaLoaded] = useState(false)
  const [quotaError, setQuotaError] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [usageLogWarning, setUsageLogWarning] = useState(false)

  // Stores uploaded image/PDF (as base64) until user sends or removes it
  const [uploadedImage, setUploadedImage] = useState<{
    base64: string
    mimeType: string
  } | null>(null)

  const applyServerRemaining = useCallback((rem: number) => {
    lastQuotaServerRef.current = { rem, at: Date.now() }
    setRemainingSeconds(rem)
  }, [])

  const refreshQuota = useCallback(async () => {
    setQuotaError(false)
    try {
      const res = await fetch('/api/tutor/quota')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setQuotaError(true)
        return
      }
      if (typeof (data as { remainingSeconds?: number }).remainingSeconds === 'number') {
        applyServerRemaining((data as { remainingSeconds: number }).remainingSeconds)
      }
    } catch {
      setQuotaError(true)
    } finally {
      setQuotaLoaded(true)
    }
  }, [applyServerRemaining])

  useEffect(() => {
    void refreshQuota()
  }, [refreshQuota])

  const logUserMessage = useCallback((content: string, source: TutorUserMessageSource) => {
    const sid = sessionIdRef.current
    if (!sid) return
    void fetch('/api/tutor/log-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sid, role: 'user', content, source }),
    }).catch(() => setUsageLogWarning(true))
  }, [])

  const logAssistantMessage = useCallback((content: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    void fetch('/api/tutor/log-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sid, role: 'assistant', content, source: 'assistant' }),
    }).catch(() => setUsageLogWarning(true))
  }, [])

  const postUsageTick = useCallback(async (sid: string, delta: number) => {
    if (delta < 1) return { ok: true as const }
    const run = async () => {
      const res = await fetch('/api/tutor/usage/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, activeDeltaSeconds: delta }),
      })
      const data = await res.json().catch(() => ({}))
      return { res, data }
    }
    let { res, data } = await run()
    if (!res.ok && res.status >= 500) {
      await new Promise((r) => setTimeout(r, 400))
      ;({ res, data } = await run())
    }
    if (res.status === 403 && (data as { code?: string }).code === 'QUOTA_EXCEEDED') {
      return { ok: false as const, quotaExceeded: true as const }
    }
    if (!res.ok) {
      return { ok: false as const, soft: true as const }
    }
    const rem = (data as { remainingSeconds?: number }).remainingSeconds
    if (typeof rem === 'number') applyServerRemaining(rem)
    return { ok: true as const }
  }, [applyServerRemaining])

  const {
    state,
    isConnected,
    isPaused,
    isMuted,
    isSpeakerMuted,
    transcript,
    chatHistory,
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
  } = useRealtimeTutor({
    onError: (userMsg) => setError(userMsg),
    onSpeechStarted: () => sendCanvasToTutorRef.current(),
    onUserMessageLogged: ({ content, source }) => logUserMessage(content, source),
    onAssistantFinalized: (c) => logAssistantMessage(c),
  })

  const disconnectTutor = useCallback(() => {
    let delta = 0
    if (lastActiveAnchorRef.current != null) {
      delta = Math.min(
        TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST,
        Math.floor((Date.now() - lastActiveAnchorRef.current) / 1000)
      )
      lastActiveAnchorRef.current = null
    }
    const sid = sessionIdRef.current
    sessionIdRef.current = null
    setActiveSessionId(null)
    disconnect()
    if (sid) {
      void fetch('/api/tutor/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, endedReason: 'user', reconcileDeltaSeconds: delta }),
      })
        .catch(() => {})
        .finally(() => void refreshQuota())
    } else {
      void refreshQuota()
    }
  }, [disconnect, refreshQuota])

  const startTutoring = useCallback(async () => {
    if (startSessionInFlightRef.current) return
    startSessionInFlightRef.current = true
    setIsStartingSession(true)
    setError(null)
    setUsageLogWarning(false)
    try {
      const startRes = await fetch('/api/tutor/session/start', { method: 'POST' })
      const data = await startRes.json().catch(() => ({}))
      if (!startRes.ok) {
        if ((data as { code?: string }).code === 'QUOTA_EXCEEDED') {
          applyServerRemaining(0)
          setError('Your tutoring time limit has been reached.')
          await refreshQuota()
          return
        }
        setError('Could not start session. Try again.')
        return
      }
      const sid = (data as { sessionId?: string }).sessionId
      if (!sid) {
        setError('Could not start session. Try again.')
        return
      }
      sessionIdRef.current = sid
      setActiveSessionId(sid)
      if (typeof (data as { remainingSeconds?: number }).remainingSeconds === 'number') {
        applyServerRemaining((data as { remainingSeconds: number }).remainingSeconds)
      }
      try {
        await connect({ language })
      } catch {
        sessionIdRef.current = null
        setActiveSessionId(null)
        void fetch('/api/tutor/session/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, endedReason: 'error', reconcileDeltaSeconds: 0 }),
        }).catch(() => {})
        await refreshQuota()
      }
    } catch {
      setError('Could not start session. Try again.')
    } finally {
      startSessionInFlightRef.current = false
      setIsStartingSession(false)
    }
  }, [applyServerRemaining, connect, language, refreshQuota])

  useEffect(() => {
    if (prevConnectedRef.current && !isConnected && sessionIdRef.current) {
      let delta = 0
      if (lastActiveAnchorRef.current != null) {
        delta = Math.min(
          TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST,
          Math.floor((Date.now() - lastActiveAnchorRef.current) / 1000)
        )
        lastActiveAnchorRef.current = null
      }
      const sid = sessionIdRef.current
      sessionIdRef.current = null
      setActiveSessionId(null)
      void fetch('/api/tutor/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, endedReason: 'error', reconcileDeltaSeconds: delta }),
      })
        .catch(() => {})
        .finally(() => void refreshQuota())
    }
    prevConnectedRef.current = isConnected
  }, [isConnected, refreshQuota])

  useEffect(() => {
    if (isConnected && activeSessionId && !wasPausedRef.current && isPaused) {
      const sid = sessionIdRef.current
      if (sid && lastActiveAnchorRef.current != null) {
        const delta = Math.min(120, Math.floor((Date.now() - lastActiveAnchorRef.current) / 1000))
        lastActiveAnchorRef.current = null
        if (delta >= 1) {
          void postUsageTick(sid, delta).then((r) => {
            if (!r.ok && r.quotaExceeded) {
              setError('Your tutoring time limit has been reached.')
              applyServerRemaining(0)
              const s = sessionIdRef.current
              sessionIdRef.current = null
              setActiveSessionId(null)
              disconnect()
              if (s) {
                void fetch('/api/tutor/session/end', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId: s, endedReason: 'quota', reconcileDeltaSeconds: 0 }),
                }).finally(() => void refreshQuota())
              }
              return
            }
            if (!r.ok) setUsageLogWarning(true)
          })
        }
      }
    }
    wasPausedRef.current = isPaused
  }, [applyServerRemaining, isConnected, activeSessionId, isPaused, postUsageTick, disconnect, refreshQuota])

  useEffect(() => {
    if (isConnected && activeSessionId && !isPaused) {
      lastActiveAnchorRef.current = Date.now()
    }
  }, [isConnected, activeSessionId, isPaused])

  useEffect(() => {
    if (!isConnected || !activeSessionId || isPaused) return
    const tick = async () => {
      const sid = sessionIdRef.current
      if (!sid || lastActiveAnchorRef.current == null) return
      const delta = Math.min(120, Math.floor((Date.now() - lastActiveAnchorRef.current) / 1000))
      if (delta < 1) return
      const r = await postUsageTick(sid, delta)
      if (!r.ok && r.quotaExceeded) {
        setError('Your tutoring time limit has been reached.')
        applyServerRemaining(0)
        const s = sessionIdRef.current
        sessionIdRef.current = null
        setActiveSessionId(null)
        lastActiveAnchorRef.current = null
        disconnect()
        if (s) {
          void fetch('/api/tutor/session/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: s, endedReason: 'quota', reconcileDeltaSeconds: 0 }),
          }).finally(() => void refreshQuota())
        }
        return
      }
      if (r.ok) {
        lastActiveAnchorRef.current = Date.now()
      } else {
        setUsageLogWarning(true)
      }
    }
    const id = setInterval(() => void tick(), 25000)
    return () => clearInterval(id)
  }, [applyServerRemaining, isConnected, activeSessionId, isPaused, postUsageTick, disconnect, refreshQuota])

  useEffect(() => {
    if (!isConnected || !activeSessionId || isPaused) return
    const id = setInterval(() => setRemainClock((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [isConnected, activeSessionId, isPaused])

  const prevPausedForQuotaRef = useRef(false)
  useEffect(() => {
    if (!isConnected || !activeSessionId) {
      prevPausedForQuotaRef.current = isPaused
      return
    }
    const s = lastQuotaServerRef.current
    if (isPaused && !prevPausedForQuotaRef.current && s) {
      const shown = Math.max(0, s.rem - Math.floor((Date.now() - s.at) / 1000))
      lastQuotaServerRef.current = { rem: shown, at: Date.now() }
    }
    if (!isPaused && prevPausedForQuotaRef.current && s) {
      lastQuotaServerRef.current = { rem: s.rem, at: Date.now() }
    }
    prevPausedForQuotaRef.current = isPaused
  }, [isPaused, isConnected, activeSessionId])

  const shownRemainingSeconds = useMemo(() => {
    void remainClock
    if (remainingSeconds === null) return null
    if (!isConnected || !activeSessionId) return remainingSeconds
    const s = lastQuotaServerRef.current
    if (!s) return remainingSeconds
    if (isPaused) return s.rem
    return Math.max(0, s.rem - Math.floor((Date.now() - s.at) / 1000))
  }, [remainClock, remainingSeconds, isConnected, activeSessionId, isPaused])

  const quotaExceeded =
    quotaLoaded && remainingSeconds !== null && remainingSeconds <= 0
  const startDisabled =
    !quotaLoaded ||
    quotaError ||
    quotaExceeded ||
    isStartingSession ||
    (activeSessionId !== null && !isConnected)

  const sendCanvasToTutor = useCallback(
    async (forceSend = false) => {
      if (!streamCanvas || !editor) return
      const shapeIds = [...editor.getCurrentPageShapeIds()].sort()
      const parts = shapeIds.map((id) => {
        const b = editor.getShapePageBounds(id)
        return `${id}:${b?.x ?? 0},${b?.y ?? 0},${b?.w ?? 0},${b?.h ?? 0}`
      })
      const data = parts.join('|')
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
      const hash = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16)
      if (!forceSend && hash === lastSentCanvasHashRef.current) return
      const result = await embeddedBoardRef.current?.captureViewport()
      if (result) {
        sendCanvasImage(result.base64, result.mimeType)
        lastSentCanvasHashRef.current = hash
      }
    },
    [sendCanvasImage, streamCanvas, editor]
  )

  sendCanvasToTutorRef.current = () => {
    if (streamCanvas && editor) {
      return sendCanvasToTutor(true)
    }
    return Promise.resolve()
  }

  useEffect(() => {
    if (!isConnected) lastSentCanvasHashRef.current = null
  }, [isConnected])

  useCanvasChangeDetection(editor, () => {
    void sendCanvasToTutor(false)
  }, {
    debounceMs: 2500,
    enabled: isConnected && streamCanvas && !isPaused,
  })

  /** Stores the uploaded file locally. Does NOT send yet - user can add text or click "Get help". */
  const handleUpload = (base64: string, mimeType: string) => {
    setUploadedImage({ base64, mimeType })
  }

  /** Sends image only (no text). User clicked "Get help with this problem". */
  const handleSendImageOnly = () => {
    if (isPaused) return
    if (uploadedImage) {
      if (streamCanvas && isConnected && editor) void sendCanvasToTutor(true)
      sendImage(uploadedImage.base64, uploadedImage.mimeType)
      setUploadedImage(null)
    }
  }

  /**
   * Sends text, optionally with the pending image.
   * If uploadedImage exists, sends both in one message (text + image).
   */
  const handleTextSend = (text: string) => {
    if (isPaused) return
    if (streamCanvas && isConnected && editor) void sendCanvasToTutor(true)
    if (uploadedImage) {
      sendTextWithImage(text, uploadedImage.base64, uploadedImage.mimeType)
      setUploadedImage(null)
    } else {
      sendText(text)
    }
  }

  const clearUploadedImage = () => setUploadedImage(null)
  const openTutorial = () => {
    setTutorialStepIndex(0)
    setIsTutorialOpen(true)
  }
  const closeTutorial = () => setIsTutorialOpen(false)

  const statusLabel = !isConnected
    ? 'Disconnected'
    : isPaused
    ? 'Paused'
    : state === 'thinking'
    ? 'Thinking'
    : state === 'speaking'
    ? 'Speaking'
    : 'Listening'
  const showAssistantStreaming = isConnected && (state === 'thinking' || state === 'speaking')
  const showTutorialPreSessionControls = !isConnected && isTutorialOpen
  const showCanvasStreamControl = isConnected || isTutorialOpen

  const tutorialSteps = useMemo<TutorialStep[]>(
    () => [
      {
        id: 'start',
        title: 'Start tutoring session',
        description:
          'Use Start tutoring to open a live tutor session. Your chat history stays visible after End, then resets when you start a new session.',
        targetId: 'start-tutoring',
        placement: 'bottom',
      },
      {
        id: 'session-controls',
        title: 'Session controls',
        description:
          'Pause stops model output. The microphone and speaker icons toggle your mic and the tutor audio. End closes the session.',
        targetId: 'session-controls',
        placement: 'bottom',
      },
      {
        id: 'stream-canvas',
        title: 'Stream canvas',
        description:
          'Turn Stream canvas on when you want the tutor to continuously receive board updates while you work.',
        targetId: 'stream-canvas-toggle',
        placement: 'bottom',
      },
      {
        id: 'math-mode',
        title: 'Math mode',
        description:
          'Click Math to insert an editable expression block directly on the board. New blocks appear in view and stack predictably.',
        targetId: 'board-tool-math',
        placement: 'bottom',
      },
      {
        id: 'board-tools',
        title: 'Pointer, pen, and hand tools',
        description:
          'Pointer selects and edits objects, Pen draws freehand strokes, and Hand pans the infinite canvas.',
        targetId: 'board-tool-group',
        placement: 'bottom',
      },
      {
        id: 'board-export',
        title: 'Export from board menu',
        description:
          'Open the collapsed burger menu on the board, choose Export, then select your preferred file format.',
        targetId: 'tutor-board-shell',
        targetSelector: [
          '[data-tutorial-id="tutor-board-shell"] .tlui-main-menu__trigger',
          '[data-tutorial-id="tutor-board-shell"] button[aria-label="Main menu"]',
          '[data-tutorial-id="tutor-board-shell"] button[title="Main menu"]',
          '[data-tutorial-id="tutor-board-shell"] [data-testid="main-menu.button"]',
          '[data-tutorial-id="tutor-board-shell"] [data-testid="main.menu"]',
        ],
        placement: 'right',
      },
    ],
    []
  )

  return (
    <div className="h-screen flex flex-col bg-[#F2F5F4]">
      <nav className="flex-shrink-0 w-full px-6 py-6 md:px-12 flex justify-between items-center border-b border-[#D1DBD7] gap-4">
        <Link
          href="/"
          className="text-2xl tracking-tight font-medium serif italic text-[#16423C] hover:text-[#0A2621]"
        >
          Lemma.
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/feedback"
            className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors"
          >
            Feedback
          </Link>
          <button
            type="button"
            onClick={openTutorial}
            className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors"
          >
            Tutorial
          </button>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-sm border border-[#A3B8B2] rounded-sm pl-3 pr-8 py-1.5 text-[#3F524C] bg-white focus:ring-[#16423C] focus:border-[#16423C] appearance-none bg-[length:12px] bg-[right_0.5rem_center] bg-no-repeat"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233F524C'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")" }}
          >
            <option value="en">English</option>
          </select>
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors"
          >
            Back
          </Link>
        </div>
      </nav>

      <div className="flex-shrink-0 px-4 py-2 md:px-12 bg-amber-50/90 border-b border-amber-100 text-xs text-[#3F524C] leading-snug">
        <span>
          We save session timing and text chat with the tutor for product improvement. Voice is processed by OpenAI.{' '}
          <Link href="/privacy" className="underline hover:text-[#16423C]">
            Privacy
          </Link>
        </span>
      </div>

      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden">
        {/* Tutor panel */}
        <div className="flex flex-col w-full md:w-[45%] md:min-w-0 p-4 md:p-6 min-h-0">
          <div className="w-full h-full bg-white/60 border border-[#D1DBD7] rounded-xl overflow-hidden flex flex-col min-h-[500px]">
            <div className="px-4 py-3 border-b border-[#E6ECE9] bg-white/70 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      !isConnected
                        ? 'bg-[#A3B8B2]'
                        : isPaused
                        ? 'bg-[#5C7069]'
                        : state === 'speaking'
                        ? 'bg-[#16423C] animate-pulse'
                        : state === 'thinking'
                        ? 'bg-[#3F524C] animate-pulse'
                        : 'bg-[#16423C]'
                    }`}
                  />
                  <span className="text-xs uppercase tracking-wider text-[#5C7069]">{statusLabel}</span>
                </div>
                {!isConnected ? (
                  <div className="flex flex-col items-end gap-1">
                    {quotaLoaded && remainingSeconds !== null && (
                      <span className="text-[10px] uppercase tracking-wider text-[#5C7069]">
                        Allowance {formatRemain(remainingSeconds)} / {formatRemain(TUTOR_QUOTA_SECONDS)}
                      </span>
                    )}
                    {quotaError && (
                      <button
                        type="button"
                        onClick={() => void refreshQuota()}
                        className="text-[10px] uppercase tracking-wider text-[#16423C] underline"
                      >
                        Retry loading allowance
                      </button>
                    )}
                    <div className="flex flex-wrap justify-end items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void startTutoring()}
                      disabled={startDisabled}
                      title={
                        quotaExceeded
                          ? 'Tutoring time limit reached'
                          : quotaError
                            ? 'Could not verify remaining time'
                            : undefined
                      }
                      className="px-4 py-2 bg-[#16423C] text-[#F2F5F4] rounded-sm hover:bg-[#0A2621] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      data-tutorial-id="start-tutoring"
                    >
                      {isStartingSession ? 'Starting…' : 'Start tutoring'}
                    </button>

                    {showTutorialPreSessionControls && (
                      <div
                        className="flex flex-wrap justify-end gap-2 opacity-95"
                        data-tutorial-id="session-controls"
                      >
                        <button
                          type="button"
                          disabled
                          className="px-3 py-1.5 rounded-sm border border-[#A3B8B2] text-[#7F908B] text-xs cursor-not-allowed"
                        >
                          Pause
                        </button>
                        <button
                          type="button"
                          disabled
                          aria-label="Microphone (disabled in preview)"
                          className={`${ICON_BTN} ${ICON_BTN_IDLE} border-[#A3B8B2] text-[#7F908B] cursor-not-allowed opacity-90`}
                        >
                          <MicGlyph muted className="opacity-80" />
                        </button>
                        <button
                          type="button"
                          disabled
                          aria-label="Speaker (disabled in preview)"
                          className={`${ICON_BTN} ${ICON_BTN_IDLE} border-[#A3B8B2] text-[#7F908B] cursor-not-allowed opacity-90`}
                        >
                          <SpeakerGlyph muted className="opacity-80" />
                        </button>
                        <button
                          type="button"
                          disabled
                          className="px-3 py-1.5 rounded-sm border border-[#A3B8B2] text-[#7F908B] text-xs cursor-not-allowed"
                        >
                          End
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    {shownRemainingSeconds !== null && (
                      <span className="text-[10px] uppercase tracking-wider text-[#5C7069]">
                        Remaining {formatRemain(shownRemainingSeconds)}
                      </span>
                    )}
                  <div className="flex flex-wrap justify-end gap-2" data-tutorial-id="session-controls">
                    <button
                      type="button"
                      onClick={isPaused ? resume : pause}
                      className={`px-3 py-1.5 rounded-sm transition-colors text-xs ${
                        isPaused
                          ? 'bg-[#16423C] text-white border border-[#16423C]'
                          : 'border border-[#A3B8B2] text-[#3F524C] hover:border-[#16423C] hover:text-[#16423C]'
                      }`}
                    >
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={isMuted ? unmute : mute}
                      aria-pressed={isMuted}
                      title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                      aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                      className={`${ICON_BTN} ${isMuted ? ICON_BTN_ACTIVE : ICON_BTN_IDLE}`}
                    >
                      <MicGlyph muted={isMuted} />
                    </button>
                    <button
                      type="button"
                      onClick={isSpeakerMuted ? unmuteSpeaker : muteSpeaker}
                      aria-pressed={isSpeakerMuted}
                      title={isSpeakerMuted ? 'Unmute tutor audio' : 'Mute tutor audio'}
                      aria-label={isSpeakerMuted ? 'Unmute tutor audio' : 'Mute tutor audio'}
                      className={`${ICON_BTN} ${isSpeakerMuted ? ICON_BTN_ACTIVE : ICON_BTN_IDLE}`}
                    >
                      <SpeakerGlyph muted={isSpeakerMuted} />
                    </button>
                    <button
                      type="button"
                      onClick={disconnectTutor}
                      className="px-3 py-1.5 border border-[#A3B8B2] text-[#3F524C] rounded-sm hover:border-[#16423C] hover:text-[#16423C] transition-colors text-xs"
                    >
                      End
                    </button>
                  </div>
                  </div>
                )}
              </div>

              {showCanvasStreamControl && (
                <label
                  className={`flex items-center gap-2 text-xs text-[#3F524C] ${
                    isConnected ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'
                  }`}
                  data-tutorial-id="stream-canvas-toggle"
                >
                  <input
                    type="checkbox"
                    checked={streamCanvas}
                    onChange={(e) => setStreamCanvas(e.target.checked)}
                    disabled={!isConnected}
                    className="sr-only"
                  />
                  <span
                    className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors ${
                      streamCanvas
                        ? 'bg-[#16423C] border-[#16423C]'
                        : 'border-[#A3B8B2] bg-white'
                    }`}
                    aria-hidden
                  >
                    {streamCanvas && (
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span>Stream canvas</span>
                </label>
              )}
            </div>

            {error && (
              <div className="mx-4 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            {usageLogWarning && (
              <div className="mx-4 mt-2 p-2 rounded-lg bg-amber-50 border border-amber-100 text-amber-900 text-xs">
                Could not save a usage log; your session still works.
              </div>
            )}

            <TutorChatWindow
              messages={chatHistory}
              currentTranscript={isConnected ? transcript : ''}
              isAssistantStreaming={showAssistantStreaming}
              paused={isPaused}
              className="m-4 mt-3 flex-1 min-h-0"
            />

            <div className="px-4 pb-4">
              {!isConnected ? (
                <p className="text-sm text-[#5C7069]">
                  Start a session to send text, voice, or image prompts. Previous chat stays visible until you start a new session.
                </p>
              ) : isPaused ? (
                <div className="w-full rounded-lg border border-[#E6ECE9] bg-white/60 p-4 text-sm text-[#5C7069]">
                  Session is paused. Resume to send text, voice, or files.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3 items-center">
                    <FileUpload
                      onUpload={handleUpload}
                      onError={setError}
                      disabled={state === 'thinking' || isPaused}
                    />
                  </div>

                  {uploadedImage && (
                    <div className="flex flex-col gap-2 p-3 bg-white/60 rounded-lg border border-[#E6ECE9]">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                          <img
                            src={`data:${uploadedImage.mimeType};base64,${uploadedImage.base64}`}
                            alt="Uploaded problem"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-sm text-[#3F524C] flex-1">
                          Problem ready. Add a message below or get help now.
                        </span>
                        <button
                          type="button"
                          onClick={clearUploadedImage}
                          className="text-[#5C7069] hover:text-[#16423C] text-xs"
                        >
                          Remove
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleSendImageOnly}
                        disabled={state === 'thinking' || isPaused}
                        className="self-start px-3 py-1.5 text-xs bg-[#16423C] text-white rounded hover:bg-[#0A2621] disabled:opacity-50"
                      >
                        Get help with this problem
                      </button>
                    </div>
                  )}

                  <TextInput
                    onSend={handleTextSend}
                    disabled={state === 'thinking' || isPaused}
                    placeholder="Type equations, steps, or clarifications..."
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Board panel */}
        <div
          className="flex flex-col w-full md:flex-1 min-h-[400px] md:min-h-0 p-4 md:p-6"
          data-tutorial-id="tutor-board-shell"
        >
          <EmbeddedBoard
            ref={embeddedBoardRef}
            className="flex-1 min-h-0"
            onEditorReady={setEditor}
          />
        </div>
      </main>
      <GuidedTutorialOverlay
        open={isTutorialOpen}
        steps={tutorialSteps}
        currentStepIndex={tutorialStepIndex}
        onStepChange={setTutorialStepIndex}
        onClose={closeTutorial}
      />
    </div>
  )
}
