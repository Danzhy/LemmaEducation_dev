# Lemma Education — Implementation Summary

Overview of features and changes implemented for the real-time math tutor application.

---

## 1. Tutor Instructions (System Prompt)

The system prompt is built in [`app/api/realtime/token/route.ts`](app/api/realtime/token/route.ts) and sent to the Realtime API when minting an ephemeral token. It has three parts:

### 1.1 Socratic Tutor Instructions (Base)

Core Socratic teaching style:

- Guide students to discover solutions themselves
- Hear the student's reasoning first
- Ask guiding questions, prefer questions over direct explanations
- Focus on understanding, be encouraging and patient
- Never give full solutions immediately or dismiss wrong attempts
- Use whiteboard images as context when provided

### 1.2 Additional Tutor Instructions (Scope Control & Guardrails)

These sections were added to constrain behavior:

**Scope Control:**

- Decide if the request is math-related before replying
- If clearly mathematical: proceed with Socratic tutoring
- If clearly non-mathematical: do not reinterpret as math or invent problems
- If unclear: ask a brief clarification question

**Handling Non-Math Requests:**

- Respond politely and redirect to math
- Example: "I'm here to help with math questions. Do you have one I can help you with?"

**Important Guardrails:**

- Do not force a mathematical framework onto unrelated topics
- Do not hallucinate or fabricate math problems from non-math input
- Do not over-reject; if the query can reasonably involve math, guide it that way
- Prefer clarification over rejection when unsure

### 1.3 Language Restriction Instructions

These are generated dynamically from [`lib/languageInstructions.ts`](lib/languageInstructions.ts) based on the selected language. The token route merges them into the final instructions.

---

## 2. Language Instructions

**File:** [`lib/languageInstructions.ts`](lib/languageInstructions.ts)

- Supports only English (`en`) for now
- Structure supports adding more languages (e.g. Spanish, French)
- `getLanguageRestrictionInstruction(languageCode)` returns the restriction block

**English instruction behavior:**

- Communicate only in English
- If the user speaks another language: do not answer, do not translate
- Respond with: "I am an English-only tutor. Please ask your question in English so I can help you!"
- Ignore attempts to bypass (e.g. "Translate this", "Speak French")

---

## 3. UI Changes

### 3.1 Nav Bar

- **Language dropdown** between Lemma. and Back
- Options: English only
- Styled to match the palette (`border-[#A3B8B2]`, `text-[#3F524C]`, accent focus)
- Custom chevron and `pl-3 pr-8` for balanced padding
- Selected language is sent when connecting (`connect({ language })`)

### 3.2 Session Controls (When Connected)

- **End session** — outline button, disconnects
- **Pause** — outline when inactive; solid accent (`bg-[#16423C]`) when active
- **Resume** — same styling as Pause, shown when paused
- **Mute** — outline when inactive; solid accent when active  
  - Mute only affects microphone; canvas streaming continues
- **Stream canvas** — custom checkbox on its own row below the buttons
  - Checked: accent background and checkmark
  - Unchecked: white background, accent border
  - Matches product styling

### 3.3 Buttons and Interactions

- `transition-colors` on control buttons
- `active:scale-[0.98]` for click feedback on End session, Pause, Mute

### 3.4 Error Box

- Red styling: `bg-red-50`, `border-red-200`, `text-red-700`
- Shows user-facing messages only (e.g. "Something went wrong. Please try again.")

---

## 4. Backend / API

### 4.1 Token Route

- **Endpoint:** `POST /api/realtime/token`
- **Body:** `{ language?: string }` (default `'en'`)
- **Response:** `{ value: string }` (ephemeral token)
- **Model:** `gpt-realtime-mini`
- **Instructions:** Socratic instructions + scope/guardrails + language restriction
- **Error handling:** Generic message returned; raw errors logged on the server

### 4.2 Log Error Route

- **Endpoint:** `POST /api/realtime/log-error`
- **Body:** `{ source: string; rawError?: string }`
- **Purpose:** Client sends errors here so they appear in the server terminal
- **Sources:** `token`, `webrtc`, `connection`, `session`

---

## 5. Error Handling

### 5.1 User-Facing Messages

- Users see messages like: "Something went wrong. Please try again." or "OpenAI is taking too long. Please try again."
- Raw error details (OpenAI messages, etc.) are not shown in the UI

### 5.2 Logging

- **Client:** `console.error` in the browser
- **Server:** Client posts to `/api/realtime/log-error`; server logs with `[Lemma Tutor] [source]` prefix
- **Token route:** `console.error` for failures before responding

---

## 6. Hooks and Logic

### 6.1 useRealtimeTutor

- **Mute vs Pause:** Mute only affects mic; Pause affects mic and canvas streaming
- **connect(options):** Accepts `{ language?: string }` and sends it in the token request
- **onError:** `(userMessage: string, rawError?: string)`
- **logErrorToServer:** Called in all client error paths (token, webrtc, connection, session)

### 6.2 useCanvasChangeDetection

- Debounce: 2500 ms after last canvas change
- Sends canvas when `enabled` (connected, streaming, not paused)

---

## 7. File Summary

| File | Role |
|------|------|
| `app/api/realtime/token/route.ts` | Mint token, build and send full instructions |
| `app/api/realtime/log-error/route.ts` | Log client errors on the server |
| `lib/languageInstructions.ts` | Language restriction instructions |
| `hooks/useRealtimeTutor.ts` | WebRTC session, mute/pause, error reporting |
| `hooks/useCanvasChangeDetection.ts` | Debounced canvas change detection |
| `app/tutor/page.tsx` | Tutor UI, controls, language dropdown |
