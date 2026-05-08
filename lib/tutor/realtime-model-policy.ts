export type OpenAIRealtimeModelId =
  | 'gpt-realtime-2'
  | 'gpt-realtime-1.5'
  | 'gpt-realtime-mini'
  | 'gpt-4o-realtime-preview'

export type RealtimeModelProfile = {
  id: OpenAIRealtimeModelId
  label: string
  role: 'best_tool_use' | 'balanced' | 'low_cost' | 'legacy'
  notes: string
}

export type ResolvedRealtimeModel = RealtimeModelProfile & {
  requested: string | null
  usedFallback: boolean
}

const OPENAI_REALTIME_MODELS: Record<OpenAIRealtimeModelId, RealtimeModelProfile> = {
  'gpt-realtime-2': {
    id: 'gpt-realtime-2',
    label: 'GPT Realtime 2',
    role: 'best_tool_use',
    notes: 'Use for the hidden lab when evaluating tool-heavy human-tutor behavior.',
  },
  'gpt-realtime-1.5': {
    id: 'gpt-realtime-1.5',
    label: 'GPT Realtime 1.5',
    role: 'balanced',
    notes: 'Balanced speech-to-speech model and the previous lab default.',
  },
  'gpt-realtime-mini': {
    id: 'gpt-realtime-mini',
    label: 'GPT Realtime mini',
    role: 'low_cost',
    notes: 'Use for cost and latency comparisons when the task does not need the strongest reasoning.',
  },
  'gpt-4o-realtime-preview': {
    id: 'gpt-4o-realtime-preview',
    label: 'GPT-4o Realtime preview',
    role: 'legacy',
    notes: 'Legacy compatibility option only.',
  },
}

function normalizeModelId(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

export function listOpenAIRealtimeModels() {
  return Object.values(OPENAI_REALTIME_MODELS)
}

export function resolveOpenAIRealtimeModel(
  requested: string | undefined | null,
  fallback: OpenAIRealtimeModelId = 'gpt-realtime-2'
): ResolvedRealtimeModel {
  const normalized = normalizeModelId(requested)
  const knownModel = normalized
    ? OPENAI_REALTIME_MODELS[normalized as OpenAIRealtimeModelId]
    : null
  const fallbackModel = OPENAI_REALTIME_MODELS[fallback] ?? OPENAI_REALTIME_MODELS['gpt-realtime-2']

  return {
    ...(knownModel ?? fallbackModel),
    requested: normalized,
    usedFallback: Boolean(normalized && !knownModel),
  }
}
