# Realtime Math Tutor — Technical Documentation

This document explains how the Lemma real-time math tutor works, including implementation details, design decisions, and the OpenAI Realtime API integration.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Why `output_modalities: ['audio']` Instead of `['audio', 'text']`](#why-output_modalities-audio-instead-of-audio-text)
3. [Ephemeral Token vs. Unified Interface](#ephemeral-token-vs-unified-interface)
4. [File Structure](#file-structure)
5. [Data Flow](#data-flow)
6. [Realtime API Events](#realtime-api-events)
7. [Input Modes (Voice, Text, File)](#input-modes-voice-text-file)
8. [PDF Handling](#pdf-handling)
9. [Environment Variables](#environment-variables)

---

## Architecture Overview

The tutor uses **OpenAI's Realtime API** over **WebRTC** for low-latency voice interaction. The flow:

1. **Client** requests an ephemeral token from our server (`POST /api/realtime/token`)
2. **Our server** mints a short-lived token via OpenAI's `client_secrets` endpoint
3. **Client** uses that token to connect directly to OpenAI's WebRTC endpoint (`POST /v1/realtime/calls`)
4. **WebRTC** handles audio (microphone → OpenAI, OpenAI → speaker)
5. **Data channel** (`oai-events`) carries JSON events for text, images, and server events

```
┌─────────────┐     token      ┌─────────────┐     client_secrets     ┌─────────────┐
│   Browser   │ ──────────────► │ Our Server  │ ─────────────────────►│   OpenAI    │
│             │                 │ /api/       │                        │   API       │
│             │                 │ realtime/   │                        │             │
│             │                 │ token      │                        │             │
└─────────────┘                 └─────────────┘                        └─────────────┘
       │                                                                      │
       │  WebRTC (SDP + audio)                                                │
       └─────────────────────────────────────────────────────────────────────┘
```

---

## Why `output_modalities: ['audio']` Instead of `['audio', 'text']`

**Short answer:** The OpenAI Realtime API does **not** support `['audio', 'text']` together. It only allows one output modality at a time: either `['audio']` or `['text']`.

**What we tried:** Initially we used `output_modalities: ['audio', 'text']` to get both voice and a text transcript of the tutor's response. The API returned:

```
Invalid modalities: ['audio', 'text']. Supported combinations are: ['text'] and ['audio'].
```

**What we use:** `output_modalities: ['audio']` because the tutor is voice-first. The student hears the tutor speak.

**Transcript display:** We still show a transcript in the UI. It comes from `response.output_audio_transcript.delta` events, which are sent alongside audio output. So we get:
- **Audio** → played through the speaker
- **Transcript** → displayed in the "Tutor says" section (from `output_audio_transcript`, not from `output_modalities: ['text']`)

If we used `output_modalities: ['text']`, we would get text-only responses and no voice.

---

## Ephemeral Token vs. Unified Interface

We originally used the **unified interface**: the browser sent the WebRTC SDP offer to our server, and our server proxied it to OpenAI. That caused **504 Gateway Timeout** (~16 seconds) because:
- WebRTC SDP negotiation with OpenAI can be slow
- Our server had a shorter timeout than the negotiation took

**Solution:** Switch to **ephemeral tokens**:
1. Our server only mints a token (~1 second) via `POST /v1/realtime/client_secrets`
2. The browser connects **directly** to OpenAI with that token
3. The slow WebRTC negotiation happens between browser and OpenAI, so our server is no longer in the path

**Security:** The ephemeral token is short-lived and scoped to the Realtime API. Our main `OPENAI_API_KEY` never leaves the server.

---

## File Structure

```
app/
  api/realtime/token/route.ts   # Mints ephemeral token for Realtime API
  tutor/page.tsx               # Main tutor UI page

components/
  TutorAvatar.tsx              # Visual avatar (listening/thinking/speaking)
  FileUpload.tsx               # Image + PDF upload
  TextInput.tsx                # Text input for equations/clarifications

hooks/
  useRealtimeTutor.ts         # WebRTC + Realtime API logic

types/
  pdfjs-dist.d.ts             # Type declarations for PDF.js webpack entry
```

---

## Data Flow

### Connection Flow

1. User clicks "Start tutoring"
2. `useRealtimeTutor.connect()` runs
3. Create `RTCPeerConnection`, add microphone track, create data channel
4. Create SDP offer
5. `fetch('/api/realtime/token')` → get ephemeral token
6. `fetch('https://api.openai.com/v1/realtime/calls', { body: offer.sdp, Authorization: Bearer <token> })` → get SDP answer
7. Set remote description → WebRTC connected
8. Data channel opens → `isConnected = true`, `state = 'listening'`

### Voice Flow

- **Input:** Microphone → WebRTC audio track → OpenAI (automatic)
- **Output:** OpenAI → WebRTC audio track → `pc.ontrack` → `<audio>.srcObject` → autoplay

### Text/Image Flow

- **Input:** User types or uploads → `conversation.item.create` (input_text or input_image) → `response.create` → sent over data channel
- **Output:** Server events (`response.output_audio.delta`, `response.output_audio_transcript.delta`) → `handleServerEvent` → update state and transcript

---

## Realtime API Events

### Client → Server (we send)

| Event | When | Purpose |
|-------|------|---------|
| `conversation.item.create` | User sends text/image | Add user message to conversation |
| `response.create` | After adding user message | Ask model to respond |

### Server → Client (we receive)

| Event | Purpose |
|-------|---------|
| `session.created` / `session.updated` | Session ready |
| `input_audio_buffer.speech_started` | User started speaking |
| `response.created` | Model started generating |
| `response.output_audio.delta` | Audio chunk (we use for "speaking" state) |
| `response.output_audio_transcript.delta` | Transcript chunk (we display) |
| `response.output_audio.done` / `response.done` | Response finished |
| `response.cancelled` | User interrupted |
| `error` | API error |

---

## Input Modes (Voice, Text, File)

All three modes work **independently** or **in combination**:

| Mode | How it works | Realtime API |
|------|---------------|--------------|
| **Voice only** | User speaks; tutor responds | Audio via WebRTC; VAD triggers response |
| **Text only** | User types; tutor responds | `conversation.item.create` (input_text) + `response.create` |
| **File only** | User uploads image/PDF; tutor responds | `conversation.item.create` (input_image) + `response.create` |
| **Voice + Text** | User speaks and types | Both flows in same session |
| **Voice + File** | User speaks and uploads | Both flows in same session |
| **Text + File** | User types with image | `conversation.item.create` with both input_text and input_image |
| **All three** | Voice, text, and file | All flows in same session |

---

## PDF Handling

The Realtime API accepts **images** (`input_image` with `data:image/...;base64,...`), not PDFs directly.

**Approach:** Convert the first page of a PDF to a PNG image client-side using `pdfjs-dist`:

1. User selects a PDF
2. `convertPdfFirstPageToImage()` loads the PDF with PDF.js
3. Renders page 1 to a canvas at 2x scale (for clarity)
4. Exports canvas as PNG base64
5. Sends as `input_image` like any other image

**Why first page only?** Most math problems fit on one page. Multi-page support could be added later by iterating over `pdf.numPages` and sending multiple `input_image` content parts.

**Worker setup:** We use `pdfjs-dist/webpack.mjs`, which auto-configures the PDF.js worker for browser use. This avoids manual worker path configuration.

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | Used server-side to mint ephemeral tokens. Never sent to the client. |
| `NEON_DATABASE_URL` | No (for tutor) | Used elsewhere in the app (e.g. waitlist). Not used by the tutor. |

**Note:** Ensure `OPENAI_API_KEY` has no spaces around the `=` in `.env`.

---

## Session Configuration (Token Route)

The session config sent to `client_secrets`:

```javascript
{
  type: 'realtime',
  model: 'gpt-realtime',
  instructions: SOCRATIC_TUTOR_INSTRUCTIONS,
  output_modalities: ['audio'],
  audio: { output: { voice: 'marin' } },
}
```

- **type:** `realtime` = speech-to-speech (vs. `transcription` for transcription-only)
- **model:** `gpt-realtime` = multimodal Realtime model
- **instructions:** Socratic tutor system prompt
- **output_modalities:** `['audio']` only (see above)
- **voice:** `marin` = one of the supported Realtime voices (alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar)

---

## References

- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Realtime WebRTC Guide](https://platform.openai.com/docs/guides/realtime-webrtc)
- [Realtime Client Secrets](https://platform.openai.com/docs/api-reference/realtime-sessions/create-realtime-client-secret)
- [Realtime Conversations](https://platform.openai.com/docs/guides/realtime-conversations)
