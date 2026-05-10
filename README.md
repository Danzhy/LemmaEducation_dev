# Lemma Education

**The AI that listens to you.**

Lemma is an educational platform that captures the complete picture of a student's thought process through voice reasoning and digital handwriting, providing real-time feedback that targets misconceptions in logic.

## Features

- **Voice Reasoning** - Verbalize your thinking while solving problems
- **Digital Handwriting** - Capture your work naturally
- **Real-time Feedback** - Get targeted guidance on misconceptions
- **Interactive Demo** - Experience the difference with our live demo
- **Saved Session Review** - Revisit transcripts and board snapshots after each tutor session
- **Role-Based Access** - Separate student, teacher, and parent dashboards with scoped visibility
- **Voice Agent Lab** - Hidden `/tutor-agent-lab` route for testing a tool-enabled realtime tutor
- **LiveKit Tutor Lab** - Hidden `/tutor-livekit-lab` route for testing a worker-based voice tutor
- **LiveKit Pipeline Lab** - Hidden `/tutor-livekit-pipeline-lab` route for testing STT plus selectable LLM plus TTS
- **Curriculum RAG Lab** - Teacher-uploaded curriculum context and custom tutor profiles for hidden agent labs
- **Learner Context Lab** - Signed-in lab tutors can quietly review recent sessions and recurring struggle signals
- **Board PDF Tools** - Tutor boards can import worksheet PDFs and export the canvas to PDF
- **Teacher Review Tools** - Session summaries, review-focus trends, and follow-up practice drafts for school pilots

## Pilot Readiness

The dev app now includes the core guardrails needed for a limited pilot with real students:

- **Role-based onboarding** for students, teachers, parents, and admins
- **Teacher classrooms** with join codes for student enrollment
- **Parent access codes** for read-only session review
- **Roster and access controls** so teachers can remove students and families can revoke linked oversight
- **Saved tutor history** with transcripts and canvas snapshots
- **Access audit logging** when teachers or parents open saved student sessions
- **Pilot tutor limits** of up to 4 active hours per student each week, with each session capped at 1 hour
- **Automatic inactivity pause** after 5 minutes without activity
- **Server-backed tutor API rate limits** to reduce abuse and accidental spend
- **Tool activity logging** so experimental agent tool calls can be reviewed alongside saved sessions
- **Safe review exports** for session metadata, learning evidence, board status, and follow-up practice without raw tool payloads
- **Review-focus trends** that aggregate repeated misconception signals for linked teachers and parents
- **Teacher follow-up drafts** that turn safe review focus into short practice sets without answer-key exposure

## Curriculum RAG Lab

The dev labs can now read teacher-provided curriculum context without changing the stable tutor page. Teachers can upload lesson text or small PDFs, create custom lab tutor profiles through `POST /api/tutor/agent-profiles`, and the hidden agent labs can use `curriculum_context` plus `curriculum_search` before answering class-specific questions. Apply `migrations/007_curriculum_rag_and_agent_profiles.sql` to enable the pgvector-backed tables.

Required for embeddings:

```bash
OPENAI_API_KEY=...
OPENAI_CURRICULUM_EMBEDDING_MODEL=text-embedding-3-small
```

Run the local helper check with:

```bash
npm run test:curriculum-rag
npm run test:curriculum-security
npm run test:curriculum-db
npm run test:curriculum-pdf
```

## Voice Agent Lab

The hidden `/tutor-agent-lab` route keeps the stable `/tutor` flow untouched while testing a tool-enabled realtime tutor. The lab currently includes:

- A shared tutor workspace with typed or microphone startup
- Structured canvas actions for graphs, fraction models, signed integers, number lines, ratios, percents, geometry, data, and short board notes
- Deterministic math tools for calculation checks, linear equations, fraction simplification, common denominators, percent-of-number, unit rates, rounding, and decimal comparison
- Problem-understanding maps for knowns, unknowns, units, and representation choices before solving
- Representation bridges between words, visuals, tables, equations, graphs, and numeric work
- Faded worked-example planning for I-do, we-do, you-do tutoring
- Targeted comprehension checks so lab tutors ask one focused question before moving on
- Exit-ticket planning for short end-of-session checks with evidence to review later
- Tutoring planner tools for word problems, misconceptions, curriculum moves, Socratic next steps, and targeted practice
- Mistake-pattern classification for common grade 3-7 errors before correction
- Tutor-turn audits to catch answer dumping, missing questions, and privacy risks in lab responses
- Interruption recovery planning so voice labs resume from the next short chunk instead of restarting long explanations
- Curriculum context and search for teacher-uploaded notes, PDFs, and custom class instructions
- Learner context plus adaptive review planning for recent topics, structured misconception timelines, struggle signals, and micro-practice
- Session mastery snapshots for concise teacher-safe learning handoffs in hidden labs
- Tool events are logged for safe review, with raw payloads hidden unless an admin explicitly enables debug review

Run the voice-agent checks with:

```bash
npm run test:voice-agent
npm run test:learner-context
npm run test:learner-security
```

This runs smoke checks, registry/schema checks, and curriculum coverage checks for the experimental tool suite.

## LiveKit Tutor Lab

The hidden `/tutor-livekit-lab` route keeps the same tutor workspace while testing a LiveKit room plus a separate LiveKit agent worker. The browser receives a short-lived room token from `/api/livekit/session`; the worker joins through explicit agent dispatch and runs the same deterministic grade 3-7 math tools server-side before sending structured board actions back to the client. The worker also enforces per-session tool and canvas-action budgets. If LiveKit is not configured locally, **Start without mic** opens a signed-in typed preview mode that still starts a quota-tracked tutor session and uses the server-owned deterministic board tools without minting a room token.

Required local variables:

```bash
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_NAME=lemma-livekit-tutor
OPENAI_API_KEY=...
```

Run the app and worker in separate terminals:

```bash
npm run dev -- --port 3013
npm run dev:livekit-agent
```

Run the LiveKit tool smoke check with:

```bash
npm run test:livekit-agent
npm run test:livekit-security
```

### LiveKit Pipeline Lab

The hidden `/tutor-livekit-pipeline-lab` route keeps the same workspace but uses LiveKit's chained voice-agent path: STT, a selectable server-side LLM brain, and TTS. The old `/tutor-livekit-lab` realtime-model route stays available for comparison.

Optional model variables:

```bash
LIVEKIT_PIPELINE_AGENT_NAME=lemma-livekit-pipeline-tutor
OPENROUTER_API_KEY=...
OPENROUTER_LIVEKIT_MODEL=...
GROQ_API_KEY=...
```

Run the pipeline worker with:

```bash
npm run dev:livekit-pipeline-agent
npm run test:livekit-pipeline
```

## Tech Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Canvas API** - Animated background effects

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### Build

```bash
# Create production build
npm run build

# Start production server
npm start
```

### Waitlist Schema

The homepage waitlist now collects more than just an email address. New signups can store:

- email
- role selection
- custom role / background
- goals or feedback
- willingness to pay

If you are setting up a fresh environment or updating an older database schema, run:

```bash
npm run migrate:waitlist
```

This updates the `public.waitlist_signups` table with the extra waitlist fields used by the local form and API.

### Tutor / Dashboard Migrations

If you are setting up a fresh pilot database, apply the tutor migrations in `migrations/` so the role dashboards, session history, pilot guardrails, and voice-agent tool logging are available.

## Project Structure

```
├── app/
│   ├── globals.css      # Global styles and animations
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Home page
├── components/
│   ├── CanvasBackground.tsx  # Animated background
│   └── DemoSection.tsx      # Interactive demo
├── docs/
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── PROJECT_DOCUMENTATION.md
│   ├── PROJECT_REPORT.md
│   ├── TUTOR_DOCUMENTATION.md
│   ├── canvasAI.md
│   ├── realtime_streaming.md
│   └── testing_strategy.md
├── scripts/
│   └── migrate-waitlist-schema.mjs  # Updates waitlist DB columns
└── public/              # Static assets
```

## Team

- [Shayan Ahmad](https://www.linkedin.com/in/shayanahmad7/)
- [Myra Rafiq](https://www.linkedin.com/in/myrarafiq/)
- [Vlera Mehani](https://www.linkedin.com/in/vlera-mehani-a11a56178/)
- [Daniar Zhylangozov](https://www.linkedin.com/in/daniar-zhylangozov/)

## License

© 2026 Lemma Education.
