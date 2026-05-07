import { evaluate, simplify } from 'mathjs'
import type {
  GraphAnnotationResult,
  GraphFeatureCoordinates,
  GraphFeaturePoint,
  CanvasActionResult,
  CanvasWriteResult,
  GeometryFigureResult,
  GraphFunctionResult,
  HintGeneratorResult,
  LinearCanvasResult,
  LinearSolveResult,
  MathAnswerCheckResult,
  MathStepCheckResult,
  PlotPointsResult,
  ValueTableResult,
  SocraticMoveResult,
  WordProblemPlanResult,
} from '@/lib/voice-agent/types'
import type {
  TutorCanvasAction,
  TutorCanvasColor,
  TutorCanvasDash,
  TutorCanvasSize,
} from '@/lib/tutor/session-adapter'

const TOOL_SCENE = {
  x: 560,
  y: 96,
  width: 780,
  height: 500,
}

const GRAPH_FRAME = {
  x: TOOL_SCENE.x + 28,
  y: TOOL_SCENE.y + 114,
  width: 448,
  height: 304,
}

const NOTE_FRAME = {
  x: GRAPH_FRAME.x + GRAPH_FRAME.width + 30,
  y: GRAPH_FRAME.y,
  width: 246,
  height: GRAPH_FRAME.height,
}

function createId() {
  return crypto.randomUUID()
}

function safeEvaluate(expression: string, scope?: Record<string, number>) {
  return evaluate(expression, scope ?? {})
}

function normalizeExpression(expression: string) {
  return expression.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/')
}

function normalizeGraphExpression(expression: string) {
  const normalized = normalizeExpression(expression)
  return normalized.replace(/^y=/i, '')
}

function coerceFiniteNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error('Expression did not evaluate to a finite number.')
  }
  return numeric
}

function extractLinearCoefficients(expression: string) {
  const normalized = normalizeExpression(expression)
  const intercept = coerceFiniteNumber(safeEvaluate(normalized, { x: 0 }))
  const atOne = coerceFiniteNumber(safeEvaluate(normalized, { x: 1 }))
  const coefficient = atOne - intercept

  const atTwo = coerceFiniteNumber(safeEvaluate(normalized, { x: 2 }))
  const expectedAtTwo = coefficient * 2 + intercept
  if (Math.abs(atTwo - expectedAtTwo) > 1e-8) {
    throw new Error('Only simple linear expressions in x are supported right now.')
  }

  return { coefficient, intercept }
}

function roundPoint(value: number, digits = 3) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function isNearlyEqual(a: number, b: number, tolerance = 1e-6) {
  return Math.abs(a - b) <= tolerance
}

function formatNumber(value: number, digits = 2) {
  if (isNearlyEqual(value, Math.round(value), 1e-9)) {
    return String(Math.round(value))
  }
  return String(roundPoint(value, digits))
}

function formatPercent(value: number) {
  return `${formatNumber(value, 1)}%`
}

function formatUnitLabel(unitLabel: string, count: number) {
  const unit = unitLabel.trim() || 'unit'
  if (isNearlyEqual(count, 1)) return unit
  if (/^(mm|cm|m|km|g|kg|ml|mL|L)$/i.test(unit) || unit.endsWith('s')) return unit
  return `${unit}s`
}

function formatSquareUnitLabel(unitLabel: string) {
  const unit = unitLabel.trim() || 'unit'
  if (/^(mm|cm|m|km)$/i.test(unit)) return `square ${unit}`
  return `square ${formatUnitLabel(unit, 2)}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function mapToRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (isNearlyEqual(inMin, inMax)) {
    return (outMin + outMax) / 2
  }
  const ratio = (value - inMin) / (inMax - inMin)
  return outMin + ratio * (outMax - outMin)
}

function niceTickStep(range: number, targetSegments = 4) {
  const safeRange = Math.max(range, 1e-6)
  const roughStep = safeRange / Math.max(targetSegments, 1)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude

  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

function generateTicks(min: number, max: number, options?: { targetSegments?: number }) {
  const step = niceTickStep(max - min, options?.targetSegments ?? 4)
  const first = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let value = first; value <= max + step * 0.35; value += step) {
    ticks.push(isNearlyEqual(value, 0, step / 1000) ? 0 : roundPoint(value, 6))
  }
  return ticks
}

function clearToolLayer(): TutorCanvasAction {
  return {
    id: createId(),
    type: 'clear_tool_layer',
  }
}

function focusRegion(x: number, y: number, width: number, height: number): TutorCanvasAction {
  return {
    id: createId(),
    type: 'focus_region',
    x,
    y,
    width,
    height,
  }
}

function textLabel(
  x: number,
  y: number,
  text: string,
  options?: {
    width?: number
    color?: TutorCanvasColor
  }
): TutorCanvasAction {
  return {
    id: createId(),
    type: 'place_text_label',
    x,
    y,
    text,
    width: options?.width,
    color: options?.color,
  }
}

function noteParagraph(
  x: number,
  y: number,
  lines: string[],
  options?: {
    width?: number
    color?: TutorCanvasColor
    lineHeight?: number
  }
) {
  const width = options?.width ?? 220
  const color = options?.color ?? 'black'
  const lineHeight = options?.lineHeight ?? 34
  const maxChars = Math.max(16, Math.floor(width / 8.5))

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => wrapTextLine(line, maxChars))
    .map((line, index) =>
      textLabel(x, y + index * lineHeight, line, {
        width,
        color,
      })
    )
}

function sanitizeShortNoteLines(lines: string[] | undefined, fallback: string[], options?: { maxLines?: number; maxChars?: number }) {
  const maxLines = options?.maxLines ?? 3
  const maxChars = options?.maxChars ?? 52
  const cleaned =
    lines
      ?.map((line) => line.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .slice(0, maxLines) ?? []

  if (
    cleaned.length === 0 ||
    cleaned.length > maxLines ||
    cleaned.some((line) => line.length > maxChars)
  ) {
    return fallback.slice(0, maxLines)
  }

  return cleaned
}

function sanitizeGraphNoteLines(
  lines: string[] | undefined,
  fallback: string[],
  options?: { maxLines?: number; maxChars?: number }
) {
  const cleaned = sanitizeShortNoteLines(lines, fallback, options)
  const looksGeneric = cleaned.every((line) => /\b(labeled|labelled|shown|marked)\b/i.test(line))
  return looksGeneric ? fallback.slice(0, options?.maxLines ?? 3) : cleaned
}

function resolveGraphSceneTitle(title: string | undefined, expression: string) {
  const trimmed = title?.trim()
  if (!trimmed) return 'Graph'

  const normalizedTitle = trimmed.toLowerCase().replace(/\s+/g, ' ')
  const compactTitle = normalizedTitle.replace(/\s+/g, '')
  const compactExpression = normalizeGraphExpression(expression).toLowerCase()

  if (
    normalizedTitle === 'graph' ||
    normalizedTitle === 'graph view' ||
    compactTitle.includes(`graphofy=${compactExpression}`) ||
    compactTitle.includes(`graphof${compactExpression}`) ||
    compactTitle.includes(`y=${compactExpression}`)
  ) {
    return 'Graph'
  }

  return trimmed
}

function wrapTextLine(line: string, maxChars: number) {
  const trimmed = line.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const words = trimmed.split(/\s+/)
  const wrapped: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || candidate.length <= maxChars) {
      current = candidate
      continue
    }

    wrapped.push(current)
    current = word
  }

  if (current) {
    wrapped.push(current)
  }

  return wrapped
}

function expandWrappedLines(lines: string[], maxChars: number) {
  return lines.flatMap((line) => wrapTextLine(line, maxChars))
}

function prettifyMathExpression(expression: string) {
  return expression
    .trim()
    .replace(/\*/g, ' · ')
    .replace(/\//g, ' / ')
    .replace(/=/g, ' = ')
    .replace(/\+/g, ' + ')
    .replace(/(?<!^|\(|\[|\{|\+|=|\s)-/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

function mathBlock(
  x: number,
  y: number,
  latex: string,
  options?: { width?: number; height?: number; displayMode?: boolean }
): TutorCanvasAction {
  return {
    id: createId(),
    type: 'place_math_block',
    x,
    y,
    latex,
    width: options?.width,
    height: options?.height,
    displayMode: options?.displayMode,
  }
}

function lineSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  options?: {
    label?: string
    color?: TutorCanvasColor
    dash?: TutorCanvasDash
    size?: TutorCanvasSize
  }
): TutorCanvasAction {
  return {
    id: createId(),
    type: 'draw_line_segment',
    start,
    end,
    label: options?.label,
    color: options?.color,
    dash: options?.dash,
    size: options?.size,
  }
}

function point(
  x: number,
  y: number,
  options?: {
    label?: string
    color?: TutorCanvasColor
    labelPosition?: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    labelWidth?: number
  }
): TutorCanvasAction {
  return {
    id: createId(),
    type: 'place_point',
    x,
    y,
    label: options?.label,
    color: options?.color,
    labelPosition: options?.labelPosition,
    labelWidth: options?.labelWidth,
  }
}

function rectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    color?: TutorCanvasColor
    dash?: TutorCanvasDash
    size?: TutorCanvasSize
    fill?: 'none' | 'semi' | 'solid'
    opacity?: number
    label?: string
  }
): TutorCanvasAction {
  return {
    id: createId(),
    type: 'draw_rectangle',
    x,
    y,
    width,
    height,
    color: options?.color,
    dash: options?.dash,
    size: options?.size,
    fill: options?.fill,
    opacity: options?.opacity,
    label: options?.label,
  }
}

function polyline(
  points: Array<{ x: number; y: number }>,
  options?: {
    label?: string
    color?: TutorCanvasColor
    dash?: TutorCanvasDash
    size?: TutorCanvasSize
  }
): TutorCanvasAction {
  return {
    id: createId(),
    type: 'plot_polyline',
    points,
    label: options?.label,
    color: options?.color,
    dash: options?.dash,
    size: options?.size,
  }
}

function buildSceneChrome(title: string) {
  return [
    rectangle(TOOL_SCENE.x, TOOL_SCENE.y, TOOL_SCENE.width, TOOL_SCENE.height, {
      color: 'light-blue',
      fill: 'semi',
      opacity: 0.08,
      dash: 'solid',
      size: 's',
    }),
    textLabel(TOOL_SCENE.x + 22, TOOL_SCENE.y + 18, title, {
      width: 260,
      color: 'green',
    }),
  ]
}

function buildTickActions(input: {
  origin: { x: number; y: number }
  xDomain: [number, number]
  yDomain: [number, number]
  plotRect: { x: number; y: number; width: number; height: number }
}) {
  const { origin, xDomain, yDomain, plotRect } = input
  const actions: TutorCanvasAction[] = []

  for (const tick of generateTicks(xDomain[0], xDomain[1], { targetSegments: 4 })) {
    const x = mapToRange(tick, xDomain[0], xDomain[1], plotRect.x, plotRect.x + plotRect.width)
    actions.push(
      lineSegment(
        { x, y: origin.y - 5 },
        { x, y: origin.y + 5 },
        { color: 'grey', size: 's', dash: 'solid' }
      )
    )
    if (!isNearlyEqual(tick, 0) && x > plotRect.x + 18 && x < plotRect.x + plotRect.width - 18) {
      actions.push(
        textLabel(x - 20, origin.y + 10, formatNumber(tick), {
          width: 40,
          color: 'grey',
        })
      )
    }
  }

  for (const tick of generateTicks(yDomain[0], yDomain[1], { targetSegments: 4 })) {
    const y = mapToRange(tick, yDomain[0], yDomain[1], plotRect.y + plotRect.height, plotRect.y)
    actions.push(
      lineSegment(
        { x: origin.x - 5, y },
        { x: origin.x + 5, y },
        { color: 'grey', size: 's', dash: 'solid' }
      )
    )
    if (!isNearlyEqual(tick, 0) && y > plotRect.y + 16 && y < plotRect.y + plotRect.height - 16) {
      actions.push(
        textLabel(origin.x + 10, y - 12, formatNumber(tick), {
          width: 52,
          color: 'grey',
        })
      )
    }
  }

  return actions
}

function buildGridActions(input: {
  origin: { x: number; y: number }
  xDomain: [number, number]
  yDomain: [number, number]
  plotRect: { x: number; y: number; width: number; height: number }
}) {
  const { xDomain, yDomain, plotRect } = input
  const actions: TutorCanvasAction[] = []

  for (const tick of generateTicks(xDomain[0], xDomain[1], { targetSegments: 4 })) {
    if (isNearlyEqual(tick, 0)) continue
    const x = mapToRange(tick, xDomain[0], xDomain[1], plotRect.x, plotRect.x + plotRect.width)
    actions.push(
      lineSegment(
        { x, y: plotRect.y },
        { x, y: plotRect.y + plotRect.height },
        { color: 'light-blue', size: 's', dash: 'dotted' }
      )
    )
  }

  for (const tick of generateTicks(yDomain[0], yDomain[1], { targetSegments: 4 })) {
    if (isNearlyEqual(tick, 0)) continue
    const y = mapToRange(tick, yDomain[0], yDomain[1], plotRect.y + plotRect.height, plotRect.y)
    actions.push(
      lineSegment(
        { x: plotRect.x, y },
        { x: plotRect.x + plotRect.width, y },
        { color: 'light-blue', size: 's', dash: 'dotted' }
      )
    )
  }

  return actions
}

function buildCanvasWriteActions(input: {
  title: string
  textLines?: string[]
  mathExpressions?: string[]
  clearExisting?: boolean
}): TutorCanvasAction[] {
  const textLines = expandWrappedLines(
    (input.textLines ?? []).map((line) => line.trim()).filter(Boolean),
    input.clearExisting === false ? 24 : 40
  )
  const mathExpressions = (input.mathExpressions ?? [])
    .map((line) => line.trim())
    .filter(Boolean)

  const workedStepHeight = 58
  const workedStepGap = 14
  const textLineHeight = 30
  const bodyHeight =
    textLines.length * textLineHeight +
    mathExpressions.length * workedStepHeight +
    Math.max(0, mathExpressions.length - 1) * workedStepGap +
    36
  const sceneHeight = clamp(Math.max(220, bodyHeight + 110), 220, 520)
  const sceneY = input.clearExisting === false ? NOTE_FRAME.y : 116
  const sceneX = input.clearExisting === false ? NOTE_FRAME.x : 600
  const sceneWidth = input.clearExisting === false ? NOTE_FRAME.width : 560

  const actions: TutorCanvasAction[] = []
  if (input.clearExisting !== false) {
    actions.push(clearToolLayer())
  }

  actions.push(
    rectangle(sceneX, sceneY, sceneWidth, sceneHeight, {
      color: 'light-blue',
      fill: 'semi',
      opacity: 0.1,
      dash: 'solid',
      size: 's',
    }),
    textLabel(sceneX + 22, sceneY + 18, input.title.trim() || 'Worked note', {
      width: sceneWidth - 44,
      color: 'green',
    })
  )

  let cursorY = sceneY + 62
  if (textLines.length > 0) {
    actions.push(
      ...noteParagraph(sceneX + 22, cursorY, textLines, {
        width: sceneWidth - 44,
        color: 'black',
        lineHeight: textLineHeight,
      })
    )
    cursorY += textLines.length * textLineHeight
    cursorY += 18
  }

  mathExpressions.forEach((latex) => {
    const readableExpression = prettifyMathExpression(latex)
    actions.push(
      rectangle(sceneX + 18, cursorY - 6, sceneWidth - 36, workedStepHeight, {
        color: 'light-blue',
        fill: 'semi',
        opacity: 0.08,
        dash: 'solid',
        size: 's',
      }),
      textLabel(sceneX + 34, cursorY + 8, readableExpression, {
        width: sceneWidth - 76,
        color: 'black',
      })
    )
    cursorY += workedStepHeight + workedStepGap
  })

  actions.push(focusRegion(sceneX - 24, sceneY - 24, sceneWidth + 48, sceneHeight + 48))
  return actions
}

function normalizeDomain(
  domain: [number, number] | undefined,
  fallback: [number, number]
): [number, number] {
  if (!domain) return fallback
  const sorted: [number, number] =
    domain[0] <= domain[1] ? [domain[0], domain[1]] : [domain[1], domain[0]]
  if (isNearlyEqual(sorted[0], sorted[1])) {
    return [sorted[0] - 1, sorted[1] + 1]
  }
  return sorted
}

function buildCoordinatePlaneScene(input?: {
  clearExisting?: boolean
  title?: string
  noteTitle?: string
  noteLines?: string[]
  showNoteBox?: boolean
  xDomain?: [number, number]
  yDomain?: [number, number]
  expressionLabel?: string
}) {
  const title = input?.title?.trim() || 'Coordinate plane'
  const noteTitle = input?.noteTitle?.trim() || 'What to notice'
  const noteLines = (
    input?.noteLines ?? ['Use this plane to plot points, compare coordinates, and trace patterns.']
  )
    .map((line) => line.trim())
    .filter(Boolean)

  const xDomain = normalizeDomain(input?.xDomain, [-6, 6])
  const yDomain = normalizeDomain(input?.yDomain, [-6, 6])
  const axisOrigin = {
    x: clamp(
      mapToRange(0, xDomain[0], xDomain[1], GRAPH_FRAME.x, GRAPH_FRAME.x + GRAPH_FRAME.width),
      GRAPH_FRAME.x,
      GRAPH_FRAME.x + GRAPH_FRAME.width
    ),
    y: clamp(
      mapToRange(0, yDomain[0], yDomain[1], GRAPH_FRAME.y + GRAPH_FRAME.height, GRAPH_FRAME.y),
      GRAPH_FRAME.y,
      GRAPH_FRAME.y + GRAPH_FRAME.height
    ),
  }

  const canvasActions: TutorCanvasAction[] = []
  if (input?.clearExisting !== false) {
    canvasActions.push(clearToolLayer())
  }

  canvasActions.push(
    ...buildSceneChrome(title),
    ...(input?.expressionLabel
      ? [
          textLabel(TOOL_SCENE.x + 22, TOOL_SCENE.y + 50, prettifyMathExpression(input.expressionLabel), {
            width: 260,
            color: 'black',
          }),
        ]
      : []),
    rectangle(GRAPH_FRAME.x, GRAPH_FRAME.y, GRAPH_FRAME.width, GRAPH_FRAME.height, {
      color: 'grey',
      fill: 'none',
      dash: 'solid',
      size: 's',
    }),
    ...buildGridActions({
      origin: axisOrigin,
      xDomain,
      yDomain,
      plotRect: GRAPH_FRAME,
    }),
    {
      id: createId(),
      type: 'draw_axes',
      origin: axisOrigin,
      xLength: GRAPH_FRAME.width,
      yLength: GRAPH_FRAME.height,
      xLabel: 'x',
      yLabel: 'y',
      color: 'grey',
      size: 's',
      dash: 'solid',
    },
    ...buildTickActions({
      origin: axisOrigin,
      xDomain,
      yDomain,
      plotRect: GRAPH_FRAME,
    }),
    ...(input?.showNoteBox
      ? [
          rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
            color: 'light-green',
            fill: 'semi',
            opacity: 0.12,
            dash: 'solid',
            size: 's',
          }),
          textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, noteTitle, {
            width: NOTE_FRAME.width - 32,
            color: 'green',
          }),
          ...noteParagraph(NOTE_FRAME.x + 16, NOTE_FRAME.y + 52, noteLines.slice(0, 4), {
            width: NOTE_FRAME.width - 32,
            color: 'black',
            lineHeight: 34,
          }),
        ]
      : []),
    focusRegion(TOOL_SCENE.x - 28, TOOL_SCENE.y - 24, TOOL_SCENE.width + 56, TOOL_SCENE.height + 48)
  )

  return {
    xDomain,
    yDomain,
    axisOrigin,
    canvasActions,
  }
}

function expandNumericDomain(
  values: number[],
  options?: {
    minSpan?: number
    padding?: number
  }
): [number, number] {
  const safeValues = values.filter((value) => Number.isFinite(value))
  if (safeValues.length === 0) return [-6, 6]

  const min = Math.min(...safeValues)
  const max = Math.max(...safeValues)
  const span = Math.max(max - min, options?.minSpan ?? 4)
  const padding = Math.max(options?.padding ?? 1, span * 0.18)
  const center = (min + max) / 2
  const half = span / 2 + padding

  return [roundPoint(center - half), roundPoint(center + half)]
}

function mapGraphCoordinateToCanvas(
  point: { x: number; y: number },
  domains: { x: [number, number]; y: [number, number] }
) {
  return {
    x: mapToRange(point.x, domains.x[0], domains.x[1], GRAPH_FRAME.x, GRAPH_FRAME.x + GRAPH_FRAME.width),
    y: mapToRange(point.y, domains.y[0], domains.y[1], GRAPH_FRAME.y + GRAPH_FRAME.height, GRAPH_FRAME.y),
  }
}

function choosePointPlotNotes(points: Array<{ x: number; y: number }>, connectPoints: boolean) {
  if (points.length < 2) {
    return ['Plot the point carefully, then describe what each coordinate means.']
  }

  const sorted = [...points].sort((a, b) => a.x - b.x)
  const slopes: number[] = []
  for (let index = 1; index < sorted.length; index += 1) {
    const dx = sorted[index].x - sorted[index - 1].x
    if (isNearlyEqual(dx, 0)) {
      slopes.push(Number.POSITIVE_INFINITY)
      continue
    }
    slopes.push(roundPoint((sorted[index].y - sorted[index - 1].y) / dx, 4))
  }

  const finiteSlopes = slopes.filter((value) => Number.isFinite(value))
  const isLinearPattern =
    connectPoints &&
    finiteSlopes.length > 0 &&
    finiteSlopes.every((value) => isNearlyEqual(value, finiteSlopes[0], 0.05))

  if (isLinearPattern) {
    return [
      'The points line up in a straight pattern.',
      `Each step changes by about ${formatNumber(finiteSlopes[0])} in y for each 1 in x.`,
    ]
  }

  if (connectPoints) {
    return [
      'Follow the points in order and notice how the graph changes.',
      'Check whether the pattern stays linear or starts to curve.',
    ]
  }

  return [
    'Read each ordered pair as left or right first, then up or down.',
    'Compare the points to spot a pattern before connecting anything.',
  ]
}

function clampCanvasLabel(point: { x: number; y: number }) {
  return {
    x: clamp(point.x + 18, GRAPH_FRAME.x + 8, GRAPH_FRAME.x + GRAPH_FRAME.width - 150),
    y: clamp(point.y - 34, GRAPH_FRAME.y + 8, GRAPH_FRAME.y + GRAPH_FRAME.height - 28),
  }
}

function getCalloutAnchorPosition(
  point: GraphFeaturePoint,
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  titleWidth: number,
  coordinateWidth: number
) {
  switch (position) {
    case 'top':
      return {
        titleX: point.canvasX - titleWidth / 2,
        titleY: point.canvasY - 62,
        coordinateX: point.canvasX - coordinateWidth / 2,
        coordinateY: point.canvasY - 32,
      }
    case 'bottom':
      return {
        titleX: point.canvasX - titleWidth / 2,
        titleY: point.canvasY + 14,
        coordinateX: point.canvasX - coordinateWidth / 2,
        coordinateY: point.canvasY + 42,
      }
    case 'left':
      return {
        titleX: point.canvasX - titleWidth - 18,
        titleY: point.canvasY - 26,
        coordinateX: point.canvasX - coordinateWidth - 18,
        coordinateY: point.canvasY + 2,
      }
    case 'right':
      return {
        titleX: point.canvasX + 18,
        titleY: point.canvasY - 26,
        coordinateX: point.canvasX + 18,
        coordinateY: point.canvasY + 2,
      }
    case 'top-left':
      return {
        titleX: point.canvasX - titleWidth - 14,
        titleY: point.canvasY - 58,
        coordinateX: point.canvasX - coordinateWidth - 14,
        coordinateY: point.canvasY - 30,
      }
    case 'top-right':
      return {
        titleX: point.canvasX + 14,
        titleY: point.canvasY - 58,
        coordinateX: point.canvasX + 14,
        coordinateY: point.canvasY - 30,
      }
    case 'bottom-left':
      return {
        titleX: point.canvasX - titleWidth - 14,
        titleY: point.canvasY + 14,
        coordinateX: point.canvasX - coordinateWidth - 14,
        coordinateY: point.canvasY + 42,
      }
    case 'bottom-right':
    default:
      return {
        titleX: point.canvasX + 14,
        titleY: point.canvasY + 14,
        coordinateX: point.canvasX + 14,
        coordinateY: point.canvasY + 42,
      }
  }
}

function clampGraphCalloutBox(x: number, y: number, width: number, height: number) {
  const minX = GRAPH_FRAME.x + 10
  const maxX = GRAPH_FRAME.x + GRAPH_FRAME.width - width - 10
  const minY = GRAPH_FRAME.y + 10
  const maxY = GRAPH_FRAME.y + GRAPH_FRAME.height - height - 10

  return {
    x: clamp(x, minX, Math.max(minX, maxX)),
    y: clamp(y, minY, Math.max(minY, maxY)),
    width,
    height,
  }
}

function getCalloutLeaderTarget(
  box: { x: number; y: number; width: number; height: number },
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
) {
  switch (position) {
    case 'top':
      return { x: box.x + box.width / 2, y: box.y + box.height }
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y }
    case 'left':
      return { x: box.x + box.width, y: box.y + box.height / 2 }
    case 'right':
      return { x: box.x, y: box.y + box.height / 2 }
    case 'top-left':
      return { x: box.x + box.width, y: box.y + box.height }
    case 'top-right':
      return { x: box.x, y: box.y + box.height }
    case 'bottom-left':
      return { x: box.x + box.width, y: box.y }
    case 'bottom-right':
    default:
      return { x: box.x, y: box.y }
  }
}

function buildGraphPointCallout(input: {
  point: GraphFeaturePoint
  pointColor: TutorCanvasColor
  title: string
  coordinateText?: string
  titleWidth?: number
  coordinateWidth?: number
  position?: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}) {
  const titleWidth = input.titleWidth ?? 104
  const coordinateWidth = input.coordinateWidth ?? 92
  const position = input.position ?? 'top-right'
  const anchor = getCalloutAnchorPosition(input.point, position, titleWidth, coordinateWidth)
  const contentWidth = Math.max(titleWidth, input.coordinateText ? coordinateWidth : 0)
  const boxWidth = contentWidth + 26
  const boxHeight = input.coordinateText ? 66 : 36
  const box = clampGraphCalloutBox(
    Math.min(anchor.titleX, anchor.coordinateX) - 10,
    anchor.titleY - 8,
    boxWidth,
    boxHeight
  )
  const leaderTarget = getCalloutLeaderTarget(box, position)
  const actions: TutorCanvasAction[] = [
    point(input.point.canvasX, input.point.canvasY, {
      color: input.pointColor,
    }),
    lineSegment(
      { x: input.point.canvasX, y: input.point.canvasY },
      leaderTarget,
      {
        color: input.pointColor,
        size: 's',
        dash: 'solid',
      }
    ),
    rectangle(box.x, box.y, box.width, box.height, {
      color: input.pointColor,
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(box.x + 12, box.y + 10, input.title, {
      width: titleWidth,
      color: input.pointColor,
    }),
  ]

  if (input.coordinateText) {
    actions.push(
      textLabel(box.x + 12, box.y + 38, input.coordinateText, {
        width: coordinateWidth,
        color: input.pointColor,
      })
    )
  }

  return actions
}

function buildBoundsForCanvasAction(action: TutorCanvasAction) {
  switch (action.type) {
    case 'focus_region':
      return { x: action.x, y: action.y, width: action.width, height: action.height }
    case 'place_text_label':
      return { x: action.x, y: action.y, width: action.width ?? 220, height: 56 }
    case 'place_math_block':
      return { x: action.x, y: action.y, width: action.width ?? 220, height: action.height ?? 86 }
    case 'place_point':
      return { x: action.x - 28, y: action.y - 28, width: 56, height: 56 }
    case 'draw_line_segment': {
      const minX = Math.min(action.start.x, action.end.x)
      const minY = Math.min(action.start.y, action.end.y)
      return {
        x: minX - 18,
        y: minY - 18,
        width: Math.abs(action.end.x - action.start.x) + 36,
        height: Math.abs(action.end.y - action.start.y) + 36,
      }
    }
    case 'draw_axes':
      return {
        x: action.origin.x - action.xLength / 2 - 24,
        y: action.origin.y - action.yLength / 2 - 24,
        width: action.xLength + 48,
        height: action.yLength + 48,
      }
    case 'draw_rectangle':
    case 'highlight_region':
      return { x: action.x, y: action.y, width: action.width, height: action.height }
    case 'plot_polyline': {
      if (action.points.length === 0) return null
      const xs = action.points.map((point) => point.x)
      const ys = action.points.map((point) => point.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      return {
        x: minX - 24,
        y: minY - 24,
        width: Math.max(48, maxX - minX + 48),
        height: Math.max(48, maxY - minY + 48),
      }
    }
    case 'clear_tool_layer':
      return null
    default:
      return null
  }
}

function appendFocusForActions(actions: TutorCanvasAction[]) {
  const bounds = actions
    .map((action) => buildBoundsForCanvasAction(action))
    .filter(Boolean) as Array<{ x: number; y: number; width: number; height: number }>

  if (bounds.length === 0) return actions

  const minX = Math.min(...bounds.map((bound) => bound.x))
  const minY = Math.min(...bounds.map((bound) => bound.y))
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width))
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height))

  return [
    ...actions,
    focusRegion(minX - 28, minY - 28, maxX - minX + 56, maxY - minY + 56),
  ]
}

function formatLinearTerm(coefficient: number) {
  if (isNearlyEqual(coefficient, 1)) return 'x'
  if (isNearlyEqual(coefficient, -1)) return '-x'
  return `${formatNumber(coefficient)}x`
}

function formatSignedConstant(value: number) {
  if (isNearlyEqual(value, 0)) return ''
  return value > 0 ? ` + ${formatNumber(value)}` : ` - ${formatNumber(Math.abs(value))}`
}

function formatLinearExpression(coefficient: number, intercept: number) {
  if (isNearlyEqual(coefficient, 0)) {
    return formatNumber(intercept)
  }

  return `${formatLinearTerm(coefficient)}${formatSignedConstant(intercept)}`
}

function formatEquality(left: string, right: string) {
  return `${left} = ${right}`
}

function chooseTeachingDomain(points: Array<{ x: number; y: number }>) {
  const xs = points.map((point) => point.x)
  const defaultMin = Math.min(...xs)
  const defaultMax = Math.max(...xs)

  const xIntercepts: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]

    if (isNearlyEqual(previous.y, 0)) {
      xIntercepts.push(previous.x)
      continue
    }

    if (previous.y === current.y || previous.y * current.y > 0) continue
    const interpolatedX =
      previous.x - (previous.y * (current.x - previous.x)) / (current.y - previous.y)
    xIntercepts.push(roundPoint(interpolatedX))
  }

  const deduped = xIntercepts.filter(
    (value, index) => xIntercepts.findIndex((candidate) => isNearlyEqual(candidate, value, 0.05)) === index
  )

  const yValues = points.map((point) => point.y)
  const lowestPoint = points.reduce((best, point) => {
    if (!best) return point
    return point.y < best.y ? point : best
  }, null as { x: number; y: number } | null)
  const highestPoint = points.reduce((best, point) => {
    if (!best) return point
    return point.y > best.y ? point : best
  }, null as { x: number; y: number } | null)
  const yMin = Math.min(...yValues)
  const yMax = Math.max(...yValues)
  const extremum =
    lowestPoint && highestPoint
      ? Math.abs(lowestPoint.y) <= Math.abs(highestPoint.y)
        ? lowestPoint
        : highestPoint
      : lowestPoint ?? highestPoint

  const keyXValues = deduped.length > 0 ? [...deduped] : []
  if (extremum && Number.isFinite(extremum.x)) {
    keyXValues.push(roundPoint(extremum.x))
  }
  keyXValues.push(0)

  if (deduped.length === 2) {
    const rootMin = Math.min(...deduped)
    const rootMax = Math.max(...deduped)
    const center = roundPoint((rootMin + rootMax) / 2, 4)
    const rootSpan = rootMax - rootMin
    const halfWidth = Math.max(2.2, rootSpan / 2 + 1.2)
    const domain: [number, number] = [roundPoint(center - halfWidth), roundPoint(center + halfWidth)]
    return [clamp(domain[0], defaultMin, defaultMax), clamp(domain[1], defaultMin, defaultMax)] as [number, number]
  }

  if (
    extremum &&
    Number.isFinite(extremum.x) &&
    isNearlyEqual(yMin, 0, 0.35) === false &&
    isNearlyEqual(yMax, 0, 0.35) === false
  ) {
    const domain = expandNumericDomain(keyXValues, {
      minSpan: 4.5,
      padding: 1.35,
    })
    return [clamp(domain[0], defaultMin, defaultMax), clamp(domain[1], defaultMin, defaultMax)] as [number, number]
  }

  return [defaultMin, defaultMax] as [number, number]
}

function dedupeNumbers(values: number[], tolerance = 0.05) {
  return values.filter(
    (value, index) => values.findIndex((candidate) => isNearlyEqual(candidate, value, tolerance)) === index
  )
}

function extractQuadraticCoefficients(expression: string) {
  const normalized = normalizeExpression(expression)
  const f0 = coerceFiniteNumber(safeEvaluate(normalized, { x: 0 }))
  const f1 = coerceFiniteNumber(safeEvaluate(normalized, { x: 1 }))
  const f2 = coerceFiniteNumber(safeEvaluate(normalized, { x: 2 }))
  const f3 = coerceFiniteNumber(safeEvaluate(normalized, { x: 3 }))

  const a = (f2 - 2 * f1 + f0) / 2
  if (Math.abs(a) < 1e-9) {
    throw new Error('Expression is not quadratic.')
  }

  const b = f1 - f0 - a
  const c = f0
  const checkAtThree = a * 9 + b * 3 + c

  if (Math.abs(checkAtThree - f3) > 1e-6) {
    throw new Error('Only simple quadratic expressions in x are supported right now.')
  }

  return {
    a: roundPoint(a, 6),
    b: roundPoint(b, 6),
    c: roundPoint(c, 6),
  }
}

type GraphAnalysis = {
  kind: 'linear' | 'quadratic' | 'sampled'
  xIntercepts: number[]
  yIntercept: number | null
  vertex: { x: number; y: number; kind: 'lowest' | 'highest' } | null
  endBehavior: 'opens-up' | 'opens-down' | null
  axisOfSymmetryX: number | null
  slope: number | null
}

function analyzeGraphFeatures(
  expression: string,
  points: Array<{ x: number; y: number }>,
  domain: [number, number]
): GraphAnalysis {
  try {
    const linear = extractLinearCoefficients(expression)
    const yIntercept = roundPoint(linear.intercept)
    const xIntercepts =
      Math.abs(linear.coefficient) < 1e-9
        ? []
        : [-linear.intercept / linear.coefficient]
            .filter((value) => value >= domain[0] - 1e-6 && value <= domain[1] + 1e-6)
            .map((value) => roundPoint(value))

    return {
      kind: 'linear',
      xIntercepts: dedupeNumbers(xIntercepts),
      yIntercept,
      vertex: null,
      endBehavior: null,
      axisOfSymmetryX: null,
      slope: roundPoint(linear.coefficient),
    }
  } catch {
    // Fall through to quadratic or sampled analysis.
  }

  try {
    const quadratic = extractQuadraticCoefficients(expression)
    const discriminant = quadratic.b ** 2 - 4 * quadratic.a * quadratic.c
    const rawRoots =
      discriminant < -1e-8
        ? []
        : discriminant < 1e-8
        ? [-quadratic.b / (2 * quadratic.a)]
        : [
            (-quadratic.b - Math.sqrt(discriminant)) / (2 * quadratic.a),
            (-quadratic.b + Math.sqrt(discriminant)) / (2 * quadratic.a),
          ]

    const xIntercepts = dedupeNumbers(
      rawRoots
        .filter((value) => value >= domain[0] - 1e-6 && value <= domain[1] + 1e-6)
        .map((value) => roundPoint(value, 4))
    )
    const vertexX = -quadratic.b / (2 * quadratic.a)
    const vertexY = quadratic.a * vertexX ** 2 + quadratic.b * vertexX + quadratic.c

    return {
      kind: 'quadratic',
      xIntercepts,
      yIntercept: roundPoint(quadratic.c),
      vertex: {
        x: roundPoint(vertexX),
        y: roundPoint(vertexY),
        kind: quadratic.a > 0 ? 'lowest' : 'highest',
      },
      endBehavior: quadratic.a > 0 ? 'opens-up' : 'opens-down',
      axisOfSymmetryX: roundPoint(vertexX),
      slope: null,
    }
  } catch {
    // Fall through to sampled analysis.
  }

  const xIntercepts: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]

    if (isNearlyEqual(previous.y, 0)) {
      xIntercepts.push(previous.x)
      continue
    }

    if (previous.y === current.y || previous.y * current.y > 0) continue

    const interpolatedX =
      previous.x - (previous.y * (current.x - previous.x)) / (current.y - previous.y)
    xIntercepts.push(roundPoint(interpolatedX))
  }

  const yIntercept =
    domain[0] <= 0 && domain[1] >= 0
      ? roundPoint(coerceFiniteNumber(safeEvaluate(expression, { x: 0 })))
      : null

  const deltas = points.slice(1).map((point, index) => point.y - points[index].y)
  const hasPositiveDelta = deltas.some((delta) => delta > 0.02)
  const hasNegativeDelta = deltas.some((delta) => delta < -0.02)
  const isMonotonic = !(hasPositiveDelta && hasNegativeDelta)
  const midpoint = points[Math.floor(points.length / 2)]
  const endBehavior =
    points[0].y > midpoint.y && points[points.length - 1].y > midpoint.y
      ? ('opens-up' as const)
      : points[0].y < midpoint.y && points[points.length - 1].y < midpoint.y
      ? ('opens-down' as const)
      : null

  const lowestPoint = points.reduce((best, point) => {
    if (!best) return point
    return point.y < best.y ? point : best
  }, null as { x: number; y: number } | null)
  const highestPoint = points.reduce((best, point) => {
    if (!best) return point
    return point.y > best.y ? point : best
  }, null as { x: number; y: number } | null)

  const vertex = isMonotonic
    ? null
    : lowestPoint && highestPoint
    ? Math.abs(lowestPoint.y) <= Math.abs(highestPoint.y)
      ? { ...lowestPoint, kind: 'lowest' as const }
      : { ...highestPoint, kind: 'highest' as const }
    : null

  return {
    kind: 'sampled',
    xIntercepts: dedupeNumbers(xIntercepts),
    yIntercept,
    vertex,
    endBehavior,
    axisOfSymmetryX: vertex ? roundPoint(vertex.x) : null,
    slope: null,
  }
}

function buildGraphFeatureLines(input: {
  xIntercepts: number[]
  yIntercept: number | null
  vertex: { x: number; y: number; kind: 'lowest' | 'highest' } | null
  endBehavior: 'opens-up' | 'opens-down' | null
  axisOfSymmetryX: number | null
  showXIntercepts: boolean
  showYIntercept: boolean
  showVertex: boolean
}) {
  const lines: string[] = []
  const features: string[] = []

  const yInterceptMatchesVertex = Boolean(
    input.yIntercept !== null &&
      input.vertex &&
      isNearlyEqual(input.vertex.x, 0, 0.05) &&
      isNearlyEqual(input.vertex.y, input.yIntercept, 0.05)
  )

  if (yInterceptMatchesVertex && input.showYIntercept && input.showVertex && input.vertex) {
    const overlapText = `(${formatNumber(input.vertex.x)}, ${formatNumber(input.vertex.y)})`
    lines.push(
      `${input.vertex.kind === 'lowest' ? 'The lowest point' : 'The highest point'} is ${overlapText}.`
    )
    features.push(`shared point: vertex and y-intercept at ${overlapText}`)
  } else {
    if (input.showVertex && input.vertex) {
      const pointText = `(${formatNumber(input.vertex.x)}, ${formatNumber(input.vertex.y)})`
      lines.push(
        `${input.endBehavior ? 'The vertex is' : input.vertex.kind === 'lowest' ? 'The lowest point is' : 'The highest point is'} ${pointText}.`
      )
      features.push(`${input.endBehavior ? 'vertex' : input.vertex.kind} point: ${pointText}`)
    }

    if (input.showYIntercept && input.yIntercept !== null) {
      lines.push(`At x = 0, y = ${formatNumber(input.yIntercept)}.`)
      features.push(`y-intercept: (0, ${formatNumber(input.yIntercept)})`)
    }
  }

  if (input.showXIntercepts && input.xIntercepts.length > 0) {
    const xInterceptText =
      input.xIntercepts.length === 2
        ? `x = ${formatNumber(input.xIntercepts[0])} and x = ${formatNumber(input.xIntercepts[1])}`
        : input.xIntercepts.map((value) => `x = ${formatNumber(value)}`).join(', ')
    lines.push(`It crosses the x-axis at ${xInterceptText}.`)
    features.push(`x-intercepts: ${input.xIntercepts.map((value) => `(${formatNumber(value)}, 0)`).join(', ')}`)
  }

  if (input.axisOfSymmetryX !== null && input.vertex && lines.length < 2) {
    lines.push(`It is symmetric about x = ${formatNumber(input.axisOfSymmetryX)}.`)
    features.push(`axis of symmetry: x = ${formatNumber(input.axisOfSymmetryX)}`)
  }

  if (input.endBehavior === 'opens-up') {
    features.push('opens upward')
    if (lines.length < 2) {
      lines.push('The curve opens upward.')
    }
  } else if (input.endBehavior === 'opens-down') {
    features.push('opens downward')
    if (lines.length < 2) {
      lines.push('The curve opens downward.')
    }
  }

  if (lines.length === 0) {
    lines.push('The plotted graph shows the overall shape over this domain.')
    features.push('general shape plotted over the requested domain')
  }

  return { noteLines: lines.slice(0, 3), features, yInterceptMatchesVertex }
}

function createGraphFeaturePoint(
  label: string,
  pointValue: { x: number; y: number },
  xDomain: [number, number],
  yDomain: [number, number]
): GraphFeaturePoint {
  const canvasPoint = mapGraphCoordinateToCanvas(pointValue, {
    x: xDomain,
    y: yDomain,
  })

  return {
    x: roundPoint(pointValue.x),
    y: roundPoint(pointValue.y),
    canvasX: roundPoint(canvasPoint.x, 2),
    canvasY: roundPoint(canvasPoint.y, 2),
    label,
  }
}

function chooseVertexLabelPosition(point: GraphFeaturePoint, kind: 'lowest' | 'highest' | null | undefined) {
  const isNearBottom = point.canvasY > GRAPH_FRAME.y + GRAPH_FRAME.height * 0.68
  const isNearTop = point.canvasY < GRAPH_FRAME.y + GRAPH_FRAME.height * 0.28

  if (kind === 'lowest') {
    return isNearBottom ? ('top' as const) : ('bottom-right' as const)
  }

  if (kind === 'highest') {
    return isNearTop ? ('bottom-right' as const) : ('top' as const)
  }

  return isNearBottom ? ('top-right' as const) : ('bottom-right' as const)
}

function buildGraphAnnotationActions(input: {
  xIntercepts: GraphFeaturePoint[]
  yIntercept: GraphFeaturePoint | null
  vertex: GraphFeaturePoint | null
  showXIntercepts: boolean
  showYIntercept: boolean
  showVertex: boolean
  yInterceptMatchesVertex: boolean
  vertexKind: 'lowest' | 'highest' | null | undefined
}) {
  const actions: TutorCanvasAction[] = []

  if (input.showXIntercepts) {
    input.xIntercepts.slice(0, 2).forEach((featurePoint, index) => {
      actions.push(
        ...buildGraphPointCallout({
          point: featurePoint,
          pointColor: 'orange',
          title: 'x-int',
          coordinateText: `(${formatNumber(featurePoint.x)}, 0)`,
          position: index === 0 ? 'top-left' : 'top-right',
          titleWidth: 72,
          coordinateWidth: 94,
        })
      )
    })
  }

  if (input.showYIntercept && input.yIntercept && !input.yInterceptMatchesVertex) {
    actions.push(
      ...buildGraphPointCallout({
        point: input.yIntercept,
        pointColor: 'green',
        title: 'y-int',
        coordinateText: `(0, ${formatNumber(input.yIntercept.y)})`,
        position: 'bottom-right',
        titleWidth: 72,
        coordinateWidth: 94,
      })
    )
  }

  if (input.showVertex && input.vertex) {
    actions.push(
      ...buildGraphPointCallout({
        point: input.vertex,
        pointColor: 'red',
        title:
          input.yInterceptMatchesVertex && input.showYIntercept
            ? input.showVertex
              ? 'vertex'
              : 'y-int'
            : 'vertex',
        coordinateText: `(${formatNumber(input.vertex.x)}, ${formatNumber(input.vertex.y)})`,
        position: chooseVertexLabelPosition(input.vertex, input.vertexKind),
        titleWidth: 82,
        coordinateWidth: 92,
      })
    )
  } else if (input.showYIntercept && input.yInterceptMatchesVertex && input.vertex) {
    actions.push(
      ...buildGraphPointCallout({
        point: input.vertex,
        pointColor: 'green',
        title: 'y-int',
        coordinateText: `(0, ${formatNumber(input.vertex.y)})`,
        position: chooseVertexLabelPosition(input.vertex, input.vertexKind),
        titleWidth: 72,
        coordinateWidth: 92,
      })
    )
  }

  return actions
}

function buildGraphFeatureCoordinates(input: {
  xDomain: [number, number]
  yDomain: [number, number]
  xIntercepts: number[]
  yIntercept: number | null
  vertex: { x: number; y: number; kind: 'lowest' | 'highest' } | null
}): GraphFeatureCoordinates {
  const xIntercepts = input.xIntercepts.map((value) =>
    createGraphFeaturePoint('x-intercept', { x: value, y: 0 }, input.xDomain, input.yDomain)
  )
  const yIntercept =
    input.yIntercept === null
      ? null
      : createGraphFeaturePoint(
          'y-intercept',
          { x: 0, y: input.yIntercept },
          input.xDomain,
          input.yDomain
        )
  const vertex =
    input.vertex === null
      ? null
      : createGraphFeaturePoint(
          'vertex',
          { x: input.vertex.x, y: input.vertex.y },
          input.xDomain,
          input.yDomain
        )

  return {
    xIntercepts,
    yIntercept,
    vertex,
    axisOfSymmetryX: input.vertex ? roundPoint(input.vertex.x) : null,
  }
}

type GraphSceneData = {
  expression: string
  xDomain: [number, number]
  yDomain: [number, number]
  points: Array<{ x: number; y: number }>
  plotPoints: Array<{ x: number; y: number }>
  axisOrigin: { x: number; y: number }
  analysis: GraphAnalysis
  featureCoordinates: GraphFeatureCoordinates
}

function buildGraphSceneData(expressionInput: string, requestedDomain?: [number, number]): GraphSceneData {
  const expression = normalizeGraphExpression(expressionInput)
  const rawRequestedDomain = requestedDomain ?? [-6, 6]
  const normalizedRequestedDomain: [number, number] =
    rawRequestedDomain[0] === rawRequestedDomain[1]
      ? [rawRequestedDomain[0] - 1, rawRequestedDomain[1] + 1]
      : rawRequestedDomain[0] < rawRequestedDomain[1]
      ? rawRequestedDomain
      : [rawRequestedDomain[1], rawRequestedDomain[0]]

  const sampleCount = 49
  const rawStep = (normalizedRequestedDomain[1] - normalizedRequestedDomain[0]) / (sampleCount - 1 || 1)
  const rawPoints: Array<{ x: number; y: number }> = []

  for (let index = 0; index < sampleCount; index += 1) {
    const x = normalizedRequestedDomain[0] + rawStep * index
    const y = coerceFiniteNumber(safeEvaluate(expression, { x }))
    rawPoints.push({ x: roundPoint(x), y: roundPoint(y) })
  }

  const xDomain = requestedDomain
    ? normalizedRequestedDomain
    : chooseTeachingDomain(rawPoints)
  const step = (xDomain[1] - xDomain[0]) / (sampleCount - 1 || 1)
  const points: Array<{ x: number; y: number }> = []

  for (let index = 0; index < sampleCount; index += 1) {
    const x = xDomain[0] + step * index
    const y = coerceFiniteNumber(safeEvaluate(expression, { x }))
    points.push({ x: roundPoint(x), y: roundPoint(y) })
  }

  if (points.length < 3) {
    throw new Error('The graph needs at least three points to render reliably.')
  }

  let yMin = Math.min(...points.map((point) => point.y))
  let yMax = Math.max(...points.map((point) => point.y))
  if (isNearlyEqual(yMin, yMax)) {
    yMin -= 2
    yMax += 2
  }

  const yPadding = Math.max(1, (yMax - yMin) * 0.18)
  const yDomain: [number, number] = [roundPoint(yMin - yPadding), roundPoint(yMax + yPadding)]
  const plotPoints = points.map((point) =>
    mapGraphCoordinateToCanvas(point, {
      x: xDomain,
      y: yDomain,
    })
  )
  const axisOrigin = {
    x: clamp(
      mapToRange(0, xDomain[0], xDomain[1], GRAPH_FRAME.x, GRAPH_FRAME.x + GRAPH_FRAME.width),
      GRAPH_FRAME.x,
      GRAPH_FRAME.x + GRAPH_FRAME.width
    ),
    y: clamp(
      mapToRange(0, yDomain[0], yDomain[1], GRAPH_FRAME.y + GRAPH_FRAME.height, GRAPH_FRAME.y),
      GRAPH_FRAME.y,
      GRAPH_FRAME.y + GRAPH_FRAME.height
    ),
  }
  const analysis = analyzeGraphFeatures(expression, points, xDomain)
  const featureCoordinates = buildGraphFeatureCoordinates({
    xDomain,
    yDomain,
    xIntercepts: analysis.xIntercepts,
    yIntercept: analysis.yIntercept,
    vertex: analysis.vertex,
  })

  return {
    expression,
    xDomain,
    yDomain,
    points,
    plotPoints,
    axisOrigin,
    analysis,
    featureCoordinates,
  }
}

export function mathCalculate(expression: string) {
  const normalized = normalizeExpression(expression)
  const exact = simplify(normalized).toString()
  const numeric = coerceFiniteNumber(safeEvaluate(normalized))

  return {
    expression: normalized,
    exact,
    numeric: roundPoint(numeric),
    explanation: 'This calculation was evaluated with a deterministic math engine.',
  }
}

function parseStudentAnswerValue(answer: string) {
  const normalized = normalizeExpression(answer).replace(/^[a-z]=/i, '')
  return coerceFiniteNumber(safeEvaluate(normalized))
}

export function mathCheckAnswer(input: {
  problemExpression: string
  studentAnswer: string
  tolerance?: number
}): MathAnswerCheckResult {
  const problemExpression = normalizeExpression(input.problemExpression)
  const studentAnswer = normalizeExpression(input.studentAnswer)
  const tolerance = clamp(input.tolerance ?? 1e-6, 1e-9, 0.05)

  if (!problemExpression || !studentAnswer) {
    return {
      verdict: 'unclear',
      reason: 'The problem and the student answer both need to be provided.',
      hintTarget: 'state the full problem and answer',
      suggestedQuestion: 'Can you write the full expression and your answer clearly?',
    }
  }

  try {
    if (problemExpression.includes('=')) {
      const solved = mathSolveLinear(problemExpression)
      const studentValue = parseStudentAnswerValue(studentAnswer)
      const correct = isNearlyEqual(studentValue, solved.solution, tolerance)

      return {
        verdict: correct ? 'correct' : 'incorrect',
        expectedValue: solved.solution,
        studentValue: roundPoint(studentValue),
        expectedExact: `x=${formatNumber(solved.solution)}`,
        reason: correct
          ? 'The answer matches the deterministic linear-equation solution.'
          : `The equation solves to x = ${formatNumber(solved.solution)}, not ${formatNumber(studentValue)}.`,
        hintTarget: correct ? 'check by substituting' : 'isolate the variable and check signs',
        suggestedQuestion: correct
          ? 'Can you substitute your answer back into the original equation to check it?'
          : 'Which operation should undo the constant or coefficient first?',
      }
    }

    const expectedValue = coerceFiniteNumber(safeEvaluate(problemExpression))
    const studentValue = parseStudentAnswerValue(studentAnswer)
    const correct = isNearlyEqual(studentValue, expectedValue, tolerance)

    return {
      verdict: correct ? 'correct' : 'incorrect',
      expectedValue: roundPoint(expectedValue),
      studentValue: roundPoint(studentValue),
      expectedExact: simplify(problemExpression).toString(),
      reason: correct
        ? 'The answer matches the deterministic calculation.'
        : `The expression equals ${formatNumber(expectedValue)}, not ${formatNumber(studentValue)}.`,
      hintTarget: correct ? 'explain the strategy' : 'recheck the operation order or common denominator',
      suggestedQuestion: correct
        ? 'Can you explain the step that made the calculation work?'
        : 'Which part should we recalculate first to find the mismatch?',
    }
  } catch {
    return {
      verdict: 'unclear',
      reason: 'The answer could not be checked reliably with the current deterministic tool.',
      hintTarget: 'rewrite in a simpler math form',
      suggestedQuestion: 'Can you rewrite the problem as a clear expression or equation?',
    }
  }
}

export function mathCheckStep(previousStep: string, nextStep: string): MathStepCheckResult {
  const prev = normalizeExpression(previousStep)
  const next = normalizeExpression(nextStep)

  if (!prev || !next) {
    throw new Error('Both the previous step and next step are required.')
  }

  if (prev === next) {
    return {
      verdict: 'valid',
      reason: 'The two steps are algebraically the same.',
      hintTarget: 'keep going from the same equation',
    }
  }

  if (!prev.includes('=') || !next.includes('=')) {
    return {
      verdict: 'unclear',
      reason: 'Step checking currently supports equation-to-equation comparisons.',
      hintTarget: 'rewrite each line as a full equation',
    }
  }

  const [prevLeft, prevRight] = prev.split('=')
  const [nextLeft, nextRight] = next.split('=')

  try {
    const prevDelta = simplify(`(${prevLeft})-(${prevRight})`).toString()
    const nextDelta = simplify(`(${nextLeft})-(${nextRight})`).toString()
    if (simplify(`(${prevDelta})-(${nextDelta})`).toString() === '0') {
      return {
        verdict: 'valid',
        reason: 'Both equations describe the same relationship.',
        hintTarget: 'explain which operation kept both sides balanced',
      }
    }
  } catch {
    return {
      verdict: 'unclear',
      reason: 'The step could not be checked reliably.',
      hintTarget: 'rewrite the step with clearer algebra',
    }
  }

  return {
    verdict: 'invalid',
    reason: 'The next line does not stay equivalent to the previous equation.',
    hintTarget: 'check whether the same operation was applied to both sides',
  }
}

export function mathSolveLinear(problem: string): LinearSolveResult {
  const normalized = normalizeExpression(problem)
  if (!normalized.includes('=')) {
    throw new Error('Please provide a linear equation such as 2x+3=11.')
  }

  const [left, right] = normalized.split('=')
  const leftCoefficients = extractLinearCoefficients(left)
  const rightCoefficients = extractLinearCoefficients(right)

  const coefficient = leftCoefficients.coefficient - rightCoefficients.coefficient
  const intercept = rightCoefficients.intercept - leftCoefficients.intercept

  if (Math.abs(coefficient) < 1e-10) {
    throw new Error('This equation does not have a single linear solution.')
  }

  const solution = intercept / coefficient
  const steps = [
    `${left}=${right}`,
    `${roundPoint(coefficient)}x=${roundPoint(intercept)}`,
    `x=${roundPoint(solution)}`,
  ]

  return {
    variable: 'x',
    solution: roundPoint(solution),
    steps,
  }
}

export function solveLinearOnCanvas(input: {
  problem: string
  maxSteps?: number
  stopBeforeFinal?: boolean
}): LinearCanvasResult {
  const normalized = normalizeExpression(input.problem)
  if (!normalized.includes('=')) {
    throw new Error('Please provide a linear equation such as 2x+3=11.')
  }

  const [left, right] = normalized.split('=')
  const leftCoefficients = extractLinearCoefficients(left)
  const rightCoefficients = extractLinearCoefficients(right)
  const maxSteps = clamp(Math.round(input.maxSteps ?? 2), 1, 3)
  const textLines: string[] = []
  const mathExpressions: string[] = []
  let suggestedQuestion = 'What should you do next so x is by itself?'

  if (isNearlyEqual(rightCoefficients.coefficient, 0)) {
    const leftExpression = formatLinearExpression(leftCoefficients.coefficient, leftCoefficients.intercept)
    const rightExpression = formatLinearExpression(0, rightCoefficients.intercept)

    if (!isNearlyEqual(leftCoefficients.intercept, 0)) {
      const interceptMagnitude = formatNumber(Math.abs(leftCoefficients.intercept))
      const inverseOperation =
        leftCoefficients.intercept > 0 ? `- ${interceptMagnitude}` : `+ ${interceptMagnitude}`

      textLines.push(
        `${leftCoefficients.intercept > 0 ? 'Subtract' : 'Add'} ${interceptMagnitude} on both sides.`
      )
      mathExpressions.push(
        formatEquality(`${leftExpression} ${inverseOperation}`, `${rightExpression} ${inverseOperation}`)
      )

      if (maxSteps >= 2) {
        const simplifiedRight = rightCoefficients.intercept - leftCoefficients.intercept
        mathExpressions.push(
          formatEquality(
            formatLinearExpression(leftCoefficients.coefficient, 0),
            formatLinearExpression(0, simplifiedRight)
          )
        )
        suggestedQuestion = isNearlyEqual(leftCoefficients.coefficient, 1)
          ? 'What does this tell you about x now?'
          : 'What number should you divide both sides by now?'
      } else {
        suggestedQuestion = 'How can you simplify each side now?'
      }
    } else if (!isNearlyEqual(leftCoefficients.coefficient, 1)) {
      textLines.push(`Divide both sides by ${formatNumber(leftCoefficients.coefficient)}.`)
      mathExpressions.push(
        formatEquality(
          `${formatLinearExpression(leftCoefficients.coefficient, 0)} / ${formatNumber(leftCoefficients.coefficient)}`,
          `${rightExpression} / ${formatNumber(leftCoefficients.coefficient)}`
        )
      )

      if (maxSteps >= 2) {
        mathExpressions.push(formatEquality('x', formatNumber(rightCoefficients.intercept / leftCoefficients.coefficient)))
        suggestedQuestion = 'Can you check the solution in the original equation?'
      } else {
        suggestedQuestion = 'What does dividing both sides by that number give you?'
      }
    }
  }

  if (mathExpressions.length === 0) {
    const solved = mathSolveLinear(normalized)
    textLines.push('Keep the equation balanced at each step.')
    mathExpressions.push(...solved.steps.slice(1, 1 + maxSteps))
    suggestedQuestion =
      maxSteps >= 2 ? 'Which move made x easier to isolate?' : 'What should happen to both sides next?'
  }

  if (input.stopBeforeFinal !== true && maxSteps >= 3) {
    const solved = mathSolveLinear(normalized)
    const finalStep = solved.steps[solved.steps.length - 1]
    if (!mathExpressions.includes(finalStep)) {
      mathExpressions.push(finalStep)
      suggestedQuestion = 'Can you check that solution in the original equation?'
    }
  }

  const cleanedExpressions = mathExpressions.slice(0, input.stopBeforeFinal === true ? maxSteps : Math.max(maxSteps, 1))
  const title = `Solve ${formatEquality(
    formatLinearExpression(leftCoefficients.coefficient, leftCoefficients.intercept),
    formatLinearExpression(rightCoefficients.coefficient, rightCoefficients.intercept)
  )}`

  return {
    title,
    spokenSummary: textLines[0] ?? 'Here is the next algebra setup on the board.',
    suggestedQuestion,
    mathExpressions: cleanedExpressions,
    textLines,
    canvasActions: buildCanvasWriteActions({
      title,
      textLines,
      mathExpressions: cleanedExpressions,
      clearExisting: true,
    }),
  }
}

export function hintGenerator(input: {
  toolName: string
  verdict?: string
  reason?: string
  solution?: number
  expression?: string
}): HintGeneratorResult {
  if (input.toolName === 'math_check_step') {
    if (input.verdict === 'invalid') {
      return {
        hintTarget: 'check balance',
        why: 'A valid algebra step must keep both sides equivalent.',
        suggestedQuestion:
          'What operation did you apply to the left side, and did the right side get the same treatment?',
      }
    }

    return {
      hintTarget: 'justify the step',
      why: 'Naming the operation helps confirm the reasoning.',
      suggestedQuestion: 'Can you explain why this transformation keeps the equation true?',
    }
  }

  if (input.toolName === 'math_solve_linear') {
    return {
      hintTarget: 'isolate the variable',
      why: 'Linear equations become easier once x is alone on one side.',
      suggestedQuestion: 'What could you remove or undo first so x becomes easier to isolate?',
    }
  }

  return {
    hintTarget: 'simplify carefully',
    why: 'Breaking the work into one clear step reduces mistakes.',
    suggestedQuestion: 'Which single part of the expression can you simplify first?',
  }
}

export function writeOnCanvas(input: {
  title: string
  textLines?: string[]
  mathExpressions?: string[]
  clearExisting?: boolean
}): CanvasWriteResult {
  const title = input.title.trim() || 'Worked note'
  const textLines = (input.textLines ?? []).map((line) => line.trim()).filter(Boolean)
  const mathExpressions = (input.mathExpressions ?? [])
    .map((line) => normalizeExpression(line))
    .filter(Boolean)

  return {
    title,
    textLines,
    mathExpressions,
    canvasActions: buildCanvasWriteActions({
      title,
      textLines,
      mathExpressions,
      clearExisting: input.clearExisting,
    }),
  }
}

export function tableOfValues(input: {
  expression: string
  xValues?: number[]
  clearExisting?: boolean
}): ValueTableResult {
  const expression = normalizeGraphExpression(input.expression)
  const xValues = (input.xValues && input.xValues.length > 0 ? input.xValues : [-2, -1, 0, 1, 2])
    .map((value) => coerceFiniteNumber(value))
    .slice(0, 6)

  const rows = xValues.map((x) => ({
    x: roundPoint(x),
    y: roundPoint(coerceFiniteNumber(safeEvaluate(expression, { x }))),
  }))

  const actions: TutorCanvasAction[] = []
  if (input.clearExisting !== false) {
    actions.push(clearToolLayer())
  }

  const sceneX = TOOL_SCENE.x + 34
  const sceneY = TOOL_SCENE.y + 40
  const tableX = sceneX
  const tableY = sceneY + 68
  const col1Width = 96
  const col2Width = 180
  const rowHeight = 48
  const totalWidth = col1Width + col2Width
  const totalHeight = rowHeight * (rows.length + 1)

  actions.push(
    rectangle(sceneX, sceneY, 520, 360, {
      color: 'light-blue',
      fill: 'semi',
      opacity: 0.1,
      dash: 'solid',
      size: 's',
    }),
    textLabel(sceneX + 18, sceneY + 18, `Table for y = ${expression}`, {
      width: 320,
      color: 'green',
    }),
    rectangle(tableX, tableY, totalWidth, totalHeight, {
      color: 'grey',
      fill: 'none',
      dash: 'solid',
      size: 's',
    }),
    lineSegment(
      { x: tableX + col1Width, y: tableY },
      { x: tableX + col1Width, y: tableY + totalHeight },
      { color: 'grey', size: 's', dash: 'solid' }
    ),
    textLabel(tableX + 18, tableY + 14, 'x', { width: 40, color: 'green' }),
    textLabel(tableX + col1Width + 18, tableY + 14, 'y', { width: 40, color: 'green' })
  )

  rows.forEach((row, index) => {
    const y = tableY + rowHeight * (index + 1)
    actions.push(
      lineSegment(
        { x: tableX, y },
        { x: tableX + totalWidth, y },
        { color: 'grey', size: 's', dash: 'solid' }
      ),
      textLabel(tableX + 18, y + 12, formatNumber(row.x), { width: 56, color: 'black' }),
      textLabel(tableX + col1Width + 18, y + 12, formatNumber(row.y), { width: 120, color: 'black' })
    )
  })

  actions.push(
    ...noteParagraph(sceneX + 316, sceneY + 76, [
      'Use the table to spot a pattern.',
      'Then plot the ordered pairs on the plane.',
    ], {
      width: 176,
      color: 'black',
      lineHeight: 34,
    }),
    focusRegion(sceneX - 24, sceneY - 24, 568, 408)
  )

  return {
    expression,
    rows,
    summary: `Built a value table for y = ${expression}.`,
    canvasActions: actions,
  }
}

export function plotPointsOnPlane(input: {
  points: Array<{ x: number; y: number }>
  connectPoints?: boolean
  labelPoints?: boolean
  equationLabel?: string
  title?: string
  noteLines?: string[]
  clearExisting?: boolean
  xDomain?: [number, number]
  yDomain?: [number, number]
}): PlotPointsResult {
  const normalizedPoints = (input.points ?? [])
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => ({
      x: roundPoint(point.x),
      y: roundPoint(point.y),
    }))

  if (normalizedPoints.length === 0) {
    throw new Error('Please provide at least one point to plot.')
  }

  const xDomain = normalizeDomain(
    input.xDomain,
    expandNumericDomain(normalizedPoints.map((point) => point.x), {
      minSpan: 4,
      padding: 1,
    })
  )
  const yDomain = normalizeDomain(
    input.yDomain,
    expandNumericDomain(normalizedPoints.map((point) => point.y), {
      minSpan: 4,
      padding: 1,
    })
  )

  const explicitNoteLines = input.noteLines?.map((line) => line.trim()).filter(Boolean) ?? []
  const noteLines =
    explicitNoteLines.length > 0
      ? explicitNoteLines
      : choosePointPlotNotes(normalizedPoints, input.connectPoints === true)

  const planeScene = buildCoordinatePlaneScene({
    clearExisting: input.clearExisting,
    title: input.title?.trim() || 'Plot points',
    noteTitle: 'What to notice',
    noteLines,
    showNoteBox: explicitNoteLines.length > 0,
    xDomain,
    yDomain,
    expressionLabel: input.equationLabel ? `y = ${normalizeGraphExpression(input.equationLabel)}` : undefined,
  })

  const plottedCanvasPoints = normalizedPoints.map((point) =>
    mapGraphCoordinateToCanvas(point, {
      x: xDomain,
      y: yDomain,
    })
  )

  const canvasActions: TutorCanvasAction[] = [...planeScene.canvasActions]

  plottedCanvasPoints.forEach((canvasPoint, index) => {
    canvasActions.push(
      point(canvasPoint.x, canvasPoint.y, {
        label:
          input.labelPoints === false
            ? undefined
            : `(${formatNumber(normalizedPoints[index].x)}, ${formatNumber(normalizedPoints[index].y)})`,
        color: 'red',
        labelPosition: index % 2 === 0 ? 'top-right' : 'bottom-right',
        labelWidth: 118,
      })
    )
  })

  if (input.connectPoints && plottedCanvasPoints.length >= 2) {
    canvasActions.push(
      polyline(plottedCanvasPoints, {
        color: 'blue',
        size: 'm',
      })
    )
  }

  if (input.equationLabel?.trim()) {
    const anchor = clampCanvasLabel(plottedCanvasPoints[plottedCanvasPoints.length - 1] ?? {
      x: NOTE_FRAME.x,
      y: NOTE_FRAME.y,
    })
    canvasActions.push(
      textLabel(anchor.x, anchor.y, `y = ${normalizeGraphExpression(input.equationLabel)}`, {
        width: 160,
        color: 'green',
      })
    )
  }

  canvasActions.push(focusRegion(TOOL_SCENE.x - 28, TOOL_SCENE.y - 24, TOOL_SCENE.width + 56, TOOL_SCENE.height + 48))

  return {
    summary: input.connectPoints
      ? 'Plotted the points on a coordinate plane and connected them.'
      : 'Plotted the points on a coordinate plane.',
    points: normalizedPoints,
    domain: {
      x: xDomain,
      y: yDomain,
    },
    noteLines,
    canvasActions,
  }
}

export function canvasAction(input: {
  actionType:
    | 'clear_tool_layer'
    | 'place_text_label'
    | 'place_math_block'
    | 'place_point'
    | 'draw_line_segment'
    | 'draw_axes'
    | 'draw_rectangle'
    | 'highlight_region'
    | 'plot_polyline'
    | 'coordinate_plane'
  clearFirst?: boolean
  focusAfter?: boolean
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  latex?: string
  label?: string
  color?: TutorCanvasColor
  dash?: TutorCanvasDash
  size?: TutorCanvasSize
  fill?: 'none' | 'semi' | 'solid'
  opacity?: number
  labelPosition?: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  labelWidth?: number
  displayMode?: boolean
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  origin?: { x: number; y: number }
  xLength?: number
  yLength?: number
  xLabel?: string
  yLabel?: string
  points?: Array<{ x: number; y: number }>
  noteLines?: string[]
  title?: string
  coordinateSpace?: 'canvas' | 'graph'
  xDomain?: [number, number]
  yDomain?: [number, number]
  xDomainStart?: number
  xDomainEnd?: number
  yDomainStart?: number
  yDomainEnd?: number
}): CanvasActionResult {
  const xDomain =
    input.xDomain ??
    (typeof input.xDomainStart === 'number' && typeof input.xDomainEnd === 'number'
      ? ([input.xDomainStart, input.xDomainEnd] as [number, number])
      : undefined)
  const yDomain =
    input.yDomain ??
    (typeof input.yDomainStart === 'number' && typeof input.yDomainEnd === 'number'
      ? ([input.yDomainStart, input.yDomainEnd] as [number, number])
      : undefined)

  if (input.actionType === 'coordinate_plane') {
    const scene = buildCoordinatePlaneScene({
      clearExisting: input.clearFirst,
      title: input.title ?? 'Coordinate plane',
      noteTitle: input.label ?? 'What to notice',
      noteLines: input.noteLines,
      xDomain,
      yDomain,
    })

    return {
      summary: 'Prepared a coordinate plane on the canvas.',
      canvasActions: scene.canvasActions,
    }
  }

  const graphDomains = {
    x: normalizeDomain(xDomain, [-6, 6]),
    y: normalizeDomain(yDomain, [-6, 6]),
  }
  const toCanvasPoint = (pointValue: { x: number; y: number }) =>
    input.coordinateSpace === 'graph'
      ? mapGraphCoordinateToCanvas(pointValue, graphDomains)
      : pointValue

  const actions: TutorCanvasAction[] = []
  if (input.clearFirst) {
    actions.push(clearToolLayer())
  }

  switch (input.actionType) {
    case 'clear_tool_layer':
      actions.push(clearToolLayer())
      break
    case 'place_text_label':
      if (typeof input.x !== 'number' || typeof input.y !== 'number' || !input.text?.trim()) {
        throw new Error('place_text_label needs x, y, and text.')
      }
      {
        const mapped = toCanvasPoint({ x: input.x, y: input.y })
      actions.push(
        textLabel(mapped.x, mapped.y, input.text, {
          width: input.width,
          color: input.color,
        })
      )
      }
      break
    case 'place_math_block':
      if (typeof input.x !== 'number' || typeof input.y !== 'number' || !input.latex?.trim()) {
        throw new Error('place_math_block needs x, y, and latex.')
      }
      {
        const mapped = toCanvasPoint({ x: input.x, y: input.y })
      actions.push(
        mathBlock(mapped.x, mapped.y, normalizeExpression(input.latex), {
          width: input.width,
          height: input.height,
          displayMode: input.displayMode,
        })
      )
      }
      break
    case 'place_point':
      if (typeof input.x !== 'number' || typeof input.y !== 'number') {
        throw new Error('place_point needs x and y.')
      }
      {
        const mapped = toCanvasPoint({ x: input.x, y: input.y })
      actions.push(
        point(mapped.x, mapped.y, {
          label: input.label,
          color: input.color,
          labelPosition: input.labelPosition,
          labelWidth: input.labelWidth,
        })
      )
      }
      break
    case 'draw_line_segment':
      if (
        typeof input.start?.x !== 'number' ||
        typeof input.start?.y !== 'number' ||
        typeof input.end?.x !== 'number' ||
        typeof input.end?.y !== 'number'
      ) {
        throw new Error('draw_line_segment needs start and end points.')
      }
      {
        const mappedStart = toCanvasPoint(input.start)
        const mappedEnd = toCanvasPoint(input.end)
      actions.push(
        lineSegment(mappedStart, mappedEnd, {
          label: input.label,
          color: input.color,
          dash: input.dash,
          size: input.size,
        })
      )
      }
      break
    case 'draw_axes':
      if (
        typeof input.origin?.x !== 'number' ||
        typeof input.origin?.y !== 'number' ||
        typeof input.xLength !== 'number' ||
        typeof input.yLength !== 'number'
      ) {
        throw new Error('draw_axes needs origin, xLength, and yLength.')
      }
      actions.push({
        id: createId(),
        type: 'draw_axes',
        origin: input.origin,
        xLength: input.xLength,
        yLength: input.yLength,
        xLabel: input.xLabel,
        yLabel: input.yLabel,
        color: input.color,
        dash: input.dash,
        size: input.size,
      })
      break
    case 'draw_rectangle':
      if (
        typeof input.x !== 'number' ||
        typeof input.y !== 'number' ||
        typeof input.width !== 'number' ||
        typeof input.height !== 'number'
      ) {
        throw new Error('draw_rectangle needs x, y, width, and height.')
      }
      {
        const topLeft = toCanvasPoint({ x: input.x, y: input.y })
        const bottomRight =
          input.coordinateSpace === 'graph'
            ? toCanvasPoint({ x: input.x + input.width, y: input.y + input.height })
            : { x: input.x + input.width, y: input.y + input.height }
        const rectX = Math.min(topLeft.x, bottomRight.x)
        const rectY = Math.min(topLeft.y, bottomRight.y)
        const rectWidth = Math.abs(bottomRight.x - topLeft.x)
        const rectHeight = Math.abs(bottomRight.y - topLeft.y)
      actions.push(
        rectangle(rectX, rectY, rectWidth, rectHeight, {
          color: input.color,
          dash: input.dash,
          size: input.size,
          fill: input.fill,
          opacity: input.opacity,
          label: input.label,
        })
      )
      }
      break
    case 'highlight_region':
      if (
        typeof input.x !== 'number' ||
        typeof input.y !== 'number' ||
        typeof input.width !== 'number' ||
        typeof input.height !== 'number'
      ) {
        throw new Error('highlight_region needs x, y, width, and height.')
      }
      {
        const topLeft = toCanvasPoint({ x: input.x, y: input.y })
        const bottomRight =
          input.coordinateSpace === 'graph'
            ? toCanvasPoint({ x: input.x + input.width, y: input.y + input.height })
            : { x: input.x + input.width, y: input.y + input.height }
        const regionX = Math.min(topLeft.x, bottomRight.x)
        const regionY = Math.min(topLeft.y, bottomRight.y)
        const regionWidth = Math.abs(bottomRight.x - topLeft.x)
        const regionHeight = Math.abs(bottomRight.y - topLeft.y)
      actions.push({
        id: createId(),
        type: 'highlight_region',
        x: regionX,
        y: regionY,
        width: regionWidth,
        height: regionHeight,
        label: input.label,
        color: input.color,
        opacity: input.opacity,
      })
      }
      break
    case 'plot_polyline':
      if (!input.points || input.points.length < 2) {
        throw new Error('plot_polyline needs at least two points.')
      }
      {
        const mappedPoints = input.points.map((pointValue) => toCanvasPoint(pointValue))
      actions.push(
        polyline(mappedPoints, {
          label: input.label,
          color: input.color,
          dash: input.dash,
          size: input.size,
        })
      )
      }
      break
    default:
      throw new Error('Unsupported canvas action.')
  }

  return {
    summary: `Prepared ${input.actionType} on the canvas.`,
    canvasActions: input.focusAfter === false ? actions : appendFocusForActions(actions),
  }
}

export function graphFunction(input: {
  expression: string
  domain?: [number, number]
  graphType?: 'cartesian'
  title?: string
  noteLines?: string[]
  showXIntercepts?: boolean
  showYIntercept?: boolean
  showVertex?: boolean
}): GraphFunctionResult {
  const scene = buildGraphSceneData(input.expression, input.domain)
  const explicitNoteLines = input.noteLines?.map((line) => line.trim()).filter(Boolean) ?? []
  const featureSelectionProvided =
    typeof input.showXIntercepts === 'boolean' ||
    typeof input.showYIntercept === 'boolean' ||
    typeof input.showVertex === 'boolean'
  const showXIntercepts = featureSelectionProvided
    ? input.showXIntercepts === true
    : scene.analysis.xIntercepts.length > 0
  const showYIntercept = featureSelectionProvided
    ? input.showYIntercept === true
    : scene.analysis.yIntercept !== null
  const showVertex = featureSelectionProvided
    ? input.showVertex === true
    : scene.analysis.vertex !== null

  const autoNotes = buildGraphFeatureLines({
    xIntercepts: scene.analysis.xIntercepts,
    yIntercept: scene.analysis.yIntercept,
    vertex: scene.analysis.vertex,
    endBehavior: scene.analysis.endBehavior,
    axisOfSymmetryX: scene.analysis.axisOfSymmetryX,
    showXIntercepts,
    showYIntercept,
    showVertex,
  })
  const noteLines = sanitizeGraphNoteLines(
    explicitNoteLines.length > 0 ? explicitNoteLines : input.noteLines,
    autoNotes.noteLines,
    {
    maxLines: 2,
    maxChars: 72,
    }
  )
  const features = autoNotes.features

  const canvasActions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(resolveGraphSceneTitle(input.title, scene.expression)),
    textLabel(TOOL_SCENE.x + 22, TOOL_SCENE.y + 50, prettifyMathExpression(`y=${scene.expression}`), {
      width: 260,
      color: 'black',
    }),
    rectangle(GRAPH_FRAME.x, GRAPH_FRAME.y, GRAPH_FRAME.width, GRAPH_FRAME.height, {
      color: 'grey',
      fill: 'none',
      dash: 'solid',
      size: 's',
    }),
    ...buildGridActions({
      origin: scene.axisOrigin,
      xDomain: scene.xDomain,
      yDomain: scene.yDomain,
      plotRect: GRAPH_FRAME,
    }),
    {
      id: createId(),
      type: 'draw_axes',
      origin: scene.axisOrigin,
      xLength: GRAPH_FRAME.width,
      yLength: GRAPH_FRAME.height,
      xLabel: 'x',
      yLabel: 'y',
      color: 'grey',
      size: 's',
      dash: 'solid',
    },
    ...buildTickActions({
      origin: scene.axisOrigin,
      xDomain: scene.xDomain,
      yDomain: scene.yDomain,
      plotRect: GRAPH_FRAME,
    }),
    polyline(scene.plotPoints, {
      color: 'blue',
      size: 'm',
      dash: 'solid',
    }),
    ...(explicitNoteLines.length > 0
      ? [
          rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
            color: 'light-green',
            fill: 'semi',
            opacity: 0.12,
            dash: 'solid',
            size: 's',
          }),
          textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Key ideas', {
            width: NOTE_FRAME.width - 32,
            color: 'green',
          }),
          ...noteParagraph(NOTE_FRAME.x + 16, NOTE_FRAME.y + 52, noteLines, {
            width: NOTE_FRAME.width - 32,
            color: 'black',
            lineHeight: 32,
          }),
        ]
      : []),
    ...buildGraphAnnotationActions({
      xIntercepts: scene.featureCoordinates.xIntercepts,
      yIntercept: scene.featureCoordinates.yIntercept,
      vertex: scene.featureCoordinates.vertex,
      showXIntercepts,
      showYIntercept,
      showVertex,
      yInterceptMatchesVertex: autoNotes.yInterceptMatchesVertex,
      vertexKind: scene.analysis.vertex?.kind,
    }),
  ]

  canvasActions.push(
    focusRegion(TOOL_SCENE.x - 28, TOOL_SCENE.y - 24, TOOL_SCENE.width + 56, TOOL_SCENE.height + 48)
  )

  return {
    expression: scene.expression,
    domain: scene.xDomain,
    yDomain: scene.yDomain,
    points: scene.points,
    features,
    noteLines,
    featureCoordinates: scene.featureCoordinates,
    canvasActions,
  }
}

export function annotateGraphFeatures(input: {
  expression: string
  domain?: [number, number]
  features: Array<'x-intercepts' | 'y-intercept' | 'vertex' | 'axis-of-symmetry'>
  clearExisting?: boolean
}): GraphAnnotationResult {
  const requestedFeatures = [...new Set((input.features ?? []).filter(Boolean))]
  if (requestedFeatures.length === 0) {
    throw new Error('Please specify at least one graph feature to annotate.')
  }

  const scene = buildGraphSceneData(input.expression, input.domain)
  const actions: TutorCanvasAction[] = []
  if (input.clearExisting) {
    actions.push(clearToolLayer())
  }

  const wantsYIntercept = requestedFeatures.includes('y-intercept')
  const wantsVertex = requestedFeatures.includes('vertex')
  const wantsXAxis = requestedFeatures.includes('x-intercepts')
  const yInterceptMatchesVertex = Boolean(
    scene.featureCoordinates.yIntercept &&
      scene.featureCoordinates.vertex &&
      isNearlyEqual(scene.featureCoordinates.yIntercept.x, scene.featureCoordinates.vertex.x, 0.05) &&
      isNearlyEqual(scene.featureCoordinates.yIntercept.y, scene.featureCoordinates.vertex.y, 0.05)
  )

  actions.push(
    ...buildGraphAnnotationActions({
      xIntercepts: scene.featureCoordinates.xIntercepts,
      yIntercept: scene.featureCoordinates.yIntercept,
      vertex: scene.featureCoordinates.vertex,
      showXIntercepts: wantsXAxis,
      showYIntercept: wantsYIntercept,
      showVertex: wantsVertex,
      yInterceptMatchesVertex,
      vertexKind: scene.analysis.vertex?.kind,
    })
  )

  if (
    requestedFeatures.includes('axis-of-symmetry') &&
    scene.analysis.axisOfSymmetryX !== null &&
    scene.featureCoordinates.vertex
  ) {
    actions.push(
      lineSegment(
        { x: scene.featureCoordinates.vertex.canvasX, y: GRAPH_FRAME.y },
        { x: scene.featureCoordinates.vertex.canvasX, y: GRAPH_FRAME.y + GRAPH_FRAME.height },
        {
          label: `x = ${formatNumber(scene.analysis.axisOfSymmetryX)}`,
          color: 'violet',
          dash: 'dashed',
          size: 'm',
        }
      )
    )
  }

  return {
    expression: scene.expression,
    domain: scene.xDomain,
    yDomain: scene.yDomain,
    requestedFeatures,
    featureCoordinates: scene.featureCoordinates,
    canvasActions: appendFocusForActions(actions),
    summary:
      requestedFeatures.length === 1
        ? `Annotated ${requestedFeatures[0]} on the current graph.`
        : 'Annotated the requested graph features on the current graph.',
  }
}

export function geometryFigure(input: {
  figureType: 'triangle' | 'rectangle' | 'axes'
  width?: number
  height?: number
  labels?: string[]
}): GeometryFigureResult {
  const labels = input.labels ?? []
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome('Diagram'),
  ]

  if (input.figureType === 'axes') {
    const plane = buildCoordinatePlaneScene({
      clearExisting: true,
      title: 'Coordinate plane',
      noteTitle: 'What to notice',
      noteLines: ['Use this plane to locate points, compare coordinates, and talk about quadrants.'],
    })

    return {
      figureType: 'axes',
      summary: 'Coordinate plane prepared.',
      canvasActions: plane.canvasActions,
    }
  }

  if (input.figureType === 'rectangle') {
    const width = input.width ?? 220
    const height = input.height ?? 130
    const x = 670
    const y = 220

    actions.push(
      rectangle(x, y, width, height, {
        color: 'blue',
        fill: 'none',
        dash: 'solid',
        size: 'm',
      }),
      point(x, y, { label: labels[0] ?? 'A', color: 'blue' }),
      point(x + width, y, { label: labels[1] ?? 'B', color: 'blue' }),
      point(x + width, y + height, { label: labels[2] ?? 'C', color: 'blue' }),
      point(x, y + height, { label: labels[3] ?? 'D', color: 'blue' }),
      focusRegion(TOOL_SCENE.x - 80, TOOL_SCENE.y - 70, TOOL_SCENE.width + 160, TOOL_SCENE.height + 140)
    )

    return {
      figureType: 'rectangle',
      summary: 'Rectangle diagram prepared with labeled corners.',
      canvasActions: actions,
    }
  }

  const trianglePoints = [
    { x: 690, y: 420 },
    { x: 825, y: 210 },
    { x: 980, y: 420 },
  ]

  actions.push(
    lineSegment(trianglePoints[0], trianglePoints[1], { color: 'blue', size: 'm' }),
    lineSegment(trianglePoints[1], trianglePoints[2], { color: 'blue', size: 'm' }),
    lineSegment(trianglePoints[2], trianglePoints[0], { color: 'blue', size: 'm' }),
    point(trianglePoints[0].x, trianglePoints[0].y, { label: labels[0] ?? 'A', color: 'blue' }),
    point(trianglePoints[1].x, trianglePoints[1].y, { label: labels[1] ?? 'B', color: 'blue' }),
    point(trianglePoints[2].x, trianglePoints[2].y, { label: labels[2] ?? 'C', color: 'blue' }),
    focusRegion(TOOL_SCENE.x - 80, TOOL_SCENE.y - 70, TOOL_SCENE.width + 160, TOOL_SCENE.height + 140)
  )

  return {
    figureType: 'triangle',
    summary: 'Triangle diagram prepared with labeled vertices.',
    canvasActions: actions,
  }
}

function formatHopLabel(from: number, to: number) {
  const delta = roundPoint(to - from, 3)
  if (isNearlyEqual(delta, 0)) {
    return '0'
  }

  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatNumber(delta, 3)}`
}

function formatMixedFraction(numerator: number, denominator: number) {
  if (denominator <= 0) return `${numerator}/${denominator}`
  const whole = Math.floor(numerator / denominator)
  const remainder = numerator % denominator

  if (whole === 0) return `${numerator}/${denominator}`
  if (remainder === 0) return `${whole}`
  return `${numerator}/${denominator} = ${whole} ${remainder}/${denominator}`
}

export function numberLineScene(input: {
  start: number
  end: number
  step?: number
  highlightValues?: number[]
  hopPairs?: Array<{ from: number; to: number; label?: string }>
  title?: string
}): CanvasActionResult {
  if (!Number.isFinite(input.start) || !Number.isFinite(input.end)) {
    throw new Error('Number line needs finite start and end values.')
  }

  const minValue = Math.min(input.start, input.end)
  const maxValue = Math.max(input.start, input.end)
  const range = maxValue - minValue
  if (range <= 0) {
    throw new Error('Number line needs different start and end values.')
  }

  const step =
    typeof input.step === 'number' && input.step > 0
      ? input.step
      : range <= 10
      ? 1
      : niceTickStep(range, 6)

  const rawTicks: number[] = []
  for (let value = minValue; value <= maxValue + step * 0.25; value += step) {
    rawTicks.push(isNearlyEqual(value, 0, step / 1000) ? 0 : roundPoint(value, 6))
  }

  if (rawTicks.length > 18) {
    throw new Error('Number line is too dense. Use a larger step or a smaller range.')
  }

  const lineStart = { x: TOOL_SCENE.x + 86, y: TOOL_SCENE.y + 246 }
  const lineEnd = { x: TOOL_SCENE.x + TOOL_SCENE.width - 86, y: TOOL_SCENE.y + 246 }
  const mapValue = (value: number) =>
    mapToRange(value, minValue, maxValue, lineStart.x, lineEnd.x)

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Number line'),
    lineSegment(lineStart, lineEnd, {
      color: 'blue',
      size: 'm',
      dash: 'solid',
    }),
  ]

  for (const tickValue of rawTicks) {
    const x = mapValue(tickValue)
    actions.push(
      lineSegment(
        { x, y: lineStart.y - 12 },
        { x, y: lineStart.y + 12 },
        { color: 'grey', size: 's', dash: 'solid' }
      ),
      textLabel(x - 24, lineStart.y + 18, formatNumber(tickValue, 3), {
        width: 48,
        color: 'grey',
      })
    )
  }

  const highlighted = [...new Set((input.highlightValues ?? []).filter(Number.isFinite))]
    .filter((value) => value >= minValue && value <= maxValue)
    .slice(0, 8)

  highlighted.forEach((value, index) => {
    const x = mapValue(value)
    actions.push(
      point(x, lineStart.y, {
        label: formatNumber(value, 3),
        color: index % 2 === 0 ? 'green' : 'violet',
        labelPosition: 'top',
        labelWidth: 92,
      })
    )
  })

  ;(input.hopPairs ?? []).slice(0, 5).forEach((hop, index) => {
    const from = clamp(hop.from, minValue, maxValue)
    const to = clamp(hop.to, minValue, maxValue)
    const fromX = mapValue(from)
    const toX = mapValue(to)
    const apexY = lineStart.y - 68 - index * 28
    const midX = (fromX + toX) / 2

    actions.push(
      polyline(
        [
          { x: fromX, y: lineStart.y - 16 },
          { x: midX, y: apexY },
          { x: toX, y: lineStart.y - 16 },
        ],
        {
          color: 'orange',
          size: 'm',
          dash: 'solid',
        }
      ),
      textLabel(midX - 38, apexY - 30, hop.label?.trim() || formatHopLabel(from, to), {
        width: 76,
        color: 'orange',
      })
    )
  })

  actions.push(
    focusRegion(
      TOOL_SCENE.x - 72,
      TOOL_SCENE.y - 60,
      TOOL_SCENE.width + 144,
      TOOL_SCENE.height + 132
    )
  )

  return {
    summary:
      highlighted.length > 0
        ? 'Prepared a number line with highlighted values.'
        : 'Prepared a number line on the canvas.',
    canvasActions: actions,
  }
}

export function fractionStripScene(input: {
  numerator: number
  denominator: number
  title?: string
  label?: string
}): CanvasActionResult {
  const numerator = Math.trunc(input.numerator)
  const denominator = Math.trunc(input.denominator)

  if (!Number.isFinite(numerator) || numerator < 0) {
    throw new Error('Fraction strip needs a non-negative numerator.')
  }
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error('Fraction strip needs a positive denominator.')
  }
  if (denominator > 12) {
    throw new Error('Fraction strip supports denominators up to 12 right now.')
  }
  if (numerator > denominator * 4) {
    throw new Error('Fraction strip is limited to at most four bars right now.')
  }

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Fraction model'),
  ]

  const bars = Math.max(1, Math.ceil(Math.max(numerator, 1) / denominator))
  const barWidth = 430
  const barHeight = 60
  const barGap = 22
  const barX = TOOL_SCENE.x + 84
  const barY = TOOL_SCENE.y + 136
  const partWidth = barWidth / denominator
  let shadedRemaining = numerator

  actions.push(
    textLabel(barX, TOOL_SCENE.y + 54, input.label?.trim() || formatMixedFraction(numerator, denominator), {
      width: 320,
      color: 'green',
    })
  )

  for (let barIndex = 0; barIndex < bars; barIndex += 1) {
    const y = barY + barIndex * (barHeight + barGap)

    for (let partIndex = 0; partIndex < denominator; partIndex += 1) {
      const x = barX + partWidth * partIndex
      const isShaded = shadedRemaining > 0

      actions.push(
        rectangle(x, y, partWidth, barHeight, {
          color: isShaded ? 'green' : 'blue',
          fill: isShaded ? 'solid' : 'none',
          opacity: isShaded ? 0.32 : undefined,
          dash: 'solid',
          size: 's',
        })
      )

      if (isShaded) {
        shadedRemaining -= 1
      }
    }
  }

  if (bars > 1) {
    actions.push(
      textLabel(
        barX,
        barY + bars * (barHeight + barGap) - 6,
        'Each bar represents 1 whole.',
        {
          width: 240,
          color: 'grey',
        }
      )
    )
  }

  actions.push(
    focusRegion(
      TOOL_SCENE.x - 72,
      TOOL_SCENE.y - 60,
      TOOL_SCENE.width + 144,
      TOOL_SCENE.height + 132
    )
  )

  return {
    summary: 'Prepared a fraction strip on the canvas.',
    canvasActions: actions,
  }
}

export function arrayModelScene(input: {
  rows: number
  columns: number
  title?: string
  rowLabel?: string
  columnLabel?: string
  highlightCount?: number
}): CanvasActionResult {
  const rows = Math.trunc(input.rows)
  const columns = Math.trunc(input.columns)
  const highlightCount =
    typeof input.highlightCount === 'number' ? Math.trunc(input.highlightCount) : rows * columns

  if (!Number.isFinite(rows) || rows <= 0 || rows > 12) {
    throw new Error('Array model supports 1 to 12 rows.')
  }
  if (!Number.isFinite(columns) || columns <= 0 || columns > 12) {
    throw new Error('Array model supports 1 to 12 columns.')
  }

  const maxCells = rows * columns
  const shadedCells = clamp(highlightCount, 0, maxCells)
  const cellSize = Math.min(48, Math.floor(360 / Math.max(rows, columns)))
  const gap = 6
  const gridWidth = columns * cellSize + (columns - 1) * gap
  const gridHeight = rows * cellSize + (rows - 1) * gap
  const x0 = TOOL_SCENE.x + 150
  const y0 = TOOL_SCENE.y + 146
  const title = input.title?.trim() || 'Array model'

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(title),
    textLabel(x0, TOOL_SCENE.y + 62, `${rows} rows x ${columns} columns = ${maxCells}`, {
      width: 360,
      color: 'green',
    }),
  ]

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column
      const shaded = index < shadedCells
      actions.push(
        rectangle(
          x0 + column * (cellSize + gap),
          y0 + row * (cellSize + gap),
          cellSize,
          cellSize,
          {
            color: shaded ? 'green' : 'blue',
            fill: shaded ? 'solid' : 'none',
            opacity: shaded ? 0.26 : undefined,
            dash: 'solid',
            size: 's',
          }
        )
      )
    }
  }

  actions.push(
    textLabel(x0 + gridWidth + 26, y0 + gridHeight / 2 - 18, input.rowLabel?.trim() || `${rows} rows`, {
      width: 130,
      color: 'grey',
    }),
    textLabel(x0 + gridWidth / 2 - 72, y0 + gridHeight + 26, input.columnLabel?.trim() || `${columns} in each row`, {
      width: 170,
      color: 'grey',
    }),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: 'Prepared an array model on the canvas.',
    canvasActions: actions,
  }
}

export function ratioTableScene(input: {
  leftLabel: string
  rightLabel: string
  rows: Array<{ left: string | number; right: string | number }>
  title?: string
}): CanvasActionResult {
  const rows = input.rows.slice(0, 8).filter((row) => row.left !== '' && row.right !== '')
  if (rows.length === 0) {
    throw new Error('Ratio table needs at least one row.')
  }

  const x = TOOL_SCENE.x + 132
  const y = TOOL_SCENE.y + 144
  const columnWidth = 170
  const rowHeight = 48
  const tableWidth = columnWidth * 2
  const tableHeight = rowHeight * (rows.length + 1)
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Ratio table'),
    rectangle(x, y, tableWidth, tableHeight, {
      color: 'blue',
      fill: 'none',
      dash: 'solid',
      size: 's',
    }),
    rectangle(x, y, tableWidth, rowHeight, {
      color: 'light-blue',
      fill: 'solid',
      opacity: 0.2,
      dash: 'solid',
      size: 's',
    }),
    lineSegment({ x: x + columnWidth, y }, { x: x + columnWidth, y: y + tableHeight }, {
      color: 'blue',
      size: 's',
      dash: 'solid',
    }),
    textLabel(x + 18, y + 12, input.leftLabel.trim() || 'Left', {
      width: columnWidth - 28,
      color: 'green',
    }),
    textLabel(x + columnWidth + 18, y + 12, input.rightLabel.trim() || 'Right', {
      width: columnWidth - 28,
      color: 'green',
    }),
  ]

  rows.forEach((row, index) => {
    const rowY = y + rowHeight * (index + 1)
    actions.push(
      lineSegment({ x, y: rowY }, { x: x + tableWidth, y: rowY }, {
        color: 'blue',
        size: 's',
        dash: 'solid',
      }),
      textLabel(x + 20, rowY + 12, String(row.left), {
        width: columnWidth - 36,
        color: 'black',
      }),
      textLabel(x + columnWidth + 20, rowY + 12, String(row.right), {
        width: columnWidth - 36,
        color: 'black',
      })
    )
  })

  actions.push(
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: 'Prepared a ratio table on the canvas.',
    canvasActions: actions,
  }
}

export function angleDiagramScene(input: {
  degrees: number
  label?: string
  title?: string
  showRightAngleMarker?: boolean
}): CanvasActionResult {
  const degrees = clamp(input.degrees, 5, 175)
  const radians = (degrees * Math.PI) / 180
  const vertex = { x: TOOL_SCENE.x + 332, y: TOOL_SCENE.y + 350 }
  const rayLength = 250
  const baseEnd = { x: vertex.x + rayLength, y: vertex.y }
  const angledEnd = {
    x: vertex.x + Math.cos(radians) * rayLength,
    y: vertex.y - Math.sin(radians) * rayLength,
  }
  const arcRadius = 84
  const arcPoints = Array.from({ length: 18 }, (_, index) => {
    const theta = (radians * index) / 17
    return {
      x: vertex.x + Math.cos(theta) * arcRadius,
      y: vertex.y - Math.sin(theta) * arcRadius,
    }
  })

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Angle diagram'),
    point(vertex.x, vertex.y, { color: 'blue' }),
    textLabel(vertex.x - 20, vertex.y + 14, 'V', {
      width: 32,
      color: 'blue',
    }),
    lineSegment(vertex, baseEnd, { color: 'blue', size: 'm', dash: 'solid' }),
    lineSegment(vertex, angledEnd, { color: 'blue', size: 'm', dash: 'solid' }),
    polyline(arcPoints, { color: 'orange', size: 'm', dash: 'solid' }),
    textLabel(
      vertex.x + arcRadius * 0.74,
      vertex.y - arcRadius * 0.48 - 28,
      input.label?.trim() || `${formatNumber(degrees, 1)} degrees`,
      {
        width: 140,
        color: 'orange',
      }
    ),
  ]

  if (input.showRightAngleMarker || isNearlyEqual(degrees, 90, 0.5)) {
    const markerSize = 34
    actions.push(
      polyline(
        [
          { x: vertex.x + markerSize, y: vertex.y },
          { x: vertex.x + markerSize, y: vertex.y - markerSize },
          { x: vertex.x, y: vertex.y - markerSize },
        ],
        { color: 'green', size: 's', dash: 'solid' }
      )
    )
  }

  actions.push(
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: 'Prepared an angle diagram on the canvas.',
    canvasActions: actions,
  }
}

export function equationBalanceScene(input: {
  leftExpression: string
  rightExpression: string
  title?: string
  balanced?: boolean
}): CanvasActionResult {
  const centerX = TOOL_SCENE.x + 390
  const baseY = TOOL_SCENE.y + 372
  const beamY = TOOL_SCENE.y + 248
  const panY = TOOL_SCENE.y + 306
  const panWidth = 230
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Equation balance'),
    lineSegment({ x: centerX - 260, y: beamY }, { x: centerX + 260, y: beamY }, {
      color: input.balanced === false ? 'orange' : 'green',
      size: 'm',
      dash: 'solid',
    }),
    lineSegment({ x: centerX, y: beamY }, { x: centerX, y: baseY }, {
      color: 'grey',
      size: 'm',
      dash: 'solid',
    }),
    polyline(
      [
        { x: centerX - 58, y: baseY },
        { x: centerX, y: beamY + 36 },
        { x: centerX + 58, y: baseY },
      ],
      { color: 'grey', size: 'm', dash: 'solid' }
    ),
    lineSegment({ x: centerX - 210, y: beamY }, { x: centerX - 210, y: panY }, {
      color: 'grey',
      size: 's',
      dash: 'solid',
    }),
    lineSegment({ x: centerX + 210, y: beamY }, { x: centerX + 210, y: panY }, {
      color: 'grey',
      size: 's',
      dash: 'solid',
    }),
    rectangle(centerX - 210 - panWidth / 2, panY, panWidth, 78, {
      color: 'blue',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    rectangle(centerX + 210 - panWidth / 2, panY, panWidth, 78, {
      color: 'blue',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(centerX - 210 - panWidth / 2 + 20, panY + 22, prettifyMathExpression(input.leftExpression), {
      width: panWidth - 40,
      color: 'green',
    }),
    textLabel(centerX + 210 - panWidth / 2 + 20, panY + 22, prettifyMathExpression(input.rightExpression), {
      width: panWidth - 40,
      color: 'green',
    }),
    textLabel(
      centerX - 128,
      TOOL_SCENE.y + 428,
      input.balanced === false ? 'Check what changed on each side.' : 'Keep both sides equal.',
      {
        width: 280,
        color: input.balanced === false ? 'orange' : 'grey',
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary: 'Prepared an equation balance model on the canvas.',
    canvasActions: actions,
  }
}

export function barModelScene(input: {
  title?: string
  bars: Array<{
    label?: string
    segments: Array<{
      label?: string
      value?: string | number
      shaded?: boolean
    }>
  }>
}): CanvasActionResult {
  const bars = input.bars
    .slice(0, 4)
    .map((bar) => ({
      label: bar.label?.trim(),
      segments: bar.segments
        .slice(0, 8)
        .map((segment) => ({
          label: segment.label?.trim(),
          value: segment.value,
          shaded: segment.shaded === true,
        }))
        .filter((segment) => segment.label || segment.value !== undefined),
    }))
    .filter((bar) => bar.segments.length > 0)

  if (bars.length === 0) {
    throw new Error('Bar model needs at least one bar with one segment.')
  }

  const barX = TOOL_SCENE.x + 178
  const barY = TOOL_SCENE.y + 142
  const barWidth = 430
  const barHeight = 58
  const barGap = 66
  const labelX = TOOL_SCENE.x + 54

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Bar model'),
  ]

  bars.forEach((bar, barIndex) => {
    const y = barY + barIndex * (barHeight + barGap)
    const numericValues = bar.segments.map((segment) => Number(segment.value))
    const hasUsableValues =
      numericValues.every((value) => Number.isFinite(value) && value > 0) &&
      numericValues.reduce((sum, value) => sum + value, 0) > 0
    const total = hasUsableValues ? numericValues.reduce((sum, value) => sum + value, 0) : 0

    actions.push(
      textLabel(labelX, y + 16, bar.label || `Bar ${barIndex + 1}`, {
        width: 110,
        color: 'green',
      })
    )

    let cursorX = barX
    bar.segments.forEach((segment, segmentIndex) => {
      const segmentWidth = hasUsableValues
        ? Math.max(42, (Number(segment.value) / total) * barWidth)
        : barWidth / bar.segments.length
      const isLast = segmentIndex === bar.segments.length - 1
      const width = isLast ? Math.max(36, barX + barWidth - cursorX) : segmentWidth
      const label =
        segment.label ||
        (segment.value !== undefined ? String(segment.value) : `Part ${segmentIndex + 1}`)

      actions.push(
        rectangle(cursorX, y, width, barHeight, {
          color: segment.shaded ? 'green' : 'blue',
          fill: segment.shaded ? 'solid' : 'none',
          opacity: segment.shaded ? 0.24 : undefined,
          dash: 'solid',
          size: 's',
        }),
        textLabel(cursorX + 10, y + 16, label, {
          width: Math.max(38, width - 20),
          color: segment.shaded ? 'green' : 'black',
        })
      )
      cursorX += width
    })
  })

  actions.push(
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: 'Prepared a bar model on the canvas.',
    canvasActions: actions,
  }
}

export function placeValueChartScene(input: {
  columns: string[]
  rows: Array<{
    label?: string
    values: Array<string | number>
  }>
  title?: string
}): CanvasActionResult {
  const columns = input.columns.map((column) => column.trim()).filter(Boolean).slice(0, 8)
  const rows = input.rows
    .slice(0, 4)
    .map((row) => ({
      label: row.label?.trim(),
      values: row.values.slice(0, columns.length).map((value) => String(value)),
    }))
    .filter((row) => row.values.length > 0)

  if (columns.length < 2) {
    throw new Error('Place-value chart needs at least two columns.')
  }
  if (rows.length === 0) {
    throw new Error('Place-value chart needs at least one row.')
  }

  const rowHeaderWidth = rows.some((row) => row.label) ? 112 : 0
  const x = TOOL_SCENE.x + 76
  const y = TOOL_SCENE.y + 140
  const availableWidth = 620
  const columnWidth = Math.min(96, Math.floor((availableWidth - rowHeaderWidth) / columns.length))
  const rowHeight = 48
  const tableWidth = rowHeaderWidth + columnWidth * columns.length
  const tableHeight = rowHeight * (rows.length + 1)

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Place-value chart'),
    rectangle(x, y, tableWidth, tableHeight, {
      color: 'blue',
      fill: 'none',
      dash: 'solid',
      size: 's',
    }),
    rectangle(x, y, tableWidth, rowHeight, {
      color: 'light-green',
      fill: 'solid',
      opacity: 0.16,
      dash: 'solid',
      size: 's',
    }),
  ]

  if (rowHeaderWidth > 0) {
    actions.push(
      lineSegment({ x: x + rowHeaderWidth, y }, { x: x + rowHeaderWidth, y: y + tableHeight }, {
        color: 'blue',
        size: 's',
        dash: 'solid',
      })
    )
  }

  columns.forEach((column, index) => {
    const columnX = x + rowHeaderWidth + columnWidth * index
    if (index > 0) {
      actions.push(
        lineSegment({ x: columnX, y }, { x: columnX, y: y + tableHeight }, {
          color: 'blue',
          size: 's',
          dash: 'solid',
        })
      )
    }
    actions.push(
      textLabel(columnX + 8, y + 12, column, {
        width: columnWidth - 14,
        color: 'green',
      })
    )
  })

  rows.forEach((row, rowIndex) => {
    const rowY = y + rowHeight * (rowIndex + 1)
    actions.push(
      lineSegment({ x, y: rowY }, { x: x + tableWidth, y: rowY }, {
        color: 'blue',
        size: 's',
        dash: 'solid',
      })
    )
    if (rowHeaderWidth > 0) {
      actions.push(
        textLabel(x + 10, rowY + 12, row.label || `Row ${rowIndex + 1}`, {
          width: rowHeaderWidth - 18,
          color: 'grey',
        })
      )
    }
    columns.forEach((_, columnIndex) => {
      actions.push(
        textLabel(x + rowHeaderWidth + columnWidth * columnIndex + 12, rowY + 12, row.values[columnIndex] || '', {
          width: columnWidth - 20,
          color: 'black',
        })
      )
    })
  })

  actions.push(
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: 'Prepared a place-value chart on the canvas.',
    canvasActions: actions,
  }
}

function primeFactorization(value: number) {
  const factors: number[] = []
  let remaining = Math.trunc(Math.abs(value))
  let divisor = 2

  while (remaining > 1 && divisor * divisor <= remaining) {
    while (remaining % divisor === 0) {
      factors.push(divisor)
      remaining /= divisor
    }
    divisor += divisor === 2 ? 1 : 2
  }

  if (remaining > 1) {
    factors.push(remaining)
  }

  return factors
}

export function factorTreeScene(input: {
  value: number
  title?: string
}): CanvasActionResult {
  const value = Math.trunc(input.value)
  if (!Number.isFinite(value) || value < 2 || value > 999) {
    throw new Error('Factor tree supports whole numbers from 2 to 999.')
  }

  const factors = primeFactorization(value)
  const root = { x: TOOL_SCENE.x + 390, y: TOOL_SCENE.y + 122 }
  const leafY = TOOL_SCENE.y + 330
  const spacing = Math.min(112, 520 / Math.max(factors.length, 1))
  const startX = root.x - ((factors.length - 1) * spacing) / 2

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Factor tree'),
    point(root.x, root.y, {
      label: String(value),
      color: 'green',
      labelPosition: 'top',
      labelWidth: 80,
    }),
  ]

  factors.forEach((factor, index) => {
    const leaf = { x: startX + index * spacing, y: leafY }
    actions.push(
      lineSegment(root, leaf, {
        color: 'grey',
        size: 's',
        dash: 'solid',
      }),
      point(leaf.x, leaf.y, {
        label: String(factor),
        color: 'blue',
        labelPosition: 'bottom',
        labelWidth: 60,
      })
    )
  })

  actions.push(
    textLabel(TOOL_SCENE.x + 146, TOOL_SCENE.y + 416, `${value} = ${factors.join(' x ')}`, {
      width: 360,
      color: 'green',
    }),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: 'Prepared a factor tree on the canvas.',
    canvasActions: actions,
  }
}

function buildLongDivisionStepLines(dividend: number, divisor: number) {
  const digits = String(dividend)
    .split('')
    .map((digit) => Number(digit))
  const lines: string[] = []
  let working = 0

  digits.forEach((digit, index) => {
    working = working * 10 + digit
    const qDigit = Math.floor(working / divisor)
    const product = qDigit * divisor
    const remainder = working - product

    if (qDigit === 0 && lines.length === 0 && index < digits.length - 1) {
      lines.push(`${working} is less than ${divisor}, so bring down the next digit.`)
      return
    }

    lines.push(`${working} ÷ ${divisor} gives ${qDigit}.`)
    lines.push(`${qDigit} × ${divisor} = ${product}; subtract to get ${remainder}.`)
    working = remainder

    if (index < digits.length - 1) {
      lines.push(`Bring down ${digits[index + 1]}.`)
    }
  })

  return lines.slice(0, 7)
}

export function longDivisionScene(input: {
  dividend: number
  divisor: number
  title?: string
}): CanvasActionResult {
  const dividend = Math.trunc(input.dividend)
  const divisor = Math.trunc(input.divisor)

  if (!Number.isFinite(dividend) || dividend < 1 || dividend > 99999) {
    throw new Error('Long division supports whole-number dividends from 1 to 99999.')
  }
  if (!Number.isFinite(divisor) || divisor < 1 || divisor > 999) {
    throw new Error('Long division supports whole-number divisors from 1 to 999.')
  }

  const quotient = Math.floor(dividend / divisor)
  const remainder = dividend % divisor
  const bracketX = TOOL_SCENE.x + 164
  const bracketY = TOOL_SCENE.y + 222
  const bracketWidth = 300
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Long division'),
    textLabel(TOOL_SCENE.x + 36, TOOL_SCENE.y + 64, `${dividend} ÷ ${divisor}`, {
      width: 220,
      color: 'green',
    }),
    textLabel(bracketX - 88, bracketY + 8, String(divisor), {
      width: 72,
      color: 'black',
    }),
    textLabel(bracketX + 26, bracketY + 8, String(dividend), {
      width: 180,
      color: 'black',
    }),
    textLabel(bracketX + 26, bracketY - 66, String(quotient), {
      width: 180,
      color: 'green',
    }),
    lineSegment(
      { x: bracketX, y: bracketY - 18 },
      { x: bracketX + bracketWidth, y: bracketY - 18 },
      { color: 'blue', size: 'm', dash: 'solid' }
    ),
    lineSegment(
      { x: bracketX, y: bracketY - 18 },
      { x: bracketX, y: bracketY + 58 },
      { color: 'blue', size: 'm', dash: 'solid' }
    ),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Steps', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(NOTE_FRAME.x + 16, NOTE_FRAME.y + 52, buildLongDivisionStepLines(dividend, divisor), {
      width: NOTE_FRAME.width - 32,
      color: 'black',
      lineHeight: 28,
    }),
    textLabel(
      bracketX + 26,
      bracketY + 94,
      remainder === 0 ? `Answer: ${quotient}` : `Answer: ${quotient} R ${remainder}`,
      {
        width: 240,
        color: 'green',
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary:
      remainder === 0
        ? `Prepared long division for ${dividend} ÷ ${divisor}; quotient ${quotient}.`
        : `Prepared long division for ${dividend} ÷ ${divisor}; quotient ${quotient} remainder ${remainder}.`,
    canvasActions: actions,
  }
}

export function decimalGridScene(input: {
  shadedParts: number
  totalParts?: number
  title?: string
  label?: string
}): CanvasActionResult {
  const totalParts = input.totalParts === 10 ? 10 : 100
  const shadedParts = Math.trunc(clamp(input.shadedParts, 0, totalParts))
  const columns = 10
  const rows = totalParts === 100 ? 10 : 1
  const cellSize = totalParts === 100 ? 30 : 42
  const gridX = TOOL_SCENE.x + 118
  const gridY = TOOL_SCENE.y + 154
  const gridWidth = columns * cellSize
  const gridHeight = rows * cellSize
  const decimalValue = shadedParts / totalParts

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || (totalParts === 100 ? 'Hundredths grid' : 'Tenths grid')),
    textLabel(
      gridX,
      TOOL_SCENE.y + 62,
      input.label?.trim() ||
        `${shadedParts}/${totalParts} = ${formatNumber(decimalValue, 2)} = ${formatPercent(decimalValue * 100)}`,
      {
        width: 420,
        color: 'green',
      }
    ),
  ]

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column
      const shaded = index < shadedParts
      actions.push(
        rectangle(gridX + column * cellSize, gridY + row * cellSize, cellSize, cellSize, {
          color: shaded ? 'green' : 'blue',
          fill: shaded ? 'solid' : 'none',
          opacity: shaded ? 0.28 : undefined,
          dash: 'solid',
          size: 's',
        })
      )
    }
  }

  actions.push(
    textLabel(gridX + gridWidth + 34, gridY + Math.max(0, gridHeight / 2 - 38), 'Each small square is one equal part.', {
      width: 180,
      color: 'grey',
    }),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: `Prepared a ${totalParts === 100 ? 'hundredths' : 'tenths'} grid for ${shadedParts}/${totalParts}.`,
    canvasActions: actions,
  }
}

export function dataDisplayScene(input: {
  displayType: 'bar_chart' | 'line_plot'
  data: Array<{ label: string; value: number }>
  title?: string
}): CanvasActionResult {
  const data = input.data
    .slice(0, 8)
    .map((item) => ({
      label: item.label.trim().slice(0, 14),
      value: coerceFiniteNumber(item.value),
    }))
    .filter((item) => item.label && Number.isFinite(item.value))

  if (data.length === 0) {
    throw new Error('Data display needs at least one labeled value.')
  }
  if (input.displayType === 'bar_chart' && data.some((item) => item.value < 0)) {
    throw new Error('Bar charts in this lab need non-negative values.')
  }

  const chartX = TOOL_SCENE.x + 96
  const chartY = TOOL_SCENE.y + 138
  const chartWidth = 530
  const chartHeight = 300
  const maxValue = Math.max(1, ...data.map((item) => item.value))
  const yMax = Math.ceil(maxValue / niceTickStep(maxValue, 4)) * niceTickStep(maxValue, 4)
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || (input.displayType === 'line_plot' ? 'Line plot' : 'Bar chart')),
    lineSegment({ x: chartX, y: chartY + chartHeight }, { x: chartX + chartWidth, y: chartY + chartHeight }, {
      color: 'grey',
      size: 'm',
      dash: 'solid',
    }),
    lineSegment({ x: chartX, y: chartY }, { x: chartX, y: chartY + chartHeight }, {
      color: 'grey',
      size: 'm',
      dash: 'solid',
    }),
  ]

  for (const tick of generateTicks(0, yMax, { targetSegments: 4 })) {
    const y = mapToRange(tick, 0, yMax, chartY + chartHeight, chartY)
    actions.push(
      lineSegment({ x: chartX - 6, y }, { x: chartX + chartWidth, y }, {
        color: tick === 0 ? 'grey' : 'light-blue',
        size: 's',
        dash: tick === 0 ? 'solid' : 'dotted',
      }),
      textLabel(chartX - 54, y - 12, formatNumber(tick), {
        width: 42,
        color: 'grey',
      })
    )
  }

  const slotWidth = chartWidth / data.length
  if (input.displayType === 'line_plot') {
    const points = data.map((item, index) => ({
      x: chartX + slotWidth * index + slotWidth / 2,
      y: mapToRange(item.value, 0, yMax, chartY + chartHeight, chartY),
    }))
    actions.push(polyline(points, { color: 'blue', size: 'm', dash: 'solid' }))
    points.forEach((canvasPoint, index) => {
      actions.push(
        point(canvasPoint.x, canvasPoint.y, {
          label: formatNumber(data[index].value),
          color: 'green',
          labelPosition: 'top',
          labelWidth: 72,
        }),
        textLabel(canvasPoint.x - slotWidth / 2 + 8, chartY + chartHeight + 18, data[index].label, {
          width: slotWidth - 16,
          color: 'grey',
        })
      )
    })
  } else {
    const barWidth = Math.min(56, slotWidth * 0.64)
    data.forEach((item, index) => {
      const barHeight = mapToRange(item.value, 0, yMax, 0, chartHeight)
      const x = chartX + slotWidth * index + (slotWidth - barWidth) / 2
      const y = chartY + chartHeight - barHeight
      actions.push(
        rectangle(x, y, barWidth, barHeight, {
          color: 'green',
          fill: 'solid',
          opacity: 0.26,
          dash: 'solid',
          size: 's',
        }),
        textLabel(x - 8, y - 28, formatNumber(item.value), {
          width: barWidth + 16,
          color: 'green',
        }),
        textLabel(chartX + slotWidth * index + 8, chartY + chartHeight + 18, item.label, {
          width: slotWidth - 16,
          color: 'grey',
        })
      )
    })
  }

  actions.push(
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: `Prepared a ${input.displayType === 'line_plot' ? 'line plot' : 'bar chart'} for ${data.length} values.`,
    canvasActions: actions,
  }
}

export function integerChipsScene(input: {
  positiveCount: number
  negativeCount: number
  title?: string
  expression?: string
}): CanvasActionResult {
  const positiveCount = Math.trunc(clamp(input.positiveCount, 0, 24))
  const negativeCount = Math.trunc(clamp(input.negativeCount, 0, 24))
  if (positiveCount + negativeCount === 0) {
    throw new Error('Integer chips need at least one positive or negative chip.')
  }

  const chipSize = 42
  const gap = 12
  const positivesX = TOOL_SCENE.x + 112
  const negativesX = TOOL_SCENE.x + 420
  const startY = TOOL_SCENE.y + 160
  const value = positiveCount - negativeCount
  const drawChip = (x: number, y: number, label: string, color: TutorCanvasColor) => [
    rectangle(x, y, chipSize, chipSize, {
      color,
      fill: 'solid',
      opacity: 0.22,
      dash: 'solid',
      size: 's',
    }),
    textLabel(x + 12, y + 9, label, {
      width: 24,
      color,
    }),
  ]

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Integer chips'),
    textLabel(TOOL_SCENE.x + 46, TOOL_SCENE.y + 66, input.expression?.trim() || `${positiveCount} positives and ${negativeCount} negatives`, {
      width: 460,
      color: 'green',
    }),
    textLabel(positivesX, startY - 42, 'Positive chips', {
      width: 180,
      color: 'green',
    }),
    textLabel(negativesX, startY - 42, 'Negative chips', {
      width: 180,
      color: 'red',
    }),
  ]

  Array.from({ length: positiveCount }).forEach((_, index) => {
    const column = index % 5
    const row = Math.floor(index / 5)
    actions.push(...drawChip(positivesX + column * (chipSize + gap), startY + row * (chipSize + gap), '+', 'green'))
  })

  Array.from({ length: negativeCount }).forEach((_, index) => {
    const column = index % 5
    const row = Math.floor(index / 5)
    actions.push(...drawChip(negativesX + column * (chipSize + gap), startY + row * (chipSize + gap), '-', 'red'))
  })

  const zeroPairs = Math.min(positiveCount, negativeCount)
  actions.push(
    textLabel(TOOL_SCENE.x + 114, TOOL_SCENE.y + 424, `${zeroPairs} zero pair${zeroPairs === 1 ? '' : 's'} can cancel.`, {
      width: 250,
      color: 'grey',
    }),
    textLabel(TOOL_SCENE.x + 420, TOOL_SCENE.y + 424, `Result: ${formatNumber(value)}`, {
      width: 210,
      color: value < 0 ? 'red' : 'green',
    }),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: `Prepared integer chips with value ${value}.`,
    canvasActions: actions,
  }
}

function simplifyFractionParts(numerator: number, denominator: number) {
  const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))
  const divisor = gcd(numerator, denominator) || 1
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  }
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : greatestCommonDivisor(b, a % b)
}

function leastCommonMultiple(a: number, b: number) {
  return Math.abs(a * b) / (greatestCommonDivisor(a, b) || 1)
}

function formatFraction(numerator: number, denominator: number) {
  if (denominator === 1) return String(numerator)
  return `${numerator}/${denominator}`
}

export function fractionCompareScene(input: {
  leftNumerator: number
  leftDenominator: number
  rightNumerator: number
  rightDenominator: number
  title?: string
}): CanvasActionResult {
  const leftNumerator = Math.trunc(input.leftNumerator)
  const leftDenominator = Math.trunc(input.leftDenominator)
  const rightNumerator = Math.trunc(input.rightNumerator)
  const rightDenominator = Math.trunc(input.rightDenominator)

  if (
    leftNumerator < 0 ||
    rightNumerator < 0 ||
    leftDenominator <= 0 ||
    rightDenominator <= 0 ||
    leftDenominator > 16 ||
    rightDenominator > 16
  ) {
    throw new Error('Fraction comparison supports non-negative fractions with denominators from 1 to 16.')
  }

  const leftValue = leftNumerator / leftDenominator
  const rightValue = rightNumerator / rightDenominator
  const comparison = isNearlyEqual(leftValue, rightValue)
    ? '='
    : leftValue > rightValue
    ? '>'
    : '<'
  const barX = TOOL_SCENE.x + 122
  const barY = TOOL_SCENE.y + 166
  const barWidth = 430
  const barHeight = 56
  const rowGap = 92
  const drawFractionBar = (
    numerator: number,
    denominator: number,
    y: number,
    label: string,
    color: TutorCanvasColor
  ) => {
    const partWidth = barWidth / denominator
    const parts: TutorCanvasAction[] = [
      textLabel(barX - 76, y + 16, label, {
        width: 64,
        color,
      }),
    ]
    for (let index = 0; index < denominator; index += 1) {
      const shaded = index < numerator
      parts.push(
        rectangle(barX + index * partWidth, y, partWidth, barHeight, {
          color: shaded ? color : 'blue',
          fill: shaded ? 'solid' : 'none',
          opacity: shaded ? 0.26 : undefined,
          dash: 'solid',
          size: 's',
        })
      )
    }
    return parts
  }

  const commonDenominator = leftDenominator * rightDenominator
  const leftEquivalent = leftNumerator * rightDenominator
  const rightEquivalent = rightNumerator * leftDenominator
  const simplifiedLeft = simplifyFractionParts(leftNumerator, leftDenominator)
  const simplifiedRight = simplifyFractionParts(rightNumerator, rightDenominator)

  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Compare fractions'),
    ...drawFractionBar(leftNumerator, leftDenominator, barY, `${leftNumerator}/${leftDenominator}`, 'green'),
    ...drawFractionBar(rightNumerator, rightDenominator, barY + rowGap, `${rightNumerator}/${rightDenominator}`, 'orange'),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Compare', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        `${leftNumerator}/${leftDenominator} ${comparison} ${rightNumerator}/${rightDenominator}`,
        `Common denominator: ${commonDenominator}`,
        `${leftEquivalent}/${commonDenominator} ${comparison} ${rightEquivalent}/${commonDenominator}`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    textLabel(
      barX,
      TOOL_SCENE.y + 408,
      `${simplifiedLeft.numerator}/${simplifiedLeft.denominator} ${comparison} ${simplifiedRight.numerator}/${simplifiedRight.denominator}`,
      {
        width: 360,
        color: 'green',
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary: `Prepared a fraction comparison for ${leftNumerator}/${leftDenominator} ${comparison} ${rightNumerator}/${rightDenominator}.`,
    canvasActions: actions,
  }
}

export function areaPerimeterModelScene(input: {
  widthUnits: number
  heightUnits: number
  unitLabel?: string
  title?: string
  showUnitSquares?: boolean
}): CanvasActionResult {
  const widthUnits = Math.trunc(input.widthUnits)
  const heightUnits = Math.trunc(input.heightUnits)
  const unitLabel = input.unitLabel?.trim() || 'unit'

  if (widthUnits <= 0 || heightUnits <= 0 || widthUnits > 20 || heightUnits > 20) {
    throw new Error('Area and perimeter model supports dimensions from 1 to 20 units.')
  }

  const maxGrid = Math.max(widthUnits, heightUnits)
  const cellSize = Math.min(42, Math.floor(300 / maxGrid))
  const rectWidth = widthUnits * cellSize
  const rectHeight = heightUnits * cellSize
  const x = TOOL_SCENE.x + 142
  const y = TOOL_SCENE.y + 152
  const area = widthUnits * heightUnits
  const perimeter = 2 * (widthUnits + heightUnits)
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Area and perimeter'),
    rectangle(x, y, rectWidth, rectHeight, {
      color: 'green',
      fill: 'semi',
      opacity: 0.14,
      dash: 'solid',
      size: 'm',
    }),
    textLabel(x + rectWidth / 2 - 70, y + rectHeight + 20, `${widthUnits} ${formatUnitLabel(unitLabel, widthUnits)}`, {
      width: 140,
      color: 'green',
    }),
    textLabel(x + rectWidth + 18, y + rectHeight / 2 - 14, `${heightUnits} ${formatUnitLabel(unitLabel, heightUnits)}`, {
      width: 150,
      color: 'green',
    }),
  ]

  if (input.showUnitSquares !== false && widthUnits <= 12 && heightUnits <= 12) {
    for (let column = 1; column < widthUnits; column += 1) {
      const lineX = x + column * cellSize
      actions.push(
        lineSegment({ x: lineX, y }, { x: lineX, y: y + rectHeight }, {
          color: 'light-blue',
          size: 's',
          dash: 'solid',
        })
      )
    }
    for (let row = 1; row < heightUnits; row += 1) {
      const lineY = y + row * cellSize
      actions.push(
        lineSegment({ x, y: lineY }, { x: x + rectWidth, y: lineY }, {
          color: 'light-blue',
          size: 's',
          dash: 'solid',
        })
      )
    }
  }

  actions.push(
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Key facts', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        `Area = ${widthUnits} x ${heightUnits} = ${area} ${formatSquareUnitLabel(unitLabel)}.`,
        `Perimeter = 2(${widthUnits} + ${heightUnits}) = ${perimeter} ${formatUnitLabel(unitLabel, perimeter)}.`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: `Prepared an area and perimeter model with area ${area} and perimeter ${perimeter}.`,
    canvasActions: actions,
  }
}

export function slopeTriangleScene(input: {
  pointA: { x: number; y: number }
  pointB: { x: number; y: number }
  title?: string
}): CanvasActionResult {
  const pointA = {
    x: coerceFiniteNumber(input.pointA.x),
    y: coerceFiniteNumber(input.pointA.y),
  }
  const pointB = {
    x: coerceFiniteNumber(input.pointB.x),
    y: coerceFiniteNumber(input.pointB.y),
  }
  if (isNearlyEqual(pointA.x, pointB.x) && isNearlyEqual(pointA.y, pointB.y)) {
    throw new Error('Slope triangle needs two different points.')
  }

  const xDomain = expandNumericDomain([pointA.x, pointB.x, 0], { minSpan: 6, padding: 1 })
  const yDomain = expandNumericDomain([pointA.y, pointB.y, 0], { minSpan: 6, padding: 1 })
  const plane = buildCoordinatePlaneScene({
    clearExisting: true,
    title: input.title?.trim() || 'Slope triangle',
    xDomain,
    yDomain,
  })
  const aCanvas = mapGraphCoordinateToCanvas(pointA, { x: xDomain, y: yDomain })
  const bCanvas = mapGraphCoordinateToCanvas(pointB, { x: xDomain, y: yDomain })
  const cornerCanvas = mapGraphCoordinateToCanvas({ x: pointB.x, y: pointA.y }, { x: xDomain, y: yDomain })
  const run = pointB.x - pointA.x
  const rise = pointB.y - pointA.y
  const slopeText = isNearlyEqual(run, 0)
    ? 'undefined'
    : formatNumber(rise / run, 3)

  const actions: TutorCanvasAction[] = [
    ...plane.canvasActions,
    lineSegment(aCanvas, bCanvas, { color: 'blue', size: 'm', dash: 'solid' }),
    lineSegment(aCanvas, cornerCanvas, {
      color: 'orange',
      size: 'm',
      dash: 'dashed',
      label: `run ${formatNumber(run)}`,
    }),
    lineSegment(cornerCanvas, bCanvas, {
      color: 'green',
      size: 'm',
      dash: 'dashed',
      label: `rise ${formatNumber(rise)}`,
    }),
    point(aCanvas.x, aCanvas.y, {
      label: `A(${formatNumber(pointA.x)}, ${formatNumber(pointA.y)})`,
      color: 'blue',
      labelPosition: 'bottom-left',
      labelWidth: 130,
    }),
    point(bCanvas.x, bCanvas.y, {
      label: `B(${formatNumber(pointB.x)}, ${formatNumber(pointB.y)})`,
      color: 'blue',
      labelPosition: 'top-right',
      labelWidth: 130,
    }),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Slope', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        `rise = ${formatNumber(rise)}`,
        `run = ${formatNumber(run)}`,
        `slope = rise/run = ${slopeText}`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary: `Prepared a slope triangle with rise ${formatNumber(rise)}, run ${formatNumber(run)}, and slope ${slopeText}.`,
    canvasActions: actions,
  }
}

export function fractionOperationScene(input: {
  operation: 'add' | 'subtract' | 'multiply' | 'divide'
  leftNumerator: number
  leftDenominator: number
  rightNumerator: number
  rightDenominator: number
  title?: string
}): CanvasActionResult {
  const leftNumerator = Math.trunc(input.leftNumerator)
  const leftDenominator = Math.trunc(input.leftDenominator)
  const rightNumerator = Math.trunc(input.rightNumerator)
  const rightDenominator = Math.trunc(input.rightDenominator)

  if (
    leftDenominator <= 0 ||
    rightDenominator <= 0 ||
    leftDenominator > 24 ||
    rightDenominator > 24 ||
    !['add', 'subtract', 'multiply', 'divide'].includes(input.operation)
  ) {
    throw new Error('Fraction operation supports denominators from 1 to 24.')
  }
  if (input.operation === 'divide' && rightNumerator === 0) {
    throw new Error('Cannot divide by zero.')
  }

  const operator = input.operation === 'add' ? '+' : input.operation === 'subtract' ? '-' : input.operation === 'multiply' ? 'x' : '÷'
  let resultNumerator: number
  let resultDenominator: number
  let stepLines: string[]

  if (input.operation === 'add' || input.operation === 'subtract') {
    const commonDenominator = leastCommonMultiple(leftDenominator, rightDenominator)
    const leftScaled = leftNumerator * (commonDenominator / leftDenominator)
    const rightScaled = rightNumerator * (commonDenominator / rightDenominator)
    resultNumerator = input.operation === 'add' ? leftScaled + rightScaled : leftScaled - rightScaled
    resultDenominator = commonDenominator
    stepLines = [
      `Common denominator: ${commonDenominator}`,
      `${formatFraction(leftNumerator, leftDenominator)} = ${formatFraction(leftScaled, commonDenominator)}`,
      `${formatFraction(rightNumerator, rightDenominator)} = ${formatFraction(rightScaled, commonDenominator)}`,
    ]
  } else if (input.operation === 'multiply') {
    resultNumerator = leftNumerator * rightNumerator
    resultDenominator = leftDenominator * rightDenominator
    stepLines = [
      'Multiply numerators.',
      'Multiply denominators.',
      `${leftNumerator} x ${rightNumerator} over ${leftDenominator} x ${rightDenominator}`,
    ]
  } else {
    resultNumerator = leftNumerator * rightDenominator
    resultDenominator = leftDenominator * rightNumerator
    stepLines = [
      'Keep the first fraction.',
      'Change divide to multiply.',
      `Use the reciprocal ${formatFraction(rightDenominator, rightNumerator)}.`,
    ]
  }

  const simplified = simplifyFractionParts(resultNumerator, resultDenominator)
  const originalExpression = `${formatFraction(leftNumerator, leftDenominator)} ${operator} ${formatFraction(rightNumerator, rightDenominator)}`
  const resultExpression = `${formatFraction(resultNumerator, resultDenominator)} = ${formatFraction(simplified.numerator, simplified.denominator)}`
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Fraction operation'),
    textLabel(TOOL_SCENE.x + 48, TOOL_SCENE.y + 70, originalExpression, {
      width: 360,
      color: 'green',
    }),
    rectangle(TOOL_SCENE.x + 54, TOOL_SCENE.y + 132, 390, 260, {
      color: 'light-blue',
      fill: 'semi',
      opacity: 0.1,
      dash: 'solid',
      size: 's',
    }),
    ...noteParagraph(TOOL_SCENE.x + 78, TOOL_SCENE.y + 162, stepLines, {
      width: 336,
      color: 'black',
      lineHeight: 34,
    }),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Result', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 62, resultExpression, {
      width: NOTE_FRAME.width - 32,
      color: 'black',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 112, 'Ask the student to explain the operation before moving on.', {
      width: NOTE_FRAME.width - 32,
      color: 'grey',
    }),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary: `Prepared fraction ${input.operation} work for ${originalExpression}; result ${formatFraction(simplified.numerator, simplified.denominator)}.`,
    canvasActions: actions,
  }
}

export function orderOfOperationsScene(input: {
  expression: string
  title?: string
}): CanvasActionResult {
  const expression = normalizeExpression(input.expression)
  if (!expression || expression.length > 80 || /[a-z]/i.test(expression)) {
    throw new Error('Order of operations tool supports numeric expressions up to 80 characters.')
  }

  const result = coerceFiniteNumber(safeEvaluate(expression))
  const simplified = simplify(expression).toString()
  const readable = prettifyMathExpression(expression)
  const hasParentheses = /[()]/.test(expression)
  const hasMultiplyDivide = /[*\/]/.test(expression)
  const hasAddSubtract = /[+\-]/.test(expression.replace(/^\-/, ''))
  const stepLines = [
    hasParentheses ? '1. Parentheses first.' : '1. No parentheses to simplify first.',
    hasMultiplyDivide ? '2. Multiply or divide left to right.' : '2. No multiply or divide step needed.',
    hasAddSubtract ? '3. Add or subtract left to right.' : '3. No final add or subtract step needed.',
  ]

  return {
    summary: `Prepared order-of-operations work for ${readable}; result ${formatNumber(result)}.`,
    canvasActions: buildCanvasWriteActions({
      title: input.title?.trim() || 'Order of operations',
      textLines: [...stepLines, `Result: ${formatNumber(result)}`],
      mathExpressions: [readable, simplified === String(result) ? formatNumber(result) : `${simplified} = ${formatNumber(result)}`],
      clearExisting: true,
    }),
  }
}

export function statisticsSummaryScene(input: {
  values: number[]
  title?: string
}): CanvasActionResult {
  const values = input.values
    .map((value) => coerceFiniteNumber(value))
    .filter(Number.isFinite)
    .slice(0, 24)

  if (values.length === 0) {
    throw new Error('Statistics summary needs at least one value.')
  }

  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((total, value) => total + value, 0)
  const mean = sum / values.length
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const counts = new Map<number, number>()
  sorted.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  const maxCount = Math.max(...counts.values())
  const modes = [...counts.entries()]
    .filter(([, count]) => count === maxCount && maxCount > 1)
    .map(([value]) => value)
  const range = sorted[sorted.length - 1] - sorted[0]
  const lineStart = { x: TOOL_SCENE.x + 84, y: TOOL_SCENE.y + 336 }
  const lineEnd = { x: TOOL_SCENE.x + 472, y: TOOL_SCENE.y + 336 }
  const minValue = sorted[0]
  const maxValue = sorted[sorted.length - 1]
  const domain: [number, number] = isNearlyEqual(minValue, maxValue)
    ? [minValue - 1, maxValue + 1]
    : [minValue, maxValue]
  const mapValue = (value: number) => mapToRange(value, domain[0], domain[1], lineStart.x, lineEnd.x)
  const seenStack = new Map<number, number>()
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Statistics summary'),
    textLabel(TOOL_SCENE.x + 62, TOOL_SCENE.y + 72, `Data: ${values.map((value) => formatNumber(value)).join(', ')}`, {
      width: 500,
      color: 'green',
    }),
    lineSegment(lineStart, lineEnd, {
      color: 'blue',
      size: 'm',
      dash: 'solid',
    }),
    textLabel(lineStart.x - 18, lineStart.y + 22, formatNumber(domain[0]), {
      width: 58,
      color: 'grey',
    }),
    textLabel(lineEnd.x - 18, lineEnd.y + 22, formatNumber(domain[1]), {
      width: 58,
      color: 'grey',
    }),
  ]

  sorted.forEach((value) => {
    const stack = seenStack.get(value) ?? 0
    seenStack.set(value, stack + 1)
    actions.push(
      point(mapValue(value), lineStart.y - 22 - stack * 26, {
        color: 'green',
      })
    )
  })

  actions.push(
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Summary', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        `Mean: ${formatNumber(mean)}`,
        `Median: ${formatNumber(median)}`,
        `Mode: ${modes.length > 0 ? modes.map((value) => formatNumber(value)).join(', ') : 'none'}`,
        `Range: ${formatNumber(range)}`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: `Prepared statistics summary: mean ${formatNumber(mean)}, median ${formatNumber(median)}, range ${formatNumber(range)}.`,
    canvasActions: actions,
  }
}

const UNIT_FACTORS = {
  length: {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    km: 1000,
  },
  mass: {
    g: 1,
    kg: 1000,
  },
  capacity: {
    mL: 0.001,
    L: 1,
  },
  time: {
    seconds: 1,
    minutes: 60,
    hours: 3600,
  },
} as const

export function unitConversionScene(input: {
  value: number
  fromUnit: string
  toUnit: string
  measurementType: 'length' | 'mass' | 'capacity' | 'time'
  title?: string
}): CanvasActionResult {
  const value = coerceFiniteNumber(input.value)
  const units = UNIT_FACTORS[input.measurementType]
  const fromUnit = input.fromUnit.trim() as keyof typeof units
  const toUnit = input.toUnit.trim() as keyof typeof units

  if (!(fromUnit in units) || !(toUnit in units)) {
    throw new Error('Unsupported unit conversion for this measurement type.')
  }

  const baseValue = value * Number(units[fromUnit])
  const converted = baseValue / Number(units[toUnit])
  const conversionFactor = Number(units[fromUnit]) / Number(units[toUnit])

  return {
    summary: `Prepared unit conversion: ${formatNumber(value)} ${String(fromUnit)} = ${formatNumber(converted)} ${String(toUnit)}.`,
    canvasActions: buildCanvasWriteActions({
      title: input.title?.trim() || 'Unit conversion',
      textLines: [
        `Convert ${formatNumber(value)} ${String(fromUnit)} to ${String(toUnit)}.`,
        `Conversion factor: ${formatNumber(conversionFactor, 6)}`,
        `Answer: ${formatNumber(converted, 6)} ${String(toUnit)}`,
      ],
      mathExpressions: [`${formatNumber(value)} x ${formatNumber(conversionFactor, 6)} = ${formatNumber(converted, 6)}`],
      clearExisting: true,
    }),
  }
}

export function probabilityModelScene(input: {
  favorableOutcomes: number
  totalOutcomes: number
  title?: string
  label?: string
}): CanvasActionResult {
  const favorableOutcomes = Math.trunc(input.favorableOutcomes)
  const totalOutcomes = Math.trunc(input.totalOutcomes)

  if (totalOutcomes <= 0 || totalOutcomes > 100 || favorableOutcomes < 0 || favorableOutcomes > totalOutcomes) {
    throw new Error('Probability model needs 0 <= favorable outcomes <= total outcomes <= 100.')
  }

  const simplified = simplifyFractionParts(favorableOutcomes, totalOutcomes)
  const probability = favorableOutcomes / totalOutcomes
  const barX = TOOL_SCENE.x + 104
  const barY = TOOL_SCENE.y + 214
  const barWidth = 460
  const barHeight = 62
  const shadedWidth = totalOutcomes === 0 ? 0 : (favorableOutcomes / totalOutcomes) * barWidth
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Probability model'),
    textLabel(TOOL_SCENE.x + 62, TOOL_SCENE.y + 72, input.label?.trim() || 'Favorable outcomes out of total outcomes', {
      width: 470,
      color: 'green',
    }),
    rectangle(barX, barY, barWidth, barHeight, {
      color: 'blue',
      fill: 'none',
      dash: 'solid',
      size: 'm',
    }),
    rectangle(barX, barY, shadedWidth, barHeight, {
      color: 'green',
      fill: 'solid',
      opacity: 0.28,
      dash: 'solid',
      size: 's',
    }),
    textLabel(barX, barY - 42, `${favorableOutcomes} favorable`, {
      width: 180,
      color: 'green',
    }),
    textLabel(barX + barWidth - 130, barY + barHeight + 18, `${totalOutcomes} total`, {
      width: 130,
      color: 'grey',
    }),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Probability', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        `${favorableOutcomes}/${totalOutcomes} = ${formatFraction(simplified.numerator, simplified.denominator)}`,
        `Decimal: ${formatNumber(probability, 3)}`,
        `Percent: ${formatPercent(probability * 100)}`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary: `Prepared probability model for ${favorableOutcomes}/${totalOutcomes}, or ${formatPercent(probability * 100)}.`,
    canvasActions: actions,
  }
}

const CURRICULUM_GUIDE = {
  place_value: {
    label: 'Place value',
    prerequisites: ['Read digits by place', 'Compare whole numbers', 'Understand regrouping'],
    misconceptions: ['Treating digit value as the digit itself', 'Misaligning decimals', 'Rounding from the wrong place'],
    tools: ['place_value_chart', 'decimal_grid', 'number_line'],
    nextMove: 'Ask which place each digit is in before doing the operation.',
  },
  multiplication_division: {
    label: 'Multiplication and division',
    prerequisites: ['Equal groups', 'Skip counting', 'Basic multiplication facts'],
    misconceptions: ['Mixing rows and columns', 'Dropping remainders', 'Forgetting place value in long division'],
    tools: ['array_model', 'long_division', 'bar_model'],
    nextMove: 'Make the equal groups visible, then connect the model to the equation.',
  },
  fractions: {
    label: 'Fractions',
    prerequisites: ['Equal parts', 'Numerator and denominator meaning', 'Equivalent fractions'],
    misconceptions: ['Adding denominators', 'Comparing only numerators', 'Unequal partitioning'],
    tools: ['fraction_strip', 'fraction_compare', 'fraction_operation', 'bar_model'],
    nextMove: 'Ask what one whole is, then represent both fractions with equal-sized parts.',
  },
  decimals_percents: {
    label: 'Decimals and percents',
    prerequisites: ['Tenths and hundredths', 'Fractions out of 100', 'Multiplying and dividing by powers of 10'],
    misconceptions: ['Thinking 0.8 is smaller than 0.75 because 8 is one digit', 'Moving decimal points without unit meaning'],
    tools: ['decimal_grid', 'percent_bar', 'place_value_chart'],
    nextMove: 'Anchor the value to hundredths or a percent bar before calculating.',
  },
  ratios_rates: {
    label: 'Ratios and rates',
    prerequisites: ['Multiplication facts', 'Equivalent fractions', 'Unit meaning'],
    misconceptions: ['Adding instead of scaling', 'Mixing units', 'Comparing non-equivalent rows'],
    tools: ['ratio_table', 'double_number_line', 'bar_model', 'unit_conversion'],
    nextMove: 'Find the scale factor or unit rate, then keep both quantities moving together.',
  },
  expressions_equations: {
    label: 'Expressions and equations',
    prerequisites: ['Operation order', 'Equality', 'Inverse operations'],
    misconceptions: ['Changing one side only', 'Combining unlike terms', 'Sign errors'],
    tools: ['order_of_operations', 'equation_balance', 'solve_linear_on_canvas', 'math_check_step'],
    nextMove: 'Ask what operation is being undone, then show why both sides must stay balanced.',
  },
  geometry_measurement: {
    label: 'Geometry and measurement',
    prerequisites: ['Shape attributes', 'Units', 'Area and perimeter difference'],
    misconceptions: ['Confusing area and perimeter', 'Using wrong units', 'Counting boundary squares as area'],
    tools: ['area_perimeter_model', 'composite_area_model', 'angle_diagram', 'geometry_figure'],
    nextMove: 'Identify the measured quantity first: length, area, angle, or volume-style reasoning.',
  },
  coordinate_graphing: {
    label: 'Coordinate graphing',
    prerequisites: ['Ordered pairs', 'X before y', 'Number lines'],
    misconceptions: ['Swapping x and y', 'Counting spaces incorrectly', 'Reading slope as points instead of change'],
    tools: ['plot_points_on_plane', 'table_of_values', 'graph_function', 'slope_triangle', 'coordinate_distance'],
    nextMove: 'Have the student say what the x-coordinate means before plotting y.',
  },
  data_probability: {
    label: 'Data and probability',
    prerequisites: ['Counting outcomes', 'Reading scales', 'Comparing quantities'],
    misconceptions: ['Mean versus median confusion', 'Ignoring repeated values', 'Using favorable outcomes as the denominator'],
    tools: ['data_display', 'statistics_summary', 'probability_model'],
    nextMove: 'Start with what the values or outcomes represent before computing.',
  },
} as const

type CurriculumTopic = keyof typeof CURRICULUM_GUIDE

function resolveCurriculumTopic(topic: string): CurriculumTopic {
  const normalized = topic.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized in CURRICULUM_GUIDE) {
    return normalized as CurriculumTopic
  }

  const aliases: Record<string, CurriculumTopic> = {
    decimals: 'decimals_percents',
    percents: 'decimals_percents',
    percentages: 'decimals_percents',
    ratios: 'ratios_rates',
    rates: 'ratios_rates',
    algebra: 'expressions_equations',
    equations: 'expressions_equations',
    expressions: 'expressions_equations',
    geometry: 'geometry_measurement',
    measurement: 'geometry_measurement',
    graphing: 'coordinate_graphing',
    coordinates: 'coordinate_graphing',
    statistics: 'data_probability',
    probability: 'data_probability',
    data: 'data_probability',
    multiplication: 'multiplication_division',
    division: 'multiplication_division',
  }

  return aliases[normalized] ?? 'fractions'
}

export function curriculumCoach(input: {
  gradeLevel?: string
  topic: string
  studentGoal?: string
  studentWork?: string
}) {
  const topic = resolveCurriculumTopic(input.topic)
  const guide = CURRICULUM_GUIDE[topic]
  const work = input.studentWork?.trim()
  const goal = input.studentGoal?.trim()

  return {
    topic,
    label: guide.label,
    gradeLevel: input.gradeLevel?.trim() || 'grades 3 to 7',
    prerequisiteCheck: guide.prerequisites.slice(0, 3),
    likelyMisconceptions: guide.misconceptions.slice(0, 3),
    recommendedTools: guide.tools,
    nextTutorMove: guide.nextMove,
    suggestedQuestion: goal
      ? `Before we solve it, what part of "${goal}" feels most uncertain?`
      : work
        ? 'Can you point to the exact step where you felt unsure?'
        : 'What do you already know, and what is the question asking for?',
    teachingGuardrail:
      'Use one short hint, one visual when helpful, and wait for the student to do the next bit of thinking.',
  }
}

export function misconceptionDiagnosis(input: {
  topic: string
  studentWork: string
  expectedAnswer?: string
}) {
  const topic = resolveCurriculumTopic(input.topic)
  const studentWork = input.studentWork.trim().toLowerCase()
  const expectedAnswer = input.expectedAnswer?.trim()
  const findings: string[] = []

  if (topic === 'fractions') {
    if (/\d+\s*\/\s*\d+\s*[+\-]\s*\d+\s*\/\s*\d+/.test(studentWork) && /\/\s*\d+\s*[+\-]\s*\d+/.test(studentWork)) {
      findings.push('May be adding or subtracting denominators instead of finding a common denominator.')
    }
    if (/\b(bigger denominator|larger denominator)\b/.test(studentWork)) {
      findings.push('May be comparing denominators without checking the size of each part.')
    }
  }

  if (topic === 'decimals_percents') {
    if (/\b0\.\d+\b.*\b0\.\d+\b/.test(studentWork) && /\bmore digits\b|\blonger\b/.test(studentWork)) {
      findings.push('May be comparing decimals by number of digits instead of place value.')
    }
    if (/%/.test(studentWork) && !/100|hundred/.test(studentWork)) {
      findings.push('May not be anchoring percent to "out of 100."')
    }
  }

  if (topic === 'expressions_equations') {
    if (/=\s*.*=\s*/.test(studentWork)) {
      findings.push('May be using the equals sign as a running calculator instead of a balance.')
    }
    if (/\bx\b.*\+\s*\d+\s*=\s*\d+/.test(studentWork) && !/both sides|subtract/.test(studentWork)) {
      findings.push('May need the inverse-operation idea made explicit.')
    }
  }

  if (topic === 'geometry_measurement') {
    if (/area/.test(studentWork) && /perimeter/.test(studentWork)) {
      findings.push('May be mixing area, which counts squares, with perimeter, which counts boundary length.')
    }
  }

  if (topic === 'coordinate_graphing') {
    if (/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(studentWork) && /y.*first|up.*then.*across/.test(studentWork)) {
      findings.push('May be reversing x and y when plotting points.')
    }
  }

  if (topic === 'data_probability') {
    if (/mean|average/.test(studentWork) && !/add|sum|total/.test(studentWork)) {
      findings.push('May need to connect mean to "total shared equally."')
    }
    if (/probability|chance/.test(studentWork) && !/total|out of/.test(studentWork)) {
      findings.push('May be missing the denominator: total possible outcomes.')
    }
  }

  if (findings.length === 0) {
    findings.push(CURRICULUM_GUIDE[topic].misconceptions[0])
  }

  return {
    topic,
    findings: findings.slice(0, 3),
    expectedAnswer,
    confidence: findings.length > 1 ? 'medium' : 'low',
    nextHint: CURRICULUM_GUIDE[topic].nextMove,
    recommendedTools: CURRICULUM_GUIDE[topic].tools.slice(0, 3),
  }
}

export function practiceSetGenerator(input: {
  topic: string
  difficulty?: 'support' | 'core' | 'stretch'
  count?: number
}) {
  const topic = resolveCurriculumTopic(input.topic)
  const difficulty = input.difficulty ?? 'core'
  const count = clamp(Math.trunc(input.count ?? 3), 1, 5)
  const pools: Record<CurriculumTopic, Array<{ prompt: string; answer: string; hint: string; suggestedTool: string }>> = {
    place_value: [
      { prompt: 'What is the value of the 7 in 4,732?', answer: '700', hint: 'Name the place first.', suggestedTool: 'place_value_chart' },
      { prompt: 'Write 3.46 in expanded form.', answer: '3 + 0.4 + 0.06', hint: 'Separate ones, tenths, and hundredths.', suggestedTool: 'place_value_chart' },
      { prompt: 'Round 8,649 to the nearest hundred.', answer: '8,600', hint: 'Look at the tens place.', suggestedTool: 'number_line' },
    ],
    multiplication_division: [
      { prompt: 'Show 6 x 8 as equal groups.', answer: '48', hint: 'Think 6 rows of 8.', suggestedTool: 'array_model' },
      { prompt: 'Divide 847 by 6.', answer: '141 remainder 1', hint: 'Divide one place at a time.', suggestedTool: 'long_division' },
      { prompt: 'A class has 5 groups of 7 students. How many students?', answer: '35', hint: 'Each group is the same size.', suggestedTool: 'array_model' },
    ],
    fractions: [
      { prompt: 'Compare 3/4 and 5/8.', answer: '3/4 is greater', hint: 'Use a common denominator.', suggestedTool: 'fraction_compare' },
      { prompt: 'Add 2/3 + 1/4.', answer: '11/12', hint: 'Find twelfths.', suggestedTool: 'fraction_operation' },
      { prompt: 'Shade 5/6 of a bar.', answer: '5 out of 6 equal parts', hint: 'The denominator tells the number of equal parts.', suggestedTool: 'fraction_strip' },
    ],
    decimals_percents: [
      { prompt: 'Which is greater: 0.8 or 0.75?', answer: '0.8', hint: 'Write both in hundredths.', suggestedTool: 'decimal_grid' },
      { prompt: 'What is 35% as a fraction out of 100?', answer: '35/100', hint: 'Percent means out of 100.', suggestedTool: 'percent_bar' },
      { prompt: 'Find 25% of 48.', answer: '12', hint: '25% is one fourth.', suggestedTool: 'percent_bar' },
    ],
    ratios_rates: [
      { prompt: 'If 3 notebooks cost 12 dollars, what is the cost per notebook?', answer: '4 dollars', hint: 'Find the value for 1 notebook.', suggestedTool: 'double_number_line' },
      { prompt: 'Complete the ratio: 2 cups for 5 people, 4 cups for ? people.', answer: '10 people', hint: 'Scale both parts by 2.', suggestedTool: 'ratio_table' },
      { prompt: 'Convert 2.5 meters to centimeters.', answer: '250 cm', hint: '1 meter is 100 centimeters.', suggestedTool: 'unit_conversion' },
    ],
    expressions_equations: [
      { prompt: 'Evaluate 3 + 4 x 2.', answer: '11', hint: 'Multiply before adding.', suggestedTool: 'order_of_operations' },
      { prompt: 'Solve x + 7 = 19.', answer: 'x = 12', hint: 'Undo plus 7.', suggestedTool: 'equation_balance' },
      { prompt: 'Simplify 4x + 3x.', answer: '7x', hint: 'Combine like terms.', suggestedTool: 'write_on_canvas' },
    ],
    geometry_measurement: [
      { prompt: 'Find the area of a 7 by 4 rectangle.', answer: '28 square units', hint: 'Area counts unit squares.', suggestedTool: 'area_perimeter_model' },
      { prompt: 'Find the perimeter of a 7 by 4 rectangle.', answer: '22 units', hint: 'Add all side lengths.', suggestedTool: 'area_perimeter_model' },
      { prompt: 'A shape is made of 3 by 4 and 2 by 5 rectangles. What is the total area?', answer: '22 square units', hint: 'Find each rectangle area, then add.', suggestedTool: 'composite_area_model' },
    ],
    coordinate_graphing: [
      { prompt: 'Plot (2, 3) and (5, 3). What is the horizontal distance?', answer: '3 units', hint: 'The y-values match, so compare x-values.', suggestedTool: 'coordinate_distance' },
      { prompt: 'Make a table for y = 2x + 1 using x = 0, 1, 2.', answer: '(0,1), (1,3), (2,5)', hint: 'Substitute each x-value.', suggestedTool: 'table_of_values' },
      { prompt: 'Find the slope from (1, 2) to (5, 6).', answer: '1', hint: 'Slope is rise over run.', suggestedTool: 'slope_triangle' },
    ],
    data_probability: [
      { prompt: 'Find the mean of 4, 7, 3, 7, 9.', answer: '6', hint: 'Add, then divide by how many values.', suggestedTool: 'statistics_summary' },
      { prompt: 'What is the probability of 3 favorable outcomes out of 8?', answer: '3/8', hint: 'Favorable over total.', suggestedTool: 'probability_model' },
      { prompt: 'Which data value appears most often in 4, 7, 3, 7, 9?', answer: '7', hint: 'Mode means most frequent.', suggestedTool: 'statistics_summary' },
    ],
  }

  const offset = difficulty === 'support' ? 0 : difficulty === 'core' ? 1 : 2
  const items = Array.from({ length: count }, (_, index) => pools[topic][(index + offset) % pools[topic].length])

  return {
    topic,
    difficulty,
    items,
    tutorMove: 'Give one item at a time. Let the student try before revealing the answer key.',
  }
}

function inferWordProblemTopic(problemText: string, explicitTopic?: string) {
  if (explicitTopic?.trim()) return resolveCurriculumTopic(explicitTopic)

  const text = problemText.toLowerCase()
  if (/\b(percent|%|discount|tax|tip|sale)\b/.test(text)) return 'decimals_percents'
  if (/\b(ratio|rate|per|each|every|recipe|speed|cost)\b/.test(text)) return 'ratios_rates'
  if (/\b(fraction|half|third|fourth|fifth|sixth|eighth|\/)\b/.test(text)) return 'fractions'
  if (/\b(equation|expression|variable|unknown|x\b|solve)\b/.test(text)) return 'expressions_equations'
  if (/\b(area|perimeter|angle|rectangle|triangle|volume|length|width|height)\b/.test(text)) return 'geometry_measurement'
  if (/\b(graph|coordinate|point|slope|ordered pair|x-axis|y-axis)\b/.test(text)) return 'coordinate_graphing'
  if (/\b(mean|median|mode|range|data|probability|chance|outcome)\b/.test(text)) return 'data_probability'
  if (/\b(place value|digit|round|decimal place)\b/.test(text)) return 'place_value'
  if (/\b(group|groups|divide|share|remainder|product|times)\b/.test(text)) return 'multiplication_division'

  return 'multiplication_division'
}

function extractWordProblemQuantities(problemText: string) {
  const matches = problemText.match(/(?:\$|AED\s*)?-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s*(?:%|[a-zA-Z]+)?/g) ?? []
  return matches
    .map((match) => match.trim().replace(/\s+/g, ' '))
    .filter((match, index, values) => match.length > 0 && values.indexOf(match) === index)
    .slice(0, 8)
}

function extractWordProblemQuestion(problemText: string) {
  const sentences = problemText
    .split(/(?<=[.?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const explicitQuestion = [...sentences].reverse().find((sentence) => sentence.includes('?'))
  return explicitQuestion ?? sentences.at(-1) ?? problemText.trim()
}

function chooseWordProblemOperation(problemText: string, topic: CurriculumTopic) {
  const text = problemText.toLowerCase()
  if (topic === 'ratios_rates') return /\bper|each|unit\b/.test(text) ? 'find a unit rate or scale factor' : 'keep two quantities scaled together'
  if (topic === 'decimals_percents') return 'connect part, whole, and percent'
  if (topic === 'fractions') return /\btotal|altogether|left|remaining\b/.test(text) ? 'combine or compare fractional parts' : 'identify the whole and equal parts'
  if (topic === 'geometry_measurement') return /\bperimeter\b/.test(text) ? 'add side lengths around the boundary' : 'decompose the shape and count square units'
  if (topic === 'expressions_equations') return 'represent the unknown with a variable and keep equality balanced'
  if (topic === 'coordinate_graphing') return 'map values to ordered pairs or changes on the coordinate plane'
  if (topic === 'data_probability') return /\bprobability|chance\b/.test(text) ? 'favorable outcomes over total outcomes' : 'summarize or compare the data set'
  if (topic === 'place_value') return 'use place value before calculating'
  if (/\bleft|remain|less|fewer|difference\b/.test(text)) return 'subtract or compare'
  if (/\baltogether|total|sum|combined|in all\b/.test(text)) return 'add or combine'
  if (/\beach|groups of|times|product\b/.test(text)) return 'multiply equal groups'
  if (/\bshare|split|divide|per\b/.test(text)) return 'divide into equal groups'
  return 'identify the relationship before choosing an operation'
}

function chooseVisualModel(topic: CurriculumTopic, problemText: string) {
  const tools = CURRICULUM_GUIDE[topic].tools
  const text = problemText.toLowerCase()

  if (topic === 'ratios_rates') return text.includes('line') ? 'double_number_line' : 'ratio_table'
  if (topic === 'decimals_percents') return 'percent_bar'
  if (topic === 'fractions') return text.includes('compare') ? 'fraction_compare' : 'fraction_strip'
  if (topic === 'geometry_measurement') return text.includes('composite') || text.includes('attached') ? 'composite_area_model' : 'area_perimeter_model'
  if (topic === 'expressions_equations') return 'equation_balance'
  if (topic === 'coordinate_graphing') return 'plot_points_on_plane'
  if (topic === 'data_probability') return text.includes('probability') ? 'probability_model' : 'data_display'
  if (topic === 'multiplication_division') return text.includes('divide') ? 'long_division' : 'array_model'

  return tools[0]
}

export function wordProblemPlan(input: {
  problemText: string
  gradeLevel?: string
  topic?: string
}): WordProblemPlanResult {
  const problemText = input.problemText.trim().replace(/\s+/g, ' ')
  if (!problemText) {
    throw new Error('word_problem_plan needs the problem text.')
  }

  const topic = inferWordProblemTopic(problemText, input.topic)
  const guide = CURRICULUM_GUIDE[topic]
  const quantities = extractWordProblemQuantities(problemText)
  const question = extractWordProblemQuestion(problemText)
  const visualModel = chooseVisualModel(topic, problemText)
  const likelyOperation = chooseWordProblemOperation(problemText, topic)

  return {
    topic,
    label: guide.label,
    quantities,
    question,
    likelyOperation,
    visualModel,
    recommendedTools: [visualModel, ...guide.tools.filter((toolName) => toolName !== visualModel)].slice(0, 4),
    firstTutorMove: 'Ask the student to name the known quantities and the unknown before calculating.',
    studentPrompt:
      quantities.length > 0
        ? `I see ${quantities.slice(0, 3).join(', ')}. Which one is the question asking us to find?`
        : 'What numbers or measurements do we know, and what are we trying to find?',
    guardrail:
      'Do not solve the whole word problem immediately. Set up the relationship, choose one visual, and let the student make the next step.',
  }
}

export function socraticMovePlanner(input: {
  topic: string
  gradeLevel?: string
  studentWork?: string
  tutorGoal?: 'start' | 'unstick' | 'check' | 'extend' | 'practice'
}): SocraticMoveResult {
  const topic = resolveCurriculumTopic(input.topic)
  const guide = CURRICULUM_GUIDE[topic]
  const work = input.studentWork?.trim() ?? ''
  const goal = input.tutorGoal ?? (work ? 'unstick' : 'start')
  const firstTool = guide.tools[0]

  if (goal === 'check') {
    return {
      topic,
      label: guide.label,
      moveType: 'check',
      recommendedTool: topic === 'expressions_equations' ? 'math_check_step' : 'math_check_answer',
      teacherNote: 'Check only the current answer or step before deciding the next hint.',
      sayThis: 'Let us check this step carefully.',
      askThis: 'What did you do from the previous line to this line?',
      waitFor: 'A student explanation of the operation or comparison they used.',
    }
  }

  if (goal === 'practice') {
    return {
      topic,
      label: guide.label,
      moveType: 'practice',
      recommendedTool: 'practice_set_generator',
      teacherNote: 'Give one short problem at a time and keep the answer hidden until the student tries.',
      sayThis: 'I will give you one quick practice problem.',
      askThis: 'Try the first step out loud before we check it.',
      waitFor: 'The student attempt, not a final perfect answer.',
    }
  }

  if (work) {
    return {
      topic,
      label: guide.label,
      moveType: 'nudge',
      recommendedTool: 'misconception_diagnosis',
      teacherNote: guide.nextMove,
      sayThis: 'I think we should look at the reasoning, not just the answer.',
      askThis: 'Which part of your work are you most confident about, and which part feels shaky?',
      waitFor: 'A specific step, phrase, or uncertainty from the student.',
    }
  }

  return {
    topic,
    label: guide.label,
    moveType: 'visualize',
    recommendedTool: firstTool,
    teacherNote: guide.nextMove,
    sayThis: 'Let us make the structure visible before calculating.',
    askThis: 'What do we know, what are we looking for, and what should the model show?',
    waitFor: 'The student naming knowns, unknowns, or the relationship in their own words.',
  }
}

export function percentBarScene(input: {
  percent?: number
  part?: number
  total?: number
  title?: string
  label?: string
}): CanvasActionResult {
  let percent = typeof input.percent === 'number' ? coerceFiniteNumber(input.percent) : undefined
  const part = typeof input.part === 'number' ? coerceFiniteNumber(input.part) : undefined
  const total = typeof input.total === 'number' ? coerceFiniteNumber(input.total) : undefined

  if (percent === undefined && part !== undefined && total !== undefined && total > 0) {
    percent = (part / total) * 100
  }
  if (percent === undefined || percent < 0 || percent > 1000) {
    throw new Error('Percent bar needs a percent from 0 to 1000, or part and total with total > 0.')
  }

  const visualPercent = clamp(percent, 0, 100)
  const barX = TOOL_SCENE.x + 88
  const barY = TOOL_SCENE.y + 214
  const barWidth = 480
  const barHeight = 64
  const shadedWidth = (visualPercent / 100) * barWidth
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Percent bar'),
    textLabel(TOOL_SCENE.x + 62, TOOL_SCENE.y + 72, input.label?.trim() || 'Percent means part out of 100.', {
      width: 470,
      color: 'green',
    }),
    rectangle(barX, barY, barWidth, barHeight, {
      color: 'blue',
      fill: 'none',
      dash: 'solid',
      size: 'm',
    }),
    rectangle(barX, barY, shadedWidth, barHeight, {
      color: 'green',
      fill: 'solid',
      opacity: 0.28,
      dash: 'solid',
      size: 's',
    }),
    textLabel(barX - 8, barY + barHeight + 18, '0%', {
      width: 54,
      color: 'grey',
    }),
    textLabel(barX + barWidth - 46, barY + barHeight + 18, '100%', {
      width: 70,
      color: 'grey',
    }),
    textLabel(barX + shadedWidth - 34, barY - 42, `${formatPercent(percent)}`, {
      width: 110,
      color: 'green',
    }),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Set up', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        part !== undefined && total !== undefined
          ? `${formatNumber(part)} out of ${formatNumber(total)}`
          : `${formatPercent(percent)} out of 100%`,
        `Decimal: ${formatNumber(percent / 100, 4)}`,
        percent > 100 ? 'The bar passes one whole.' : 'The shaded part shows the percent.',
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary: `Prepared a percent bar for ${formatPercent(percent)}.`,
    canvasActions: actions,
  }
}

export function doubleNumberLineScene(input: {
  topLabel: string
  bottomLabel: string
  pairs: Array<{ top: number; bottom: number; label?: string }>
  title?: string
}): CanvasActionResult {
  const pairs = input.pairs
    .map((pair) => ({
      top: coerceFiniteNumber(pair.top),
      bottom: coerceFiniteNumber(pair.bottom),
      label: pair.label?.trim(),
    }))
    .slice(0, 7)
    .sort((a, b) => a.top - b.top)

  if (pairs.length < 2) {
    throw new Error('Double number line needs at least two aligned pairs.')
  }

  const lineStartX = TOOL_SCENE.x + 112
  const lineEndX = TOOL_SCENE.x + 560
  const topY = TOOL_SCENE.y + 210
  const bottomY = TOOL_SCENE.y + 330
  const topValues = pairs.map((pair) => pair.top)
  const minTop = Math.min(...topValues)
  const maxTop = Math.max(...topValues)
  const mapTop = (value: number) => mapToRange(value, minTop, maxTop, lineStartX, lineEndX)
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Double number line'),
    textLabel(TOOL_SCENE.x + 46, topY - 16, input.topLabel.trim() || 'Top', {
      width: 92,
      color: 'green',
    }),
    textLabel(TOOL_SCENE.x + 46, bottomY - 16, input.bottomLabel.trim() || 'Bottom', {
      width: 92,
      color: 'green',
    }),
    lineSegment({ x: lineStartX, y: topY }, { x: lineEndX, y: topY }, { color: 'blue', size: 'm', dash: 'solid' }),
    lineSegment({ x: lineStartX, y: bottomY }, { x: lineEndX, y: bottomY }, { color: 'blue', size: 'm', dash: 'solid' }),
  ]

  pairs.forEach((pair) => {
    const x = mapTop(pair.top)
    actions.push(
      lineSegment({ x, y: topY - 10 }, { x, y: bottomY + 10 }, {
        color: 'light-blue',
        size: 's',
        dash: 'dashed',
      }),
      textLabel(x - 28, topY - 48, formatNumber(pair.top), {
        width: 70,
        color: 'black',
      }),
      textLabel(x - 28, bottomY + 18, formatNumber(pair.bottom), {
        width: 70,
        color: 'black',
      })
    )
    if (pair.label) {
      actions.push(textLabel(x - 42, topY + 38, pair.label, { width: 110, color: 'grey' }))
    }
  })

  const first = pairs[0]
  const last = pairs[pairs.length - 1]
  const topChange = last.top - first.top
  const bottomChange = last.bottom - first.bottom
  actions.push(
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Relationship', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        `${input.topLabel}: ${formatNumber(first.top)} to ${formatNumber(last.top)}`,
        `${input.bottomLabel}: ${formatNumber(first.bottom)} to ${formatNumber(last.bottom)}`,
        `Changes: ${formatNumber(topChange)} and ${formatNumber(bottomChange)}`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: 'Prepared a double number line for proportional reasoning.',
    canvasActions: actions,
  }
}

export function compositeAreaModelScene(input: {
  rectangles: Array<{ xUnits: number; yUnits: number; widthUnits: number; heightUnits: number; label?: string }>
  unitLabel?: string
  title?: string
}): CanvasActionResult {
  const unitLabel = input.unitLabel?.trim() || 'unit'
  const pieces = input.rectangles
    .slice(0, 6)
    .map((piece) => ({
      xUnits: Math.trunc(piece.xUnits),
      yUnits: Math.trunc(piece.yUnits),
      widthUnits: Math.trunc(piece.widthUnits),
      heightUnits: Math.trunc(piece.heightUnits),
      label: piece.label?.trim(),
    }))

  if (
    pieces.length === 0 ||
    pieces.some((piece) => piece.widthUnits <= 0 || piece.heightUnits <= 0 || piece.xUnits < 0 || piece.yUnits < 0)
  ) {
    throw new Error('Composite area needs positive rectangle dimensions and non-negative positions.')
  }

  const maxX = Math.max(...pieces.map((piece) => piece.xUnits + piece.widthUnits))
  const maxY = Math.max(...pieces.map((piece) => piece.yUnits + piece.heightUnits))
  if (maxX > 20 || maxY > 16) {
    throw new Error('Composite area model supports a drawing up to 20 by 16 units.')
  }

  const cellSize = Math.min(34, Math.floor(360 / Math.max(maxX, maxY, 1)))
  const originX = TOOL_SCENE.x + 98
  const originY = TOOL_SCENE.y + 136
  const colors: TutorCanvasColor[] = ['green', 'blue', 'orange', 'violet', 'red', 'grey']
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(input.title?.trim() || 'Composite area'),
  ]
  let totalArea = 0

  pieces.forEach((piece, index) => {
    const area = piece.widthUnits * piece.heightUnits
    totalArea += area
    const x = originX + piece.xUnits * cellSize
    const y = originY + piece.yUnits * cellSize
    const width = piece.widthUnits * cellSize
    const height = piece.heightUnits * cellSize
    actions.push(
      rectangle(x, y, width, height, {
        color: colors[index % colors.length],
        fill: 'semi',
        opacity: 0.14,
        dash: 'solid',
        size: 'm',
        label: piece.label || `${area}`,
      })
    )
    for (let column = 1; column < piece.widthUnits && piece.widthUnits <= 12; column += 1) {
      const gridX = x + column * cellSize
      actions.push(lineSegment({ x: gridX, y }, { x: gridX, y: y + height }, { color: 'light-blue', size: 's', dash: 'solid' }))
    }
    for (let row = 1; row < piece.heightUnits && piece.heightUnits <= 12; row += 1) {
      const gridY = y + row * cellSize
      actions.push(lineSegment({ x, y: gridY }, { x: x + width, y: gridY }, { color: 'light-blue', size: 's', dash: 'solid' }))
    }
  })

  actions.push(
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Add the parts', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        ...pieces.slice(0, 4).map((piece, index) => `Part ${index + 1}: ${piece.widthUnits} x ${piece.heightUnits} = ${piece.widthUnits * piece.heightUnits}`),
        `Total area: ${totalArea} ${formatSquareUnitLabel(unitLabel)}`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 32,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132)
  )

  return {
    summary: `Prepared a composite area model with total area ${totalArea} ${formatSquareUnitLabel(unitLabel)}.`,
    canvasActions: actions,
  }
}

export function coordinateDistanceScene(input: {
  pointA: { x: number; y: number }
  pointB: { x: number; y: number }
  title?: string
}): CanvasActionResult {
  const pointA = {
    x: coerceFiniteNumber(input.pointA.x),
    y: coerceFiniteNumber(input.pointA.y),
  }
  const pointB = {
    x: coerceFiniteNumber(input.pointB.x),
    y: coerceFiniteNumber(input.pointB.y),
  }
  if (isNearlyEqual(pointA.x, pointB.x) && isNearlyEqual(pointA.y, pointB.y)) {
    throw new Error('Coordinate distance needs two different points.')
  }

  const xDomain = expandNumericDomain([pointA.x, pointB.x, 0], { minSpan: 6, padding: 1 })
  const yDomain = expandNumericDomain([pointA.y, pointB.y, 0], { minSpan: 6, padding: 1 })
  const plane = buildCoordinatePlaneScene({
    clearExisting: true,
    title: input.title?.trim() || 'Coordinate distance',
    xDomain,
    yDomain,
  })
  const aCanvas = mapGraphCoordinateToCanvas(pointA, { x: xDomain, y: yDomain })
  const bCanvas = mapGraphCoordinateToCanvas(pointB, { x: xDomain, y: yDomain })
  const cornerCanvas = mapGraphCoordinateToCanvas({ x: pointB.x, y: pointA.y }, { x: xDomain, y: yDomain })
  const dx = pointB.x - pointA.x
  const dy = pointB.y - pointA.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  const actions: TutorCanvasAction[] = [
    ...plane.canvasActions,
    lineSegment(aCanvas, bCanvas, { color: 'blue', size: 'm', dash: 'solid', label: 'distance' }),
    lineSegment(aCanvas, cornerCanvas, { color: 'orange', size: 'm', dash: 'dashed', label: `horizontal ${formatNumber(Math.abs(dx))}` }),
    lineSegment(cornerCanvas, bCanvas, { color: 'green', size: 'm', dash: 'dashed', label: `vertical ${formatNumber(Math.abs(dy))}` }),
    point(aCanvas.x, aCanvas.y, {
      label: `A(${formatNumber(pointA.x)}, ${formatNumber(pointA.y)})`,
      color: 'blue',
      labelPosition: 'bottom-left',
      labelWidth: 130,
    }),
    point(bCanvas.x, bCanvas.y, {
      label: `B(${formatNumber(pointB.x)}, ${formatNumber(pointB.y)})`,
      color: 'blue',
      labelPosition: 'top-right',
      labelWidth: 130,
    }),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Distance', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      isNearlyEqual(dx, 0) || isNearlyEqual(dy, 0)
        ? [`Change in x: ${formatNumber(Math.abs(dx))}`, `Change in y: ${formatNumber(Math.abs(dy))}`, `Distance: ${formatNumber(distance)}`]
        : [`Horizontal: ${formatNumber(Math.abs(dx))}`, `Vertical: ${formatNumber(Math.abs(dy))}`, `Distance: about ${formatNumber(distance, 3)}`],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    summary: `Prepared a coordinate-distance model with distance ${formatNumber(distance, 3)}.`,
    canvasActions: actions,
  }
}
