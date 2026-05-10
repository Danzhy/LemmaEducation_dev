export type LiveKitPipelineModelProvider =
  | 'openai_responses'
  | 'openai_chat'
  | 'openrouter_compatible'
  | 'groq_compatible'

export type LiveKitPipelineModelId = string

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
const OPENROUTER_REQUIRED_ENV = ['OPENROUTER_API_KEY']

function openRouterOption({
  id,
  label,
  shortLabel,
  model,
  description,
  experimental = true,
}: {
  id: string
  label: string
  shortLabel: string
  model: string
  description: string
  experimental?: boolean
}): LiveKitPipelineModelOption {
  return {
    id,
    label,
    shortLabel,
    provider: 'openrouter_compatible',
    model,
    description,
    requiredEnv: OPENROUTER_REQUIRED_ENV,
    experimental,
  }
}

export const LIVEKIT_PIPELINE_MODEL_OPTIONS: LiveKitPipelineModelOption[] = [
  {
    id: 'openai-gpt-5-4',
    label: 'GPT-5.4',
    shortLabel: 'GPT-5.4',
    provider: 'openai_responses',
    model: 'gpt-5.4',
    description: 'Best for careful step-by-step tutoring and harder word problems.',
    requiredEnv: ['OPENAI_API_KEY'],
  },
  {
    id: 'openai-gpt-4-1',
    label: 'GPT-4.1',
    shortLabel: 'GPT-4.1',
    provider: 'openai_chat',
    model: 'gpt-4.1',
    description: 'Solid all-around tutor for quick explanations and guided practice.',
    requiredEnv: ['OPENAI_API_KEY'],
  },
  openRouterOption({
    id: 'openrouter-gpt-5-5',
    label: 'OpenRouter GPT-5.5',
    shortLabel: 'OR GPT-5.5',
    model: 'openai/gpt-5.5',
    description: 'Strong reasoning option for multi-step problems and precise hints.',
  }),
  openRouterOption({
    id: 'openrouter-gpt-5-4',
    label: 'OpenRouter GPT-5.4',
    shortLabel: 'OR GPT-5.4',
    model: 'openai/gpt-5.4',
    description: 'Careful tutoring style for algebra, fractions, and word problems.',
  }),
  openRouterOption({
    id: 'openrouter-gpt-5-4-mini',
    label: 'OpenRouter GPT-5.4 Mini',
    shortLabel: 'OR GPT Mini',
    model: 'openai/gpt-5.4-mini',
    description: 'Faster option for short hints, checks, and practice support.',
  }),
  openRouterOption({
    id: 'openrouter-gpt-oss-120b',
    label: 'OpenRouter GPT-OSS 120B',
    shortLabel: 'OR GPT-OSS',
    model: 'openai/gpt-oss-120b',
    description: 'Open model option for testing clear explanations at lower cost.',
  }),
  openRouterOption({
    id: 'openrouter-llama-4-maverick',
    label: 'OpenRouter Llama 4 Maverick',
    shortLabel: 'OR Llama 4',
    model: 'meta-llama/llama-4-maverick',
    description: 'Useful for comparing visual reasoning and Socratic explanations.',
  }),
  openRouterOption({
    id: 'openrouter-llama-3-3-70b',
    label: 'OpenRouter Llama 3.3 70B',
    shortLabel: 'OR Llama 70B',
    model: 'meta-llama/llama-3.3-70b-instruct',
    description: 'Reliable open model for grade-school math explanations.',
  }),
  openRouterOption({
    id: 'openrouter-qwen-3-6-35b',
    label: 'OpenRouter Qwen3.6 35B',
    shortLabel: 'OR Qwen 35B',
    model: 'qwen/qwen3.6-35b-a3b',
    description: 'Efficient reasoning option for arithmetic, algebra, and checking steps.',
  }),
  openRouterOption({
    id: 'openrouter-qwen-3-5-122b',
    label: 'OpenRouter Qwen3.5 122B',
    shortLabel: 'OR Qwen 122B',
    model: 'qwen/qwen3.5-122b-a10b',
    description: 'Larger reasoning option for harder multi-step word problems.',
  }),
  openRouterOption({
    id: 'openrouter-deepseek-v3-2',
    label: 'OpenRouter DeepSeek V3.2',
    shortLabel: 'OR DeepSeek',
    model: 'deepseek/deepseek-v3.2',
    description: 'Strong reasoning option for checking work and planning hints.',
  }),
  openRouterOption({
    id: 'openrouter-mistral-small-4',
    label: 'OpenRouter Mistral Small 4',
    shortLabel: 'OR Mistral',
    model: 'mistralai/mistral-small-2603',
    description: 'Fast option for short, responsive tutoring turns.',
  }),
  openRouterOption({
    id: 'openrouter-gemma-4-31b-free',
    label: 'OpenRouter Gemma 4 31B Free',
    shortLabel: 'OR Gemma',
    model: 'google/gemma-4-31b-it:free',
    description: 'Lightweight option for quick local checks and simple practice.',
  }),
  openRouterOption({
    id: 'openrouter-kimi-k2-6',
    label: 'OpenRouter Kimi K2.6',
    shortLabel: 'OR Kimi',
    model: 'moonshotai/kimi-k2.6',
    description: 'Alternative reasoning style for comparing explanations and hints.',
  }),
  openRouterOption({
    id: 'openrouter-claude-sonnet-4-6',
    label: 'OpenRouter Claude Sonnet 4.6',
    shortLabel: 'OR Sonnet',
    model: 'anthropic/claude-sonnet-4.6',
    description: 'Premium comparison option for clear guidance and safety behavior.',
  }),
  openRouterOption({
    id: 'openrouter-gemini-3-1-flash-lite',
    label: 'OpenRouter Gemini 3.1 Flash Lite',
    shortLabel: 'OR Gemini',
    model: 'google/gemini-3.1-flash-lite',
    description: 'Low-latency comparison option for quick back-and-forth tutoring.',
  }),
  openRouterOption({
    id: 'openrouter-custom',
    label: 'OpenRouter custom',
    shortLabel: 'OpenRouter',
    model: process.env.OPENROUTER_LIVEKIT_MODEL?.trim() || OPENROUTER_MODEL_FALLBACK,
    description: 'Custom model option for local experiments.',
  }),
  {
    id: 'groq-gpt-oss-120b',
    label: 'Groq GPT-OSS 120B',
    shortLabel: 'Groq OSS',
    provider: 'groq_compatible',
    model: 'openai/gpt-oss-120b',
    description: 'Fast open model option for responsive tutoring experiments.',
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
