# AGENTS.md

## Mission

Build Lemma's dev tutor labs into the strongest possible grade 3-7 AI math tutor: voice-first, reasoning-visible, safe for minors, and closer to a great human tutor than generic answer engines. The product bar is not "has an AI chat"; the bar is a tutor that listens to the student, sees the work, uses reliable math tools, writes on the board when useful, asks good questions, and leaves teachers or parents with auditable learning evidence.

The main strategic edge is math-specific tutoring with voice plus a shared work surface. Protect that edge.

## Hard Boundaries

- Work in the dev repo unless the user explicitly asks otherwise.
- Do not edit the production main repo from this checkout.
- Do not change the stable `/tutor` route, homepage, waitlist, or production-facing flows unless the user explicitly asks.
- Keep experiments isolated in hidden lab pages such as `/tutor-agent-lab`, `/tutor-livekit-lab`, supporting APIs, tests, migrations, and local-only reports.
- Never commit secrets, `.env*`, private docs, `Market Research/`, or `reports/`.
- Do not create public recommendation or comparison pages for internal strategy. Put strategy, testing notes, and market research in ignored local reports.
- Do not use the user's browser accounts, sign up for paid services, create third-party API keys, or make purchases unless the user explicitly confirms that exact action.
- Do not claim school, COPPA, FERPA, HIPAA, SOC 2, or accessibility compliance unless it has been implemented and independently verified.

## Current Product Surfaces

- Stable tutor: `/tutor`. Treat as protected.
- OpenAI Agents SDK lab: `/tutor-agent-lab`.
- LiveKit worker lab: `/tutor-livekit-lab`.
- Dashboard wrappers may exist under `/dashboard/...`.
- Curriculum RAG, learner context, session history, teacher/parent dashboards, and role access are dev-pilot features. Keep them secure and tested.

## Product Principles

- Tutor before answer machine. Default to hints, questions, and step-level feedback before full solutions.
- Reasoning visible. Capture spoken reasoning, canvas work, transcripts, tool calls, and board actions as reviewable session evidence.
- Reliable math first. Use deterministic tools for arithmetic, fractions, equations, graph data, geometry facts, units, ratios, percents, and checks.
- Board control must be structured. Agents can request allowed canvas actions, but should not get arbitrary editor access.
- Human tutor feel. The agent should speak naturally, pace explanations, pause for the learner, handle interruptions, and write or draw only when it helps.
- Grade 3-7 safety. Keep topics age-appropriate, math-scoped, privacy-preserving, and free of unsupported certainty or emotional overreach.
- Teacher and parent value. Summaries should surface misconceptions, evidence, next practice, and safety/audit context without exposing unnecessary private data.

## Market Bar

Use local ignored market research plus fresh web research when needed. Track competitors as a feature bar, not as copy to imitate.

Key competitor capabilities to beat include:

- Flint-style school platform features: teacher-created AI activities, custom guardrails, rubrics, activity analytics, full admin visibility, SSO, class summaries, session export, follow-up activities, timed/deadlined assignments, graphing, formula entry, and LMS/SIS readiness.
- Voice tutor competitors: low-latency speech, interruption handling, spoken practice, real-time feedback, multilingual support, and safe classroom controls.
- Math tutor competitors: step checks, graphing, diagrams, formula rendering, uploaded worksheets, misconception detection, targeted practice, mastery tracking, and curriculum alignment.

Lemma should go beyond these by combining voice, live canvas observation, deterministic math tools, structured board actions, curriculum context, learner memory, and school-safe session review in one coherent tutoring loop.

## Autonomous Sprint Loop

At the start of every substantial run:

1. Read this file, `README.md`, relevant docs, and the latest ignored report in `reports/` if present.
2. Inspect `git status --short` before editing. Do not overwrite unrelated user work.
3. Confirm you are in `/Users/ee2282/Documents/LemmaEducation_dev` or the intended dev checkout.
4. Pick the highest-impact safe task from the backlog below.
5. Implement the smallest meaningful slice that improves tutor quality, reliability, safety, or evaluation.
6. Add or update tests for the behavior.
7. Run the relevant verification commands.
8. If tests pass, commit and push one meaningful change to the dev repo when the user has asked for autonomous pushes. Avoid giant mixed commits.
9. Update an ignored local report in `reports/` with what changed, tests run, what failed, and the next best tasks.
10. Repeat until blocked by missing credentials, product ambiguity, failing external systems, or session limits. If blocked, document the blocker and the next safe action.

Be honest about autonomy: this file guides future Codex runs, but it does not run a background daemon by itself. For unattended loops, use Codex Automations or an external scheduler with a durable prompt that points back to this file.

## Verification Baseline

Use the narrowest relevant tests for small changes, and the full set before major pushes or deployment checks.

Core checks:

- `npm run test:voice-agent`
- `npm run test:livekit-agent`
- `npm run test:livekit-planner`
- `npm run test:livekit-security`
- `npm run test:canvas-reveal`
- `npm run test:realtime-model-policy`
- `npm run test:tutor-strategies`
- `npm run test:curriculum-rag`
- `npm run test:curriculum-security`
- `npm run test:learner-context`
- `npm run test:learner-security`
- `npm run test:tutor-human-experience`
- `npx tsc --noEmit --pretty false`
- `npm run build`

Browser QA for tutor labs:

- Open `/tutor-agent-lab` and `/tutor-livekit-lab`.
- Start typed preview without mic when live credentials are unavailable.
- Verify graph drawing, equation solving, fraction models, geometry diagrams, board notes, and recovery from malformed prompts.
- Verify no internal recommendations, tool traces, or QA panels leak into normal user-facing views unless intentionally hidden behind a lab-only debug flag.

Security QA:

- Token/session endpoints require auth, quota checks, rate limits, and short TTLs.
- Browser bundles do not expose server-only keys, tool secrets, model-provider secrets, or database URLs.
- Public endpoints return generic anti-enumeration responses.
- Tool schemas are allowlisted, narrow, and reject unknown properties.
- Session/tool/canvas logs are scoped to the owner, authorized teacher, authorized parent, or admin only.

## Backlog

Tutor intelligence:

- Improve grade 3-7 topic coverage across arithmetic, fractions, decimals, ratios, percents, geometry, measurement, data, expressions, and early algebra.
- Add misconception classifiers for common wrong turns by topic.
- Add step-level checkers that explain what changed between two student steps.
- Add Socratic hint policies that ask one focused question before giving a method.
- Add adaptive practice generation based on the last session's misconception.
- Add answer-dumping audits for every assistant turn in labs.
- Add confidence handling so the tutor asks for clarification when work is missing or ambiguous.
- Add session-end mastery snapshots with next practice and evidence.

Canvas and visual reasoning:

- Expand structured canvas actions for points, lines, rays, axes, plots, arrays, bar models, tape diagrams, number lines, area models, angles, triangles, and coordinate grids.
- Make graph tools return sampled points and labels, not pixels.
- Make geometry tools return figure specs, labels, and constraints.
- Add safe board-writing actions for short notes, equations, highlights, and step callouts.
- Add replayable canvas action logs to saved sessions.
- Add visual diff checks so repeated actions do not duplicate stale objects.
- Explore animation libraries only for lab experiments; prefer deterministic, replayable math visuals over flashy motion.

Voice and realtime interaction:

- Compare OpenAI Realtime, Agents SDK voice, and LiveKit worker routes with the same eval prompts.
- Track latency, interruption handling, transcript quality, cost risk, and failure recovery.
- Add turn-taking rules that make the tutor pause naturally after questions.
- Add graceful fallback from voice to typed preview.
- Keep all provider secrets server-side.

Curriculum and RAG:

- Let teachers upload curriculum safely with size, type, and content limits.
- Add source-grounded retrieval for lesson notes, worksheets, and custom class instructions.
- Add custom tutor profiles per teacher/class with strict policy inheritance.
- Add retrieval citations in internal session review, not noisy student-facing text unless helpful.
- Add stale-context detection and safe fallback when retrieval is weak.
- Evaluate Neon pgvector first before adding another database.

Teacher, parent, and school readiness:

- Improve class creation, join codes, roster controls, and parent linking.
- Add teacher views for misconception trends, recent sessions, needs-attention lists, and suggested follow-up activities.
- Add parent-safe summaries with limited, student-centered detail.
- Add role-based permissions tests for every dashboard and API.
- Add audit logs for every non-student session view.
- Add data retention controls and export/delete workflows before any real school pilot.
- Add assignment-like flows only after the tutor loop is reliable.

Reliability, cost, and evaluation:

- Build scripted eval suites for canonical grade 3-7 tasks and adversarial prompts.
- Track tool accuracy separately from model explanation quality.
- Add cost guardrails per user, session, day, and provider.
- Add inactivity pause and hard session caps in all lab routes.
- Add model comparison reports in ignored `reports/`, not on the website.
- Keep docs updated when behavior changes.

## Commit And Push Protocol

- Commit only cohesive, tested changes.
- Prefer commit messages like `Improve LiveKit graph canvas tools` or `Add tutor misconception evals`.
- Never include ignored local reports unless the user explicitly asks and the content is safe to publish.
- Before pushing, run `git status --short` and confirm the staged files match the intended slice.
- Push only to the dev repo remote unless the user explicitly asks for another target.

