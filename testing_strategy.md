# Testing Strategy

This document outlines how to verify that all implemented features work correctly and that no regressions have been introduced. It covers the tutor instructions, language handling, UI, error handling, and canvas streaming optimizations described in `IMPLEMENTATION_SUMMARY.md` and `realtime_streaming.md`.

---

## Prerequisites

- **Environment:** Ensure `.env` has valid `OPENAI_API_KEY` and `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`
- **Browser:** Use Chrome or Edge (WebRTC, microphone access)
- **Network:** Stable connection for Realtime API
- **Run app:** `npm run dev` and open `http://localhost:3000/tutor`

---

## 1. Build and Smoke Tests

| Test | Steps | Expected |
|------|-------|----------|
| Build succeeds | `npm run build` | Exit code 0, no TypeScript or lint errors |
| App loads | Open `/tutor` | Page renders; no console errors |
| Nav visible | Check header | Lemma. link, language dropdown, Back link present |
| Canvas visible | Check main area | Whiteboard loads; can draw with pen tool |

---

## 2. Connection and Session Flow

| Test | Steps | Expected |
|------|-------|----------|
| Start session | Click "Start tutoring" | Connects; h1 "Math Tutor" disappears; controls and avatar appear |
| End session | Click "End session" | Disconnects; "Math Tutor" reappears; "Start tutoring" visible |
| Chat history persists | Connect → exchange messages → End session | Chat history still visible after disconnect |
| Chat cleared on new session | Connect → End → "Start tutoring" again | Chat history is cleared |
| Error on bad config | Use invalid API key in `.env` | Error message shown; no crash |

---

## 3. Tutor Avatar and States

| Test | Steps | Expected |
|------|-------|----------|
| Idle | Before connect | "Ready" label; subdued border |
| Listening | Connected, not speaking | "Listening" label; pulsing border |
| Waiting | Click Pause or Mute | "Waiting" label; no pulse |
| Return to Listening | Unclick both Pause and Mute | "Listening" label again |
| Thinking | Send text or image | "Thinking" label |
| Speaking | Tutor responds with voice | "Speaking" label; wave animation |
| Size | Compare to design | Avatar is ~12.5% smaller than original |
| Buttons layout | When connected | Avatar and End/Pause/Mute buttons side by side |

---

## 4. Session Controls (Pause, Mic Mute, Speaker Mute, Stream Canvas)

| Test | Steps | Expected |
|------|-------|----------|
| Pause immediate interrupt | While tutor is actively speaking, click Pause | Tutor audio stops immediately; in-flight response is cancelled |
| Pause with no active response | Wait until tutor is idle, then click Pause | No user-facing error banner appears |
| Resume | Click Resume | Mic on; canvas streaming resumes |
| Mic mute | Click Mute | User mic is muted; tutor output still audible |
| Mic unmute | Click Unmute | User mic is restored |
| Speaker mute | Click Mute speaker | Tutor output audio is silent; mic behavior unchanged |
| Speaker unmute | Click Unmute speaker | Tutor output audio is audible again |
| Pause input lock | Click Pause, then try typing/uploading/sending | Text/file actions are blocked while paused |
| Stream canvas off | Uncheck "Stream canvas" | No canvas sends (passive or active) |
| Stream canvas on | Check "Stream canvas" | Canvas sends on interactions and debounced changes |
| Pause + canvas | Pause with stream on, draw, wait 2.5s | No canvas sent |

---

## 5. Language and System Prompt

| Test | Steps | Expected |
|------|-------|----------|
| Language dropdown | Change language before connect | Selected value used when connecting |
| English restriction | Connect, ask in Spanish or French | Tutor responds with redirect to English (per `languageInstructions.ts`) |
| Math scope | Ask "What is 2+2?" | Math-related response |
| Non-math redirect | Ask "What's the weather?" | Polite redirect to math; no fabricated math |
| Socratic style | Ask a problem | Tutor asks guiding questions rather than giving full solution |
| Canvas context | Draw problem, speak or send text | Tutor refers to drawn content when responding |

---

## 6. Chat Interface, History, and Duplicates

| Test | Steps | Expected |
|------|-------|----------|
| Two-sided layout | Start session and exchange messages | User bubbles are right-aligned; assistant bubbles are left-aligned |
| No duplicated latest bubble | Let assistant finish a reply | Final assistant bubble appears once (no duplicate streaming/final copy) |
| No duplicate assistant messages | Have tutor respond multiple times | Each assistant response appears once |
| Text/file user messages | Send text and upload image | User entries appear correctly in chat |
| Voice user messages | Speak a short sentence and stop | Spoken user turn is handled in audio flow; transcript-in-chat is currently not implemented |
| Transcript live | While tutor speaks | Current assistant transcript streams in chat and finalizes cleanly |

---

## 7. Error Handling

| Test | Steps | Expected |
|------|-------|----------|
| User-facing message | Simulate connection failure | Generic message (e.g. "Something went wrong"); no stack trace |
| Error box styling | Trigger error | Red box (`bg-red-50`, `border-red-200`) |
| Server logging | Trigger error | Entry in server terminal (if log-error wired) |
| Dismiss | Fix issue, retry | Error can be cleared by successful action |

---

## 8. Canvas Streaming Optimizations

### 8.1 Active Mode (Send on Interaction)

| Test | Steps | Expected |
|------|-------|----------|
| On speech | Connect, draw, then speak | Canvas sent when you start speaking (tutor has context) |
| On text send | Connect, draw, type and send "What is this?" | Canvas sent with the message |
| On image send | Upload image, click "Get help with this problem" | Canvas sent with the image (if stream on) |
| Bypass filters | Use any active trigger with unchanged canvas | Canvas still sent (no staleness skip) |

### 8.2 Passive Mode (Debounced Change)

| Test | Steps | Expected |
|------|-------|----------|
| Add shape | Draw one stroke, wait 2.5s | Canvas sent after debounce |
| Remove shape | Delete a shape, wait 2.5s | Canvas sent |
| Significance skip | Select one shape, nudge it slightly, wait 2.5s | No canvas sent (1 updated, 0 add/remove) |
| Multiple updates | Update 2+ shapes, wait 2.5s | Canvas sent |
| Staleness skip | Draw, wait for send, don't change canvas, trigger passive again | No duplicate send (same hash) |
| Staleness reset | Change canvas after passive send | Next qualifying change triggers new send |

### 8.3 Viewport and Image Format

| Test | Steps | Expected |
|------|-------|----------|
| Viewport capture | Pan/zoom so only part of drawing visible, trigger send | Only visible area in captured image |
| Empty viewport | Pan to empty area, trigger send | No send (or no capture) when no shapes in view |
| JPEG format | Inspect network or dev tools | Image sent as `data:image/jpeg;base64,...` |

### 8.4 Replace Strategy and canvasItemIdRef

| Test | Steps | Expected |
|------|-------|----------|
| Single canvas item | Send multiple canvas updates | Only one canvas image in context; previous replaced |
| User upload preserved | Upload image, then draw and send canvas | User-uploaded image not deleted; canvas added separately |
| canvasItemIdRef | Send canvas, then send user image | canvasItemIdRef does not point at user upload; only canvas items tracked |

---

## 9. File Upload and Text Input

| Test | Steps | Expected |
|------|-------|----------|
| Upload image | Use FileUpload, select image | Preview shown; "Get help" and text input available |
| Send image only | Upload, click "Get help with this problem" | Image + canvas (if streaming) sent; tutor responds |
| Send text + image | Upload, type message, send | Both sent; tutor responds with context |
| Remove upload | Click "Remove" | Preview cleared |
| Disabled during thinking | Send message, try FileUpload or TextInput while "Thinking" | Inputs disabled |
| Disabled during pause | Pause session, try FileUpload or TextInput | Inputs are unavailable; paused helper message is shown |

---

## 10. Regression Checks

| Area | Quick Check |
|------|-------------|
| Home page | `/` loads; demo/interactive elements work |
| Board page | `/board` loads; drawing works |
| Mobile layout | Resize to narrow width; tutor page usable |
| Unified shell continuity | First load, start, end, start again | Same chat shell layout stays consistent; controls are integrated in top bar |
| Keyboard | Tab through controls; Enter sends text |
| Refresh during session | Refresh while connected; graceful cleanup (no errors) |

---

## 11. Optional: Automated Test Hooks

If you add automated tests later, consider:

| Component | Test Focus |
|-----------|------------|
| `useCanvasChangeDetection` | Significance filter: 1 updated → no schedule; 1 added → schedule |
| `sendCanvasToTutor` | Staleness: same hash → skip; different hash → send |
| Token route | Language param merged into instructions |
| `languageInstructions` | Returns correct block for `en` |
| `TutorAvatar` | Correct state and label for idle/listening/waiting/thinking/speaking |
| `sendCanvasImage` | Builds correct `image_url` with mimeType |

---

## 12. Checklist Summary

Use this checklist for a full manual pass:

- [ ] Build succeeds
- [ ] Start/End session works
- [ ] Chat history persists after disconnect; clears on new session
- [ ] Avatar states: idle, listening, waiting, thinking, speaking
- [ ] Pause interrupts response immediately and resumes correctly
- [ ] Pause when idle does not show false cancellation error
- [ ] Mic mute/unmute affects user input only
- [ ] Speaker mute/unmute affects tutor output only
- [ ] Stream canvas toggle works
- [ ] Language dropdown and English restriction
- [ ] Two-sided chat layout is active
- [ ] Latest assistant bubble is not duplicated
- [ ] No duplicate assistant messages in chat
- [ ] Spoken user turns are handled in audio flow (transcript in chat is TODO)
- [ ] Canvas on speech start
- [ ] Canvas on text send
- [ ] Canvas on image send
- [ ] Passive: add/remove triggers send; single nudge does not
- [ ] Staleness: no duplicate passive sends for same content
- [ ] User upload and canvas coexist (no accidental delete)
- [ ] Error handling shows user-friendly message
- [ ] File upload and text input flow
