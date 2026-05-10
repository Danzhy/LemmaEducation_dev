import * as openai from '@livekit/agents-plugin-openai'
import type { stt, tts } from '@livekit/agents'
import type { ResolvedLiveKitPipelineModel } from '@/lib/livekit/pipeline-models'
import { resolveLiveKitPipelineVoiceConfig } from '@/lib/livekit/pipeline-config'

export function createLiveKitPipelineSTT(language: string): stt.STT {
  const voice = resolveLiveKitPipelineVoiceConfig()
  return new openai.STT({
    model: voice.sttModel,
    apiKey: process.env.OPENAI_API_KEY,
    language: language === 'en' ? 'en' : language,
    detectLanguage: language !== 'en',
    prompt: 'Grade 3 to 7 math tutoring. Expect fractions, ratios, equations, geometry, graphing, and student reasoning.',
  })
}

export function createLiveKitPipelineTTS(): tts.TTS {
  const voice = resolveLiveKitPipelineVoiceConfig()
  return new openai.TTS({
    model: voice.ttsModel,
    voice: voice.ttsVoice as never,
    speed: voice.ttsSpeed,
    apiKey: process.env.OPENAI_API_KEY,
    instructions: 'Speak like a calm math tutor. Keep turns short and invite the student to think.',
  })
}

export function createLiveKitPipelineLLM(model: ResolvedLiveKitPipelineModel) {
  if (model.provider === 'openai_responses') {
    return new openai.responses.LLM({
      model: model.model,
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.35,
      maxOutputTokens: 800,
      parallelToolCalls: false,
      strictToolSchema: true,
      store: false,
    })
  }

  if (model.provider === 'openai_chat') {
    return new openai.LLM({
      model: model.model,
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.35,
      maxCompletionTokens: 800,
      parallelToolCalls: false,
      strictToolSchema: true,
      store: false,
    })
  }

  if (model.provider === 'openrouter_compatible') {
    return new openai.LLM({
      model: model.model,
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      temperature: 0.35,
      maxCompletionTokens: 800,
      parallelToolCalls: false,
      strictToolSchema: true,
      store: false,
    })
  }

  return openai.LLM.withGroq({
    model: model.model,
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0.35,
  })
}
