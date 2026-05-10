import assert from 'node:assert/strict'
import {
  planCanvasActionReveal,
  shouldStageCanvasActions,
} from '@/lib/tutor/canvas-action-reveal'
import { planLocalToolTurn } from '@/lib/livekit/local-tool-planner'
import { runLiveKitTutorTool } from '@/lib/livekit/tool-runner'
import { canvasArtifactIdMatches } from '@/lib/tutor/canvas-action-artifacts'
import {
  deleteExistingCanvasArtifactShapes,
  getCanvasArtifactShapeIds,
} from '@/lib/tutor/canvas-artifact-renderer'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'
import { applyTutorCanvasAction } from '@/lib/voice-agent/canvas-actions'
import {
  annotateGraphFeatures,
  adaptiveReviewPlan,
  angleDiagramScene,
  areaPerimeterModelScene,
  arrayModelScene,
  barModelScene,
  compositeAreaModelScene,
  coordinateDistanceScene,
  dataDisplayScene,
  decimalGridScene,
  doubleNumberLineScene,
  equationBalanceScene,
  factorTreeScene,
  fractionCompareScene,
  fractionOperationScene,
  fractionStripScene,
  graphFunction,
  integerChipsScene,
  integerOperationScene,
  longDivisionScene,
  numberLineScene,
  orderOfOperationsScene,
  percentBarScene,
  plotPointsOnPlane,
  placeValueChartScene,
  probabilityModelScene,
  ratioTableScene,
  slopeTriangleScene,
  statisticsSummaryScene,
  unitConversionScene,
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

type MockTldrawShape = {
  id: string
  type: string
  meta?: Record<string, unknown>
  props?: Record<string, unknown>
}

class MockTldrawEditor {
  private readonly shapes = new Map<string, MockTldrawShape>()

  getCurrentPageShapeIds() {
    return this.shapes.keys()
  }

  getShape(shapeId: string) {
    return this.shapes.get(shapeId)
  }

  createShape(shape: MockTldrawShape) {
    this.shapes.set(String(shape.id), {
      ...shape,
      id: String(shape.id),
    })
  }

  deleteShapes(shapeIds: string[]) {
    shapeIds.forEach((shapeId) => this.shapes.delete(String(shapeId)))
  }

  createStudentShape(id: string) {
    this.shapes.set(id, {
      id,
      type: 'draw',
      meta: {},
      props: {},
    })
  }

  deleteToolOwnedShapes() {
    const toolOwnedShapeIds = [...this.shapes.values()]
      .filter((shape) => shape.meta?.lemmaToolOwned)
      .map((shape) => shape.id)
    this.deleteShapes(toolOwnedShapeIds)
  }

  get shapeCount() {
    return this.shapes.size
  }

  shapeIds() {
    return [...this.shapes.keys()].sort()
  }

  artifactIds() {
    return [...this.shapes.values()]
      .map((shape) => shape.meta?.lemmaArtifactId)
      .filter((artifactId): artifactId is string => typeof artifactId === 'string')
      .sort()
  }

  hasShape(shapeId: string) {
    return this.shapes.has(shapeId)
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

function applyWorkspaceRendererAction(editor: MockTldrawEditor, action: TutorCanvasAction) {
  if (action.type === 'clear_tool_layer') {
    editor.deleteToolOwnedShapes()
    return
  }

  if (action.type === 'focus_region') return

  applyTutorCanvasAction(editor as never, action)
}

async function renderTypedPreviewVisual(
  editor: MockTldrawEditor,
  prompt: string,
  expectedToolName: string
) {
  const plans = planLocalToolTurn(prompt, '6')
  assert.deepEqual(
    plans.map((plan) => plan.toolName),
    [expectedToolName],
    `Typed preview prompt should route directly to ${expectedToolName}: ${prompt}`
  )

  const result = await runLiveKitTutorTool(expectedToolName, plans[0].input)
  const actions = extractCanvasActionsFromToolResult(expectedToolName, result)
  const drawingActions = actions.filter(
    (action) => action.type !== 'clear_tool_layer' && action.type !== 'focus_region'
  )

  assert.ok(drawingActions.length > 0, `${expectedToolName} should return drawable canvas actions.`)
  actions.forEach((action) => applyWorkspaceRendererAction(editor, action))
}

async function assertTypedPreviewVisualReplacesRepeatedShapes(options: {
  name: string
  expectedToolName: string
  firstPrompt: string
  secondPrompt: string
}) {
  const editor = new MockTldrawEditor()
  editor.createStudentShape('student-rough-work')

  await renderTypedPreviewVisual(editor, options.firstPrompt, options.expectedToolName)
  const firstShapeCount = editor.shapeCount
  const firstShapeIds = editor.shapeIds()
  const firstArtifactIds = editor.artifactIds()

  assert.ok(firstArtifactIds.length > 0, `${options.name} should render tool-owned artifact ids.`)
  assert.ok(editor.hasShape('student-rough-work'), `${options.name} should preserve student-drawn work.`)

  await renderTypedPreviewVisual(editor, options.secondPrompt, options.expectedToolName)

  assert.equal(
    editor.shapeCount,
    firstShapeCount,
    `${options.name} should replace repeated typed-preview visual shapes instead of stacking duplicates.`
  )
  assert.deepEqual(
    editor.artifactIds(),
    firstArtifactIds,
    `${options.name} should preserve stable semantic artifact slots across repeated typed-preview prompts.`
  )
  assert.notDeepEqual(
    editor.shapeIds(),
    firstShapeIds,
    `${options.name} should redraw replacement shapes rather than reusing stale tldraw shape ids.`
  )
  assert.ok(editor.hasShape('student-rough-work'), `${options.name} should not delete student-drawn work.`)
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

function requireCanvasResult(toolName: string, result: { canvasActions?: TutorCanvasAction[] }) {
  assert.ok(
    Array.isArray(result.canvasActions) && result.canvasActions.length > 0,
    `${toolName} should return canvas actions for rendering.`
  )
  return { canvasActions: result.canvasActions }
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

assertStableSemanticArtifactIds(
  'array_model',
  arrayModelScene({ rows: 3, columns: 4, highlightCount: 5 }),
  arrayModelScene({ rows: 3, columns: 4, highlightCount: 8 })
)

assertStableSemanticArtifactIds(
  'ratio_table',
  ratioTableScene({
    leftLabel: 'cups',
    rightLabel: 'tablespoons',
    rows: [
      { left: 1, right: 16 },
      { left: 2, right: 32 },
      { left: 3, right: 48 },
    ],
  }),
  ratioTableScene({
    leftLabel: 'cups',
    rightLabel: 'tablespoons',
    rows: [
      { left: 1, right: 12 },
      { left: 2, right: 24 },
      { left: 3, right: 36 },
    ],
  })
)

assertStableSemanticArtifactIds(
  'place_value_chart',
  placeValueChartScene({
    columns: ['hundreds', 'tens', 'ones', 'tenths'],
    rows: [{ label: 'number', values: [3, 4, 5, 6] }],
    highlightColumn: 'tens',
  }),
  placeValueChartScene({
    columns: ['hundreds', 'tens', 'ones', 'tenths'],
    rows: [{ label: 'number', values: [3, 5, 2, 8] }],
    highlightColumn: 'ones',
  })
)

assertStableSemanticArtifactIds(
  'factor_tree',
  factorTreeScene({ value: 36 }),
  factorTreeScene({ value: 84 })
)

assertStableSemanticArtifactIds(
  'long_division',
  longDivisionScene({ dividend: 156, divisor: 6 }),
  longDivisionScene({ dividend: 168, divisor: 7 })
)

assertStableSemanticArtifactIds(
  'decimal_grid',
  decimalGridScene({ shadedParts: 37, totalParts: 100 }),
  decimalGridScene({ shadedParts: 62, totalParts: 100 })
)

assertStableSemanticArtifactIds(
  'data_display',
  dataDisplayScene({
    displayType: 'bar_chart',
    data: [
      { label: 'Mon', value: 4 },
      { label: 'Tue', value: 7 },
      { label: 'Wed', value: 5 },
    ],
  }),
  dataDisplayScene({
    displayType: 'bar_chart',
    data: [
      { label: 'Mon', value: 6 },
      { label: 'Tue', value: 3 },
      { label: 'Wed', value: 8 },
    ],
  })
)

assertStableSemanticArtifactIds(
  'integer_chips',
  integerChipsScene({ positiveCount: 6, negativeCount: 2 }),
  integerChipsScene({ positiveCount: 5, negativeCount: 3 })
)

assertStableSemanticArtifactIds(
  'area_perimeter_model',
  areaPerimeterModelScene({ widthUnits: 7, heightUnits: 4, unitLabel: 'cm', showUnitSquares: false }),
  areaPerimeterModelScene({ widthUnits: 6, heightUnits: 5, unitLabel: 'cm', showUnitSquares: false })
)

assertStableSemanticArtifactIds(
  'fraction_operation',
  fractionOperationScene({
    operation: 'add',
    leftNumerator: 1,
    leftDenominator: 2,
    rightNumerator: 1,
    rightDenominator: 3,
  }),
  fractionOperationScene({
    operation: 'add',
    leftNumerator: 2,
    leftDenominator: 5,
    rightNumerator: 1,
    rightDenominator: 4,
  })
)

assertStableSemanticArtifactIds(
  'order_of_operations',
  orderOfOperationsScene({ expression: '3 + 4 * 2' }),
  orderOfOperationsScene({ expression: '6 + 12 / 3' })
)

assertStableSemanticArtifactIds(
  'statistics_summary',
  statisticsSummaryScene({ values: [2, 4, 4, 6, 9] }),
  statisticsSummaryScene({ values: [3, 5, 5, 7, 10] })
)

assertStableSemanticArtifactIds(
  'unit_conversion',
  unitConversionScene({ value: 2.5, fromUnit: 'm', toUnit: 'cm', measurementType: 'length' }),
  unitConversionScene({ value: 3.5, fromUnit: 'm', toUnit: 'cm', measurementType: 'length' })
)

assertStableSemanticArtifactIds(
  'probability_model',
  probabilityModelScene({ favorableOutcomes: 3, totalOutcomes: 8 }),
  probabilityModelScene({ favorableOutcomes: 5, totalOutcomes: 8 })
)

assertStableSemanticArtifactIds(
  'percent_bar',
  percentBarScene({ percent: 35 }),
  percentBarScene({ percent: 65 })
)

assertStableSemanticArtifactIds(
  'composite_area_model',
  compositeAreaModelScene({
    rectangles: [
      { xUnits: 0, yUnits: 0, widthUnits: 4, heightUnits: 3 },
      { xUnits: 4, yUnits: 0, widthUnits: 2, heightUnits: 5 },
    ],
  }),
  compositeAreaModelScene({
    rectangles: [
      { xUnits: 0, yUnits: 0, widthUnits: 5, heightUnits: 2 },
      { xUnits: 5, yUnits: 0, widthUnits: 2, heightUnits: 4 },
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
  'adaptive_review_plan',
  requireCanvasResult(
    'adaptive_review_plan',
    adaptiveReviewPlan({
      gradeLevel: 'Grade 6',
      targetTopic: 'fractions',
      sessionGoal: 'continue from last time',
      topics: ['fractions'],
      struggleSignals: ['student says they are stuck'],
      misconceptionTimeline: [
        {
          topic: 'fractions',
          signal: 'May be adding or subtracting denominators instead of finding a common denominator.',
          count: 1,
          priority: 'reteach',
          sourceTools: ['misconception_diagnosis'],
          recentEvidence: ['Misconception diagnosis returned this learning pattern.'],
          lastSeen: '2026-05-09T18:00:00.000Z',
        },
      ],
    })
  ),
  requireCanvasResult(
    'adaptive_review_plan',
    adaptiveReviewPlan({
      gradeLevel: 'Grade 6',
      targetTopic: 'fractions',
      sessionGoal: 'continue from last time',
      topics: ['fractions'],
      struggleSignals: ['student says they are stuck'],
      misconceptionTimeline: [
        {
          topic: 'fractions',
          signal: 'May be adding or subtracting denominators instead of finding a common denominator.',
          count: 3,
          priority: 'reteach',
          sourceTools: ['misconception_diagnosis', 'math_check_step'],
          recentEvidence: ['Step check returned invalid.'],
          lastSeen: '2026-05-10T18:00:00.000Z',
        },
      ],
    })
  )
)

assertMockRendererReplacesRepeatedArtifact(
  'number_line',
  numberLineScene({ start: -5, end: 5, highlightValues: [-3, 2], hopPairs: [{ from: -3, to: 2 }] }),
  numberLineScene({ start: -5, end: 5, highlightValues: [-2, 3], hopPairs: [{ from: -2, to: 3 }] })
)

assertMockRendererReplacesRepeatedArtifact(
  'probability_model',
  probabilityModelScene({ favorableOutcomes: 3, totalOutcomes: 8 }),
  probabilityModelScene({ favorableOutcomes: 5, totalOutcomes: 8 })
)

assertMockRendererReplacesRepeatedArtifact(
  'composite_area_model',
  compositeAreaModelScene({
    rectangles: [
      { xUnits: 0, yUnits: 0, widthUnits: 4, heightUnits: 3 },
      { xUnits: 4, yUnits: 0, widthUnits: 2, heightUnits: 5 },
    ],
  }),
  compositeAreaModelScene({
    rectangles: [
      { xUnits: 0, yUnits: 0, widthUnits: 5, heightUnits: 2 },
      { xUnits: 5, yUnits: 0, widthUnits: 2, heightUnits: 4 },
    ],
  })
)

async function main() {
  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'fraction bar typed-preview visual',
    expectedToolName: 'fraction_strip',
    firstPrompt: 'Show a fraction bar for 1/4.',
    secondPrompt: 'Show a fraction bar for 3/4.',
  })

  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'tape diagram typed-preview visual',
    expectedToolName: 'bar_model',
    firstPrompt: 'Draw a tape diagram for 36 stickers total with 14 used and the rest unknown.',
    secondPrompt: 'Draw a tape diagram for 40 stickers total with 15 used and the rest unknown.',
  })

  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'angle diagram typed-preview visual',
    expectedToolName: 'angle_diagram',
    firstPrompt: 'Show the complementary angle to 35 on the board.',
    secondPrompt: 'Show the complementary angle to 45 on the board.',
  })

  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'graph annotation typed-preview visual',
    expectedToolName: 'graph_function',
    firstPrompt: 'Graph y = 2x + 1 from x = -3 to 3 and mark the x-intercept and y-intercept.',
    secondPrompt: 'Graph y = 2x + 1 from x = -3 to 3 and mark the x-intercept and y-intercept.',
  })

  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'number-line typed-preview visual',
    expectedToolName: 'number_line',
    firstPrompt: 'Draw a number line from -5 to 5 and highlight -3 and 2.',
    secondPrompt: 'Draw a number line from -5 to 5 and highlight -2 and 3.',
  })

  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'probability typed-preview visual',
    expectedToolName: 'probability_model',
    firstPrompt: 'Show the probability of 3 favorable outcomes out of 8.',
    secondPrompt: 'Show the probability of 5 favorable outcomes out of 8.',
  })

  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'data-display typed-preview visual',
    expectedToolName: 'data_display',
    firstPrompt: 'Draw a bar chart with apples 4, bananas 7, and grapes 5.',
    secondPrompt: 'Draw a bar chart with apples 5, bananas 6, and grapes 8.',
  })

  await assertTypedPreviewVisualReplacesRepeatedShapes({
    name: 'composite-area typed-preview visual',
    expectedToolName: 'composite_area_model',
    firstPrompt: 'A shape is made of 3 by 4 and 2 by 5 rectangles. What is the total area?',
    secondPrompt: 'A shape is made of 3 by 4 and 2 by 5 rectangles. What is the total area?',
  })

  console.log('Canvas action reveal smoke passed.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
