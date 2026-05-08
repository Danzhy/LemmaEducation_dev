import assert from 'node:assert/strict'
import {
  listOpenAIRealtimeModels,
  resolveOpenAIRealtimeModel,
} from '@/lib/tutor/realtime-model-policy'

const models = listOpenAIRealtimeModels()

assert(models.some((model) => model.id === 'gpt-realtime-2'))
assert(models.some((model) => model.id === 'gpt-realtime-mini'))
assert.equal(resolveOpenAIRealtimeModel(undefined).id, 'gpt-realtime-2')
assert.equal(resolveOpenAIRealtimeModel('gpt-realtime-mini').role, 'low_cost')
assert.equal(resolveOpenAIRealtimeModel('gpt-realtime-1.5').role, 'balanced')

const fallback = resolveOpenAIRealtimeModel('not-a-real-model')
assert.equal(fallback.id, 'gpt-realtime-2')
assert.equal(fallback.usedFallback, true)
assert.equal(fallback.requested, 'not-a-real-model')

console.log(`Realtime model policy smoke passed ${models.length} allowlisted models.`)
