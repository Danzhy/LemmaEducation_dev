export type LiveKitPipelineModelProvider =
  | 'openai_responses'
  | 'openai_chat'
  | 'openrouter_compatible'
  | 'groq_compatible'

export type LiveKitPipelineModelId =
  | 'openai-gpt-5-4'
  | 'openai-gpt-4-1'
  | 'openrouter-custom'
  | 'groq-gpt-oss-120b'

export type LiveKitPipelineModelOption = {
  id: LiveKitPipelineModelId
  label: string
  shortLabel: string
  provider: LiveKitPipelineModelProvider
  model: string
  description: string
  requiredEnv: string[]
  experimental?: boolean
}

export type ResolvedLiveKitPipelineModel = LiveKitPipelineModelOption & {
  requested: string | null
  usedFallback: boolean
  configured: boolean
  missing: string[]
}

export const LIVEKIT_PIPELINE_DEFAULT_MODEL_ID: LiveKitPipelineModelId = 'openai-gpt-5-4'

export function getLiveKitPipelineAgentName() {
  return process.env.LIVEKIT_PIPELINE_AGENT_NAME?.trim() || 'lemma-livekit-pipeline-tutor'
}

const OPENROUTER_MODEL_FALLBACK = 'openai/gpt-oss-120b'

export const LIVEKIT_PIPELINE_MODEL_OPTIONS: LiveKitPipelineModelOption[] = [
  {
    id: 'openai-gpt-5-4',
    label: 'GPT-5.4',
    shortLabel: 'GPT-5.4',
    provider: 'openai_responses',
    model: 'gpt-5.4',
    description: 'Best OpenAI text reasoning brain for the STT to LLM to TTS LiveKit pipeline.',
    requiredEnv: ['OPENAI_API_KEY'],
  },
  {
    id: 'openai-gpt-4-1',
    label: 'GPT-4.1',
    shortLabel: 'GPT-4.1',
    provider: 'openai_chat',
    model: 'gpt-4.1',
    description: 'Lower-cost OpenAI baseline for comparing pipeline latency and tool behavior.',
    requiredEnv: ['OPENAI_API_KEY'],
  },
  {
    id: 'openrouter-custom',
    label: 'OpenRouter custom',
    shortLabel: 'OpenRouter',
    provider: 'openrouter_compatible',
    model: process.env.OPENROUTER_LIVEKIT_MODEL?.trim() || OPENROUTER_MODEL_FALLBACK,
    description: 'OpenAI-compatible LLM through OpenRouter. Set OPENROUTER_LIVEKIT_MODEL to override the default model.',
    requiredEnv: ['OPENROUTER_API_KEY'],
    experimental: true,
  },
  {
    id: 'groq-gpt-oss-120b',
    label: 'Groq GPT-OSS 120B',
    shortLabel: 'Groq OSS',
    provider: 'groq_compatible',
    model: 'openai/gpt-oss-120b',
    description: 'Fast OpenAI-compatible open-weight baseline through Groq.',
    requiredEnv: ['GROQ_API_KEY'],
    experimental: true,
  },
]

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim())
}

function isPipelineModelId(value: string | null): value is LiveKitPipelineModelId {
  return LIVEKIT_PIPELINE_MODEL_OPTIONS.some((option) => option.id === value)
}

export function resolveLiveKitPipelineModel(requested: string | undefined | null): ResolvedLiveKitPipelineModel {
  const normalized = requested?.trim() || null
  const selected = isPipelineModelId(normalized)
    ? LIVEKIT_PIPELINE_MODEL_OPTIONS.find((option) => option.id === normalized)
    : null
  const fallback = LIVEKIT_PIPELINE_MODEL_OPTIONS.find(
    (option) => option.id === LIVEKIT_PIPELINE_DEFAULT_MODEL_ID
  )!
  const option = selected ?? fallback
  const missing = option.requiredEnv.filter((name) => !hasEnv(name))

  return {
    ...option,
    requested: normalized,
    usedFallback: Boolean(normalized && !selected),
    configured: missing.length === 0,
    missing,
  }
}

export function listLiveKitPipelineModelOptions() {
  return LIVEKIT_PIPELINE_MODEL_OPTIONS.map((option) => {
    const missing = option.requiredEnv.filter((name) => !hasEnv(name))
    return {
      ...option,
      configured: missing.length === 0,
      missing,
    }
  })
}
