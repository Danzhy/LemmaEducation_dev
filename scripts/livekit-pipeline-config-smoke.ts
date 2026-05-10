import assert from 'node:assert/strict'
import {
  LIVEKIT_PIPELINE_DEFAULT_MODEL_ID,
  listLiveKitPipelineModelOptions,
  resolveLiveKitPipelineModel,
} from '@/lib/livekit/pipeline-models'
import { resolveLiveKitPipelineSelection, resolveLiveKitPipelineVoiceConfig } from '@/lib/livekit/pipeline-config'

function main() {
  const options = listLiveKitPipelineModelOptions()
  assert.ok(options.length >= 12, 'pipeline lab should expose a broad model comparison set')
  assert.equal(new Set(options.map((option) => option.id)).size, options.length, 'model IDs must be unique')

  const defaultModel = resolveLiveKitPipelineModel(null)
  assert.equal(defaultModel.id, LIVEKIT_PIPELINE_DEFAULT_MODEL_ID)
  assert.equal(defaultModel.usedFallback, false)

  const openRouterModel = options.find((option) => option.id === 'openrouter-custom')
  assert.ok(openRouterModel, 'OpenRouter model should be present in the pipeline allowlist')
  assert.deepEqual(
    openRouterModel.requiredEnv,
    ['OPENROUTER_API_KEY'],
    'OpenRouter should not require an override model because a safe default exists'
  )
  assert.equal(openRouterModel.model, process.env.OPENROUTER_LIVEKIT_MODEL?.trim() || 'openai/gpt-oss-120b')

  const expectedOpenRouterIds = [
    'openrouter-gpt-5-5',
    'openrouter-gpt-5-4',
    'openrouter-gpt-5-4-mini',
    'openrouter-gpt-oss-120b',
    'openrouter-llama-4-maverick',
    'openrouter-llama-3-3-70b',
    'openrouter-qwen-3-6-35b',
    'openrouter-deepseek-v3-2',
    'openrouter-mistral-small-4',
    'openrouter-gemma-4-31b-free',
  ]
  for (const id of expectedOpenRouterIds) {
    const option = options.find((candidate) => candidate.id === id)
    assert.ok(option, `${id} should be present in the OpenRouter allowlist`)
    assert.equal(option?.provider, 'openrouter_compatible', `${id} should use the OpenRouter-compatible provider`)
    assert.deepEqual(option?.requiredEnv, ['OPENROUTER_API_KEY'], `${id} should only require the OpenRouter key`)
  }

  const fallbackModel = resolveLiveKitPipelineModel('not-a-real-model')
  assert.equal(fallbackModel.id, LIVEKIT_PIPELINE_DEFAULT_MODEL_ID)
  assert.equal(fallbackModel.usedFallback, true)

  for (const option of options) {
    assert.ok(option.label.length > 0, `${option.id} is missing a label`)
    assert.ok(option.model.length > 0, `${option.id} is missing a provider model`)
    assert.ok(Array.isArray(option.requiredEnv), `${option.id} should expose required env names only`)
    assert.ok(
      option.requiredEnv.every((name) => /^[A-Z0-9_]+$/.test(name)),
      `${option.id} should only expose environment variable names, not values`
    )
    assert.deepEqual(
      option.missing,
      option.requiredEnv.filter((name) => !process.env[name]?.trim()),
      `${option.id} missing credential list should match runtime env`
    )
  }

  const voice = resolveLiveKitPipelineVoiceConfig()
  assert.ok(voice.sttModel.length > 0, 'STT model should be resolved')
  assert.ok(voice.ttsModel.length > 0, 'TTS model should be resolved')
  assert.ok(voice.ttsVoice.length > 0, 'TTS voice should be resolved')

  const selection = resolveLiveKitPipelineSelection(defaultModel.id)
  assert.deepEqual(
    selection.missing,
    [...new Set([...selection.model.missing, ...selection.voice.missing])],
    'pipeline missing list should combine model and voice credentials'
  )

  console.log(
    JSON.stringify(
      {
        ok: true,
        modelOptions: options.length,
        defaultModel: defaultModel.id,
        configuredModels: options.filter((option) => option.configured).length,
        voiceConfigured: voice.configured,
      },
      null,
      2
    )
  )
}

main()
