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
