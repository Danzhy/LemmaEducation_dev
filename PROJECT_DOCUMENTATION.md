# Lemma Education - Project Documentation

This is the comprehensive technical documentation for the full project.
It covers architecture, routes, tutor runtime, board behavior, APIs, state and
data flow, known limitations, and the latest implemented changes.

---

## 1) Project Overview

Lemma Education is a Next.js 14 app with three major user-facing areas:

- `/` landing page with waitlist signup
- `/board` standalone infinite whiteboard
- `/tutor` real-time Socratic AI math tutor with multimodal input

The tutor experience combines:

- Voice conversation (WebRTC)
- Text input
- Image/PDF upload
- Embedded `tldraw` board
- Canvas context streaming to OpenAI Realtime API

Primary product objective: guide students through math reasoning rather than
directly giving answers.

---

## 2) Tech Stack

- Framework: Next.js 14 (App Router)
- UI: React 18 + Tailwind CSS
- Canvas: `tldraw`
- Realtime AI: OpenAI Realtime API (WebRTC + data channel)
- PDF conversion: `pdfjs-dist`
- Waitlist DB: Neon Postgres via `@neondatabase/serverless`

---

## 3) Important Routes and Files

### 3.1 App routes

- `app/page.tsx` - landing page
- `app/tutor/page.tsx` - tutor experience
- `app/board/page.tsx` - standalone board
- `app/api/realtime/token/route.ts` - mint ephemeral Realtime token
- `app/api/realtime/log-error/route.ts` - client error logging sink
- `app/api/waitlist/route.ts` - waitlist insert endpoint

### 3.2 Core tutor components/hooks

- `hooks/useRealtimeTutor.ts` - WebRTC + event/session logic
- `hooks/useCanvasChangeDetection.ts` - passive canvas change listener
- `components/TutorChatWindow.tsx` - chat rendering + streaming row
- `components/EmbeddedBoard.tsx` - tutor-embedded board orchestration
- `components/Canvas.tsx` - `tldraw` wrapper + export/capture methods
- `components/CanvasToolbar.tsx` - tools + board controls
- `components/GuidedTutorialOverlay.tsx` - guided tutorial spotlight system

---

## 4) High-Level Runtime Architecture

```mermaid
flowchart TD
  user[User] --> tutorPage[TutorPage]
  tutorPage --> realtimeHook[useRealtimeTutor]
  realtimeHook --> tokenApi[/api/realtime/token]
  tokenApi --> openai[OpenAI Realtime API]
  realtimeHook --> openai
  tutorPage --> embeddedBoard[EmbeddedBoard]
  embeddedBoard --> canvas[Canvas(Tldraw)]
  canvas --> changeHook[useCanvasChangeDetection]
  changeHook --> tutorPage
  tutorPage --> realtimeHook
```

Runtime responsibilities:

- `app/tutor/page.tsx` orchestrates UI + cross-component behavior.
- `useRealtimeTutor` controls session lifecycle and event handling.
- Board components produce canvas snapshots and editing interactions.
- Change-detection hook controls debounced passive streaming.

---

## 5) Tutor Page Behavior (`app/tutor/page.tsx`)

The tutor page uses a unified shell design:

- Top bar:
  - compact status indicator
  - `Start tutoring` when disconnected
  - `Pause`, `Mic`, `Sound`, `End` controls when connected
  - `Stream canvas` toggle
- Middle: chat thread (`TutorChatWindow`)
- Bottom: upload + composer area (or paused/disconnected message)

Session continuity behavior:

- `End` keeps history visible in the same shell.
- starting a new tutoring session clears previous history.

Tutorial integration:

- Manual `Tutorial` trigger in top nav.
- Tour works before session starts.
- During tutorial only (while disconnected), non-functional preview controls are
  shown for `Pause/Mic/Sound/End` so onboarding can explain them.

---

## 6) Chat Rendering (`components/TutorChatWindow.tsx`)

Current chat behavior:

- Two-sided bubbles:
  - user on right
  - assistant on left
- Live assistant transcript bubble shown only while actively streaming.
- Auto-scroll to latest on message/transcript change.
- "Jump to latest" appears when user scrolls away from bottom.

Duplicate-bubble prevention:

- Final assistant text is committed to `chatHistory` on response completion.
- Live transcript bubble is separately gated with `isAssistantStreaming`.
- Transcript is cleared in hook on completion/cancel to avoid final duplication.

---

## 7) Realtime Engine (`hooks/useRealtimeTutor.ts`)

### 7.1 Connection flow

`connect({ language })`:

1. Create `RTCPeerConnection`
2. Capture microphone and add input track
3. Create `oai-events` data channel
4. Request ephemeral key from `/api/realtime/token`
5. Send SDP offer to `https://api.openai.com/v1/realtime/calls`
6. Apply SDP answer as remote description

This avoids server-side SDP proxy timeout issues.

### 7.2 Incoming event handling

Key events:

- `session.created` / `session.updated` -> `listening`
- `input_audio_buffer.speech_started` -> trigger on-speech canvas send
- `response.created` -> mark active response + clear transcript buffer
- `response.output_audio_transcript.delta` -> append transcript
- `response.output_audio.delta` -> `speaking`
- `response.done` / `response.cancelled`:
  - append final assistant content once
  - clear transcript and ref
  - mark response inactive
- `error` -> server log + user-safe error message (except benign cancel case)

### 7.3 Outgoing actions

- `sendText`: create user text item + `response.create`
- `sendImage`: create user image item + `response.create`
- `sendTextWithImage`: single multi-part user item + `response.create`
- `sendCanvasImage`: context-only canvas item (no `response.create`)

Canvas replace strategy:

- prior canvas context item deleted first
- new context item created with fixed id `lemma_canvas_context`

### 7.4 Pause/mute/speaker logic

- `mute`: mic input only
- `muteSpeaker`: output audio only
- `pause`:
  - disables mic track
  - sends `response.cancel` only when a response is active
  - blocks all new sends while paused
- `resume`: restores mic when appropriate

Benign cancellation error handling:

- `Cancellation failed: no active response found` is suppressed from user-facing
  "Something went wrong" UI.

---

## 8) Realtime Token API (`app/api/realtime/token/route.ts`)

Endpoint purpose:

- mint short-lived client secret for browser-side WebRTC handshake with OpenAI

Session config sent to OpenAI:

- `type: 'realtime'`
- `model`: from `OPENAI_REALTIME_MODEL` env var (fallback: `gpt-realtime-mini`)
- `instructions`: Socratic guardrails + language restriction
- `output_modalities: ['audio']`
- `audio.output.voice: 'marin'`

Prompt composition precedence:

1. Base instructions from `OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS` when set
2. Otherwise fallback to built-in default Socratic prompt in code
3. Append language restriction from `lib/languageInstructions.ts`

Important compatibility:

- `session.input_audio_transcription` is intentionally not included in this
  speech-to-speech mode.
- Including that parameter in this setup causes 400 unknown parameter behavior.

---

## 9) Canvas System

### 9.1 `components/Canvas.tsx`

`Canvas` wraps `Tldraw` and exposes:

- `exportPNG()`
- `exportPDF()` (currently PNG-based placeholder behavior)
- `exportBoard()`
- `getEditor()`
- `captureViewport()`

`captureViewport()`:

- captures viewport-only shapes
- outputs optimized JPEG (`quality: 0.75`, `scale: 0.75`)
- returns `{ base64, mimeType: 'image/jpeg' }`

### 9.2 `components/EmbeddedBoard.tsx`

Composes:

- `CanvasToolbar`
- `Canvas` with `MathBlockShapeUtil`
- `MathEditor`

Exposes `captureViewport()` via ref for tutor page canvas streaming.

Math block workflow:

- toolbar action creates a `math-block`
- double-click fires `lemma:math-block-edit`
- `MathEditor` updates `{ latex, displayMode }` props on save

### 9.3 Math placement reliability updates

Latest insertion behavior:

- insertion uses viewport page bounds (deterministic, in-view)
- cascades near selected math block when adding multiple expressions
- clamps coordinates to viewport
- uses post-create visibility guard if needed

This prevents the prior "random/off-screen" insertion experience.

### 9.4 `components/CanvasToolbar.tsx`

Current tool group labels:

- `Pointer`
- `Pen`
- `Hand`
- `Eraser`
- `Math`

Also contains tutorial anchors (`data-tutorial-id`) for guided onboarding.

---

## 10) Canvas Streaming (`hooks/useCanvasChangeDetection.ts`)

Passive streaming strategy:

- listens to user document shape changes
- debounces callback
- skips insignificant change events
- triggers send callback for meaningful updates

Active streaming is triggered on tutor page when:

- user speech starts
- user sends text/image inputs

Staleness guard on tutor page uses shape hash comparison to avoid redundant sends.

---

## 11) Guided Tutorial System

### 11.1 Overlay component

`components/GuidedTutorialOverlay.tsx` provides:

- full-screen dim backdrop
- spotlight cutout around current target
- anchored dialog with title/description
- `Back`/`Next`/`Skip`/`Finish` controls
- resize/scroll recalc
- keyboard shortcuts (`Escape`, arrow keys)

### 11.2 Step content implemented on tutor page

The tour covers:

1. Start tutoring
2. Session controls (`Pause/Mic/Sound/End`)
3. Stream canvas toggle
4. Math mode button
5. Pointer/Pen/Hand tools
6. Burger menu export flow (`Export` then format)

### 11.3 Layering hardening

- Overlay and dialog are set to maximum z-index (`2147483647`) so tutorial
  dialog remains above `tldraw` and other UI layers.

---

## 12) Input Modalities and UX

Supported tutor input combinations:

- voice only
- text only
- image/PDF only
- mixed usage in a single session

`components/FileUpload.tsx`:

- supports PNG/JPEG/WEBP
- converts PDF first page to PNG with `pdfjs-dist`
- emits base64 + mime type to parent

`components/TextInput.tsx`:

- controlled text composer
- parent can combine with pending image context before sending

---

## 13) Data, Persistence, and Limits

Persistence:

- tutor chat/session state is runtime only
- board content is runtime only unless exported

Known limitations:

- language dropdown currently exposes English only (`en`)
- board PDF export path is still placeholder behavior
- no transcript DB persistence yet

---

## 14) Home + Waitlist

Landing page (`app/page.tsx`):

- marketing/hero content
- waitlist form
- user-facing success/error feedback

Waitlist API (`app/api/waitlist/route.ts`):

- validates email
- inserts into `public.waitlist_signups` (Neon)
- duplicate signup handled as non-fatal success response
- DB errors returned as safe API errors

---

## 15) Environment Variables

Required for tutor:

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`
- `OPENAI_REALTIME_MODEL` (optional override; defaults to `gpt-realtime-mini`)
- `OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS` (optional override; defaults to in-code prompt)

Optional for waitlist:

- `NEON_DATABASE_URL`

---

## 16) Local Development

Commands:

- `npm run dev`
- `npm run build`
- `npm run start`

Main URLs:

- `http://localhost:3000/`
- `http://localhost:3000/tutor`
- `http://localhost:3000/board`

---

## 17) Vercel Operations Notes

To experiment with model and prompt without code changes:

1. Open Vercel project settings -> Environment Variables.
2. Set or update:
   - `OPENAI_REALTIME_MODEL`
   - `OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS`
3. Redeploy so the updated values are applied to the deployment.

Notes:

- Empty/whitespace values are ignored by the API route and fall back to defaults.
- Keep multiline prompt formatting exactly as intended when pasting into Vercel.

---

## 18) Related Internal Docs

- `IMPLEMENTATION_SUMMARY.md`
- `realtime_streaming.md`
- `testing_strategy.md`
- `PROJECT_REPORT.md`
- `TUTOR_DOCUMENTATION.md`
- `canvasAI.md`

This file should be treated as the authoritative high-level reference for the
current project state, with the above docs providing deeper topic-specific detail.
