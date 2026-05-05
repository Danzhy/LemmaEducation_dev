# Lemma Education — Comprehensive Project Report

## Executive Summary

Lemma Education is a Next.js 14 application providing a real-time AI math tutor. Students interact via voice, text, file upload (images/PDFs), and a shared whiteboard canvas. The tutor uses OpenAI's Realtime API over WebRTC for low-latency voice and sends canvas snapshots as vision context so the AI can see what the student is working on.

---

## Quick Reference: Canvas AI Frequency & Efficiency

| Question | Answer |
|----------|--------|
| **How often are canvas images sent?** | **2500 ms debounce** after the last canvas change. Each shape add/update/remove resets the timer; the image is sent only 2.5 s after the user stops editing. |
| **Maximum rate** | ~1 image per 2.5 s during continuous drawing. In practice, often far fewer (e.g., 10–30 in a 1-hour session with moderate use). |
| **Replace strategy** | Yes — the previous canvas item is deleted before adding a new one. Only 1 canvas image in context at a time (~170 tokens). |
| **User controls** | "Stream canvas" toggle (off = no canvas sent); Pause mutes mic and disables canvas sends. |
| **Capture scope** | Currently full page (all shapes), not viewport-only — slightly higher token cost than recommended. |
| **On-speech send** | Not wired — intended to send canvas when user starts speaking; `onSpeechStarted` is never invoked. |

---

# Part 1: General Project Structure

## 1.1 Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| UI | React 18, Tailwind CSS |
| Canvas | tldraw 4.3.1 (infinite whiteboard) |
| Math | KaTeX, custom math parser |
| AI | OpenAI Realtime API (gpt-realtime, WebRTC) |
| Database | Neon (PostgreSQL) via `@neondatabase/serverless` |
| PDF | pdfjs-dist for PDF→PNG conversion |

## 1.2 Directory Structure

```
LemmaEducation_dev/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── realtime/token/       # Ephemeral token for Realtime API
│   │   └── waitlist/             # Email waitlist signup
│   ├── board/                    # Standalone whiteboard page
│   ├── tutor/                    # Main tutor UI page
│   ├── globals.css
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home/landing page
├── components/
│   ├── Canvas.tsx                # tldraw wrapper, captureViewport
│   ├── CanvasBackground.tsx      # Animated hero background
│   ├── CanvasToolbar.tsx         # Tools, undo/redo, zoom
│   ├── DemoSection.tsx           # Interactive demo on home page
│   ├── EmbeddedBoard.tsx         # Board + MathEditor for tutor
│   ├── FileUpload.tsx            # Image/PDF upload
│   ├── MathBlockShape.tsx        # Custom tldraw shape (LaTeX)
│   ├── MathEditor.tsx           # LaTeX editor modal
│   ├── TextInput.tsx            # Text input for tutor
│   └── TutorAvatar.tsx          # Visual tutor states
├── hooks/
│   ├── useCanvasChangeDetection.ts   # Debounced canvas change listener
│   └── useRealtimeTutor.ts          # WebRTC + Realtime API
├── lib/
│   └── mathParser.ts            # LaTeX parsing utilities
├── types/
│   ├── pdfjs-dist.d.ts
│   └── tldraw.d.ts
├── docs/canvasAI.md             # Canvas integration design doc
├── docs/TUTOR_DOCUMENTATION.md  # Realtime tutor technical docs
└── package.json
```

## 1.3 Entry Points & Routing

| Route | Purpose |
|-------|---------|
| `/` | Landing page (hero, waitlist, demo) |
| `/tutor` | Main tutor UI — voice, text, file upload, canvas |
| `/board` | Standalone whiteboard (no tutor) |

**Routing:** Next.js App Router (file-based). No explicit router config — `app/page.tsx`, `app/tutor/page.tsx`, `app/board/page.tsx` map directly.

## 1.4 Key Entry Points

- **App Layout:** `app/layout.tsx` — minimal root layout with metadata and global CSS.
- **Tutor Page:** `app/tutor/page.tsx` — primary user-facing page; composes `TutorAvatar`, `FileUpload`, `TextInput`, `EmbeddedBoard`, `useRealtimeTutor`, `useCanvasChangeDetection`.

## 1.5 State Management

- **No global store** — state is local to React components/hooks.
- **`useRealtimeTutor`** — owns WebRTC session state (`isConnected`, `isPaused`, `state`, `transcript`).
- **`app/tutor/page.tsx`** — owns `error`, `streamCanvas`, `editor`, `uploadedImage`; delegates session logic to the hook.
- **tldraw** — manages its own store via `editor.store`; changes are observed via `store.listen()`.

## 1.6 API Structure

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/realtime/token` | POST | Mint ephemeral token for Realtime API |
| `/api/waitlist` | POST | Add email to waitlist (Neon DB) |

**Realtime flow:** Client → `POST /api/realtime/token` → server mints token via OpenAI `client_secrets` → client connects directly to OpenAI WebRTC with token (no proxying).

## 1.7 Architectural Patterns

- **Client-side WebRTC** — browser connects to OpenAI directly after token fetch.
- **Ephemeral tokens** — avoid proxying SDP (previously caused 504 timeouts).
- **Data channel** — `oai-events` for JSON events (text, images, server events).
- **Component composition** — small, focused components; hooks encapsulate WebRTC and canvas logic.
- **Ref-based capture** — `EmbeddedBoard` exposes `captureViewport()` via `forwardRef` / `useImperativeHandle`.

---

# Part 2: Canvas AI Deep Dive

## 2.1 How Canvas Images Are Sent to the Realtime API

### Capture Flow

```
EmbeddedBoard (ref) → Canvas.captureViewport() → editor.toImage() → Blob → base64 → sendCanvasImage()
```

1. **`Canvas.captureViewport()`** (in `Canvas.tsx`):
   - Gets `editor.getCurrentPageShapeIds()` — all shapes on the current page.
   - Calls `editor.toImage([...shapeIds], { format: 'png', scale: 1 })` — scale 1 for token cost.
   - Converts the returned Blob to base64 via `FileReader.readAsDataURL()`.

2. **`EmbeddedBoard`** — forwards to `Canvas`:
   ```ts
   captureViewport: () => canvasRef.current?.captureViewport() ?? Promise.resolve(null)
   ```

3. **`useRealtimeTutor.sendCanvasImage(base64)`** — sends over the data channel:
   ```json
   {
     "type": "conversation.item.create",
     "item": {
       "id": "lemma_canvas_context",
       "type": "message",
       "role": "user",
       "content": [{ "type": "input_image", "image_url": "data:image/png;base64,..." }]
     }
   }
   ```
   - Images are sent as `input_image` with `data:image/png;base64,{data}`.
   - Canvas is sent as context only — **no `response.create`** (no forced reply).
   - Uses a stable `id` for replace-on-update behavior.

### Replace Strategy

Before adding a new canvas image, the previous canvas item is removed:

```ts
if (canvasItemIdRef.current) {
  dc.send(JSON.stringify({
    type: 'conversation.item.delete',
    item_id: canvasItemIdRef.current,
  }))
  canvasItemIdRef.current = null
}
```

So only one canvas image remains in context at a time.

---

## 2.2 Frequency of Sending Images

### Triggers

1. **On-change (debounced)** — canvas shape changes (add/update/remove).
2. **On-speech (intended)** — when the user starts speaking (`input_audio_buffer.speech_started`).

### Debouncing

| Mechanism | Location | Value |
|-----------|----------|-------|
| Debounce | `useCanvasChangeDetection` | **2500 ms** |

**How it works:**
- `editor.store.listen()` with `{ source: 'user', scope: 'document' }` listens for shape changes.
- Only `added`, `updated`, `removed` changes trigger the callback.
- Each change resets the debounce timer; `onChange` runs 2.5 s after the last change.

### Conditional Sending

Canvas is sent only when:
- `enabled` in `useCanvasChangeDetection` is true.
- In `app/tutor/page.tsx`:
  - `isConnected && streamCanvas && !isPaused`

So images are **not** sent when:
- Not connected.
- "Stream canvas" is off.
- Session is paused.

### Intended On-Speech Trigger (Currently Incomplete)

The tutor page passes `onSpeechStarted: () => sendCanvasToTutorRef.current()` to send the canvas when the user starts speaking. However, **`useRealtimeTutor` never calls `onSpeechStarted`** in `handleServerEvent` when `input_audio_buffer.speech_started` is received. The case only does `setState('listening')`. As a result, the on-speech canvas send is not implemented.

---

## 2.3 Efficiency Mechanisms

### Implemented

| Mechanism | Implementation |
|-----------|----------------|
| Replace-only policy | Delete previous canvas item before creating a new one; at most one canvas image in context. |
| Debouncing | 2.5 s debounce for on-change sends. |
| Scale reduction | `scale: 1` in `toImage()` to reduce tokens. |
| User toggle | "Stream canvas" checkbox; when off, no canvas updates are sent. |
| Pause | When paused, canvas change detection is disabled. |
| Conditional capture | Capture only when `streamCanvas && editor && isConnected && !isPaused`. |

### Not Implemented (vs. docs/canvasAI.md)

| Recommendation | Status |
|-----------------|--------|
| Viewport-only capture | **Not used** — uses `getCurrentPageShapeIds()` (all shapes) instead of viewport bounds. |
| On-speech canvas send | **Not working** — `onSpeechStarted` is never invoked. |
| Content hash / skip unchanged | Not implemented — no comparison of canvas content before sending. |
| Token limits (session.update) | Not implemented. |

---

## 2.4 Full Flow: Canvas to API

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. User draws / edits on tldraw canvas                                          │
│    → editor.store emits change (added/updated/removed)                           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 2. useCanvasChangeDetection                                                      │
│    → store.listen() catches change                                               │
│    → debounce 2500ms (reset on each change)                                      │
│    → if enabled: call onChange()                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 3. Tutor page onChange callback                                                  │
│    → sendCanvasToTutor() (if streamCanvas && editor && !isPaused)                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 4. sendCanvasToTutor                                                             │
│    → embeddedBoardRef.current.captureViewport()                                  │
│    → Canvas: editor.toImage(shapeIds, { format: 'png', scale: 1 })               │
│    → Blob → base64                                                               │
│    → sendCanvasImage(base64)                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 5. useRealtimeTutor.sendCanvasImage                                              │
│    → if canvasItemIdRef.current: conversation.item.delete                       │
│    → conversation.item.create { id: 'lemma_canvas_context', input_image }        │
│    → (no response.create — context only)                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 6. WebRTC data channel sends JSON to OpenAI                                     │
│    → OpenAI includes canvas in next response context                             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Response Handling

- Canvas updates **do not** trigger a tutor reply by themselves.
- The tutor replies only when the user speaks or sends text/images.
- When replying, the model receives the latest canvas image in the conversation context.
- Transcript/audio output is handled like other inputs via `response.output_audio_transcript.delta` and `response.output_audio.delta`.

---

## 2.5 Data Structures

### conversation.item.create (Canvas)

```json
{
  "type": "conversation.item.create",
  "item": {
    "id": "lemma_canvas_context",
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_image",
        "image_url": "data:image/png;base64,..."
      }
    ]
  }
}
```

### conversation.item.delete

```json
{
  "type": "conversation.item.delete",
  "item_id": "<previous canvas item id>"
}
```

---

## 2.6 Cost Model (from docs/canvasAI.md)

| Modality | Input | Output |
|----------|-------|--------|
| Text | $4.00 / 1M tokens | $16.00 / 1M |
| Audio | $32.00 / 1M tokens | $64.00 / 1M |
| Image | $5.00 / 1M tokens | — |

- ~170 tokens per image.
- Replace strategy keeps at most one canvas image in context.
- Estimated ~$0.07 for images in a 1-hour session with ~20 updates.

---

## 2.7 Identified Issues

### 1. On-speech canvas send not wired

- **Location:** `hooks/useRealtimeTutor.ts`, `input_audio_buffer.speech_started` case.
- **Issue:** `onSpeechStarted` is passed but never called.
- **Fix:** Add `onSpeechStarted?.()` in the `input_audio_buffer.speech_started` handler.

### 2. canvasItemIdRef can reference non-canvas images

- **Location:** `hooks/useRealtimeTutor.ts`, `conversation.item.added` handler.
- **Issue:** Any `input_image` item updates `canvasItemIdRef`, including file uploads.
- **Impact:** Deleting before a new canvas send could remove a user-uploaded problem image.
- **Fix:** Update `canvasItemIdRef` only when `item.id === LEMMA_CANVAS_ITEM_ID` or when the item is clearly a canvas context item.

### 3. Full-page capture vs viewport

- **Location:** `components/Canvas.tsx`, `captureViewport()`.
- **Issue:** Uses `getCurrentPageShapeIds()` (all shapes on the page) instead of viewport bounds.
- **Impact:** Larger images and higher token cost than viewport-only capture.
- **Recommendation:** Use viewport bounds as in `docs/canvasAI.md` (e.g. `editor.getViewportScreenBounds()`, `editor.screenToPage()`, `editor.toImage()` with viewport bounds).

---

# Appendix A: Relationship to docs/canvasAI.md

The existing `docs/canvasAI.md` document is a design/planning document. The report above reflects the current implementation:

| `docs/canvasAI.md` Recommendation | Implementation Status |
|---------------------------|------------------------|
| Replace strategy (delete before add) | Implemented |
| Debounce 2–3 s | Implemented (2.5 s) |
| Stream canvas toggle | Implemented |
| Pause/Resume session | Implemented |
| On-speech canvas send | Not implemented (callback not invoked) |
| Viewport-only capture | Not implemented (full page) |
| Stable item_id for delete | Implemented (lemma_canvas_context) |
| scale: 1 | Implemented |
| System prompt for canvas context | Implemented in token route |

---

# Appendix B: File Change Summary (for Implementation)

| File | Role in Canvas AI |
|------|-------------------|
| `components/Canvas.tsx` | `captureViewport()` — toImage + base64 |
| `components/EmbeddedBoard.tsx` | Exposes `captureViewport` via ref, provides editor to parent |
| `hooks/useRealtimeTutor.ts` | `sendCanvasImage()`, replace strategy, canvas item tracking |
| `hooks/useCanvasChangeDetection.ts` | Debounced store listener for shape changes |
| `app/tutor/page.tsx` | Wires canvas capture, change detection, stream toggle, on-speech |
| `app/api/realtime/token/route.ts` | System prompt mentions canvas images |
