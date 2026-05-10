import assert from 'node:assert/strict'
import {
  LIVEKIT_PIPELINE_DEFAULT_MODEL_ID,
  listLiveKitPipelineModelOptions,
  resolveLiveKitPipelineModel,
} from '@/lib/livekit/pipeline-models'
import { resolveLiveKitPipelineSelection, resolveLiveKitPipelineVoiceConfig } from '@/lib/livekit/pipeline-config'

function main() {
  const options = listLiveKitPipelineModelOptions()
  assert.ok(options.length >= 3, 'pipeline lab should expose multiple LLM choices')
  assert.equal(new Set(options.map((option) => option.id)).size, options.length, 'model IDs must be unique')

  const defaultModel = resolveLiveKitPipelineModel(null)
  assert.equal(defaultModel.id, LIVEKIT_PIPELINE_DEFAULT_MODEL_ID)
  assert.equal(defaultModel.usedFallback, false)

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
