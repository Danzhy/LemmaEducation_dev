import { createVoiceAgentTools } from '../lib/voice-agent/tools'
import { curriculumCoach } from '../lib/voice-agent/math-engine'

const TOPICS = [
  'place_value',
  'multiplication_division',
  'fractions',
  'decimals_percents',
  'ratios_rates',
  'expressions_equations',
  'geometry_measurement',
  'coordinate_graphing',
  'data_probability',
] as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const registeredTools = new Set((createVoiceAgentTools() as Array<{ name: string }>).map((tool) => tool.name))

for (const topic of TOPICS) {
  const guide = curriculumCoach({ topic })
  const recommendedTools = [...guide.recommendedTools]

  assert(recommendedTools.length >= 3, `${topic} should recommend at least three teaching tools.`)

  for (const toolName of recommendedTools) {
    assert(registeredTools.has(toolName), `${topic} recommends missing tool: ${toolName}`)
  }

  assert(
    guide.prerequisiteCheck.length > 0 && guide.likelyMisconceptions.length > 0,
    `${topic} needs prerequisites and likely misconceptions for tutoring context.`
  )
}

console.log(`Voice agent curriculum coverage check passed (${TOPICS.length} topics).`)
