import assert from 'node:assert/strict'
import {
  planCanvasActionReveal,
  shouldStageCanvasActions,
} from '@/lib/tutor/canvas-action-reveal'
import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'

const clearAction: TutorCanvasAction = { id: 'clear', type: 'clear_tool_layer' }

const labels: TutorCanvasAction[] = Array.from({ length: 10 }, (_, index) => ({
  id: `label-${index}`,
  type: 'place_text_label',
  x: 40,
  y: 40 + index * 28,
  text: `Step ${index + 1}`,
}))

assert.equal(shouldStageCanvasActions([labels[0]], 'graph_function'), false)
assert.equal(shouldStageCanvasActions(labels.slice(0, 3), 'graph_function'), true)
assert.equal(shouldStageCanvasActions(labels.slice(0, 3), 'fraction_strip'), false)
assert.equal(shouldStageCanvasActions(labels.concat(labels), 'fraction_strip'), true)

const batches = planCanvasActionReveal([clearAction, ...labels], {
  sourceToolName: 'board_animation_plan',
  chunkSize: 3,
  intervalMs: 100,
  maxDelayMs: 350,
})

assert.equal(batches[0].actions.length, 1)
assert.equal(batches[0].actions[0].type, 'clear_tool_layer')
assert.deepEqual(
  batches.map((batch) => batch.delayMs),
  [0, 100, 200, 300]
)
assert.equal(batches.at(-1)?.actions.length, 4)
assert.equal(
  batches.reduce((count, batch) => count + batch.actions.length, 0),
  11
)

const instant = planCanvasActionReveal(labels.slice(0, 2), { sourceToolName: 'fraction_strip' })
assert.equal(instant.length, 1)
assert.equal(instant[0].delayMs, 0)
assert.equal(instant[0].actions.length, 2)

console.log('Canvas action reveal smoke passed.')
