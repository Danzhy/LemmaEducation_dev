import assert from 'node:assert/strict'
import {
  planCanvasActionReveal,
  shouldStageCanvasActions,
} from '@/lib/tutor/canvas-action-reveal'
import { canvasArtifactIdMatches } from '@/lib/tutor/canvas-action-artifacts'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'
import {
  angleDiagramScene,
  barModelScene,
  fractionCompareScene,
  fractionStripScene,
} from '@/lib/voice-agent/math-engine'

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

const firstParsedActions = extractCanvasActionsFromToolResult('fraction_strip', {
  canvasActions: [
    {
      id: 'random-first',
      type: 'place_text_label',
      x: 80,
      y: 120,
      text: 'Equivalent parts',
    },
  ],
})
const secondParsedActions = extractCanvasActionsFromToolResult('fraction_strip', {
  canvasActions: [
    {
      id: 'random-second',
      type: 'place_text_label',
      x: 80,
      y: 120,
      text: 'Equivalent parts',
    },
  ],
})

assert.equal(firstParsedActions.length, 1)
assert.equal(secondParsedActions.length, 1)
assert.equal(
  firstParsedActions[0].artifactId,
  secondParsedActions[0].artifactId,
  'Matching tool actions should receive stable artifact ids despite random action ids.'
)
assert.equal(firstParsedActions[0].artifactGroupId, 'tool:fraction_strip')
assert.ok(firstParsedActions[0].artifactId?.startsWith('tool:fraction_strip:0:'))
assert.equal(canvasArtifactIdMatches(`${firstParsedActions[0].artifactId}:label`, firstParsedActions[0].artifactId!), true)
assert.equal(canvasArtifactIdMatches(`${firstParsedActions[0].artifactId}-stale`, firstParsedActions[0].artifactId!), false)

function drawingActions(actions: TutorCanvasAction[]) {
  return actions.filter((action) => action.type !== 'clear_tool_layer' && action.type !== 'focus_region')
}

function assertStableSemanticArtifactIds(
  toolName: string,
  firstResult: { canvasActions: TutorCanvasAction[] },
  secondResult: { canvasActions: TutorCanvasAction[] }
) {
  const firstActions = extractCanvasActionsFromToolResult(toolName, firstResult)
  const secondActions = extractCanvasActionsFromToolResult(toolName, secondResult)
  const firstDrawingActions = drawingActions(firstActions)
  const secondDrawingActions = drawingActions(secondActions)
  const sharedLength = Math.min(firstDrawingActions.length, secondDrawingActions.length)

  assert.ok(sharedLength >= 4, `${toolName} should return enough drawing actions for artifact coverage.`)
  assert.ok(
    firstActions
      .filter((action) => action.type === 'clear_tool_layer' || action.type === 'focus_region')
      .every((action) => !action.artifactId && !action.artifactGroupId),
    `${toolName} should keep non-drawing actions out of artifact replacement.`
  )
  assert.equal(firstDrawingActions[0].artifactGroupId, `tool:${toolName}`)
  assert.equal(firstDrawingActions[0].artifactId, `tool:${toolName}:scene:0`)
  assert.deepEqual(
    firstDrawingActions.slice(0, sharedLength).map((action) => action.artifactId),
    secondDrawingActions.slice(0, sharedLength).map((action) => action.artifactId),
    `${toolName} should keep the same semantic artifact slots when the visual values change.`
  )
}

assertStableSemanticArtifactIds(
  'fraction_strip',
  fractionStripScene({ numerator: 3, denominator: 4, title: 'Fraction model' }),
  fractionStripScene({ numerator: 5, denominator: 6, title: 'Fraction model' })
)

assertStableSemanticArtifactIds(
  'fraction_compare',
  fractionCompareScene({ leftNumerator: 3, leftDenominator: 4, rightNumerator: 5, rightDenominator: 8 }),
  fractionCompareScene({ leftNumerator: 2, leftDenominator: 3, rightNumerator: 4, rightDenominator: 7 })
)

assertStableSemanticArtifactIds(
  'bar_model',
  barModelScene({
    title: 'Comparison tape',
    bars: [
      {
        label: 'Maya',
        segments: [
          { label: 'shared', value: 24, shaded: true },
          { label: 'more', value: 8, shaded: false },
        ],
      },
    ],
  }),
  barModelScene({
    title: 'Comparison tape',
    bars: [
      {
        label: 'Maya',
        segments: [
          { label: 'shared', value: 30, shaded: true },
          { label: 'more', value: 12, shaded: false },
        ],
      },
    ],
  })
)

assertStableSemanticArtifactIds(
  'angle_diagram',
  angleDiagramScene({
    degrees: 110,
    relationshipType: 'supplementary',
    knownAngle: 110,
    missingAngle: 70,
    attemptedAngle: 80,
  }),
  angleDiagramScene({
    degrees: 100,
    relationshipType: 'supplementary',
    knownAngle: 100,
    missingAngle: 80,
    attemptedAngle: 75,
  })
)

console.log('Canvas action reveal smoke passed.')
