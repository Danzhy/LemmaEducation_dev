import assert from 'node:assert/strict'
import {
  planCanvasActionReveal,
  shouldStageCanvasActions,
} from '@/lib/tutor/canvas-action-reveal'
import { canvasArtifactIdMatches } from '@/lib/tutor/canvas-action-artifacts'
import {
  deleteExistingCanvasArtifactShapes,
  getCanvasArtifactShapeIds,
} from '@/lib/tutor/canvas-artifact-renderer'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'
import {
  annotateGraphFeatures,
  angleDiagramScene,
  barModelScene,
  coordinateDistanceScene,
  doubleNumberLineScene,
  equationBalanceScene,
  fractionCompareScene,
  fractionStripScene,
  graphFunction,
  integerOperationScene,
  numberLineScene,
  plotPointsOnPlane,
  slopeTriangleScene,
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

type MockToolShape = {
  id: string
  meta: Record<string, unknown>
  payload: string
}

class MockArtifactEditor {
  private nextShapeIndex = 0
  private readonly shapes = new Map<string, MockToolShape>()

  getCurrentPageShapeIds() {
    return this.shapes.keys()
  }

  getShape(shapeId: string) {
    return this.shapes.get(shapeId)
  }

  deleteShapes(shapeIds: string[]) {
    shapeIds.forEach((shapeId) => this.shapes.delete(shapeId))
  }

  createToolShape(artifactId: string, artifactGroupId: string | undefined, payload: string) {
    this.nextShapeIndex += 1
    const id = `mock-shape-${this.nextShapeIndex}`
    this.shapes.set(id, {
      id,
      meta: {
        lemmaToolOwned: true,
        lemmaArtifactId: artifactId,
        ...(artifactGroupId ? { lemmaArtifactGroupId: artifactGroupId } : {}),
      },
      payload,
    })
    return id
  }

  get shapeCount() {
    return this.shapes.size
  }

  shapeIds() {
    return [...this.shapes.keys()].sort()
  }

  artifactIds() {
    return [...this.shapes.values()]
      .map((shape) => shape.meta.lemmaArtifactId)
      .filter((artifactId): artifactId is string => typeof artifactId === 'string')
      .sort()
  }
}

function childLabelForAction(action: TutorCanvasAction) {
  switch (action.type) {
    case 'draw_line_segment':
    case 'draw_rectangle':
    case 'plot_polyline':
    case 'highlight_region':
    case 'place_point':
      return action.label
    case 'draw_axes':
      return action.xLabel ?? action.yLabel
    default:
      return undefined
  }
}

function applyMockRendererAction(editor: MockArtifactEditor, action: TutorCanvasAction) {
  if (action.type === 'clear_tool_layer' || action.type === 'focus_region' || !action.artifactId) return

  deleteExistingCanvasArtifactShapes(editor, action.artifactId)
  editor.createToolShape(action.artifactId, action.artifactGroupId, action.type)

  const childLabel = childLabelForAction(action)
  if (childLabel) {
    editor.createToolShape(`${action.artifactId}:label`, action.artifactGroupId, childLabel)
  }
}

function renderToolResult(editor: MockArtifactEditor, toolName: string, result: { canvasActions: TutorCanvasAction[] }) {
  extractCanvasActionsFromToolResult(toolName, result).forEach((action) => applyMockRendererAction(editor, action))
}

function assertMockRendererReplacesRepeatedArtifact(
  toolName: string,
  firstResult: { canvasActions: TutorCanvasAction[] },
  secondResult: { canvasActions: TutorCanvasAction[] }
) {
  const editor = new MockArtifactEditor()

  renderToolResult(editor, toolName, firstResult)
  const firstShapeCount = editor.shapeCount
  const firstShapeIds = editor.shapeIds()
  const firstArtifactIds = editor.artifactIds()

  assert.ok(firstShapeCount > 0, `${toolName} should render at least one tool-owned shape.`)

  renderToolResult(editor, toolName, secondResult)

  assert.equal(
    editor.shapeCount,
    firstShapeCount,
    `${toolName} should replace existing artifact shapes instead of stacking duplicates.`
  )
  assert.deepEqual(
    editor.artifactIds(),
    firstArtifactIds,
    `${toolName} should preserve the same rendered artifact slots after a repeated request.`
  )
  assert.notDeepEqual(
    editor.shapeIds(),
    firstShapeIds,
    `${toolName} should delete stale shapes before drawing replacement shapes.`
  )
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

assertStableSemanticArtifactIds(
  'graph_function',
  graphFunction({ expression: 'x^2 + 2*x - 3', showXIntercepts: true, showYIntercept: true, showVertex: true }),
  graphFunction({ expression: 'x^2 + 4*x + 3', showXIntercepts: true, showYIntercept: true, showVertex: true })
)

assertStableSemanticArtifactIds(
  'annotate_graph_features',
  annotateGraphFeatures({
    expression: 'x^2 + 2*x - 3',
    features: ['x-intercepts', 'y-intercept', 'vertex', 'axis-of-symmetry'],
  }),
  annotateGraphFeatures({
    expression: 'x^2 + 4*x + 3',
    features: ['x-intercepts', 'y-intercept', 'vertex', 'axis-of-symmetry'],
  })
)

assertStableSemanticArtifactIds(
  'plot_points_on_plane',
  plotPointsOnPlane({
    points: [
      { x: 0, y: 1 },
      { x: 2, y: 5 },
    ],
    connectPoints: true,
    equationLabel: '2*x+1',
  }),
  plotPointsOnPlane({
    points: [
      { x: 0, y: 2 },
      { x: 2, y: 6 },
    ],
    connectPoints: true,
    equationLabel: '2*x+2',
  })
)

assertStableSemanticArtifactIds(
  'number_line',
  numberLineScene({ start: -5, end: 5, highlightValues: [-3, 2], hopPairs: [{ from: -3, to: 2 }] }),
  numberLineScene({ start: -5, end: 5, highlightValues: [-2, 3], hopPairs: [{ from: -2, to: 3 }] })
)

assertStableSemanticArtifactIds(
  'integer_operation_scene',
  integerOperationScene({ left: -3, right: 5, operation: 'add' }),
  integerOperationScene({ left: -2, right: 4, operation: 'add' })
)

assertStableSemanticArtifactIds(
  'equation_balance',
  equationBalanceScene({ leftExpression: '2x + 3', rightExpression: '11', balanced: true }),
  equationBalanceScene({ leftExpression: '2x', rightExpression: '8', balanced: true })
)

assertStableSemanticArtifactIds(
  'slope_triangle',
  slopeTriangleScene({ pointA: { x: 1, y: 2 }, pointB: { x: 5, y: 6 } }),
  slopeTriangleScene({ pointA: { x: 0, y: 1 }, pointB: { x: 4, y: 7 } })
)

assertStableSemanticArtifactIds(
  'coordinate_distance',
  coordinateDistanceScene({ pointA: { x: 2, y: 3 }, pointB: { x: 5, y: 7 } }),
  coordinateDistanceScene({ pointA: { x: 1, y: 2 }, pointB: { x: 4, y: 6 } })
)

assertStableSemanticArtifactIds(
  'double_number_line',
  doubleNumberLineScene({
    topLabel: 'notebooks',
    bottomLabel: 'dollars',
    pairs: [
      { top: 0, bottom: 0 },
      { top: 3, bottom: 12 },
      { top: 6, bottom: 24 },
    ],
  }),
  doubleNumberLineScene({
    topLabel: 'notebooks',
    bottomLabel: 'dollars',
    pairs: [
      { top: 0, bottom: 0 },
      { top: 2, bottom: 10 },
      { top: 4, bottom: 20 },
    ],
  })
)

const lookupEditor = new MockArtifactEditor()
lookupEditor.createToolShape('tool:fraction_strip:scene:0', 'tool:fraction_strip', 'main')
lookupEditor.createToolShape('tool:fraction_strip:scene:0:label', 'tool:fraction_strip', 'label')
lookupEditor.createToolShape('tool:fraction_strip:scene:0-stale', 'tool:fraction_strip', 'unrelated')

assert.equal(getCanvasArtifactShapeIds(lookupEditor, 'tool:fraction_strip:scene:0').length, 2)
assert.equal(deleteExistingCanvasArtifactShapes(lookupEditor, 'tool:fraction_strip:scene:0').length, 2)
assert.equal(lookupEditor.shapeCount, 1, 'Artifact replacement should not delete dash-suffixed unrelated shapes.')

assertMockRendererReplacesRepeatedArtifact(
  'fraction_strip',
  fractionStripScene({ numerator: 1, denominator: 4, title: 'Fraction model' }),
  fractionStripScene({ numerator: 3, denominator: 4, title: 'Fraction model' })
)

assertMockRendererReplacesRepeatedArtifact(
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

assertMockRendererReplacesRepeatedArtifact(
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

assertMockRendererReplacesRepeatedArtifact(
  'annotate_graph_features',
  annotateGraphFeatures({
    expression: 'x^2 + 2*x - 3',
    features: ['x-intercepts', 'y-intercept', 'vertex', 'axis-of-symmetry'],
  }),
  annotateGraphFeatures({
    expression: 'x^2 + 4*x + 3',
    features: ['x-intercepts', 'y-intercept', 'vertex', 'axis-of-symmetry'],
  })
)

assertMockRendererReplacesRepeatedArtifact(
  'number_line',
  numberLineScene({ start: -5, end: 5, highlightValues: [-3, 2], hopPairs: [{ from: -3, to: 2 }] }),
  numberLineScene({ start: -5, end: 5, highlightValues: [-2, 3], hopPairs: [{ from: -2, to: 3 }] })
)

console.log('Canvas action reveal smoke passed.')
