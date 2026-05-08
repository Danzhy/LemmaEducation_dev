export type RealtimeModelId =
  | 'gpt-realtime-mini'
  | 'gpt-realtime'
  | 'gpt-realtime-1.5'
  | 'gpt-realtime-2'
  | 'gpt-4o-realtime-preview'

export type TutorStrategyId =
  | 'direct-openai-webrtc'
  | 'openai-agents-sdk'
  | 'livekit-worker-realtime'
  | 'typed-tool-preview'

export type UsageProfileId = 'typed-visual-10-turns' | 'voice-10-min-light-board' | 'voice-45-min-classroom'

export type ModelPricing = {
  id: RealtimeModelId
  label: string
  textInputPerMTok: number
  textOutputPerMTok: number
  cachedTextInputPerMTok?: number
  audioInputPerMTok?: number
  audioOutputPerMTok?: number
  imageInputPerMTok?: number
  contextWindow: string
  maxOutputTokens: string
  sourceUrl: string
  notes: string[]
}

export type UsageProfile = {
  id: UsageProfileId
  label: string
  textInputTokens: number
  textOutputTokens: number
  audioInputTokens: number
  audioOutputTokens: number
  imageInputTokens: number
  description: string
}

export type TutorStrategy = {
  id: TutorStrategyId
  label: string
  route: string
  dashboardRoute?: string
  stack: string
  defaultModel: RealtimeModelId | 'env-required'
  modelEnv?: string
  currentModel: string
  transport: string
  toolExecution: string
  productionReadiness: 'stable' | 'lab' | 'candidate' | 'local-preview'
  latencyScore: number
  costScore: number
  safetyScore: number
  implementationScore: number
  recommendation: string
  strengths: string[]
  risks: string[]
  nextSteps: string[]
}

export const REALTIME_MODEL_PRICING: Record<RealtimeModelId, ModelPricing> = {
  'gpt-realtime-mini': {
    id: 'gpt-realtime-mini',
    label: 'GPT Realtime Mini',
    textInputPerMTok: 0.6,
    cachedTextInputPerMTok: 0.06,
    textOutputPerMTok: 2.4,
    audioInputPerMTok: 32,
    audioOutputPerMTok: 64,
    contextWindow: '32K',
    maxOutputTokens: '4,096',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime-mini',
    notes: ['Lowest-cost realtime option in the current OpenAI realtime family.'],
  },
  'gpt-realtime': {
    id: 'gpt-realtime',
    label: 'GPT Realtime',
    textInputPerMTok: 4,
    cachedTextInputPerMTok: 0.4,
    textOutputPerMTok: 16,
    audioInputPerMTok: 32,
    audioOutputPerMTok: 64,
    imageInputPerMTok: 5,
    contextWindow: '32K',
    maxOutputTokens: '4,096',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime',
    notes: ['General availability realtime model for audio and text.'],
  },
  'gpt-realtime-1.5': {
    id: 'gpt-realtime-1.5',
    label: 'GPT Realtime 1.5',
    textInputPerMTok: 4,
    cachedTextInputPerMTok: 0.4,
    textOutputPerMTok: 16,
    audioInputPerMTok: 32,
    audioOutputPerMTok: 64,
    imageInputPerMTok: 5,
    contextWindow: '32K',
    maxOutputTokens: '4,096',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime-1.5',
    notes: ['Current default for the Agents SDK and LiveKit lab paths in this repo.'],
  },
  'gpt-realtime-2': {
    id: 'gpt-realtime-2',
    label: 'GPT Realtime 2',
    textInputPerMTok: 4,
    cachedTextInputPerMTok: 0.4,
    textOutputPerMTok: 24,
    audioInputPerMTok: 32,
    audioOutputPerMTok: 64,
    imageInputPerMTok: 5,
    contextWindow: '128K',
    maxOutputTokens: '32K',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime-2',
    notes: [
      'Most capable realtime voice model in current OpenAI docs.',
      'Best candidate for tool-heavy tutoring pilots if latency is acceptable.',
    ],
  },
  'gpt-4o-realtime-preview': {
    id: 'gpt-4o-realtime-preview',
    label: 'GPT-4o Realtime Preview',
    textInputPerMTok: 5,
    cachedTextInputPerMTok: 2.5,
    textOutputPerMTok: 20,
    audioInputPerMTok: 40,
    audioOutputPerMTok: 80,
    contextWindow: '32K',
    maxOutputTokens: '4,096',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-4o-realtime-preview',
    notes: ['Legacy preview baseline. Keep only for backwards comparison.'],
  },
}

export const REALTIME_USAGE_PROFILES: UsageProfile[] = [
  {
    id: 'typed-visual-10-turns',
    label: 'Typed visual tutoring, 10 turns',
    textInputTokens: 12_000,
    textOutputTokens: 6_000,
    audioInputTokens: 0,
    audioOutputTokens: 0,
    imageInputTokens: 2_000,
    description: 'A student types problems and the tutor uses deterministic board tools without live audio.',
  },
  {
    id: 'voice-10-min-light-board',
    label: 'Voice tutor, 10 minutes',
    textInputTokens: 8_000,
    textOutputTokens: 4_000,
    audioInputTokens: 80_000,
    audioOutputTokens: 35_000,
    imageInputTokens: 2_000,
    description: 'A short spoken tutoring session with a few board snapshots and tool calls.',
  },
  {
    id: 'voice-45-min-classroom',
    label: 'Voice tutor, 45 minutes',
    textInputTokens: 30_000,
    textOutputTokens: 18_000,
    audioInputTokens: 360_000,
    audioOutputTokens: 170_000,
    imageInputTokens: 6_000,
    description: 'A longer after-school or classroom pilot session with sustained voice interaction.',
  },
]

function envValue(name: string | undefined, fallback: string) {
  if (!name) return fallback
  return process.env[name]?.trim() || fallback
}

export function resolveTutorStrategies(): TutorStrategy[] {
  const stableModel = envValue('OPENAI_REALTIME_MODEL', 'env-required')
  const agentsModel = envValue('OPENAI_VOICE_AGENT_MODEL', 'gpt-realtime-1.5')
  const liveKitModel = envValue('OPENAI_LIVEKIT_REALTIME_MODEL', 'gpt-realtime-1.5')

  return [
    {
      id: 'direct-openai-webrtc',
      label: 'Direct OpenAI Realtime',
      route: '/tutor',
      stack: 'Browser WebRTC to OpenAI Realtime via short-lived client secret',
      defaultModel: 'env-required',
      modelEnv: 'OPENAI_REALTIME_MODEL',
      currentModel: stableModel,
      transport: 'WebRTC from browser to OpenAI',
      toolExecution: 'No deterministic server-owned tools in the stable path yet',
      productionReadiness: 'stable',
      latencyScore: 4,
      costScore: stableModel === 'gpt-realtime-mini' ? 5 : 3,
      safetyScore: 3,
      implementationScore: 5,
      recommendation: 'Keep as the reliable fallback while server-owned tool paths mature.',
      strengths: ['Smallest moving-parts surface', 'Existing student flow', 'Fast to debug'],
      risks: ['Harder to enforce tool execution server-side', 'Less observable than worker-owned approaches'],
      nextSteps: ['Set explicit realtime model env per environment', 'Keep route functional but avoid adding complex tools here'],
    },
    {
      id: 'openai-agents-sdk',
      label: 'OpenAI Agents SDK Realtime',
      route: '/tutor-agent-lab',
      dashboardRoute: '/dashboard/tutor-agent-lab',
      stack: 'Browser RealtimeAgent and RealtimeSession with shared tutor workspace',
      defaultModel: 'gpt-realtime-1.5',
      modelEnv: 'OPENAI_VOICE_AGENT_MODEL',
      currentModel: agentsModel,
      transport: 'OpenAI Agents SDK realtime session',
      toolExecution: 'Tool-enabled lab path, fastest place to iterate on prompts and schemas',
      productionReadiness: 'lab',
      latencyScore: 4,
      costScore: agentsModel === 'gpt-realtime-mini' ? 5 : 3,
      safetyScore: 4,
      implementationScore: 4,
      recommendation: 'Use for prompt/tool iteration and model A/B tests, not the school pilot default yet.',
      strengths: ['Very fast iteration loop', 'Close to OpenAI docs model', 'Good for comparing realtime model behavior'],
      risks: ['Browser-side session still needs careful production hardening', 'Less deployment isolation than a worker'],
      nextSteps: ['Add model override testing through env only', 'Keep deterministic board tools tightly schema-limited'],
    },
    {
      id: 'livekit-worker-realtime',
      label: 'LiveKit Worker Agent',
      route: '/tutor-livekit-lab',
      dashboardRoute: '/dashboard/tutor-livekit-lab',
      stack: 'LiveKit room plus server-side worker agent using OpenAI realtime model',
      defaultModel: 'gpt-realtime-1.5',
      modelEnv: 'OPENAI_LIVEKIT_REALTIME_MODEL',
      currentModel: liveKitModel,
      transport: 'WebRTC to LiveKit room, worker talks to OpenAI',
      toolExecution: 'Server-owned deterministic math tools plus structured tldraw actions',
      productionReadiness: 'candidate',
      latencyScore: 4,
      costScore: liveKitModel === 'gpt-realtime-mini' ? 4 : 3,
      safetyScore: 5,
      implementationScore: 3,
      recommendation: 'Make this the main pilot candidate after LiveKit credentials and worker deployment are configured.',
      strengths: ['Best server-side control', 'Cleaner tool audit trail', 'Can support observability and room-level orchestration'],
      risks: ['Requires LiveKit credentials and worker deployment', 'Cold starts can affect join time on lower tiers'],
      nextSteps: ['Test with gpt-realtime-2 for tool-heavy sessions', 'Test gpt-realtime-mini for cost stress sessions'],
    },
    {
      id: 'typed-tool-preview',
      label: 'Typed Tool Preview',
      route: '/tutor-livekit-lab',
      stack: 'Signed-in local preview through /api/livekit/tool-preview',
      defaultModel: 'gpt-realtime-mini',
      currentModel: 'no realtime model minted',
      transport: 'Typed browser events to server tool endpoint',
      toolExecution: 'Server-owned deterministic tools only, no live voice model',
      productionReadiness: 'local-preview',
      latencyScore: 5,
      costScore: 5,
      safetyScore: 5,
      implementationScore: 4,
      recommendation: 'Use for deterministic tool QA and board rendering tests before spending voice tokens.',
      strengths: ['No voice token spend', 'Great for graph/geometry/fraction visual regression testing', 'No LiveKit env required'],
      risks: ['Not a voice tutor', 'Only validates tool routing and board rendering, not conversation quality'],
      nextSteps: ['Keep hidden', 'Use as the first test stage for every new math tool'],
    },
  ]
}

export function estimateRealtimeModelCost(modelId: RealtimeModelId, profile: UsageProfile) {
  const pricing = REALTIME_MODEL_PRICING[modelId]
  const textInput = (profile.textInputTokens / 1_000_000) * pricing.textInputPerMTok
  const textOutput = (profile.textOutputTokens / 1_000_000) * pricing.textOutputPerMTok
  const audioInput = (profile.audioInputTokens / 1_000_000) * (pricing.audioInputPerMTok ?? 0)
  const audioOutput = (profile.audioOutputTokens / 1_000_000) * (pricing.audioOutputPerMTok ?? 0)
  const imageInput = (profile.imageInputTokens / 1_000_000) * (pricing.imageInputPerMTok ?? 0)
  const total = textInput + textOutput + audioInput + audioOutput + imageInput

  return {
    modelId,
    profileId: profile.id,
    textInput,
    textOutput,
    audioInput,
    audioOutput,
    imageInput,
    total,
  }
}

export function formatUsd(value: number) {
  if (value < 0.01) return `$${value.toFixed(4)}`
  if (value < 1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

export function scoreLabel(score: number) {
  if (score >= 5) return 'Excellent'
  if (score >= 4) return 'Strong'
  if (score >= 3) return 'Workable'
  if (score >= 2) return 'Risky'
  return 'Weak'
}
