import {
  resolveLiveKitPipelineModel,
  type ResolvedLiveKitPipelineModel,
} from '@/lib/livekit/pipeline-models'

export const LIVEKIT_PIPELINE_DEFAULT_STT_MODEL = 'gpt-4o-transcribe'
export const LIVEKIT_PIPELINE_DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts'
export const LIVEKIT_PIPELINE_DEFAULT_TTS_VOICE = 'alloy'
export const LIVEKIT_PIPELINE_DEFAULT_TTS_SPEED = 1.06

function envValue(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback
}

export function resolveLiveKitPipelineVoiceConfig() {
  const sttModel = envValue('OPENAI_LIVEKIT_PIPELINE_STT_MODEL', LIVEKIT_PIPELINE_DEFAULT_STT_MODEL)
  const ttsModel = envValue('OPENAI_LIVEKIT_PIPELINE_TTS_MODEL', LIVEKIT_PIPELINE_DEFAULT_TTS_MODEL)
  const ttsVoice = envValue('OPENAI_LIVEKIT_PIPELINE_TTS_VOICE', LIVEKIT_PIPELINE_DEFAULT_TTS_VOICE)
  const ttsSpeedRaw = Number(envValue('OPENAI_LIVEKIT_PIPELINE_TTS_SPEED', String(LIVEKIT_PIPELINE_DEFAULT_TTS_SPEED)))
  const ttsSpeed = Number.isFinite(ttsSpeedRaw)
    ? Math.min(Math.max(ttsSpeedRaw, 0.7), 1.2)
    : LIVEKIT_PIPELINE_DEFAULT_TTS_SPEED
  const missing = process.env.OPENAI_API_KEY?.trim() ? [] : ['OPENAI_API_KEY']

  return {
    sttModel,
    ttsModel,
    ttsVoice,
    ttsSpeed,
    configured: missing.length === 0,
    missing,
  }
}

export function resolveLiveKitPipelineSelection(modelId: string | undefined | null) {
  const model: ResolvedLiveKitPipelineModel = resolveLiveKitPipelineModel(modelId)
  const voice = resolveLiveKitPipelineVoiceConfig()
  const missing = [...new Set([...model.missing, ...voice.missing])]

  return {
    model,
    voice,
    configured: missing.length === 0,
    missing,
  }
}
