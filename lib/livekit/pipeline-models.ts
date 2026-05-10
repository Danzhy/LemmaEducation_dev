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
  openRouterOption({
    id: 'openrouter-gpt-5-5',
    label: 'OpenRouter GPT-5.5',
    shortLabel: 'OR GPT-5.5',
    model: 'openai/gpt-5.5',
    description: 'Current high-capability GPT baseline through OpenRouter for model-to-model comparisons.',
  }),
  openRouterOption({
    id: 'openrouter-gpt-5-4',
    label: 'OpenRouter GPT-5.4',
    shortLabel: 'OR GPT-5.4',
    model: 'openai/gpt-5.4',
    description: 'OpenRouter-hosted GPT-5.4 route for comparing provider latency and tool behavior.',
  }),
  openRouterOption({
    id: 'openrouter-gpt-5-4-mini',
    label: 'OpenRouter GPT-5.4 Mini',
    shortLabel: 'OR GPT Mini',
    model: 'openai/gpt-5.4-mini',
    description: 'Cheaper GPT-family baseline for quick tutoring turns and latency experiments.',
  }),
  openRouterOption({
    id: 'openrouter-gpt-oss-120b',
    label: 'OpenRouter GPT-OSS 120B',
    shortLabel: 'OR GPT-OSS',
    model: 'openai/gpt-oss-120b',
    description: 'Open-weight OpenAI model for checking whether a lower-cost reasoning model can tutor well.',
  }),
  openRouterOption({
    id: 'openrouter-llama-4-maverick',
    label: 'OpenRouter Llama 4 Maverick',
    shortLabel: 'OR Llama 4',
    model: 'meta-llama/llama-4-maverick',
    description: 'Large Meta open-weight baseline for visual reasoning style and Socratic tutoring quality.',
  }),
  openRouterOption({
    id: 'openrouter-llama-3-3-70b',
    label: 'OpenRouter Llama 3.3 70B',
    shortLabel: 'OR Llama 70B',
    model: 'meta-llama/llama-3.3-70b-instruct',
    description: 'Reliable open-weight instruction baseline for grade-school math tutoring comparisons.',
  }),
  openRouterOption({
    id: 'openrouter-qwen-3-6-35b',
    label: 'OpenRouter Qwen3.6 35B',
    shortLabel: 'OR Qwen 35B',
    model: 'qwen/qwen3.6-35b-a3b',
    description: 'Efficient open-weight reasoning baseline for arithmetic, algebra, and explanation quality.',
  }),
  openRouterOption({
    id: 'openrouter-qwen-3-5-122b',
    label: 'OpenRouter Qwen3.5 122B',
    shortLabel: 'OR Qwen 122B',
    model: 'qwen/qwen3.5-122b-a10b',
    description: 'Larger Qwen reasoning baseline for harder multi-step word problems.',
  }),
  openRouterOption({
    id: 'openrouter-deepseek-v3-2',
    label: 'OpenRouter DeepSeek V3.2',
    shortLabel: 'OR DeepSeek',
    model: 'deepseek/deepseek-v3.2',
    description: 'Strong open-model reasoning baseline for step checks and tutoring plans.',
  }),
  openRouterOption({
    id: 'openrouter-mistral-small-4',
    label: 'OpenRouter Mistral Small 4',
    shortLabel: 'OR Mistral',
    model: 'mistralai/mistral-small-2603',
    description: 'Fast open-weight baseline for low-latency tutor responses.',
  }),
  openRouterOption({
    id: 'openrouter-gemma-4-31b-free',
    label: 'OpenRouter Gemma 4 31B Free',
    shortLabel: 'OR Gemma',
    model: 'google/gemma-4-31b-it:free',
    description: 'Free open-weight baseline for cheap smoke testing and early model trials.',
  }),
  openRouterOption({
    id: 'openrouter-kimi-k2-6',
    label: 'OpenRouter Kimi K2.6',
    shortLabel: 'OR Kimi',
    model: 'moonshotai/kimi-k2.6',
    description: 'Alternative reasoning baseline for comparing explanation style and tool use.',
  }),
  openRouterOption({
    id: 'openrouter-claude-sonnet-4-6',
    label: 'OpenRouter Claude Sonnet 4.6',
    shortLabel: 'OR Sonnet',
    model: 'anthropic/claude-sonnet-4.6',
    description: 'Premium non-GPT comparison model for tutoring style and safety behavior.',
  }),
  openRouterOption({
    id: 'openrouter-gemini-3-1-flash-lite',
    label: 'OpenRouter Gemini 3.1 Flash Lite',
    shortLabel: 'OR Gemini',
    model: 'google/gemini-3.1-flash-lite',
    description: 'Low-latency non-GPT comparison model for quick voice turns.',
  }),
  openRouterOption({
    id: 'openrouter-custom',
    label: 'OpenRouter custom',
    shortLabel: 'OpenRouter',
    model: process.env.OPENROUTER_LIVEKIT_MODEL?.trim() || OPENROUTER_MODEL_FALLBACK,
    description: 'OpenAI-compatible route through OpenRouter. Set OPENROUTER_LIVEKIT_MODEL to override the default.',
  }),
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
