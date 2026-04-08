# Lemma Education - Project Documentation

This is the comprehensive technical documentation for the full project.
It covers architecture, routes, tutor runtime, board behavior, APIs, state and
data flow, known limitations, and the latest implemented changes.

---

## 1) Project Overview

Lemma Education is a Next.js 14 app with three major user-facing areas:

- `/` landing page with waitlist signup and nav links to **Try Tutor**, **Feedback**, and **Request Access**
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
- Auth: Neon Auth ([`@neondatabase/auth`](https://www.npmjs.com/package/@neondatabase/auth) + [`@neondatabase/neon-js`](https://www.npmjs.com/package/@neondatabase/neon-js)); Sonner toasts in auth UI
- Canvas: `tldraw`
- Math: KaTeX (`katex`) for `MathEditor` and `math-block` shapes
- Realtime AI: OpenAI Realtime API (WebRTC + data channel)
- PDF conversion: `pdfjs-dist`
- Database: Neon Postgres via `@neondatabase/serverless` (waitlist, tutor usage, feedback, message log)

---

## 3) Important Routes and Files

### 3.1 App routes

- `app/page.tsx` - landing page (waitlist + nav to tutor, feedback, waitlist anchor)
- `app/tutor/page.tsx` - tutor experience (auth-gated; quota + minimal logging)
- `app/board/page.tsx` - standalone board
- `app/auth/[path]/page.tsx` - Neon Auth routes (`generateStaticParams` + `AuthViewClient`)
- `app/auth/[path]/auth-view-client.tsx` - centered auth shell, Home link, localized sign-up description (password length)
- `app/auth-provider.tsx` - `NeonAuthUIProvider` (navigation, `credentials.passwordValidation`, full-height wrapper)
- `lib/auth/client.ts` - browser auth client
- `lib/auth/neon-server.ts` - lazy `getAuth()` + cookie/base URL config
- `lib/auth/password-policy.ts` - `AUTH_PASSWORD_MIN_LENGTH` (must match Neon Auth console rules)
- `app/feedback/page.tsx` - feedback form (public)
- `app/privacy/page.tsx` - short privacy copy for the recording notice
- `app/api/auth/[...path]/route.ts` - Neon Auth API handler
- `app/api/realtime/token/route.ts` - mint ephemeral Realtime token (**requires signed-in user** and **under lifetime tutor quota**)
- `app/api/realtime/log-error/route.ts` - client error logging sink
- `app/api/waitlist/route.ts` - waitlist insert endpoint (public)
- `app/api/tutor/quota/route.ts` - `GET` remaining lifetime active seconds
- `app/api/tutor/session/start|end` - tutor DB session lifecycle
- `app/api/tutor/usage/tick` - incremental active-usage accounting
- `app/api/tutor/log-message` - persist user/assistant **text** turns only
- `app/api/feedback/route.ts` - `POST` feedback to Neon (`feedback` table)
- `middleware.ts` - protects **`/tutor` only** (redirect to `/auth/sign-in`); `/`, `/board`, waitlist unchanged
- `migrations/001_tutor_auth_quota.sql` - `tutor_usage`, `tutor_sessions`, `tutor_messages`, `feedback`
- `migrations/002_tutor_messages_user_id_index.sql` - index on `tutor_messages(user_id)`
- **Waitlist table:** not in the numbered migrations; production DBs need `public.waitlist_signups` (see §14) for `POST /api/waitlist`.

### Neon Auth and environment

- `NEON_AUTH_BASE_URL`, `NEXT_PUBLIC_NEON_AUTH_URL` - typically the **same** Auth URL from the Neon console (`NEON_AUTH_*` server-side; `NEXT_PUBLIC_*` inlined for the browser client)
- `NEON_AUTH_COOKIE_SECRET` - at least 32 characters (session cookie signing; you generate and store server-side only)
- `NEON_DATABASE_URL` - same Neon project; apply SQL migrations for tutor + feedback tables, plus `waitlist_signups` if using the landing waitlist
- See [`.env.example`](.env.example) for a checklist of variables. **Password rules:** client-side minimum length and sign-up copy come from [`lib/auth/password-policy.ts`](lib/auth/password-policy.ts); keep that value aligned with Neon Auth / Better Auth settings in the console.

Auth UI imports use [`@neondatabase/auth`](https://www.npmjs.com/package/@neondatabase/auth) directly (named ESM exports). The repo includes [`.npmrc`](.npmrc) with `legacy-peer-deps=true` because that package declares an optional Next.js 16+ peer while this app stays on Next 14.

**Auth UI behavior (current):**

- **Layout:** [`app/auth/[path]/auth-view-client.tsx`](app/auth/[path]/auth-view-client.tsx) wraps `AuthView` in a full-viewport, centered column with Lemma palette background and a **← Home** link.
- **Validation:** [`app/auth-provider.tsx`](app/auth-provider.tsx) passes `credentials.passwordValidation.minLength` using `AUTH_PASSWORD_MIN_LENGTH`, so short passwords surface as **inline field errors** before submit when rules match the server.
- **Errors:** failed sign-in/up still uses Sonner toasts; [`app/globals.css`](app/globals.css) sets a high `z-index` on `[data-sonner-toaster]` so toasts are visible above the board and other UI.
- **Global CSS:** Google Fonts `@import` is placed **before** `@tailwind` per CSS rules; Tailwind layers follow, then app utilities.

**Production build** can sit on “Creating an optimized production build …” for a long time (often several minutes): webpack is bundling `tldraw` and the rest of the app, and there is little console output until it finishes. `@neondatabase/auth` is **not** in `transpilePackages` so webpack does not re-transpile that whole tree. Use `npm run build:progress` to print coarse webpack progress, or ensure enough RAM via the `node --max-old-space-size=8192` used in the `build` script.

If the log **freezes around 85–95% on `webpack:client`** (often after “sealing” / hashing): (1) delete `.next` and retry (`npm run build:clean`), (2) close other heavy apps and give it **15+ minutes** the first time, (3) try **`npm run build:fallback-minify`** (disables SWC minify; falls back to Terser — larger output but avoids some SWC minify stalls), (4) optional **`NEXT_WEBPACK_PARALLELISM=25`** to reduce memory thrashing during compile.

`getAuth()` in [`lib/auth/neon-server.ts`](lib/auth/neon-server.ts) is **lazy**: Neon Auth config is only validated when auth runs (e.g. `/tutor` middleware, `/api/auth/*`, or any `getSessionUserId()` call)—not at module import—so missing tutor auth env does not fail builds that never touch those paths.

Canonical user id for application rows is Neon Auth `session.user.id` (see `lib/tutor/session-user.ts`).

### Tutor quota and logging policy

- **Lifetime cap:** `total_active_seconds <= 1200` (20 minutes) per user in `tutor_usage`.
- **Active time:** counted while WebRTC is connected and the session is **not** paused; the client sends heartbeats to `POST /api/tutor/usage/tick` and reconciles remaining seconds on `session/end`.
- **Persisted chat:** only user/assistant **text** turns (`sendText`, `sendTextWithImage`, image-only placeholder, assistant finals from Realtime). No canvas dumps, no granular UI telemetry in DB.
- **Single open session:** `POST /api/tutor/session/start` closes any previous `tutor_sessions` rows for the user with `ended_at IS NULL` (e.g. other tab or crash) before creating a new session.
- **Start button guard:** the tutor page uses a ref + `isStartingSession` so double-clicks cannot fire two parallel `/session/start` calls before React disables the control; label shows **Starting…** while the flow runs.
- **`tutor_usage` row:** `ensureTutorUsageRow` runs on quota read, token mint, ticks, and session end so `UPDATE tutor_usage` never silently applies zero rows.
- **Session end reconcile:** server accepts up to `TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST` (600s) per request and applies it in 120s DB chunks; `session/end` while `alreadyEnded` can still apply stray `reconcileDeltaSeconds` to lifetime usage only.
- **Feedback:** `POST /api/feedback` uses best-effort IP rate limiting (in-memory; weak on multi-instance serverless).

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
  - recording / data notice strip (session timing + chat may be stored)
  - **Allowance** when idle: remaining lifetime seconds from `GET /api/tutor/quota` (server value).
  - **Remaining** when connected: **smooth second-by-second countdown** between server usage ticks (interpolates from last server `remainingSeconds` + sync timestamp); **freezes** while paused; resyncs on each successful tick or quota refresh.
  - `Start tutoring` when disconnected (disabled if quota exhausted, allowance could not be loaded, or a start is already in flight); double-click safe.
  - When connected: `Pause` / `Resume`, **microphone and speaker icon toggles** (accessible `aria-label` / `aria-pressed`), `End`, and `Stream canvas` toggle
  - Top nav: **Feedback** (public form), **Tutorial**, language (English only for now), **Back**
- Middle: chat thread (`TutorChatWindow`)
- Bottom: upload + composer area (or paused/disconnected message)

Session continuity behavior:

- `End` keeps history visible in the same shell.
- starting a new tutoring session clears previous history.

Tutorial integration:

- Manual `Tutorial` trigger in top nav.
- Tour works before session starts.
- During tutorial only (while disconnected), non-functional preview controls are
  shown for `Pause`, mic/speaker **icons**, and `End` so onboarding can explain them (copy references icon toggles).

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

[`components/MathEditor.tsx`](components/MathEditor.tsx) modal:

- Light-theme-safe **input and KaTeX preview** colors (`#0F2922` text on white / mint preview background) so math stays readable when the app root uses dark-theme class providers (e.g. Neon Auth UI).

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
2. Session controls (`Pause`, microphone/speaker icons, `End`)
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

- **Browser:** tutor **chat UI** and board state are in-memory for the active page session; `End` keeps chat visible until a new start clears it.
- **Database:** user/assistant **text** turns are appended to `tutor_messages` (linked to `tutor_sessions`); usage and session timing live in `tutor_usage` / `tutor_sessions` (see §3).
- **Board:** geometric content is runtime only unless the user exports from the board menu.

Known limitations:

- language dropdown currently exposes English only (`en`)
- board PDF export path is still placeholder behavior
- voice audio is not stored; only text chat lines above are logged to the DB

---

## 14) Home + Waitlist + Feedback entry points

Landing page (`app/page.tsx`):

- marketing/hero content
- primary nav: **Try Tutor** (`/tutor`), **Feedback** (`/feedback`), **Request Access** (scroll to `#waitlist`)
- waitlist form
- user-facing success/error feedback

**Feedback** is public (no auth middleware on `/feedback` or `/api/feedback`). The tutor page nav also links to `/feedback` for users already in-session.

Waitlist API (`app/api/waitlist/route.ts`):

- validates email
- inserts into `public.waitlist_signups` (Neon) — create this table in SQL if it does not exist (e.g. `email TEXT PRIMARY KEY`, optional `created_at`)
- duplicate signup handled as non-fatal success response
- DB errors returned as safe API errors

---

## 15) Environment Variables

Required for tutor + auth:

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`
- `OPENAI_REALTIME_MODEL` (optional override; defaults to `gpt-realtime-mini`)
- `OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS` (optional override; defaults to in-code prompt)
- `NEON_AUTH_BASE_URL` — Neon Auth HTTP base URL (server)
- `NEXT_PUBLIC_NEON_AUTH_URL` — same Auth URL for the browser auth client
- `NEON_AUTH_COOKIE_SECRET` — 32+ random characters (session cookies)
- `NEON_DATABASE_URL` — Postgres connection string (tutor tables, feedback, waitlist)

**Code alignment:** minimum password length for the Neon Auth sign-up form is defined in [`lib/auth/password-policy.ts`](lib/auth/password-policy.ts) and must match the Neon console / Better Auth project.

Optional / operational:

- Waitlist and other Neon-backed features need `NEON_DATABASE_URL` and the corresponding tables applied.

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
