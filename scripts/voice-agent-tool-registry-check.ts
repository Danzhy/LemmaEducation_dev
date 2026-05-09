import { readFileSync } from 'node:fs'
import { createVoiceAgentTools } from '../lib/voice-agent/tools'

type ToolLike = {
  name?: unknown
  description?: unknown
  strict?: unknown
  parameters?: {
    type?: unknown
    additionalProperties?: unknown
    properties?: Record<string, unknown>
    required?: unknown
  }
}

const REQUIRED_TOOL_NAMES = [
  'curriculum_coach',
  'curriculum_context',
  'curriculum_search',
  'learner_context',
  'adaptive_review_plan',
  'session_mastery_snapshot',
  'exit_ticket_builder',
  'tutor_turn_audit',
  'tutor_response_planner',
  'board_state_summarizer',
  'short_spoken_turn_formatter',
  'voice_interruption_recovery_plan',
  'student_check_question',
  'safety_boundary_check',
  'socratic_move_planner',
  'tutor_teaching_sequence',
  'answer_disclosure_gate',
  'board_animation_plan',
  'problem_understanding_map',
  'representation_bridge',
  'worked_example_fader',
  'word_problem_plan',
  'mistake_pattern_classifier',
  'misconception_diagnosis',
  'next_step_coach',
  'hint_ladder',
  'practice_set_generator',
  'math_calculate',
  'math_check_step',
  'math_check_answer',
  'math_solve_linear',
  'fraction_simplify',
  'common_denominator',
  'percent_of_number',
  'unit_rate',
  'decimal_compare',
  'round_number',
  'integer_operation_scene',
  'graph_function',
  'percent_bar',
  'double_number_line',
  'fraction_operation',
  'coordinate_distance',
  'write_on_canvas',
] as const

const EXPECTED_CANVAS_ACTION_TYPES = [
  'clear_tool_layer',
  'place_text_label',
  'place_math_block',
  'place_point',
  'draw_line_segment',
  'draw_axes',
  'draw_rectangle',
  'highlight_region',
  'plot_polyline',
  'coordinate_plane',
] as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function getToolName(tool: ToolLike) {
  assert(typeof tool.name === 'string' && tool.name.length > 0, 'Every tool needs a name.')
  return tool.name
}

const tools = createVoiceAgentTools() as ToolLike[]
const names = tools.map(getToolName)
const uniqueNames = new Set(names)

assert(tools.length >= 40, `Expected a broad grade 3 to 7 tool suite. Found only ${tools.length} tools.`)
assert(uniqueNames.size === names.length, 'Voice agent tool names must be unique.')

for (const requiredTool of REQUIRED_TOOL_NAMES) {
  assert(uniqueNames.has(requiredTool), `Missing required voice agent tool: ${requiredTool}`)
}

for (const tool of tools) {
  const name = getToolName(tool)
  assert(/^[a-z][a-z0-9_]*$/.test(name), `Tool name must be snake_case: ${name}`)
  assert(tool.strict === true, `${name} must use strict schema mode.`)
  assert(
    typeof tool.description === 'string' && tool.description.trim().length >= 32,
    `${name} needs a useful description for tool routing.`
  )
  assert(tool.parameters?.type === 'object', `${name} parameters must be an object schema.`)
  assert(tool.parameters.additionalProperties === false, `${name} must reject extra top-level fields.`)
  assert(tool.parameters.properties && typeof tool.parameters.properties === 'object', `${name} must define properties.`)

  const propertyNames = Object.keys(tool.parameters.properties)
  const required = Array.isArray(tool.parameters.required) ? tool.parameters.required : []
  for (const propertyName of propertyNames) {
    assert(required.includes(propertyName), `${name}.${propertyName} must be required in strict mode.`)
  }
}

const canvasTool = tools.find((tool) => tool.name === 'canvas_action')
assert(canvasTool, 'canvas_action tool must stay registered.')
const canvasActionType = canvasTool.parameters?.properties?.actionType as { enum?: unknown } | undefined
assert(Array.isArray(canvasActionType?.enum), 'canvas_action.actionType must be an enum allowlist.')
assert(
  JSON.stringify([...canvasActionType.enum].sort()) === JSON.stringify([...EXPECTED_CANVAS_ACTION_TYPES].sort()),
  'canvas_action.actionType enum drifted from the safe structured action allowlist.'
)

const instructionSource = readFileSync(new URL('../app/api/voice-agent/session/route.ts', import.meta.url), 'utf8')
for (const toolName of names) {
  assert(
    instructionSource.includes(toolName),
    `Lab instructions should mention ${toolName} so routing stays discoverable.`
  )
}

console.log(`Voice agent tool registry check passed (${tools.length} tools).`)
