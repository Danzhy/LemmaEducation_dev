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
import { useRealtimeTutor } from '@/hooks/useRealtimeTutor'
import { useCanvasChangeDetection } from '@/hooks/useCanvasChangeDetection'
import Link from 'next/link'

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
        </div>
      </nav>

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
                  <div className="flex flex-wrap justify-end items-center gap-2">
                    <button
                      onClick={() => {
                        setError(null)
                        connect({ language })
                      }}
                      className="px-4 py-2 bg-[#16423C] text-[#F2F5F4] rounded-sm hover:bg-[#0A2621] transition-colors text-sm font-medium"
                      data-tutorial-id="start-tutoring"
                    >
                      Start tutoring
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
                          className="px-3 py-1.5 rounded-sm border border-[#A3B8B2] text-[#7F908B] text-xs cursor-not-allowed"
                        >
                          Mic off
                        </button>
                        <button
                          type="button"
                          disabled
                          className="px-3 py-1.5 rounded-sm border border-[#A3B8B2] text-[#7F908B] text-xs cursor-not-allowed"
                        >
                          Sound off
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
                ) : (
                  <div className="flex flex-wrap justify-end gap-2" data-tutorial-id="session-controls">
                    <button
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
                      onClick={isMuted ? unmute : mute}
                      className={`px-3 py-1.5 rounded-sm transition-colors text-xs ${
                        isMuted
                          ? 'bg-[#16423C] text-white border border-[#16423C]'
                          : 'border border-[#A3B8B2] text-[#3F524C] hover:border-[#16423C] hover:text-[#16423C]'
                      }`}
                    >
                      {isMuted ? 'Mic on' : 'Mic off'}
                    </button>
                    <button
                      onClick={isSpeakerMuted ? unmuteSpeaker : muteSpeaker}
                      className={`px-3 py-1.5 rounded-sm transition-colors text-xs ${
                        isSpeakerMuted
                          ? 'bg-[#16423C] text-white border border-[#16423C]'
                          : 'border border-[#A3B8B2] text-[#3F524C] hover:border-[#16423C] hover:text-[#16423C]'
                      }`}
                    >
                      {isSpeakerMuted ? 'Sound on' : 'Sound off'}
                    </button>
                    <button
                      onClick={disconnect}
                      className="px-3 py-1.5 border border-[#A3B8B2] text-[#3F524C] rounded-sm hover:border-[#16423C] hover:text-[#16423C] transition-colors text-xs"
                    >
                      End
                    </button>
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
