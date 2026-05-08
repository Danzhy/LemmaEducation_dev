import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REALTIME_MODEL_PRICING,
  REALTIME_USAGE_PROFILES,
  estimateRealtimeModelCost,
  formatUsd,
  resolveTutorStrategies,
  type RealtimeModelId,
} from '@/lib/tutor/realtime-strategy-catalog'

const REPORT_PATH = join(process.cwd(), 'reports', 'realtime-tutor-cto-sprint.md')
const MODEL_ORDER: RealtimeModelId[] = [
  'gpt-realtime-mini',
  'gpt-realtime-1.5',
  'gpt-realtime-2',
  'gpt-realtime',
  'gpt-4o-realtime-preview',
]

const REQUIRED_ROUTES = [
  'app/tutor/page.tsx',
  'app/tutor-agent-lab/page.tsx',
  'app/tutor-livekit-lab/page.tsx',
  'app/dashboard/realtime-eval/page.tsx',
]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function markdownCostTable() {
  const header = ['Profile', ...MODEL_ORDER.map((modelId) => REALTIME_MODEL_PRICING[modelId].label)]
  const rows = REALTIME_USAGE_PROFILES.map((profile) => [
    profile.label,
    ...MODEL_ORDER.map((modelId) => formatUsd(estimateRealtimeModelCost(modelId, profile).total)),
  ])

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function markdownStrategyTable() {
  const strategies = resolveTutorStrategies()
  const rows = strategies.map((strategy) => [
    strategy.label,
    strategy.route,
    strategy.currentModel,
    strategy.productionReadiness,
    strategy.toolExecution.replace(/\|/g, '/'),
    strategy.recommendation.replace(/\|/g, '/'),
  ])

  return [
    '| Strategy | Route | Current model | Status | Tool execution | Recommendation |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function writeReport() {
  mkdirSync(join(process.cwd(), 'reports'), { recursive: true })

  const now = new Date().toISOString()
  const report = `# Realtime Tutor CTO Sprint Report

Generated: ${now}

This report is local-only and ignored by git. It summarizes the current realtime tutor paths, model defaults, planning-cost proxy, and the next evaluation loop.

## Current model map

${markdownStrategyTable()}

## Planning cost proxy

These are planning estimates based on fixed token profiles in \`lib/tutor/realtime-strategy-catalog.ts\`. They are not invoice estimates. Real cost must be measured from OpenAI and LiveKit usage logs.

${markdownCostTable()}

## Architecture read

The best production candidate is the LiveKit worker path because it keeps deterministic math tools server-side, can send structured board actions to the browser, and gives us a clearer place to enforce budgets, audit tool calls, and manage room lifecycle. The OpenAI Agents SDK path is the fastest experimentation lane for prompts, schemas, and model behavior. The direct OpenAI WebRTC path should stay as the simplest fallback.

## Model read

Use \`gpt-realtime-2\` for the next high-quality LiveKit pilot test because current OpenAI docs describe it as the stronger realtime model for complex voice-agent workflows and tool use. Use \`gpt-realtime-mini\` for cost stress tests and classroom concurrency simulations. Keep \`gpt-realtime-1.5\` as the baseline because it is the current default in both lab paths.

## Required eval loop

1. Run typed preview tests first for graph, geometry, fraction, percent, ratio, algebra, data, and word-problem visuals.
2. Run the same prompt set in \`/tutor-agent-lab\` and \`/tutor-livekit-lab\`.
3. Record time to first assistant response, tool-call success, board-action success, interruption recovery, and hallucinated-answer count.
4. Repeat with \`gpt-realtime-mini\`, \`gpt-realtime-1.5\`, and \`gpt-realtime-2\` through env overrides.
5. Promote only the route that wins on safety, tool reliability, and student experience, not only latency.

## Sources checked

- OpenAI gpt-realtime-mini model page: https://developers.openai.com/api/docs/models/gpt-realtime-mini
- OpenAI gpt-realtime-1.5 model page: https://developers.openai.com/api/docs/models/gpt-realtime-1.5
- OpenAI gpt-realtime-2 model page: https://developers.openai.com/api/docs/models/gpt-realtime-2
- OpenAI gpt-realtime model page: https://developers.openai.com/api/docs/models/gpt-realtime
- LiveKit Agents overview: https://docs.livekit.io/agents/
- LiveKit Agents JS reference: https://docs.livekit.io/reference/agents-js/
- LiveKit quotas and limits: https://docs.livekit.io/deploy/admin/quotas-and-limits/
`

  writeFileSync(REPORT_PATH, report)
  return report
}

for (const route of REQUIRED_ROUTES) {
  assert(existsSync(route), `Missing realtime tutor route: ${route}`)
}

const strategies = resolveTutorStrategies()
assert(strategies.length >= 4, 'Expected at least four tutor strategy entries.')
assert(
  strategies.some((strategy) => strategy.id === 'livekit-worker-realtime' && strategy.safetyScore >= 5),
  'LiveKit worker should remain the highest-control safety candidate.'
)

for (const profile of REALTIME_USAGE_PROFILES) {
  for (const modelId of MODEL_ORDER) {
    const estimate = estimateRealtimeModelCost(modelId, profile)
    assert(Number.isFinite(estimate.total) && estimate.total >= 0, `Bad estimate for ${modelId}/${profile.id}`)
  }
}

writeReport()

console.log(
  JSON.stringify(
    {
      ok: true,
      strategies: strategies.length,
      models: MODEL_ORDER.length,
      profiles: REALTIME_USAGE_PROFILES.length,
      reportPath: REPORT_PATH,
    },
    null,
    2
  )
)
