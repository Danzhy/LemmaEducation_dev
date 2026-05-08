# LiveKit Tutor Lab

The LiveKit tutor lab is an isolated experiment for a worker-based voice tutor. It does not replace the stable `/tutor` route or the OpenAI Agents SDK lab.

## Route

- Page: `/tutor-livekit-lab`
- Dashboard redirect: `/dashboard/tutor-livekit-lab`
- Token endpoint: `POST /api/livekit/session`
- Status endpoint: `GET /api/livekit/status`
- Typed preview endpoint: `POST /api/livekit/tool-preview`
- Worker: `workers/livekit-tutor-agent.ts`

## Architecture

1. The browser starts a normal tutor session through the existing session and quota system.
2. The browser requests a short-lived LiveKit token from `/api/livekit/session`.
3. The token uses explicit LiveKit agent dispatch so only the named worker joins the room.
4. The LiveKit worker joins as the tutor participant and runs `gpt-realtime-1.5`.
5. The worker executes deterministic grade 3-7 math tools server-side.
6. The worker can search teacher-uploaded curriculum context through the server-owned `curriculum_search` tool.
7. The worker can generate one targeted `student_check_question` before moving on from a tool result or explanation.
8. The worker can create short `exit_ticket_builder` checks for session wrap-up without revealing answers first.
9. The worker sends structured board actions back to the browser through LiveKit RPC.
10. The browser translates only allowed structured actions into tldraw shapes.

When LiveKit variables are missing locally, **Start without mic** uses a typed preview mode instead of creating a room. That path stays signed-in and rate-limited, runs deterministic tools through `/api/livekit/tool-preview`, and renders the same structured board actions. It is for local tool testing, not a replacement for the full voice worker path.

## Guardrails

- Auth is required before token minting.
- Tokens expire after 10 minutes.
- API session creation is rate-limited.
- Tutor quota and inactivity checks run before room access.
- The browser never receives `LIVEKIT_API_SECRET`, `LIVEKIT_API_KEY`, or `OPENAI_API_KEY`.
- The worker has a per-session tool-call budget.
- The worker has a per-session canvas-action budget.
- Curriculum search stays authenticated and scoped to the session owner, teacher-owned documents, or class membership.
- Canvas control is restricted to structured math actions, not arbitrary editor access.
- Tool telemetry and canvas transport are best-effort so optional UI streams cannot break math tool execution.
- The typed preview endpoint is authenticated, rate-limited, and restricted to the same allowlisted deterministic tools.

## Local Setup

Add LiveKit and OpenAI variables to `.env.local`:

```bash
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_NAME=lemma-livekit-tutor
OPENAI_API_KEY=...
```

Run the app and worker in two terminals:

```bash
npm run dev -- --port 3013
npm run dev:livekit-agent
```

Open:

```text
http://localhost:3013/tutor-livekit-lab
```

## Tests

```bash
npm run test:livekit-agent
npm run test:livekit-security
npm run build
```

`test:livekit-agent` checks tool exposure, arithmetic, graph canvas actions, telemetry resilience, and budget enforcement.

`test:livekit-security` checks that client files do not expose server-only secrets and that the LiveKit token route still has auth, rate limiting, explicit dispatch, short TTLs, and publish restrictions.
