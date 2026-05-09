import type { Tool } from '@openai/agents'
import { createVoiceAgentTools } from '@/lib/voice-agent/tools'
import {
  getCurriculumSearchUserId,
  searchCurriculumForUser,
} from '@/lib/curriculum/search'
import {
  buildCurriculumContextToolResult,
  getLabTutorCurriculumContextPackForUser,
} from '@/lib/curriculum/context'
import {
  getLearnerContextForUser,
  getLearnerContextUserId,
} from '@/lib/tutor/learner-context'

const MAX_TOOL_INPUT_BYTES = 12_000
const MAX_SCHEMA_ARRAY_ITEMS = 64

type ToolWithInvoke = Tool & {
  invoke?: (context: unknown, input: string) => Promise<string>
  parameters?: JsonSchemaObject
}

export type LiveKitToolRunContext = {
  userId?: string | null
  sessionId?: string | null
}

let toolRegistry: Map<string, ToolWithInvoke> | null = null

type JsonSchemaObject = {
  type?: unknown
  enum?: unknown
  minimum?: unknown
  maximum?: unknown
  exclusiveMinimum?: unknown
  exclusiveMaximum?: unknown
  minLength?: unknown
  maxLength?: unknown
  minItems?: unknown
  maxItems?: unknown
  additionalProperties?: unknown
  properties?: Record<string, JsonSchemaObject | boolean>
  required?: unknown
  items?: JsonSchemaObject | boolean | Array<JsonSchemaObject | boolean>
  anyOf?: Array<JsonSchemaObject | boolean>
  oneOf?: Array<JsonSchemaObject | boolean>
  allOf?: Array<JsonSchemaObject | boolean>
}

function jsonByteLength(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function getToolRegistry() {
  if (!toolRegistry) {
    const registry = new Map(
      (createVoiceAgentTools() as ToolWithInvoke[]).map((toolDef) => [toolDef.name, toolDef])
    )
    registry.set('curriculum_context', createCurriculumContextTool())
    registry.set('curriculum_search', createCurriculumSearchTool())
    registry.set('learner_context', createLearnerContextTool())
    toolRegistry = registry
  }
  return toolRegistry
}

function schemaTypeIncludes(schema: JsonSchemaObject, expectedType: string) {
  return schema.type === expectedType || (Array.isArray(schema.type) && schema.type.includes(expectedType))
}

function getSchemaTypes(schema: JsonSchemaObject) {
  if (typeof schema.type === 'string') return [schema.type]
  if (Array.isArray(schema.type)) return schema.type.filter((type): type is string => typeof type === 'string')
  return []
}

function valueMatchesSchemaType(value: unknown, type: string) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'null') return value === null
  return true
}

function formatExpectedSchemaTypes(types: string[]) {
  if (types.includes('number')) return 'a finite number'
  if (types.includes('integer')) return 'an integer'
  if (types.includes('array')) return 'an array'
  if (types.includes('object')) return 'a JSON object'
  if (types.includes('string')) return 'a string'
  if (types.includes('boolean')) return 'a boolean'
  if (types.includes('null')) return 'null'
  return `one of: ${types.join(', ')}`
}

function formatToolInputPath(path: Array<string | number>) {
  if (path.length === 0) return ''
  return path
    .map((part) => {
      if (typeof part === 'number') return `[${part}]`
      return /^[A-Za-z_$][\w$]*$/.test(part) ? `.${part}` : `[${JSON.stringify(part)}]`
    })
    .join('')
}

function formatToolInputField(path: Array<string | number>) {
  const formattedPath = formatToolInputPath(path)
  return formattedPath ? ` field${formattedPath}` : ''
}

function formatEnumValues(values: unknown) {
  return Array.isArray(values)
    ? values
        .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
        .join(', ')
    : ''
}

function finiteSchemaNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeSchemaInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function getRequiredProperties(schema: JsonSchemaObject) {
  return Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string')
    : []
}

function schemaAllowsNull(schema: JsonSchemaObject | boolean | undefined): boolean {
  if (!schema || typeof schema === 'boolean') return false
  if (schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null'))) {
    return true
  }
  return [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(schemaAllowsNull)
}

function assertSchemaVariants(
  label: 'anyOf' | 'oneOf',
  schemas: Array<JsonSchemaObject | boolean> | undefined,
  value: unknown,
  path: Array<string | number>
) {
  if (!schemas?.length) return
  const errors: Error[] = []
  for (const variant of schemas) {
    try {
      assertAllowedSchemaProperties(variant, value, path)
      return
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error('Schema variant did not match.'))
    }
  }

  throw errors[0] ?? new Error(`Tool input${formatToolInputField(path)} does not match an allowed ${label} schema.`)
}

function assertAllowedSchemaProperties(
  schema: JsonSchemaObject | boolean | undefined,
  value: unknown,
  path: Array<string | number> = []
) {
  if (!schema || typeof schema === 'boolean') return

  assertSchemaVariants('anyOf', schema.anyOf, value, path)
  assertSchemaVariants('oneOf', schema.oneOf, value, path)
  for (const variant of schema.allOf ?? []) {
    assertAllowedSchemaProperties(variant, value, path)
  }

  const types = getSchemaTypes(schema)
  if (types.length > 0 && !types.some((type) => valueMatchesSchemaType(value, type))) {
    throw new Error(
      `Tool input${formatToolInputField(path)} must be ${formatExpectedSchemaTypes(types)}.`
    )
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((option) => Object.is(option, value))) {
    throw new Error(
      `Tool input${formatToolInputField(path)} must be one of: ${formatEnumValues(schema.enum)}.`
    )
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const minimum = finiteSchemaNumber(schema.minimum)
    if (minimum !== null && value < minimum) {
      throw new Error(`Tool input${formatToolInputField(path)} must be at least ${minimum}.`)
    }

    const maximum = finiteSchemaNumber(schema.maximum)
    if (maximum !== null && value > maximum) {
      throw new Error(`Tool input${formatToolInputField(path)} must be at most ${maximum}.`)
    }

    const exclusiveMinimum = finiteSchemaNumber(schema.exclusiveMinimum)
    if (exclusiveMinimum !== null && value <= exclusiveMinimum) {
      throw new Error(`Tool input${formatToolInputField(path)} must be greater than ${exclusiveMinimum}.`)
    }

    const exclusiveMaximum = finiteSchemaNumber(schema.exclusiveMaximum)
    if (exclusiveMaximum !== null && value >= exclusiveMaximum) {
      throw new Error(`Tool input${formatToolInputField(path)} must be less than ${exclusiveMaximum}.`)
    }
  }

  if (typeof value === 'string') {
    const minLength = nonNegativeSchemaInteger(schema.minLength)
    if (minLength !== null && value.length < minLength) {
      throw new Error(`Tool input${formatToolInputField(path)} must be at least ${minLength} characters.`)
    }

    const maxLength = nonNegativeSchemaInteger(schema.maxLength)
    if (maxLength !== null && value.length > maxLength) {
      throw new Error(`Tool input${formatToolInputField(path)} must be at most ${maxLength} characters.`)
    }
  }

  if (schemaTypeIncludes(schema, 'object')) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      if (path.length === 0) throw new Error('Tool input must be a JSON object.')
      return
    }

    if (schema.additionalProperties === false) {
      const allowedProperties = new Set(Object.keys(schema.properties ?? {}))
      const unknownProperties = Object.keys(value as Record<string, unknown>).filter(
        (key) => !allowedProperties.has(key)
      )

      if (unknownProperties.length > 0) {
        throw new Error(
          `Tool input contains unsupported field${formatToolInputPath([...path, unknownProperties[0]])}.`
        )
      }
    }

    const requiredProperties = getRequiredProperties(schema).filter(
      (key) => !schemaAllowsNull(schema.properties?.[key])
    )
    const missingRequiredProperty = requiredProperties.find(
      (key) => !Object.prototype.hasOwnProperty.call(value, key)
    )
    if (missingRequiredProperty) {
      throw new Error(
        `Tool input is missing required field${formatToolInputPath([...path, missingRequiredProperty])}.`
      )
    }

    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        assertAllowedSchemaProperties(childSchema, (value as Record<string, unknown>)[key], [...path, key])
      }
    }
    return
  }

  if (schemaTypeIncludes(schema, 'array') && Array.isArray(value)) {
    const minItems = nonNegativeSchemaInteger(schema.minItems)
    if (minItems !== null && value.length < minItems) {
      throw new Error(
        `Tool input${formatToolInputField(path)} needs at least ${minItems} items.`
      )
    }

    const maxItems = nonNegativeSchemaInteger(schema.maxItems) ?? MAX_SCHEMA_ARRAY_ITEMS
    if (value.length > maxItems) {
      throw new Error(
        `Tool input${formatToolInputField(path)} has too many items (${value.length} > ${maxItems}).`
      )
    }

    const itemSchemas = Array.isArray(schema.items) ? schema.items : schema.items ? [schema.items] : []
    if (itemSchemas.length === 0) return

    value.forEach((item, index) => {
      const itemSchema = itemSchemas[Math.min(index, itemSchemas.length - 1)]
      assertAllowedSchemaProperties(itemSchema, item, [...path, index])
    })
  }
}

function assertAllowedToolInputProperties(toolDef: ToolWithInvoke, input: unknown) {
  assertAllowedSchemaProperties(toolDef.parameters, input)
}

function createCurriculumContextTool(): ToolWithInvoke {
  return {
    name: 'curriculum_context',
    description:
      'Load the active teacher-created tutor profile and available curriculum document titles for this signed-in student or teacher. Use this before curriculum-specific tutoring, local typed lab planning, or when deciding how a custom class tutor should adapt vocabulary, pacing, and examples.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: {
          type: 'string',
          description: 'Why the tutor needs curriculum context for this turn.',
        },
      },
      required: ['reason'],
    },
    async invoke(context: unknown) {
      const runContext = (context ?? {}) as LiveKitToolRunContext
      const userId = await getCurriculumSearchUserId(runContext)
      if (!userId) {
        throw new Error('Curriculum context needs a signed-in user or tutor session context.')
      }

      const pack = await getLabTutorCurriculumContextPackForUser(userId)
      return JSON.stringify(buildCurriculumContextToolResult(pack))
    },
  } as unknown as ToolWithInvoke
}

function createLearnerContextTool(): ToolWithInvoke {
  return {
    name: 'learner_context',
    description:
      'Load concise recent tutoring history for this signed-in learner: recent topics, struggle signals, structured misconception timeline, useful tools, and suggested tutor adjustments. Use this when the student says "last time", asks to continue, asks what they struggle with, or when adapting a review session without exposing old private history verbatim.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional active tutor session id so the server can exclude the current session from history.',
        },
        reason: {
          type: 'string',
          description: 'Why learner history is relevant for this tutoring turn.',
        },
      },
      required: ['sessionId', 'reason'],
    },
    async invoke(context: unknown, input: string) {
      const parsed = JSON.parse(input || '{}') as {
        sessionId?: unknown
        reason?: unknown
      }
      const runContext = (context ?? {}) as LiveKitToolRunContext
      const sessionId = typeof parsed.sessionId === 'string' && parsed.sessionId ? parsed.sessionId : runContext.sessionId
      const userId = await getLearnerContextUserId({
        userId: runContext.userId,
        sessionId,
      })
      if (!userId) {
        throw new Error('Learner context needs a signed-in user or tutor session context.')
      }

      const result = await getLearnerContextForUser({
        userId,
        sessionId,
      })
      return JSON.stringify({
        ...result,
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : '',
      })
    },
  } as unknown as ToolWithInvoke
}

function createCurriculumSearchTool(): ToolWithInvoke {
  return {
    name: 'curriculum_search',
    description:
      'Search teacher-uploaded curriculum notes, lesson text, or classroom instructions before answering a curriculum-specific math question. Use this when the student asks about uploaded material, class vocabulary, homework directions, or the teacher custom agent profile.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'A concise math topic, lesson phrase, homework question, or curriculum lookup query.',
        },
        classroomId: {
          type: 'string',
          description: 'Optional classroom id when the lab session is scoped to one class.',
        },
        limit: {
          type: 'number',
          description: 'Optional result count. Keep this small.',
        },
      },
      required: ['query', 'classroomId', 'limit'],
    },
    async invoke(context: unknown, input: string) {
      const parsed = JSON.parse(input || '{}') as {
        query?: unknown
        classroomId?: unknown
        limit?: unknown
      }
      const runContext = (context ?? {}) as LiveKitToolRunContext
      const userId = await getCurriculumSearchUserId(runContext)
      if (!userId) {
        throw new Error('Curriculum search needs a signed-in user or tutor session context.')
      }

      const result = await searchCurriculumForUser({
        userId,
        query: typeof parsed.query === 'string' ? parsed.query : '',
        classroomId: typeof parsed.classroomId === 'string' ? parsed.classroomId : null,
        limit: typeof parsed.limit === 'number' ? parsed.limit : undefined,
      })
      return JSON.stringify(result)
    },
  } as ToolWithInvoke
}

export function getLiveKitToolDefinitions() {
  return [...getToolRegistry().values()]
}

export function getLiveKitToolNames() {
  return [...getToolRegistry().keys()].sort()
}

export async function runLiveKitTutorToolWithMetrics(
  toolName: string,
  input: unknown,
  context: LiveKitToolRunContext = {}
) {
  const toolDef = getToolRegistry().get(toolName)
  if (!toolDef?.invoke) {
    throw new Error(`Unsupported LiveKit tutor tool: ${toolName}`)
  }

  const payload = JSON.stringify(input ?? {})
  const inputBytes = new TextEncoder().encode(payload).length
  if (inputBytes > MAX_TOOL_INPUT_BYTES) {
    throw new Error('Tool input is too large for the LiveKit lab.')
  }

  assertAllowedToolInputProperties(toolDef, input ?? {})

  const startedAt = Date.now()
  const rawResult = await toolDef.invoke(context, payload)
  const durationMs = Date.now() - startedAt
  let output: unknown
  try {
    output = JSON.parse(rawResult)
  } catch {
    output = rawResult
  }

  return {
    output,
    metrics: {
      durationMs,
      inputBytes,
      outputBytes: jsonByteLength(output),
    },
  }
}

export async function runLiveKitTutorTool(
  toolName: string,
  input: unknown,
  context: LiveKitToolRunContext = {}
) {
  const { output } = await runLiveKitTutorToolWithMetrics(toolName, input, context)
  return output
}
