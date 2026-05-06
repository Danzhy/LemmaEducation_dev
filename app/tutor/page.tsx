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

import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode, type SVGProps } from 'react'
// @ts-expect-error - Editor is exported at runtime but TypeScript definitions may be incomplete
import type { Editor } from 'tldraw'
import TutorChatWindow from '@/components/TutorChatWindow'
import FileUpload from '@/components/FileUpload'
import TextInput from '@/components/TextInput'
import EmbeddedBoard, { type EmbeddedBoardRef } from '@/components/EmbeddedBoard'
import GuidedTutorialOverlay, { type TutorialStep } from '@/components/GuidedTutorialOverlay'
import { useRealtimeTutor } from '@/hooks/useRealtimeTutor'
import { useCanvasChangeDetection } from '@/hooks/useCanvasChangeDetection'
import { authClient } from '@/lib/auth/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function ControlButton({
  label,
  onClick,
  children,
  active = false,
  disabled = false,
  tone = 'default',
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  active?: boolean
  disabled?: boolean
  tone?: 'default' | 'danger'
}) {
  const baseClasses =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200'
  const stateClasses = disabled
    ? 'cursor-not-allowed border-[#C7D4CF] bg-white/45 text-[#93A49F]'
    : tone === 'danger'
    ? 'border-[#D8B8B1] bg-[#FCF2F0] text-[#8B3A2E] hover:border-[#B45242] hover:bg-[#F7E5E1]'
    : active
    ? 'border-[#16423C] bg-[#16423C] text-white shadow-[0_18px_45px_-22px_rgba(22,66,60,0.75)]'
    : 'border-[#C9D6D1] bg-white/88 text-[#3F524C] hover:-translate-y-0.5 hover:border-[#16423C] hover:text-[#16423C] hover:shadow-[0_16px_38px_-24px_rgba(15,41,34,0.38)]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${baseClasses} ${stateClasses}`}
    >
      {children}
    </button>
  )
}

function StatusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="12" cy="12" r="12" />
    </svg>
  )
}

function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M9 6v12M15 6v12" />
    </svg>
  )
}

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M8 6.5c0-1.05 1.15-1.68 2.02-1.1l8.08 5.5a1.33 1.33 0 010 2.2l-8.08 5.5A1.33 1.33 0 018 17.5v-11z" />
    </svg>
  )
}

function MicrophoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M12 4a3 3 0 00-3 3v5a3 3 0 006 0V7a3 3 0 00-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M6.5 11.5a5.5 5.5 0 0011 0M12 17v3M8.5 20h7" />
    </svg>
  )
}

function MicrophoneOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M15 9.5V7a3 3 0 00-5.66-1.4" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M9 9.25V12a3 3 0 004.65 2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M6.5 11.5a5.49 5.49 0 003.3 4.94M12 17v3M8.5 20h7" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 4l16 16" />
    </svg>
  )
}

function SpeakerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M11 6L7.7 9H5a1 1 0 00-1 1v4a1 1 0 001 1h2.7L11 18a1 1 0 001.68-.73V6.73A1 1 0 0011 6z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M16 9.5a4.5 4.5 0 010 5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M18.5 7a8 8 0 010 10" />
    </svg>
  )
}

function SpeakerOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M11 6L7.7 9H5a1 1 0 00-1 1v4a1 1 0 001 1h2.7L11 18a1 1 0 001.68-.73V6.73A1 1 0 0011 6z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M15 9.5a4.48 4.48 0 011.44 2.31" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 4l16 16" />
    </svg>
  )
}

function EndIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M7 7l10 10M17 7L7 17" />
    </svg>
  )
}

const GRADE_LEVEL_OPTIONS = [
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
]

export default function TutorPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [streamCanvas, setStreamCanvas] = useState(true)
  const [language, setLanguage] = useState<string>('en')
  const [gradeLevel, setGradeLevel] = useState<string>('Grade 6')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [isTutorialOpen, setIsTutorialOpen] = useState(false)
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const embeddedBoardRef = useRef<EmbeddedBoardRef>(null)
  const sendCanvasToTutorRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const lastSentCanvasHashRef = useRef<string | null>(null)

  // Stores uploaded image/PDF (as base64) until user sends or removes it
  const [uploadedImage, setUploadedImage] = useState<{
    base64: string
    mimeType: string
  } | null>(null)

  const {
    state,
    isConnected,
    isPaused,
    isMuted,
    isSpeakerMuted,
    currentUserTranscript,
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
  })

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

  useEffect(() => {
    if (isConnected || (!isConnected && state === 'idle')) {
      setIsStartingSession(false)
    }
  }, [isConnected, state])

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
  const handleStartTutoring = async () => {
    if (isStartingSession || isConnected) return
    setError(null)
    setIsStartingSession(true)
    await connect({ language, gradeLevel })
  }
  const handleSignOut = useCallback(async () => {
    try {
      disconnect('user')
      await authClient.signOut()
      router.replace('/auth/sign-in')
      router.refresh()
    } catch {
      setError('Could not sign out. Please try again.')
    }
  }, [disconnect, router])
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
          'Pause stops model output, Mic toggles your voice input, Sound toggles AI audio output, and End closes the session.',
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
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
        <div className="relative h-full px-4 py-4 md:px-6 md:py-6">
          <div className="relative mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 md:gap-0">
            <div
              className="flex min-h-[420px] flex-1 flex-col md:pr-[24.5rem] lg:pr-[25.5rem]"
              data-tutorial-id="tutor-board-shell"
            >
              <EmbeddedBoard
                ref={embeddedBoardRef}
                className="h-full min-h-[420px] flex-1 rounded-[28px] border-[#D8E4DF] bg-[#FCFDFC] shadow-[0_34px_90px_-58px_rgba(15,41,34,0.52)]"
                onEditorReady={setEditor}
              />
            </div>

            <aside className="flex w-full flex-col md:absolute md:bottom-5 md:right-5 md:top-5 md:w-[23rem] lg:w-[24rem]">
              <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-[30px] border border-white/70 bg-[rgba(248,251,249,0.88)] shadow-[0_28px_80px_-50px_rgba(15,41,34,0.7)] backdrop-blur-xl">
                <div className="border-b border-[#DCE7E2] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(247,250,248,0.72))] px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <StatusIcon
                          className={`h-2.5 w-2.5 ${
                            !isConnected
                              ? 'text-[#A3B8B2]'
                              : isPaused
                              ? 'text-[#5C7069]'
                              : state === 'speaking'
                              ? 'animate-pulse text-[#16423C]'
                              : state === 'thinking'
                              ? 'animate-pulse text-[#3F524C]'
                              : 'text-[#16423C]'
                          }`}
                        />
                        <span className="text-[11px] uppercase tracking-[0.28em] text-[#5C7069]">{statusLabel}</span>
                      </div>
                      <div>
                        <h1 className="text-[1.7rem] font-light leading-none tracking-[-0.03em] text-[#0F2922]">
                          AI tutor
                        </h1>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-[#7A8C86]">
                          {gradeLevel}
                        </p>
                      </div>
                    </div>

                    {isConnected ? (
                      <div className="flex flex-wrap justify-end gap-2" data-tutorial-id="session-controls">
                        <ControlButton
                          label={isPaused ? 'Resume session' : 'Pause session'}
                          onClick={isPaused ? resume : pause}
                          active={isPaused}
                        >
                          {isPaused ? <PlayIcon className="h-[18px] w-[18px]" /> : <PauseIcon className="h-[18px] w-[18px]" />}
                        </ControlButton>
                        <ControlButton
                          label={isMuted ? 'Turn microphone on' : 'Mute microphone'}
                          onClick={isMuted ? unmute : mute}
                          active={isMuted}
                        >
                          {isMuted ? (
                            <MicrophoneOffIcon className="h-[18px] w-[18px]" />
                          ) : (
                            <MicrophoneIcon className="h-[18px] w-[18px]" />
                          )}
                        </ControlButton>
                        <ControlButton
                          label={isSpeakerMuted ? 'Turn speaker on' : 'Mute speaker'}
                          onClick={isSpeakerMuted ? unmuteSpeaker : muteSpeaker}
                          active={isSpeakerMuted}
                        >
                          {isSpeakerMuted ? (
                            <SpeakerOffIcon className="h-[18px] w-[18px]" />
                          ) : (
                            <SpeakerIcon className="h-[18px] w-[18px]" />
                          )}
                        </ControlButton>
                        <ControlButton label="End session" onClick={disconnect} tone="danger">
                          <EndIcon className="h-[18px] w-[18px]" />
                        </ControlButton>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-3">
                        <button
                          onClick={() => {
                            void handleStartTutoring()
                          }}
                          disabled={isStartingSession}
                          className={`rounded-full px-4 py-2.5 text-sm font-medium text-[#F2F5F4] shadow-[0_20px_45px_-24px_rgba(22,66,60,0.75)] transition-all ${
                            isStartingSession
                              ? 'cursor-not-allowed bg-[#A7B7B1] shadow-none'
                              : 'bg-[#16423C] hover:-translate-y-0.5 hover:bg-[#0A2621]'
                          }`}
                          data-tutorial-id="start-tutoring"
                        >
                          {isStartingSession ? 'Starting...' : 'Start tutoring'}
                        </button>

                        {showTutorialPreSessionControls && (
                          <div className="flex flex-wrap justify-end gap-2 opacity-95" data-tutorial-id="session-controls">
                            <ControlButton label="Pause session" disabled>
                              <PauseIcon className="h-[18px] w-[18px]" />
                            </ControlButton>
                            <ControlButton label="Mute microphone" disabled>
                              <MicrophoneOffIcon className="h-[18px] w-[18px]" />
                            </ControlButton>
                            <ControlButton label="Mute speaker" disabled>
                              <SpeakerOffIcon className="h-[18px] w-[18px]" />
                            </ControlButton>
                            <ControlButton label="End session" disabled tone="danger">
                              <EndIcon className="h-[18px] w-[18px]" />
                            </ControlButton>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {showCanvasStreamControl && (
                    <label
                      className={`mt-4 flex items-center justify-between gap-4 rounded-full border border-[#D5E1DD] bg-white/68 px-4 py-2.5 text-sm text-[#3F524C] ${
                        isConnected ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'
                      }`}
                      data-tutorial-id="stream-canvas-toggle"
                    >
                      <div>
                        <p className="font-medium text-[#203A34]">Stream canvas</p>
                        <p className="text-xs text-[#6A7E78]">Share live board updates with the tutor as you work.</p>
                      </div>
                      <span className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={streamCanvas}
                          onChange={(e) => setStreamCanvas(e.target.checked)}
                          disabled={!isConnected}
                          className="peer sr-only"
                        />
                        <span className="h-7 w-12 rounded-full bg-[#D5E1DD] transition-colors peer-checked:bg-[#16423C]" />
                        <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
                  {!isConnected ? (
                    <div className="mb-3 rounded-[22px] border border-[#DCE7E2] bg-white/74 px-4 py-3.5">
                      <label className="block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">
                        Math level
                      </label>
                      <div className="mt-2">
                        <select
                          value={gradeLevel}
                          onChange={(e) => setGradeLevel(e.target.value)}
                          className="w-full appearance-none rounded-[14px] border border-[#D5E1DD] bg-[#F7FAF8] px-3.5 py-2.5 text-[13px] font-normal text-[#203A34] outline-none transition-colors focus:border-[#16423C]"
                          style={{
                            backgroundImage:
                              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233F524C'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
                            backgroundPosition: 'right 0.9rem center',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: '14px',
                            fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          {GRADE_LEVEL_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  {error && (
                    <div className="mb-3 rounded-[22px] border border-red-200 bg-red-50/95 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <TutorChatWindow
                    messages={chatHistory}
                    currentUserTranscript={isConnected ? currentUserTranscript : ''}
                    currentTranscript={isConnected ? transcript : ''}
                    isAssistantStreaming={showAssistantStreaming}
                    paused={isPaused}
                    className="min-h-0 flex-1"
                  />

                  <div className="mt-3 space-y-3">
                    {!isConnected ? (
                      <div className="rounded-[22px] border border-[#DCE7E2] bg-white/72 px-4 py-4 text-sm leading-relaxed text-[#5C7069]">
                        Start a session to speak, type, or upload a problem. Your board stays open while the tutor sits here on the edge.
                      </div>
                    ) : isPaused ? (
                      <div className="rounded-[22px] border border-[#DCE7E2] bg-white/72 px-4 py-4 text-sm leading-relaxed text-[#5C7069]">
                        Session is paused. Resume when you want to send text, voice, or images again.
                      </div>
                    ) : (
                      <>
                        {uploadedImage && (
                          <div className="flex flex-col gap-3 rounded-[22px] border border-[#DCE7E2] bg-white/76 p-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                                <img
                                  src={`data:${uploadedImage.mimeType};base64,${uploadedImage.base64}`}
                                  alt="Uploaded problem"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <span className="flex-1 text-sm leading-relaxed text-[#3F524C]">
                                Problem ready. Add context below or send it directly for help.
                              </span>
                              <button
                                type="button"
                                onClick={clearUploadedImage}
                                className="text-xs text-[#5C7069] transition-colors hover:text-[#16423C]"
                              >
                                Remove
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={handleSendImageOnly}
                              disabled={state === 'thinking' || isPaused}
                              className="self-start rounded-full bg-[#16423C] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0A2621] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Get help with this problem
                            </button>
                          </div>
                        )}

                        <TextInput
                          onSend={handleTextSend}
                          disabled={state === 'thinking' || isPaused}
                          placeholder="Ask a question or add context..."
                          className="w-full"
                          leadingAccessory={
                            <FileUpload
                              onUpload={handleUpload}
                              onError={setError}
                              disabled={state === 'thinking' || isPaused}
                              variant="icon"
                            />
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
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
