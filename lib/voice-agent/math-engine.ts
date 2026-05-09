import { evaluate, simplify } from 'mathjs'
import type {
  AnswerDisclosureGateResult,
  GraphAnnotationResult,
  GraphFeatureCoordinates,
  GraphFeaturePoint,
  CanvasActionResult,
  CanvasWriteResult,
  GeometryFigureResult,
  GraphFunctionResult,
  HintGeneratorResult,
  MistakePatternClassifierResult,
  HintLadderResult,
  LinearCanvasResult,
  LinearSolveResult,
  MathAnswerCheckResult,
  MathStepCheckResult,
  NextStepCoachResult,
  TutorResponsePlannerResult,
  AdaptiveReviewPlanResult,
  SessionMasterySnapshotResult,
  ShortSpokenTurnFormatterResult,
  TutorTurnAuditResult,
  PlotPointsResult,
  ValueTableResult,
  SocraticMoveResult,
  BoardAnimationPlanResult,
  TutorTeachingSequenceResult,
  WordProblemPlanResult,
  ProblemUnderstandingMapResult,
  RepresentationBridgeResult,
  WorkedExampleFaderResult,
  FractionSimplifyResult,
  PercentOfNumberResult,
  UnitRateResult,
  DecimalCompareResult,
  RoundNumberResult,
  CommonDenominatorResult,
  IntegerOperationResult,
  StudentCheckQuestionResult,
  ExitTicketResult,
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

function hasMixedNumber(text: string) {
  return /(^|[^A-Za-z0-9_.])-?\d+\s+\d+\s*\/\s*\d+(?=$|[^A-Za-z0-9_.])/.test(text)
}

function normalizeMixedNumbers(expression: string) {
  return expression.replace(
    /(^|[^A-Za-z0-9_.])(-?\d+)\s+(\d+)\s*\/\s*(\d+)(?=$|[^A-Za-z0-9_.])/g,
    (match, prefix: string, wholeRaw: string, numeratorRaw: string, denominatorRaw: string) => {
      const whole = Number(wholeRaw)
      const numerator = Number(numeratorRaw)
      const denominator = Number(denominatorRaw)
      if (
        !Number.isFinite(whole) ||
        !Number.isFinite(numerator) ||
        !Number.isFinite(denominator) ||
        denominator === 0
      ) {
        return match
      }

      const sign = whole < 0 ? '-' : ''
      return `${prefix}${sign}(${Math.abs(whole)}+${numerator}/${denominator})`
    }
  )
}

function normalizeExpression(expression: string) {
  return normalizeMixedNumbers(expression)
    .replace(/\bof\b/gi, '*')
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
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

type MeasurementType = keyof typeof UNIT_FACTORS

type ParsedUnitQuantity = {
  value: number
  unit: string
  measurementType: MeasurementType
  baseValue: number
}

type ComparableExpression =
  | {
      value: number
      kind: 'ratio' | 'expression'
    }
  | {
      value: number
      kind: 'unit'
      unitQuantity: ParsedUnitQuantity
    }

const UNIT_ALIASES: Record<string, { measurementType: MeasurementType; unit: string }> = {
  mm: { measurementType: 'length', unit: 'mm' },
  millimeter: { measurementType: 'length', unit: 'mm' },
  millimeters: { measurementType: 'length', unit: 'mm' },
  cm: { measurementType: 'length', unit: 'cm' },
  centimeter: { measurementType: 'length', unit: 'cm' },
  centimeters: { measurementType: 'length', unit: 'cm' },
  m: { measurementType: 'length', unit: 'm' },
  meter: { measurementType: 'length', unit: 'm' },
  meters: { measurementType: 'length', unit: 'm' },
  metre: { measurementType: 'length', unit: 'm' },
  metres: { measurementType: 'length', unit: 'm' },
  km: { measurementType: 'length', unit: 'km' },
  kilometer: { measurementType: 'length', unit: 'km' },
  kilometers: { measurementType: 'length', unit: 'km' },
  kilometre: { measurementType: 'length', unit: 'km' },
  kilometres: { measurementType: 'length', unit: 'km' },
  g: { measurementType: 'mass', unit: 'g' },
  gram: { measurementType: 'mass', unit: 'g' },
  grams: { measurementType: 'mass', unit: 'g' },
  kg: { measurementType: 'mass', unit: 'kg' },
  kilogram: { measurementType: 'mass', unit: 'kg' },
  kilograms: { measurementType: 'mass', unit: 'kg' },
  ml: { measurementType: 'capacity', unit: 'mL' },
  milliliter: { measurementType: 'capacity', unit: 'mL' },
  milliliters: { measurementType: 'capacity', unit: 'mL' },
  millilitre: { measurementType: 'capacity', unit: 'mL' },
  millilitres: { measurementType: 'capacity', unit: 'mL' },
  l: { measurementType: 'capacity', unit: 'L' },
  liter: { measurementType: 'capacity', unit: 'L' },
  liters: { measurementType: 'capacity', unit: 'L' },
  litre: { measurementType: 'capacity', unit: 'L' },
  litres: { measurementType: 'capacity', unit: 'L' },
  s: { measurementType: 'time', unit: 'seconds' },
  sec: { measurementType: 'time', unit: 'seconds' },
  second: { measurementType: 'time', unit: 'seconds' },
  seconds: { measurementType: 'time', unit: 'seconds' },
  min: { measurementType: 'time', unit: 'minutes' },
  minute: { measurementType: 'time', unit: 'minutes' },
  minutes: { measurementType: 'time', unit: 'minutes' },
  h: { measurementType: 'time', unit: 'hours' },
  hr: { measurementType: 'time', unit: 'hours' },
  hour: { measurementType: 'time', unit: 'hours' },
  hours: { measurementType: 'time', unit: 'hours' },
}

function parseSimpleRatio(expression: string) {
  const match = expression.match(/^(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/)
  if (!match) {
    return null
  }

  const antecedent = Number(match[1])
  const consequent = Number(match[2])
  if (!Number.isFinite(antecedent) || !Number.isFinite(consequent) || isNearlyEqual(consequent, 0)) {
    return null
  }

  return {
    antecedent,
    consequent,
    value: antecedent / consequent,
  }
}

function parseUnitQuantity(expression: string): ParsedUnitQuantity | null {
  const compact = expression.replace(/,/g, '').trim()
  const match = compact.match(
    /^(-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s+\d+\s*\/\s*\d+|\s*\/\s*(?:\d+(?:\.\d+)?|\.\d+))?)\s*([a-zA-Z]+)$/
  )
  if (!match) {
    return null
  }

  const unitAlias = UNIT_ALIASES[match[2].toLowerCase()]
  if (!unitAlias) {
    return null
  }

  const value = coerceFiniteNumber(safeEvaluate(normalizeExpression(match[1])))
  const factors = UNIT_FACTORS[unitAlias.measurementType] as unknown as Record<string, number>
  const factor = factors[unitAlias.unit]
  if (!Number.isFinite(factor)) {
    return null
  }

  return {
    value,
    unit: unitAlias.unit,
    measurementType: unitAlias.measurementType,
    baseValue: value * factor,
  }
}

function hasKnownUnitQuantity(text: string) {
  const matches = text.matchAll(
    /-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s+\d+\s*\/\s*\d+|\s*\/\s*(?:\d+(?:\.\d+)?|\.\d+))?\s*([a-zA-Z]+)/g
  )
  for (const match of matches) {
    if (UNIT_ALIASES[match[1].toLowerCase()]) return true
  }
  return false
}

function parseCoordinatePoint(text: string) {
  const xyMatch = text.match(
    /\bx\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,?\s*\by\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/i
  )
  if (xyMatch) {
    const x = Number(xyMatch[1])
    const y = Number(xyMatch[2])
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  }

  const pairMatch = text.match(
    /\(?\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)?/
  )
  if (!pairMatch) return null

  const x = Number(pairMatch[1])
  const y = Number(pairMatch[2])
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function parseCoordinatePoints(text: string) {
  return [...text.matchAll(/\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/g)]
    .map((match) => {
      const x = Number(match[1])
      const y = Number(match[2])
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
    })
    .filter((point): point is { x: number; y: number } => Boolean(point))
}

function extractFunctionExpressionForPointCheck(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const yEqualsMatch = normalized.match(
    /\by\s*=\s*(.+?)(?=\s+(?:at|when|for|where)\b|\s*,\s*(?:point|\(?-?\d)|[?!.;]|$)/i
  )
  const rawExpression = yEqualsMatch?.[1]?.trim()
  if (!rawExpression) return null

  return rawExpression.replace(/\s+$/g, '').trim()
}

function checkCoordinatePointStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const expression = extractFunctionExpressionForPointCheck(previousStep)
  const point = parseCoordinatePoint(nextStep)
  if (!expression || !point) return null

  try {
    const expectedY = coerceFiniteNumber(safeEvaluate(normalizeGraphExpression(expression), { x: point.x }))
    const pointFits = isNearlyEqual(expectedY, point.y)
    return {
      verdict: pointFits ? 'valid' : 'invalid',
      reason: pointFits
        ? `The point fits the function because x = ${formatNumber(point.x)} gives y = ${formatNumber(expectedY, 4)}.`
        : `For this function, x = ${formatNumber(point.x)} gives y = ${formatNumber(expectedY, 4)}, not ${formatNumber(point.y, 4)}.`,
      hintTarget: pointFits
        ? 'explain how substituting the x-coordinate gives the y-coordinate'
        : 'substitute the x-coordinate before plotting the point',
    }
  } catch {
    return null
  }
}

function parseDistanceValue(text: string) {
  const withoutLabels = text
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\b(?:distance|length|units?|unit)\b/gi, '')
    .replace(/^\s*[dD]\s*=/, '')
    .replace(/[?!.,;:]+$/g, '')
    .trim()
  const normalized = normalizeExpression(withoutLabels)
  if (!normalized) return null

  try {
    return coerceFiniteNumber(safeEvaluate(normalized))
  } catch {
    const numberMatch = withoutLabels.match(
      /-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*-?(?:\d+(?:\.\d+)?|\.\d+))?/
    )
    if (!numberMatch) return null
    try {
      return coerceFiniteNumber(safeEvaluate(normalizeExpression(numberMatch[0])))
    } catch {
      return null
    }
  }
}

function checkCoordinateDistanceStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/\bdistance|length|between|from\b/i.test(combined)) return null

  const points = parseCoordinatePoints(previousStep)
  if (points.length < 2 || parseCoordinatePoints(nextStep).length > 0) return null

  const studentDistance = parseDistanceValue(nextStep)
  if (studentDistance === null) return null

  const [pointA, pointB] = points
  const horizontalChange = Math.abs(pointB.x - pointA.x)
  const verticalChange = Math.abs(pointB.y - pointA.y)
  const expectedDistance = Math.sqrt(horizontalChange * horizontalChange + verticalChange * verticalChange)
  const distanceMatches = isNearlyEqual(expectedDistance, studentDistance, 0.01)
  const axisAligned = isNearlyEqual(horizontalChange, 0) || isNearlyEqual(verticalChange, 0)
  const changeSummary = axisAligned
    ? `The coordinate change is ${formatNumber(Math.max(horizontalChange, verticalChange), 4)} units.`
    : `The horizontal change is ${formatNumber(horizontalChange, 4)} and the vertical change is ${formatNumber(verticalChange, 4)}.`

  return {
    verdict: distanceMatches ? 'valid' : 'invalid',
    reason: distanceMatches
      ? `${changeSummary} That gives a distance of ${formatNumber(expectedDistance, 4)}.`
      : `${changeSummary} The distance is ${formatNumber(expectedDistance, 4)}, not ${formatNumber(studentDistance, 4)}.`,
    hintTarget: distanceMatches
      ? 'explain how the coordinate changes determine distance'
      : 'use horizontal and vertical changes before deciding the distance',
  }
}

function parseSlopeValue(text: string): number | 'undefined' | null {
  const cleaned = text
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[?!.,;:]+$/g, '')
    .trim()
  if (/\b(undefined|vertical|no\s+slope)\b/i.test(cleaned)) {
    return 'undefined'
  }

  const numberPattern = /-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*-?(?:\d+(?:\.\d+)?|\.\d+))?/
  const explicitMatch = cleaned.match(
    new RegExp(`\\b(?:slope|rate\\s+of\\s+change|m)\\s*(?:is|=|:)?\\s*(${numberPattern.source})`, 'i')
  )
  const valueMatch = explicitMatch?.[1] ?? cleaned.match(numberPattern)?.[0]
  if (!valueMatch) return null

  try {
    return coerceFiniteNumber(safeEvaluate(normalizeExpression(valueMatch)))
  } catch {
    return null
  }
}

function checkSlopeStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/\b(slope|rate of change|rise|run)\b/i.test(combined)) return null

  const points = parseCoordinatePoints(previousStep)
  if (points.length < 2 || parseCoordinatePoints(nextStep).length > 0) return null

  const studentSlope = parseSlopeValue(nextStep)
  if (studentSlope === null) return null

  const [pointA, pointB] = points
  const rise = pointB.y - pointA.y
  const run = pointB.x - pointA.x
  const verticalLine = isNearlyEqual(run, 0)

  if (verticalLine) {
    const slopeMatches = studentSlope === 'undefined'
    return {
      verdict: slopeMatches ? 'valid' : 'invalid',
      reason: slopeMatches
        ? `The run is 0, so the slope is undefined.`
        : `The rise is ${formatNumber(rise, 4)} but the run is 0, so the slope is undefined, not ${formatNumber(studentSlope, 4)}.`,
      hintTarget: slopeMatches
        ? 'explain why a vertical line has undefined slope'
        : 'check the run before writing a numerical slope',
    }
  }

  if (studentSlope === 'undefined') {
    return {
      verdict: 'invalid',
      reason: `The rise is ${formatNumber(rise, 4)} and the run is ${formatNumber(run, 4)}, so the slope is ${formatNumber(rise / run, 4)}.`,
      hintTarget: 'use rise over run before deciding the slope',
    }
  }

  const expectedSlope = rise / run
  const slopeMatches = isNearlyEqual(expectedSlope, studentSlope, 0.01)
  return {
    verdict: slopeMatches ? 'valid' : 'invalid',
    reason: slopeMatches
      ? `The rise is ${formatNumber(rise, 4)} and the run is ${formatNumber(run, 4)}, so the slope is ${formatNumber(expectedSlope, 4)}.`
      : `The rise is ${formatNumber(rise, 4)} and the run is ${formatNumber(run, 4)}, so the slope is ${formatNumber(expectedSlope, 4)}, not ${formatNumber(studentSlope, 4)}.`,
    hintTarget: slopeMatches
      ? 'explain how rise over run gives the slope'
      : 'compare rise over run instead of using only one coordinate change',
  }
}

type GraphInterceptType = 'x' | 'y'

type GraphInterceptClaim =
  | {
      kind: 'none'
    }
  | {
      kind: 'coordinate'
      x: number
      y: number
    }
  | {
      kind: 'value'
      value: number
    }

function extractGraphInterceptType(text: string): GraphInterceptType | null {
  if (/\b(?:x\s*[- ]?intercepts?|roots?|zeros?|cross(?:es|ing)?\s+the\s+x-axis|x-axis)\b/i.test(text)) {
    return 'x'
  }

  if (/\b(?:y\s*[- ]?intercepts?|cross(?:es|ing)?\s+the\s+y-axis|y-axis|where\s+it\s+starts)\b/i.test(text)) {
    return 'y'
  }

  return null
}

function parseGraphInterceptClaim(text: string): GraphInterceptClaim | null {
  if (/\b(?:no|none|neither|does\s+not|doesn't|never)\b/i.test(text) && /\bintercept|root|zero|cross/i.test(text)) {
    return { kind: 'none' }
  }

  const point = parseCoordinatePoint(text)
  if (point) {
    return {
      kind: 'coordinate',
      x: point.x,
      y: point.y,
    }
  }

  const value = parseDistanceValue(text)
  if (value !== null) {
    return {
      kind: 'value',
      value,
    }
  }

  return null
}

function formatGraphInterceptClaim(claim: GraphInterceptClaim) {
  if (claim.kind === 'none') return 'no intercept'
  if (claim.kind === 'coordinate') return `(${formatNumber(claim.x, 4)}, ${formatNumber(claim.y, 4)})`
  return formatNumber(claim.value, 4)
}

function checkGraphInterceptStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/\b(intercept|root|zero|x-axis|y-axis)\b/i.test(combined)) return null

  const interceptType = extractGraphInterceptType(combined)
  if (!interceptType) return null

  const expression = extractFunctionExpressionForPointCheck(previousStep) ?? extractFunctionExpressionForPointCheck(combined)
  const claim = parseGraphInterceptClaim(nextStep)
  if (!expression || !claim) return null

  try {
    const { coefficient, intercept } = extractLinearCoefficients(expression)

    if (interceptType === 'y') {
      if (claim.kind === 'none') {
        return {
          verdict: 'invalid',
          reason: `The y-intercept is where x = 0. Substituting x = 0 gives y = ${formatNumber(intercept, 4)}.`,
          hintTarget: 'substitute x = 0 before finding the y-intercept',
        }
      }

      const claimedY = claim.kind === 'coordinate' ? claim.y : claim.value
      const axisMatches = claim.kind !== 'coordinate' || isNearlyEqual(claim.x, 0, 0.01)
      const valueMatches = axisMatches && isNearlyEqual(claimedY, intercept, 0.01)

      return {
        verdict: valueMatches ? 'valid' : 'invalid',
        reason: valueMatches
          ? `The y-intercept is where x = 0. Substituting x = 0 gives y = ${formatNumber(intercept, 4)}.`
          : claim.kind === 'coordinate' && !axisMatches
            ? `A y-intercept must have x = 0, but ${formatGraphInterceptClaim(claim)} has x = ${formatNumber(claim.x, 4)}. Substituting x = 0 gives y = ${formatNumber(intercept, 4)}.`
            : `The y-intercept is where x = 0. Substituting x = 0 gives y = ${formatNumber(intercept, 4)}, not ${formatGraphInterceptClaim(claim)}.`,
        hintTarget: valueMatches
          ? 'explain why x = 0 at a y-intercept'
          : 'substitute x = 0 before finding the y-intercept',
      }
    }

    const horizontalLine = isNearlyEqual(coefficient, 0)
    if (horizontalLine) {
      if (isNearlyEqual(intercept, 0)) {
        return {
          verdict: 'unclear',
          reason: 'This graph is y = 0, so every point on the line lies on the x-axis. Name a specific point if the problem asks for one.',
          hintTarget: 'clarify which x-intercept point the problem wants',
        }
      }

      return {
        verdict: claim.kind === 'none' ? 'valid' : 'invalid',
        reason: `This horizontal line has y = ${formatNumber(intercept, 4)}, so it never reaches y = 0 and has no x-intercept.`,
        hintTarget: claim.kind === 'none'
          ? 'explain why the line never crosses the x-axis'
          : 'set y = 0 before finding the x-intercept',
      }
    }

    if (claim.kind === 'none') {
      const expectedX = -intercept / coefficient
      return {
        verdict: 'invalid',
        reason: `The x-intercept is where y = 0. Solving ${expression} = 0 gives x = ${formatNumber(expectedX, 4)}.`,
        hintTarget: 'set y = 0 before finding the x-intercept',
      }
    }

    const expectedX = -intercept / coefficient
    const claimedX = claim.kind === 'coordinate' ? claim.x : claim.value
    const axisMatches = claim.kind !== 'coordinate' || isNearlyEqual(claim.y, 0, 0.01)
    const valueMatches = axisMatches && isNearlyEqual(claimedX, expectedX, 0.01)

    return {
      verdict: valueMatches ? 'valid' : 'invalid',
      reason: valueMatches
        ? `The x-intercept is where y = 0. Solving ${expression} = 0 gives x = ${formatNumber(expectedX, 4)}.`
        : claim.kind === 'coordinate' && !axisMatches
          ? `An x-intercept must have y = 0, but ${formatGraphInterceptClaim(claim)} has y = ${formatNumber(claim.y, 4)}. Solving ${expression} = 0 gives x = ${formatNumber(expectedX, 4)}.`
          : `The x-intercept is where y = 0. Solving ${expression} = 0 gives x = ${formatNumber(expectedX, 4)}, not ${formatGraphInterceptClaim(claim)}.`,
      hintTarget: valueMatches
        ? 'explain why y = 0 at an x-intercept'
        : 'set y = 0 before finding the x-intercept',
    }
  } catch {
    return null
  }
}

function extractFunctionExpressionForTableCheck(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const match = normalized.match(
    /\by\s*=\s*(.+?)(?=\s+(?:using|with|for|at|when|where|table|values?|rows?|ordered|and|i\s+got|i\s+found|my\s+answer|my\s+table)\b|\s*,\s*(?:my|the|table|values?|rows?|\(?-?\d|x\s*=)|[?!.;]|$)/i
  )
  return match?.[1]?.trim().replace(/\s+$/g, '') || null
}

function formatTableRows(rows: Array<{ x: number; y: number }>, limit = 3) {
  const shown = rows.slice(0, limit).map((row) => `(${formatNumber(row.x, 4)}, ${formatNumber(row.y, 4)})`)
  const suffix = rows.length > limit ? ', ...' : ''
  return `${shown.join(', ')}${suffix}`
}

function checkTableOfValuesStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/\b(table|values?|rows?|ordered\s+pairs?)\b/i.test(combined)) return null

  const expression =
    extractFunctionExpressionForTableCheck(previousStep) ??
    extractFunctionExpressionForPointCheck(previousStep) ??
    extractFunctionExpressionForTableCheck(combined)
  const rows = parseCoordinatePoints(nextStep).slice(0, 8)
  if (!expression || rows.length === 0) return null

  try {
    const checkedRows = rows.map((row) => ({
      ...row,
      expectedY: coerceFiniteNumber(safeEvaluate(normalizeGraphExpression(expression), { x: row.x })),
    }))
    const mismatch = checkedRows.find((row) => !isNearlyEqual(row.y, row.expectedY, 0.01))

    if (!mismatch) {
      return {
        verdict: 'valid',
        reason: `The table rows fit the function: ${formatTableRows(rows)} all match y = ${expression}.`,
        hintTarget: 'explain how each x-value was substituted into the function',
      }
    }

    return {
      verdict: 'invalid',
      reason: `In the table, x = ${formatNumber(mismatch.x, 4)} should give y = ${formatNumber(mismatch.expectedY, 4)}, not ${formatNumber(mismatch.y, 4)}.`,
      hintTarget: 'substitute each x-value before filling the table row',
      boardFocus: {
        kind: 'table_row',
        x: roundPoint(mismatch.x),
        studentY: roundPoint(mismatch.y),
        expectedY: roundPoint(mismatch.expectedY),
      },
    }
  } catch {
    return null
  }
}

const PLAIN_NUMBER_PATTERN = String.raw`-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)`

function parsePlainNumber(token: string) {
  const value = Number(token.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

function extractPlainNumbers(text: string) {
  return [...text.matchAll(new RegExp(PLAIN_NUMBER_PATTERN, 'g'))]
    .map((match) => parsePlainNumber(match[0]))
    .filter((value): value is number => value !== null)
}

type StatisticsKind = 'mean' | 'median' | 'mode' | 'range'

type ComputedStatistics = {
  sorted: number[]
  sum: number
  mean: number
  median: number
  modes: number[]
  range: number
}

function computeStatistics(values: number[]): ComputedStatistics {
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

  return {
    sorted,
    sum,
    mean,
    median,
    modes,
    range,
  }
}

function extractStatisticsKind(text: string): StatisticsKind | null {
  if (/\b(mean|average)\b/i.test(text)) return 'mean'
  if (/\bmedian\b/i.test(text)) return 'median'
  if (/\bmode\b/i.test(text)) return 'mode'
  if (/\brange\b/i.test(text)) return 'range'
  return null
}

function formatDataValues(values: number[], limit = 8) {
  const shown = values.slice(0, limit).map((value) => formatNumber(value, 4))
  const suffix = values.length > limit ? ', ...' : ''
  return `${shown.join(', ')}${suffix}`
}

function sameNumberSet(left: number[], right: number[]) {
  if (left.length !== right.length) return false
  const leftSorted = [...left].sort((a, b) => a - b)
  const rightSorted = [...right].sort((a, b) => a - b)
  return leftSorted.every((value, index) => isNearlyEqual(value, rightSorted[index], 0.01))
}

function uniqueNumbers(values: number[]) {
  const unique: number[] = []
  values.forEach((value) => {
    if (!unique.some((existing) => isNearlyEqual(existing, value, 0.01))) {
      unique.push(value)
    }
  })
  return unique
}

function checkStatisticsSummaryStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/\b(mean|average|median|mode|range|data|statistics)\b/i.test(combined)) return null

  const kind = extractStatisticsKind(previousStep) ?? extractStatisticsKind(combined)
  if (!kind) return null

  const values = extractPlainNumbers(previousStep).slice(0, 24)
  if (values.length < 2) return null

  const stats = computeStatistics(values)
  const dataSummary = formatDataValues(values)

  if (kind === 'mean') {
    const studentMean = parseLastPlainNumber(nextStep)
    if (studentMean === null) return null

    const meanMatches = isNearlyEqual(stats.mean, studentMean, 0.01)
    return {
      verdict: meanMatches ? 'valid' : 'invalid',
      reason: meanMatches
        ? `The mean of ${dataSummary} is total ${formatNumber(stats.sum, 4)} divided by ${values.length}, which is ${formatNumber(stats.mean, 4)}.`
        : `The mean of ${dataSummary} is total ${formatNumber(stats.sum, 4)} divided by ${values.length}, which is ${formatNumber(stats.mean, 4)}, not ${formatNumber(studentMean, 4)}.`,
      hintTarget: meanMatches
        ? 'explain mean as the total shared equally'
        : 'add all data values, then divide by how many values',
    }
  }

  if (kind === 'median') {
    const studentMedian = parseLastPlainNumber(nextStep)
    if (studentMedian === null) return null

    const medianMatches = isNearlyEqual(stats.median, studentMedian, 0.01)
    return {
      verdict: medianMatches ? 'valid' : 'invalid',
      reason: medianMatches
        ? `Ordered data: ${formatDataValues(stats.sorted)}. The median is ${formatNumber(stats.median, 4)}.`
        : `Ordered data: ${formatDataValues(stats.sorted)}. The median is ${formatNumber(stats.median, 4)}, not ${formatNumber(studentMedian, 4)}.`,
      hintTarget: medianMatches
        ? 'explain why the middle value represents the median'
        : 'order the data before finding the middle value',
    }
  }

  if (kind === 'mode') {
    const claimedNoMode = /\b(no\s+mode|none|no\s+repeats?|no\s+repeated\s+values?)\b/i.test(nextStep)
    const claimedModes = uniqueNumbers(extractPlainNumbers(nextStep))

    if (stats.modes.length === 0) {
      return {
        verdict: claimedNoMode ? 'valid' : 'invalid',
        reason: claimedNoMode
          ? `No value repeats in ${dataSummary}, so this data set has no mode.`
          : `No value repeats in ${dataSummary}, so this data set has no mode.`,
        hintTarget: claimedNoMode
          ? 'explain why a mode needs a repeated value'
          : 'look for repeated values before naming a mode',
      }
    }

    if (claimedModes.length === 0) return null

    const modeMatches = sameNumberSet(stats.modes, claimedModes)
    const expectedModes = stats.modes.map((value) => formatNumber(value, 4)).join(', ')
    const studentModes = claimedModes.map((value) => formatNumber(value, 4)).join(', ')
    return {
      verdict: modeMatches ? 'valid' : 'invalid',
      reason: modeMatches
        ? `${expectedModes} appears most often in ${dataSummary}, so the mode is ${expectedModes}.`
        : `${expectedModes} appears most often in ${dataSummary}, so the mode is ${expectedModes}, not ${studentModes}.`,
      hintTarget: modeMatches
        ? 'explain why the mode is the most frequent value'
        : 'count how often each value appears before choosing the mode',
    }
  }

  const studentRange = parseLastPlainNumber(nextStep)
  if (studentRange === null) return null

  const rangeMatches = isNearlyEqual(stats.range, studentRange, 0.01)
  return {
    verdict: rangeMatches ? 'valid' : 'invalid',
    reason: rangeMatches
      ? `The range is the maximum minus the minimum: ${formatNumber(stats.sorted[stats.sorted.length - 1], 4)} - ${formatNumber(stats.sorted[0], 4)} = ${formatNumber(stats.range, 4)}.`
      : `The range is the maximum minus the minimum: ${formatNumber(stats.sorted[stats.sorted.length - 1], 4)} - ${formatNumber(stats.sorted[0], 4)} = ${formatNumber(stats.range, 4)}, not ${formatNumber(studentRange, 4)}.`,
    hintTarget: rangeMatches
      ? 'explain why range compares the greatest and least values'
      : 'subtract the smallest data value from the largest data value',
  }
}

type ProbabilitySetup = {
  favorable: number
  total: number
  useComplement: boolean
}

type ProbabilityAnswer = {
  value: number
  label: string
  numerator?: number
  denominator?: number
}

function extractProbabilitySetup(text: string): ProbabilitySetup | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(probability|chance|outcomes?|favorable|likely|out\s+of)\b/i.test(normalized)) return null

  const outOfMatch = normalized.match(
    new RegExp(
      `(${PLAIN_NUMBER_PATTERN})(?:\\s+(?:favorable|successful|desired|winning|possible|total|outcomes?|results?|ways?|items?|marbles?|cubes?|cards?|spins?|rolls?))*\\s+out\\s+of\\s+(${PLAIN_NUMBER_PATTERN})`,
      'i'
    )
  )
  const favorableMatch = normalized.match(
    new RegExp(`\\b(?:favorable|successful|desired|winning)\\s+(?:outcomes?|results?|ways?)?\\s*(?:is|are|=|:)?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i')
  )
  const totalMatch = normalized.match(
    new RegExp(`\\b(?:total|possible|all)\\s+(?:outcomes?|results?|ways?)?\\s*(?:is|are|=|:)?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i')
  )

  const favorable = outOfMatch ? parsePlainNumber(outOfMatch[1]) : favorableMatch ? parsePlainNumber(favorableMatch[1]) : null
  const total = outOfMatch ? parsePlainNumber(outOfMatch[2]) : totalMatch ? parsePlainNumber(totalMatch[1]) : null
  if (favorable === null || total === null) return null

  return {
    favorable,
    total,
    useComplement: /\b(not|complement|opposite|doesn'?t|without)\b/i.test(normalized),
  }
}

function parseProbabilityAnswer(text: string): ProbabilityAnswer | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const outOfMatch = normalized.match(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s+out\\s+of\\s+(${PLAIN_NUMBER_PATTERN})`, 'i'))
  if (outOfMatch) {
    const numerator = parsePlainNumber(outOfMatch[1])
    const denominator = parsePlainNumber(outOfMatch[2])
    if (numerator !== null && denominator !== null && !isNearlyEqual(denominator, 0)) {
      return {
        value: numerator / denominator,
        label: `${formatNumber(numerator, 4)}/${formatNumber(denominator, 4)}`,
        numerator,
        denominator,
      }
    }
  }

  const fractionMatch = normalized.match(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s*\\/\\s*(${PLAIN_NUMBER_PATTERN})`, 'i'))
  if (fractionMatch) {
    const numerator = parsePlainNumber(fractionMatch[1])
    const denominator = parsePlainNumber(fractionMatch[2])
    if (numerator !== null && denominator !== null && !isNearlyEqual(denominator, 0)) {
      return {
        value: numerator / denominator,
        label: `${formatNumber(numerator, 4)}/${formatNumber(denominator, 4)}`,
        numerator,
        denominator,
      }
    }
  }

  const percentMatch = normalized.match(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s*(?:%|percent(?:age)?)`, 'i'))
  if (percentMatch) {
    const percent = parsePlainNumber(percentMatch[1])
    if (percent !== null) {
      return {
        value: percent / 100,
        label: formatPercent(percent),
      }
    }
  }

  const value = parseLastPlainNumber(normalized)
  return value === null ? null : { value, label: formatNumber(value, 4) }
}

function formatProbabilityFraction(numerator: number, denominator: number) {
  return `${formatNumber(numerator, 4)}/${formatNumber(denominator, 4)}`
}

function checkProbabilityModelStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const setup = extractProbabilitySetup(previousStep)
  const studentAnswer = parseProbabilityAnswer(nextStep)
  if (!setup || !studentAnswer) return null

  if (setup.total <= 0) {
    return {
      verdict: 'unclear',
      reason: 'A probability model needs a positive total number of possible outcomes.',
      hintTarget: 'identify the total possible outcomes before writing the probability',
    }
  }

  if (setup.favorable < 0 || setup.favorable > setup.total) {
    return {
      verdict: 'unclear',
      reason: `The favorable outcomes should be between 0 and the total ${formatNumber(setup.total, 4)} outcomes.`,
      hintTarget: 'check the favorable and total outcome counts',
    }
  }

  const expectedFavorable = setup.useComplement ? setup.total - setup.favorable : setup.favorable
  const expectedProbability = expectedFavorable / setup.total
  const answerMatches = isNearlyEqual(expectedProbability, studentAnswer.value, 0.005)
  const expectedFraction = formatProbabilityFraction(expectedFavorable, setup.total)
  const baseReason = setup.useComplement
    ? `For the complement, use total minus favorable outcomes: ${formatNumber(setup.total, 4)} - ${formatNumber(
        setup.favorable,
        4
      )} = ${formatNumber(expectedFavorable, 4)}. The probability is ${expectedFraction}, or ${formatPercent(
        expectedProbability * 100
      )}.`
    : `Probability uses favorable outcomes over total outcomes: ${formatNumber(setup.favorable, 4)} out of ${formatNumber(
        setup.total,
        4
      )} is ${expectedFraction}, or ${formatPercent(expectedProbability * 100)}.`

  if (answerMatches) {
    return {
      verdict: 'valid',
      reason: baseReason,
      hintTarget: setup.useComplement
        ? 'explain why the complement uses the outcomes that are not favorable'
        : 'explain favorable outcomes over total outcomes',
    }
  }

  const denominatorMistake =
    typeof studentAnswer.denominator === 'number' && !isNearlyEqual(studentAnswer.denominator, setup.total, 0.01)
  const complementMistake =
    setup.useComplement &&
    typeof studentAnswer.numerator === 'number' &&
    isNearlyEqual(studentAnswer.numerator, setup.favorable, 0.01) &&
    typeof studentAnswer.denominator === 'number' &&
    isNearlyEqual(studentAnswer.denominator, setup.total, 0.01)

  return {
    verdict: 'invalid',
    reason: `${baseReason} The student answer is ${studentAnswer.label}.`,
    hintTarget: complementMistake
      ? 'subtract favorable outcomes from the total for the complement'
      : denominatorMistake
        ? 'use total outcomes as the denominator'
        : 'put favorable outcomes over total outcomes',
  }
}

function parseLastPlainNumber(text: string) {
  const numbers = extractPlainNumbers(text)
  return numbers.length > 0 ? numbers[numbers.length - 1] : null
}

function extractRectangleDimensions(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const byMatch = normalized.match(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s*(?:by|x|×)\\s*(${PLAIN_NUMBER_PATTERN})`, 'i'))
  if (byMatch) {
    const width = parsePlainNumber(byMatch[1])
    const height = parsePlainNumber(byMatch[2])
    if (width !== null && height !== null && width > 0 && height > 0) {
      return { width, height }
    }
  }

  const widthMatch = normalized.match(new RegExp(`\\b(?:width|wide)\\s*(?:is|=|:)?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i'))
  const heightMatch = normalized.match(new RegExp(`\\b(?:length|height|tall)\\s*(?:is|=|:)?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i'))
  if (widthMatch && heightMatch) {
    const width = parsePlainNumber(widthMatch[1])
    const height = parsePlainNumber(heightMatch[1])
    if (width !== null && height !== null && width > 0 && height > 0) {
      return { width, height }
    }
  }

  if (!/\b(rectangle|rectangular|area|perimeter)\b/i.test(normalized)) return null
  const numbers = extractPlainNumbers(normalized)
  if (numbers.length < 2 || numbers[0] <= 0 || numbers[1] <= 0) return null
  return { width: numbers[0], height: numbers[1] }
}

function extractRectangleMeasurementKind(previousStep: string, nextStep: string): 'area' | 'perimeter' | null {
  const nextHasArea = /\barea\b/i.test(nextStep)
  const nextHasPerimeter = /\bperimeter\b/i.test(nextStep)
  if (nextHasArea && !nextHasPerimeter) return 'area'
  if (nextHasPerimeter && !nextHasArea) return 'perimeter'

  const previousHasArea = /\barea\b/i.test(previousStep)
  const previousHasPerimeter = /\bperimeter\b/i.test(previousStep)
  if (previousHasArea && !previousHasPerimeter) return 'area'
  if (previousHasPerimeter && !previousHasArea) return 'perimeter'

  return null
}

type CompositeAreaPiece = {
  width: number
  height: number
}

type CompositeMissingPieceArea = {
  outer: CompositeAreaPiece
  missing: CompositeAreaPiece
}

function hasCompositeAreaCue(text: string) {
  return (
    /\barea\b/i.test(text) &&
    /\b(composite|combined|decomposed|split|made\s+(?:up\s+)?of|made\s+from|attached|l[-\s]?shaped|rectangles|parts?)\b/i.test(
      text
    )
  )
}

function extractCompositeAreaPieces(text: string): CompositeAreaPiece[] | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!hasCompositeAreaCue(normalized)) return null

  const matches = [
    ...normalized.matchAll(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s*(?:by|x|×)\\s*(${PLAIN_NUMBER_PATTERN})`, 'gi')),
  ]
  const pieces = matches
    .map((match) => ({
      width: parsePlainNumber(match[1]),
      height: parsePlainNumber(match[2]),
    }))
    .filter((piece): piece is CompositeAreaPiece => {
      return piece.width !== null && piece.height !== null && piece.width > 0 && piece.height > 0
    })

  return pieces.length >= 2 ? pieces : null
}

function hasMissingPieceCompositeAreaCue(text: string) {
  return (
    /\barea\b/i.test(text) &&
    /\b(rectangle|rectangular|shape|composite|l[-\s]?shaped)\b/i.test(text) &&
    /\b(notch|cut\s*out|cutout|removed|missing|taken\s+out|hole|subtracted?)\b/i.test(text)
  )
}

function extractCompositeMissingPieceArea(text: string): CompositeMissingPieceArea | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!hasMissingPieceCompositeAreaCue(normalized)) return null

  const matches = [
    ...normalized.matchAll(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s*(?:by|x|×)\\s*(${PLAIN_NUMBER_PATTERN})`, 'gi')),
  ]
  const dimensions = matches
    .map((match) => ({
      width: parsePlainNumber(match[1]),
      height: parsePlainNumber(match[2]),
      index: match.index ?? 0,
      endIndex: (match.index ?? 0) + match[0].length,
    }))
    .filter((dimension): dimension is CompositeAreaPiece & { index: number; endIndex: number } => {
      return dimension.width !== null && dimension.height !== null && dimension.width > 0 && dimension.height > 0
    })

  if (dimensions.length < 2) return null

  const localContexts = dimensions.map((dimension, index) => {
    const previousEnd = index === 0 ? 0 : dimensions[index - 1].endIndex
    const nextStart = index === dimensions.length - 1 ? normalized.length : dimensions[index + 1].index
    return `${normalized.slice(Math.max(previousEnd, dimension.index - 36), dimension.index)} ${normalized.slice(
      dimension.endIndex,
      Math.min(nextStart, dimension.endIndex + 48)
    )}`
  })
  const missingCue = /\b(notch|cut\s*out|cutout|removed|missing|taken\s+out|hole|inner|small|subtracted?)\b/i
  const outerCue = /\b(outer|whole|large|big|original|starting|main)\b/i
  let missingIndex = localContexts.findIndex((context) => missingCue.test(context))
  let outerIndex = localContexts.findIndex((context, index) => index !== missingIndex && outerCue.test(context))

  if (missingIndex === -1 && outerIndex !== -1) {
    missingIndex = outerIndex === 0 ? 1 : 0
  }
  if (missingIndex === -1) {
    missingIndex = 1
  }
  if (outerIndex === -1 || outerIndex === missingIndex) {
    outerIndex = missingIndex === 0 ? 1 : 0
  }

  const outer = dimensions[outerIndex]
  const missing = dimensions[missingIndex]
  if (!outer || !missing) return null

  return {
    outer: { width: outer.width, height: outer.height },
    missing: { width: missing.width, height: missing.height },
  }
}

function checkMissingPieceCompositeAreaStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const setup = extractCompositeMissingPieceArea(previousStep)
  const studentAnswer = parseLastPlainNumber(nextStep)
  if (!setup || studentAnswer === null) return null

  const outerArea = setup.outer.width * setup.outer.height
  const missingArea = setup.missing.width * setup.missing.height
  if (missingArea >= outerArea) {
    return {
      verdict: 'unclear',
      reason: `The missing piece area ${formatNumber(missingArea, 4)} is not smaller than the whole rectangle area ${formatNumber(
        outerArea,
        4
      )}.`,
      hintTarget: 'check the whole rectangle and missing-piece dimensions before subtracting',
    }
  }

  const totalArea = outerArea - missingArea
  const baseReason = `The whole rectangle area is ${formatNumber(setup.outer.width, 4)} x ${formatNumber(
    setup.outer.height,
    4
  )} = ${formatNumber(outerArea, 4)}, and the missing piece is ${formatNumber(setup.missing.width, 4)} x ${formatNumber(
    setup.missing.height,
    4
  )} = ${formatNumber(missingArea, 4)}, so the remaining area is ${formatNumber(outerArea, 4)} - ${formatNumber(
    missingArea,
    4
  )} = ${formatNumber(totalArea, 4)} square units.`
  const answerMatches = isNearlyEqual(totalArea, studentAnswer, 0.01)

  return {
    verdict: answerMatches ? 'valid' : 'invalid',
    reason: answerMatches ? baseReason : `${baseReason} The student answer is ${formatNumber(studentAnswer, 4)}.`,
    hintTarget: answerMatches
      ? 'explain why missing-piece composite area subtracts the removed rectangle'
      : isNearlyEqual(outerArea + missingArea, studentAnswer, 0.01)
        ? 'subtract the cut-out piece instead of adding it'
        : isNearlyEqual(outerArea, studentAnswer, 0.01)
          ? 'subtract the missing rectangle from the whole area'
          : isNearlyEqual(missingArea, studentAnswer, 0.01)
            ? 'start with the whole rectangle before subtracting the notch'
            : 'multiply the whole rectangle, multiply the missing rectangle, then subtract',
  }
}

function checkCompositeAreaStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const missingPieceStep = checkMissingPieceCompositeAreaStep(previousStep, nextStep)
  if (missingPieceStep) return missingPieceStep

  const pieces = extractCompositeAreaPieces(previousStep)
  const studentAnswer = parseLastPlainNumber(nextStep)
  if (!pieces || studentAnswer === null) return null

  const partAreas = pieces.map((piece) => piece.width * piece.height)
  const totalArea = partAreas.reduce((sum, area) => sum + area, 0)
  const partReasons = pieces
    .map((piece, index) => {
      return `${formatNumber(piece.width, 4)} x ${formatNumber(piece.height, 4)} = ${formatNumber(partAreas[index], 4)}`
    })
    .join(', ')
  const totalExpression = partAreas.map((area) => formatNumber(area, 4)).join(' + ')
  const baseReason = `The composite parts have areas ${partReasons}, so the total area is ${totalExpression} = ${formatNumber(
    totalArea,
    4
  )} square units.`
  const answerMatches = isNearlyEqual(totalArea, studentAnswer, 0.01)
  const singlePartAnswer = partAreas.some((area) => isNearlyEqual(area, studentAnswer, 0.01))
  const sideBySideBoundingArea = pieces.reduce((sum, piece) => sum + piece.width, 0) * Math.max(...pieces.map((piece) => piece.height))
  const stackedBoundingArea = Math.max(...pieces.map((piece) => piece.width)) * pieces.reduce((sum, piece) => sum + piece.height, 0)
  const boundingBoxAnswer =
    isNearlyEqual(sideBySideBoundingArea, studentAnswer, 0.01) || isNearlyEqual(stackedBoundingArea, studentAnswer, 0.01)

  return {
    verdict: answerMatches ? 'valid' : 'invalid',
    reason: answerMatches ? baseReason : `${baseReason} The student answer is ${formatNumber(studentAnswer, 4)}.`,
    hintTarget: answerMatches
      ? 'explain why decomposed rectangle areas add to the composite area'
      : singlePartAnswer
        ? 'include every rectangular part before giving the total area'
        : boundingBoxAnswer
          ? 'add the decomposed rectangle areas instead of using the outside bounding rectangle'
          : 'multiply each rectangle part, then add the part areas',
  }
}

function checkRectangleAreaPerimeterStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const kind = extractRectangleMeasurementKind(previousStep, nextStep)
  if (!kind) return null

  const dimensions = extractRectangleDimensions(previousStep)
  const studentAnswer = parseLastPlainNumber(nextStep)
  if (!dimensions || studentAnswer === null) return null

  const { width, height } = dimensions
  const area = width * height
  const perimeter = 2 * (width + height)

  if (kind === 'area') {
    const answerMatches = isNearlyEqual(area, studentAnswer, 0.01)
    const baseReason = `A rectangle with side lengths ${formatNumber(width, 4)} and ${formatNumber(
      height,
      4
    )} has area ${formatNumber(width, 4)} x ${formatNumber(height, 4)} = ${formatNumber(area, 4)} square units.`
    return {
      verdict: answerMatches ? 'valid' : 'invalid',
      reason: answerMatches ? baseReason : `${baseReason} The student answer is ${formatNumber(studentAnswer, 4)}.`,
      hintTarget: answerMatches
        ? 'explain why multiplying length by width counts square units inside'
        : isNearlyEqual(perimeter, studentAnswer, 0.01)
          ? 'separate area from perimeter before choosing the operation'
          : 'multiply length by width to count the square units inside',
    }
  }

  const answerMatches = isNearlyEqual(perimeter, studentAnswer, 0.01)
  const baseReason = `A rectangle with side lengths ${formatNumber(width, 4)} and ${formatNumber(
    height,
    4
  )} has perimeter 2 x (${formatNumber(width, 4)} + ${formatNumber(height, 4)}) = ${formatNumber(
    perimeter,
    4
  )} units.`
  return {
    verdict: answerMatches ? 'valid' : 'invalid',
    reason: answerMatches ? baseReason : `${baseReason} The student answer is ${formatNumber(studentAnswer, 4)}.`,
    hintTarget: answerMatches
      ? 'explain why perimeter adds the side lengths around the boundary'
      : isNearlyEqual(area, studentAnswer, 0.01)
        ? 'separate perimeter from area before choosing the operation'
        : 'add all side lengths around the rectangle',
  }
}

function extractTriangleBaseHeight(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(triangle|triangular)\b/i.test(normalized) || !/\barea\b/i.test(normalized)) return null

  const baseMatch = normalized.match(new RegExp(`\\bbase\\b\\s*(?:is|=|:|of)?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i'))
  const heightMatch = normalized.match(
    new RegExp(`\\b(?:height|altitude)\\b\\s*(?:is|=|:|of)?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i')
  )
  if (!baseMatch || !heightMatch) return null

  const base = parsePlainNumber(baseMatch[1])
  const height = parsePlainNumber(heightMatch[1])
  if (base === null || height === null || base <= 0 || height <= 0) return null
  return { base, height }
}

function checkTriangleAreaStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const dimensions = extractTriangleBaseHeight(previousStep)
  const studentAnswer = parseLastPlainNumber(nextStep)
  if (!dimensions || studentAnswer === null) return null

  const { base, height } = dimensions
  const rectangleArea = base * height
  const triangleArea = rectangleArea / 2
  const answerMatches = isNearlyEqual(triangleArea, studentAnswer, 0.01)
  const baseReason = `A triangle with base ${formatNumber(base, 4)} and height ${formatNumber(
    height,
    4
  )} has area (${formatNumber(base, 4)} x ${formatNumber(height, 4)}) / 2 = ${formatNumber(
    triangleArea,
    4
  )} square units.`

  return {
    verdict: answerMatches ? 'valid' : 'invalid',
    reason: answerMatches ? baseReason : `${baseReason} The student answer is ${formatNumber(studentAnswer, 4)}.`,
    hintTarget: answerMatches
      ? 'explain why triangle area is half of the base-height rectangle'
      : isNearlyEqual(rectangleArea, studentAnswer, 0.01)
        ? 'halve the base-times-height rectangle area for a triangle'
        : 'multiply base by height, then divide by 2',
  }
}

type AngleRelationshipPrompt =
  | {
      relationship: 'complementary' | 'supplementary'
      knownAngle: number
    }
  | {
      relationship: 'triangle'
      knownAngles: [number, number]
    }

function extractPairAnglePrompt(text: string): AngleRelationshipPrompt | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const isComplementary = /\b(complementary|complement)\b/i.test(normalized)
  const isSupplementary = /\b(supplementary|supplement|linear\s+pair|straight\s+line)\b/i.test(normalized)
  if (isComplementary === isSupplementary) return null

  const directMatch = normalized.match(
    new RegExp(
      isComplementary
        ? `\\b(?:complementary|complement)(?:\\s+angle)?\\s+(?:to|of|with)?\\s*(${PLAIN_NUMBER_PATTERN})`
        : `\\b(?:supplementary|supplement)(?:\\s+angle)?\\s+(?:to|of|with)?\\s*(${PLAIN_NUMBER_PATTERN})`,
      'i'
    )
  )
  const oneAngleMatch = normalized.match(
    new RegExp(`\\b(?:one\\s+)?angle\\s*(?:is|=|measures?|measured)?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i')
  )
  const directAngle = directMatch ? parsePlainNumber(directMatch[1]) : null
  const oneAngle = oneAngleMatch ? parsePlainNumber(oneAngleMatch[1]) : null
  const knownAngle = directAngle ?? oneAngle ?? extractPlainNumbers(normalized)[0] ?? null

  if (knownAngle === null || knownAngle < 0) return null
  return {
    relationship: isComplementary ? 'complementary' : 'supplementary',
    knownAngle,
  }
}

function extractTriangleAnglePrompt(text: string): AngleRelationshipPrompt | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(triangle|triangular)\b/i.test(normalized) || !/\b(angle|degrees?|missing|third)\b/i.test(normalized)) {
    return null
  }

  const pairMatch = normalized.match(
    new RegExp(
      `\\b(?:triangle|triangular)\\b[^.?!]*?(${PLAIN_NUMBER_PATTERN})\\s*(?:degrees?|deg)?\\s*(?:and|,)\\s*(${PLAIN_NUMBER_PATTERN})`,
      'i'
    )
  )
  if (!pairMatch) return null

  const firstAngle = parsePlainNumber(pairMatch[1])
  const secondAngle = parsePlainNumber(pairMatch[2])
  if (firstAngle === null || secondAngle === null || firstAngle < 0 || secondAngle < 0) return null

  return {
    relationship: 'triangle',
    knownAngles: [firstAngle, secondAngle],
  }
}

function extractAngleRelationshipPrompt(text: string) {
  return extractTriangleAnglePrompt(text) ?? extractPairAnglePrompt(text)
}

function angleTotalHint(relationship: 'complementary' | 'supplementary') {
  return relationship === 'complementary'
    ? 'use 90 degrees for complementary angles, not 180'
    : 'use 180 degrees for supplementary angles, not 90'
}

function checkAngleRelationshipStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const prompt = extractAngleRelationshipPrompt(previousStep)
  const studentAnswer = parseLastPlainNumber(nextStep)
  if (!prompt || studentAnswer === null) return null

  if (prompt.relationship === 'triangle') {
    const [firstAngle, secondAngle] = prompt.knownAngles
    const knownSum = firstAngle + secondAngle
    const expected = 180 - knownSum
    if (expected < 0) {
      return {
        verdict: 'unclear',
        reason: `The two known triangle angles add to ${formatNumber(knownSum, 4)} degrees, which is already more than 180 degrees.`,
        hintTarget: 'check the given angle measures before finding the missing angle',
      }
    }

    const answerMatches = isNearlyEqual(expected, studentAnswer, 0.01)
    const baseReason = `Triangle angles sum to 180 degrees, so the missing angle is 180 - (${formatNumber(
      firstAngle,
      4
    )} + ${formatNumber(secondAngle, 4)}) = ${formatNumber(expected, 4)} degrees.`
    return {
      verdict: answerMatches ? 'valid' : 'invalid',
      reason: answerMatches ? baseReason : `${baseReason} The student answer is ${formatNumber(studentAnswer, 4)} degrees.`,
      hintTarget: answerMatches
        ? 'explain why every triangle has a 180 degree angle sum'
        : isNearlyEqual(knownSum, studentAnswer, 0.01)
          ? 'subtract the known angles from 180 instead of using their sum as the missing angle'
          : 'add the known angles, then subtract from 180',
    }
  }

  const total = prompt.relationship === 'complementary' ? 90 : 180
  const expected = total - prompt.knownAngle
  if (expected < 0) {
    return {
      verdict: 'unclear',
      reason: `A ${prompt.relationship} angle pair totals ${total} degrees, but the given angle is ${formatNumber(
        prompt.knownAngle,
        4
      )} degrees.`,
      hintTarget: 'check the given angle measure before finding the missing angle',
    }
  }

  const answerMatches = isNearlyEqual(expected, studentAnswer, 0.01)
  const otherTotal = prompt.relationship === 'complementary' ? 180 : 90
  const otherRelationshipAnswer = otherTotal - prompt.knownAngle
  const baseReason = `${prompt.relationship[0].toUpperCase()}${prompt.relationship.slice(
    1
  )} angles sum to ${total} degrees, so the missing angle is ${total} - ${formatNumber(
    prompt.knownAngle,
    4
  )} = ${formatNumber(expected, 4)} degrees.`

  return {
    verdict: answerMatches ? 'valid' : 'invalid',
    reason: answerMatches ? baseReason : `${baseReason} The student answer is ${formatNumber(studentAnswer, 4)} degrees.`,
    hintTarget: answerMatches
      ? `explain why ${prompt.relationship} angles use a ${total} degree total`
      : isNearlyEqual(otherRelationshipAnswer, studentAnswer, 0.01)
        ? angleTotalHint(prompt.relationship)
        : `subtract the known angle from ${total} degrees`,
  }
}

function extractPercentChangeAmounts(text: string) {
  if (/%|\bpercent\b/i.test(text)) return null

  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const fromToMatch = normalized.match(
    new RegExp(
      `\\bfrom\\s+\\$?\\s*(${PLAIN_NUMBER_PATTERN})\\s+(?:to|into|up\\s+to|down\\s+to)\\s+\\$?\\s*(${PLAIN_NUMBER_PATTERN})`,
      'i'
    )
  )
  const arrowMatch = normalized.match(
    new RegExp(`\\$?\\s*(${PLAIN_NUMBER_PATTERN})\\s*(?:->|→|⇒|to)\\s*\\$?\\s*(${PLAIN_NUMBER_PATTERN})`, 'i')
  )
  const match = fromToMatch ?? arrowMatch
  if (!match) return null

  const from = parsePlainNumber(match[1])
  const to = parsePlainNumber(match[2])
  if (from === null || to === null) return null
  return { from, to }
}

function parsePercentChangeAnswer(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const percentMatches = [
    ...normalized.matchAll(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s*(?:%|percent(?:age)?)`, 'gi')),
  ]
  const valueMatch = percentMatches.at(-1)
  const value = valueMatch ? parsePlainNumber(valueMatch[1]) : null
  if (value === null) return null

  const lower = normalized.toLowerCase()
  const direction = /\b(decrease|decreased|decreasing|drop|dropped|loss|lower|less|down|discount)\b/.test(lower)
    ? 'decrease'
    : /\b(increase|increased|increasing|gain|grew|growth|more|up|rise|rose|raised)\b/.test(lower)
      ? 'increase'
      : null

  return { value, direction }
}

function checkPercentChangeStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/%|\bpercent\b/i.test(nextStep)) return null
  if (!/\b(percent\s+change|increase|increased|decrease|decreased|from|to|original|new|old)\b/i.test(combined)) {
    return null
  }

  const amounts = extractPercentChangeAmounts(previousStep)
  const studentAnswer = parsePercentChangeAnswer(nextStep)
  if (!amounts || !studentAnswer) return null

  const { from, to } = amounts
  if (isNearlyEqual(from, 0)) {
    return {
      verdict: 'unclear',
      reason: 'Percent change needs a nonzero original amount as the base.',
      hintTarget: 'identify the original amount before finding percent change',
    }
  }

  const change = to - from
  const expectedDirection = change > 0 ? 'increase' : change < 0 ? 'decrease' : 'unchanged'
  const expectedPercent = Math.abs((change / from) * 100)
  const valueMatches = isNearlyEqual(expectedPercent, studentAnswer.value, 0.05)
  const directionMatches =
    studentAnswer.direction === null ||
    expectedDirection === 'unchanged' ||
    studentAnswer.direction === expectedDirection
  const changeMagnitude = Math.abs(change)
  const baseReason = `The amount changed by ${formatNumber(changeMagnitude, 4)} from ${formatNumber(
    from,
    4
  )} to ${formatNumber(to, 4)}. Percent change uses the original amount ${formatNumber(
    from,
    4
  )} as the base, so ${formatNumber(changeMagnitude, 4)}/${formatNumber(from, 4)} = ${formatPercent(
    expectedPercent
  )}.`

  if (valueMatches && directionMatches) {
    return {
      verdict: 'valid',
      reason: baseReason,
      hintTarget: 'explain why the original amount is the percent-change base',
    }
  }

  if (!directionMatches) {
    return {
      verdict: 'invalid',
      reason: `${baseReason} The direction is a ${expectedDirection}, not a ${studentAnswer.direction}.`,
      hintTarget: 'match the increase or decrease direction to the change',
    }
  }

  return {
    verdict: 'invalid',
    reason: `${baseReason} The student percent is ${formatPercent(studentAnswer.value)}.`,
    hintTarget: 'use the original amount as the percent-change base',
  }
}

function extractPercentErrorAmounts(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const actualMatch = normalized.match(
    new RegExp(
      `\\b(?:actual|accepted|exact|true|correct)\\s+(?:value\\s+)?(?:was|is|=|of)?\\s*\\$?\\s*(${PLAIN_NUMBER_PATTERN})`,
      'i'
    )
  )
  const measuredMatch = normalized.match(
    new RegExp(
      `\\b(?:estimate|estimated|measured|measurement|experimental|observed|approximation|approximate|predicted)\\s+(?:value\\s+)?(?:was|is|=|of)?\\s*\\$?\\s*(${PLAIN_NUMBER_PATTERN})`,
      'i'
    )
  )
  if (!actualMatch || !measuredMatch) return null

  const actual = parsePlainNumber(actualMatch[1])
  const measured = parsePlainNumber(measuredMatch[1])
  if (actual === null || measured === null) return null
  return { actual, measured }
}

function parsePercentErrorAnswer(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const percentMatches = [
    ...normalized.matchAll(new RegExp(`(${PLAIN_NUMBER_PATTERN})\\s*(?:%|percent(?:age)?)`, 'gi')),
  ]
  const valueMatch = percentMatches.at(-1)
  const value = valueMatch ? parsePlainNumber(valueMatch[1]) : null
  return value === null ? null : value
}

function checkPercentErrorStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/%|\bpercent\b/i.test(nextStep)) return null
  if (!/\b(percent\s+error|error|actual|accepted|experimental|measured|estimate|estimated|observed)\b/i.test(combined)) {
    return null
  }

  const amounts = extractPercentErrorAmounts(previousStep)
  const studentPercent = parsePercentErrorAnswer(nextStep)
  if (!amounts || studentPercent === null) return null

  const { actual, measured } = amounts
  if (isNearlyEqual(actual, 0)) {
    return {
      verdict: 'unclear',
      reason: 'Percent error needs a nonzero actual value as the base.',
      hintTarget: 'identify the actual value before finding percent error',
    }
  }

  const errorAmount = Math.abs(measured - actual)
  const actualBase = Math.abs(actual)
  const expectedPercent = (errorAmount / actualBase) * 100
  const valueMatches = isNearlyEqual(expectedPercent, studentPercent, 0.05)
  const baseReason = `The difference between the measured value ${formatNumber(
    measured,
    4
  )} and the actual value ${formatNumber(actual, 4)} is ${formatNumber(
    errorAmount,
    4
  )}. Percent error uses the actual value ${formatNumber(actualBase, 4)} as the base, so ${formatNumber(
    errorAmount,
    4
  )}/${formatNumber(actualBase, 4)} = ${formatPercent(expectedPercent)}.`

  return {
    verdict: valueMatches ? 'valid' : 'invalid',
    reason: valueMatches
      ? baseReason
      : `${baseReason} The student percent is ${formatPercent(studentPercent)}.`,
    hintTarget: valueMatches
      ? 'explain why the actual value is the percent-error base'
      : 'use the actual value as the percent-error base',
  }
}

const PLACE_VALUE_PATTERN =
  String.raw`thousandths?|hundredths?|tenths?|thousands?|hundreds?|tens?|ones?|units?`

const PLACE_VALUE_EXPONENTS: Record<string, number> = {
  thousandths: -3,
  thousandth: -3,
  hundredths: -2,
  hundredth: -2,
  tenths: -1,
  tenth: -1,
  ones: 0,
  one: 0,
  units: 0,
  unit: 0,
  tens: 1,
  ten: 1,
  hundreds: 2,
  hundred: 2,
  thousands: 3,
  thousand: 3,
}

const PLACE_VALUE_LABELS_BY_EXPONENT: Record<number, string> = {
  [-3]: 'thousandths',
  [-2]: 'hundredths',
  [-1]: 'tenths',
  0: 'ones',
  1: 'tens',
  2: 'hundreds',
  3: 'thousands',
}

function normalizePlaceValue(place: string) {
  const match = place.toLowerCase().match(new RegExp(`\\b(${PLACE_VALUE_PATTERN})\\b`))
  if (!match) return null
  return match[1]
}

function placeValueExponent(place: string) {
  const normalized = normalizePlaceValue(place)
  return normalized ? PLACE_VALUE_EXPONENTS[normalized] ?? null : null
}

function placeValueLabel(exponent: number) {
  return PLACE_VALUE_LABELS_BY_EXPONENT[exponent] ?? 'place'
}

function splitPlaceValueNumber(numberText: string) {
  const compact = numberText.replace(/,/g, '').trim()
  const match = compact.match(/^[-+]?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/)
  if (!match) return null

  return {
    integerDigits: (match[1] ?? '0').replace(/^0+(?=\d)/, '') || '0',
    fractionalDigits: match[2] ?? match[3] ?? '',
  }
}

function digitAtPlace(numberText: string, exponent: number) {
  const split = splitPlaceValueNumber(numberText)
  if (!split) return null

  if (exponent >= 0) {
    const index = split.integerDigits.length - 1 - exponent
    return index >= 0 ? Number(split.integerDigits[index]) : 0
  }

  const index = Math.abs(exponent) - 1
  return index < split.fractionalDigits.length ? Number(split.fractionalDigits[index]) : 0
}

function digitPlaceValueMatches(numberText: string, targetDigit: number) {
  const split = splitPlaceValueNumber(numberText)
  if (!split) return null

  const matches: Array<{ exponent: number; value: number }> = []
  for (let index = 0; index < split.integerDigits.length; index += 1) {
    const digit = Number(split.integerDigits[index])
    if (digit === targetDigit) {
      const exponent = split.integerDigits.length - 1 - index
      matches.push({ exponent, value: digit * 10 ** exponent })
    }
  }
  for (let index = 0; index < split.fractionalDigits.length; index += 1) {
    const digit = Number(split.fractionalDigits[index])
    if (digit === targetDigit) {
      const exponent = -(index + 1)
      matches.push({ exponent, value: digit * 10 ** exponent })
    }
  }

  return matches
}

function singleDigitPlaceValue(numberText: string, targetDigit: number) {
  const matches = digitPlaceValueMatches(numberText, targetDigit)
  if (!matches) return null
  if (matches.length !== 1) return null
  return matches[0]
}

function parsePlaceValueDigitAnswer(text: string) {
  const normalized = text.toLowerCase().trim()
  const digitMatch = normalized.match(/\b([0-9])\b/)
  if (digitMatch) return Number(digitMatch[1])

  const wordDigits: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
  }
  const wordMatch = normalized.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/)
  return wordMatch ? wordDigits[wordMatch[1]] : null
}

function parsePlaceValueNumericAnswer(text: string) {
  const match = text.replace(/,/g, '').match(new RegExp(PLAIN_NUMBER_PATTERN))
  return match ? parsePlainNumber(match[0]) : null
}

type PlaceValueDigitPrompt =
  | {
      mode: 'digit_at_place'
      numberText: string
      place: string
    }
  | {
      mode: 'digit_value'
      numberText: string
      targetDigit: number
    }

function extractPlaceValueDigitPrompt(text: string): PlaceValueDigitPrompt | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const numberPattern = PLAIN_NUMBER_PATTERN
  const digitPlacePatterns = [
    new RegExp(
      `\\b(?:digit|number)\\s+(?:is\\s+)?(?:in|at)\\s+(?:the\\s+)?(${PLACE_VALUE_PATTERN})\\s+place\\s+(?:of|in)\\s+(${numberPattern})`,
      'i'
    ),
    new RegExp(
      `\\b(?:the\\s+)?(${PLACE_VALUE_PATTERN})\\s+(?:place\\s+)?(?:digit|number)\\s+(?:of|in)\\s+(${numberPattern})`,
      'i'
    ),
  ]

  for (const pattern of digitPlacePatterns) {
    const match = normalized.match(pattern)
    if (match) {
      return {
        mode: 'digit_at_place',
        place: match[1],
        numberText: match[2],
      }
    }
  }

  const digitValueMatch = normalized.match(
    new RegExp(`\\bvalue\\s+of\\s+(?:the\\s+)?([0-9])\\s+(?:in|of)\\s+(${numberPattern})`, 'i')
  )
  if (digitValueMatch) {
    return {
      mode: 'digit_value',
      targetDigit: Number(digitValueMatch[1]),
      numberText: digitValueMatch[2],
    }
  }

  return null
}

function checkPlaceValueDigitStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const prompt = extractPlaceValueDigitPrompt(previousStep)
  if (!prompt) return null

  if (prompt.mode === 'digit_at_place') {
    const exponent = placeValueExponent(prompt.place)
    const expectedDigit = exponent === null ? null : digitAtPlace(prompt.numberText, exponent)
    const studentDigit = parsePlaceValueDigitAnswer(nextStep)
    if (exponent === null || expectedDigit === null || studentDigit === null) return null

    const label = placeValueLabel(exponent)
    const matches = expectedDigit === studentDigit
    const reason = `The ${label} digit in ${prompt.numberText} is ${expectedDigit}.`
    return {
      verdict: matches ? 'valid' : 'invalid',
      reason: matches ? reason : `${reason} The student answer is ${studentDigit}.`,
      hintTarget: matches
        ? `explain how the ${label} place was located`
        : `locate the ${label} place before naming the digit`,
    }
  }

  const placeValueMatches = digitPlaceValueMatches(prompt.numberText, prompt.targetDigit)
  if (!placeValueMatches) return null

  if (placeValueMatches.length > 1) {
    const placeLabels = placeValueMatches.map((match) => placeValueLabel(match.exponent))
    return {
      verdict: 'unclear',
      reason: `There is more than one ${prompt.targetDigit} in ${prompt.numberText}: one in the ${placeLabels.join(
        ' place and one in the '
      )} place.`,
      hintTarget: `say which ${prompt.targetDigit} you mean by naming its place`,
    }
  }

  if (placeValueMatches.length === 0) {
    return {
      verdict: 'unclear',
      reason: `I do not see a ${prompt.targetDigit} in ${prompt.numberText}.`,
      hintTarget: 'check the digit in the number first',
    }
  }

  const placeValue = placeValueMatches[0]
  const studentValue = parsePlaceValueNumericAnswer(nextStep)
  if (studentValue === null) return null

  const label = placeValueLabel(placeValue.exponent)
  const matches = isNearlyEqual(placeValue.value, studentValue, Math.abs(placeValue.value) < 1 ? 1e-9 : 1e-6)
  const reason = `The ${prompt.targetDigit} in ${prompt.numberText} is in the ${label} place, so its value is ${formatNumber(
    placeValue.value,
    6
  )}.`
  return {
    verdict: matches ? 'valid' : 'invalid',
    reason: matches ? reason : `${reason} The student answer is ${formatNumber(studentValue, 6)}.`,
    hintTarget: matches
      ? `explain why the ${label} place gives that value`
      : "name the digit's place before giving its value",
  }
}

function extractRoundingPlace(text: string) {
  const lower = text.toLowerCase()
  if (/\bthousandths?\b/.test(lower)) return 'thousandths'
  if (/\bhundredths?\b/.test(lower)) return 'hundredths'
  if (/\btenths?\b/.test(lower)) return 'tenths'
  if (/\bthousands?\b/.test(lower)) return 'thousands'
  if (/\bhundreds?\b/.test(lower)) return 'hundreds'
  if (/\btens?\b/.test(lower)) return 'tens'
  if (/\bones?|units?\b/.test(lower)) return 'ones'
  return null
}

function extractRoundedValue(text: string) {
  const match = text.replace(/,/g, '').match(new RegExp(PLAIN_NUMBER_PATTERN))
  return match ? parsePlainNumber(match[0]) : null
}

function checkDecimalRoundingStep(previousStep: string, nextStep: string): MathStepCheckResult | null {
  const combined = `${previousStep} ${nextStep}`
  if (!/\b(round|rounded|nearest)\b/i.test(combined)) return null

  const place = extractRoundingPlace(previousStep)
  const sourceValue = extractRoundedValue(previousStep)
  const studentValue = extractRoundedValue(nextStep)
  if (!place || sourceValue === null || studentValue === null) return null

  try {
    const factor = resolveRoundingFactor(place)
    const rounded = roundPoint(Math.round(sourceValue / factor) * factor, 6)
    const checkedDigit = getRoundingCheckedDigit(sourceValue, factor)
    const roundsUp = checkedDigit >= 5
    const valuesMatch = isNearlyEqual(rounded, studentValue, factor < 1 ? factor / 10 : 1e-6)
    const roundingReason = `Rounding ${formatNumber(sourceValue, 6)} to the nearest ${place} gives ${formatNumber(
      rounded,
      6
    )}. The next digit is ${checkedDigit}, so we ${roundsUp ? 'round up' : 'keep the target place and round down'}.`

    return {
      verdict: valuesMatch ? 'valid' : 'invalid',
      reason: valuesMatch
        ? roundingReason
        : `${roundingReason} The student answer is ${formatNumber(studentValue, 6)}.`,
      hintTarget: valuesMatch
        ? 'explain how the next digit controls the rounding'
        : 'identify the target place and check the next digit',
    }
  } catch {
    return null
  }
}

function evaluateComparableExpression(expression: string): ComparableExpression {
  const unitQuantity = parseUnitQuantity(expression)
  if (unitQuantity) {
    return {
      value: unitQuantity.baseValue,
      kind: 'unit',
      unitQuantity,
    }
  }

  const ratio = parseSimpleRatio(expression)
  if (ratio) {
    return {
      value: ratio.value,
      kind: 'ratio' as const,
    }
  }

  return {
    value: coerceFiniteNumber(safeEvaluate(expression)),
    kind: 'expression' as const,
  }
}

function unitComparisonStatus(
  left: ComparableExpression,
  right: ComparableExpression
): 'compatible' | 'missing_unit' | 'different_measurement' {
  const leftIsUnit = left.kind === 'unit'
  const rightIsUnit = right.kind === 'unit'

  if (!leftIsUnit && !rightIsUnit) return 'compatible'
  if (!leftIsUnit || !rightIsUnit) return 'missing_unit'
  return left.unitQuantity.measurementType === right.unitQuantity.measurementType
    ? 'compatible'
    : 'different_measurement'
}

function hasOnlyXVariableExpression(expression: string) {
  const variableTokens = expression.match(/[A-Za-z]+/g) ?? []
  return variableTokens.length > 0 && variableTokens.every((token) => token.toLowerCase() === 'x')
}

function variableExpressionSuccessHintTarget(features: ReturnType<typeof detectStepFeatures>) {
  if (features.hasDistributivePropertyWork) {
    return 'explain how the distributive property multiplied every term'
  }
  if (features.hasLikeTermsWork) {
    return 'explain how like terms combine by adding coefficients'
  }
  return 'explain why the expression stayed equivalent'
}

function variableExpressionSuccessReason(features: ReturnType<typeof detectStepFeatures>) {
  if (features.hasDistributivePropertyWork) {
    return 'The distributive step stays equivalent because the outside factor is applied to every term.'
  }
  if (features.hasLikeTermsWork) {
    return 'The like-term step stays equivalent because only matching variable terms were combined.'
  }
  return 'The expressions give the same value for the checked x-values.'
}

function variableExpressionInvalidReason(
  features: ReturnType<typeof detectStepFeatures>,
  sample: { x: number; previousValue: number; nextValue: number }
) {
  const sampleReason = `At x = ${formatNumber(sample.x, 4)}, the previous expression equals ${formatNumber(
    sample.previousValue,
    4
  )} but the next expression equals ${formatNumber(sample.nextValue, 4)}.`

  if (features.hasDistributivePropertyWork) {
    return `${sampleReason} The outside factor needs to multiply every term inside the parentheses.`
  }
  if (features.hasLikeTermsWork) {
    return `${sampleReason} Like terms can combine only when the variable part matches, and constants stay separate.`
  }
  return `${sampleReason} The expression value changed.`
}

function checkVariableExpressionStep(
  previousExpression: string,
  nextExpression: string,
  features: ReturnType<typeof detectStepFeatures>
): MathStepCheckResult | null {
  if (!features.hasAlgebraExpressionWork) return null
  if (!hasOnlyXVariableExpression(previousExpression) || !hasOnlyXVariableExpression(nextExpression)) {
    return null
  }

  const samples = [-3, -1, 0, 2, 5]
  const comparisons: { x: number; previousValue: number; nextValue: number }[] = []

  for (const x of samples) {
    try {
      comparisons.push({
        x,
        previousValue: coerceFiniteNumber(safeEvaluate(previousExpression, { x })),
        nextValue: coerceFiniteNumber(safeEvaluate(nextExpression, { x })),
      })
    } catch {
      // Some expressions may be undefined at a sample point. Other samples can still verify the step.
    }
  }

  if (comparisons.length < 3) return null

  const mismatch = comparisons.find(
    (comparison) => !isNearlyEqual(comparison.previousValue, comparison.nextValue, 1e-6)
  )

  if (!mismatch) {
    return {
      verdict: 'valid',
      reason: variableExpressionSuccessReason(features),
      hintTarget: variableExpressionSuccessHintTarget(features),
    }
  }

  return {
    verdict: 'invalid',
    reason: variableExpressionInvalidReason(features, mismatch),
    hintTarget: expressionStepHintTarget(features),
  }
}

function hasAdditionOrSubtractionOperator(expression: string) {
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    if (char === '+') return true
    if (char !== '-') continue

    const previous = expression[index - 1]
    if (
      !previous ||
      previous === '(' ||
      previous === '=' ||
      previous === '+' ||
      previous === '-' ||
      previous === '*' ||
      previous === '/' ||
      previous === '^'
    ) {
      continue
    }
    return true
  }

  return false
}

function hasOrderOfOperationsWork(previousStep: string, nextStep: string) {
  return [previousStep, nextStep].some((step) => {
    const compact = normalizeExpression(step)
    if (!/\d/.test(compact) || /[A-Za-z]/.test(compact)) return false
    if (/[()^]/.test(compact) && /[+\-*/]/.test(compact)) return true
    return hasAdditionOrSubtractionOperator(compact) && /[*\/]/.test(compact)
  })
}

function detectStepFeatures(previousStep: string, nextStep: string) {
  const combined = `${previousStep} ${nextStep}`
  const compactCombined = normalizeExpression(combined)
  return {
    hasTableOfValuesWork:
      /\b(table|values?|rows?|ordered\s+pairs?)\b/i.test(combined) &&
      /\by\s*=/.test(combined),
    hasProbabilityWork: Boolean(extractProbabilitySetup(combined)),
    hasGraphInterceptWork:
      /\b(intercept|root|zero|x-axis|y-axis)\b/i.test(combined) &&
      /\by\s*=/.test(combined),
    hasCoordinateDistanceWork:
      /\bdistance|length\b/i.test(combined) &&
      /\(\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*,\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*\)/.test(combined),
    hasSlopeWork:
      /\b(slope|rate of change|rise|run)\b/i.test(combined) &&
      /\(\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*,\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*\)/.test(combined),
    hasCompositeAreaWork: Boolean(extractCompositeAreaPieces(combined)),
    hasTriangleAreaWork:
      /\b(area|triangle|triangular|base|height|altitude)\b/i.test(combined) &&
      /\b(triangle|triangular)\b/i.test(combined) &&
      extractPlainNumbers(combined).length >= 2,
    hasAngleRelationshipWork:
      /\b(angle|degrees?|complementary|complement|supplementary|supplement|linear\s+pair|straight\s+line)\b/i.test(
        combined
      ) && extractPlainNumbers(combined).length >= 2,
    hasRectangleMeasurementWork:
      /\b(area|perimeter|rectangle|rectangular)\b/i.test(combined) && extractPlainNumbers(combined).length >= 2,
    hasUnitConversionWork: hasKnownUnitQuantity(combined),
    hasMixedNumberWork: hasMixedNumber(previousStep) || hasMixedNumber(nextStep),
    hasFractionWork: /\d+\s*\/\s*\d+/.test(combined),
    hasPercentWork: /%|\bpercent\b/i.test(combined),
    hasPercentErrorWork:
      /%|\bpercent\b/i.test(nextStep) &&
      /\b(percent\s+error|error|actual|accepted|experimental|measured|estimate|estimated|observed)\b/i.test(combined),
    hasPercentChangeWork:
      /%|\bpercent\b/i.test(nextStep) &&
      /\b(percent\s+change|increase|increased|decrease|decreased|from|to|original|new|old)\b/i.test(combined),
    hasPlaceValueDigitWork: Boolean(extractPlaceValueDigitPrompt(previousStep)),
    hasDecimalRoundingWork:
      /\b(round|rounded|nearest)\b/i.test(combined) && /\d+\.\d+/.test(combined) && Boolean(extractRoundingPlace(combined)),
    hasRatioWork: /-?\d+(?:\.\d+)?\s*:\s*-?\d+(?:\.\d+)?/.test(combined),
    hasDecimalWork: /\d+\.\d+/.test(combined),
    hasIntegerSignWork: /(^|[=+\-*/(]\s*)-\d/.test(combined),
    hasOrderOfOperationsWork: hasOrderOfOperationsWork(previousStep, nextStep),
    hasAlgebraExpressionWork: /x/i.test(combined),
    hasDistributivePropertyWork:
      /(?:^|[=+\-*/(]\s*)-?(?:\d+(?:\.\d+)?|\.\d+)?\s*x?\s*\([^)]*[+\-][^)]*\)/i.test(combined),
    hasLikeTermsWork:
      /(?:^|[=+\-*/(])(?:-?(?:\d+(?:\.\d+)?|\.\d+)?)?x(?:[+\-](?:\d+(?:\.\d+)?|\.\d+)?x)+/i.test(
        compactCombined
      ),
  }
}

function hasOrderOfOperationsFocus(features: ReturnType<typeof detectStepFeatures>) {
  return (
    features.hasOrderOfOperationsWork &&
    !features.hasUnitConversionWork &&
    !features.hasMixedNumberWork &&
    !features.hasFractionWork &&
    !features.hasRatioWork &&
    !features.hasAlgebraExpressionWork
  )
}

function expressionStepHintTarget(features: ReturnType<typeof detectStepFeatures>) {
  if (features.hasTableOfValuesWork) {
    return 'substitute each x-value before filling the table row'
  }
  if (features.hasProbabilityWork) {
    return 'put favorable outcomes over total outcomes'
  }
  if (features.hasGraphInterceptWork) {
    return 'use the axis condition for the requested intercept'
  }
  if (features.hasCoordinateDistanceWork) {
    return 'use horizontal and vertical changes before deciding the distance'
  }
  if (features.hasSlopeWork) {
    return 'compare rise over run instead of using only one coordinate change'
  }
  if (features.hasCompositeAreaWork) {
    return 'decompose the shape into rectangles and add each part area'
  }
  if (features.hasTriangleAreaWork) {
    return 'use the triangle area formula and halve the base-times-height product'
  }
  if (features.hasAngleRelationshipWork) {
    return 'use the correct angle-sum relationship before subtracting'
  }
  if (features.hasRectangleMeasurementWork) {
    return 'decide whether the problem asks for square units inside or distance around the boundary'
  }
  if (features.hasUnitConversionWork) {
    return 'use the conversion factor and keep the measurement type the same'
  }
  if (features.hasMixedNumberWork) {
    return 'convert mixed numbers to improper fractions or combine whole and fraction parts carefully'
  }
  if (features.hasFractionWork) {
    return 'recheck the common denominator or fraction operation'
  }
  if (features.hasPercentChangeWork) {
    return 'use the original amount as the percent-change base'
  }
  if (features.hasPercentErrorWork) {
    return 'use the actual value as the percent-error base'
  }
  if (features.hasPercentWork) {
    return 'convert the percent to an equivalent decimal or fraction first'
  }
  if (features.hasPlaceValueDigitWork) {
    return 'locate the named place before deciding the digit value'
  }
  if (features.hasDecimalRoundingWork) {
    return 'identify the target place and check the next digit'
  }
  if (features.hasRatioWork) {
    return 'scale both parts of the ratio by the same factor'
  }
  if (features.hasDecimalWork) {
    return 'line up decimal place values before combining'
  }
  if (hasOrderOfOperationsFocus(features)) {
    return 'evaluate parentheses and multiplication or division before addition or subtraction'
  }
  if (features.hasDistributivePropertyWork) {
    return 'multiply every term inside the parentheses when using the distributive property'
  }
  if (features.hasLikeTermsWork) {
    return 'combine only like terms and keep constants separate'
  }
  if (features.hasAlgebraExpressionWork) {
    return 'compare the expressions with the same x-value'
  }
  if (features.hasIntegerSignWork) {
    return 'recheck the integer signs and direction of the operation'
  }
  return 'compare the value before and after the step'
}

function describeEquationSideChange(previousSide: string, nextSide: string) {
  const change = simplify(`(${nextSide})-(${previousSide})`).toString()
  const normalizedChange = normalizeExpression(change)

  try {
    const numericChange = coerceFiniteNumber(safeEvaluate(normalizedChange))
    if (isNearlyEqual(numericChange, 0)) {
      return {
        changed: false,
        phrase: 'stayed the same',
      }
    }

    return {
      changed: true,
      phrase: `changed by ${numericChange > 0 ? '+' : ''}${formatNumber(numericChange, 4)}`,
    }
  } catch {
    if (normalizedChange === '0') {
      return {
        changed: false,
        phrase: 'stayed the same',
      }
    }

    return {
      changed: true,
      phrase: `changed by ${change}`,
    }
  }
}

function explainLinearEquationMismatch(
  prevLeft: string,
  prevRight: string,
  nextLeft: string,
  nextRight: string
) {
  try {
    const leftChange = describeEquationSideChange(prevLeft, nextLeft)
    const rightChange = describeEquationSideChange(prevRight, nextRight)

    if (leftChange.changed && !rightChange.changed) {
      return `Only the left side changed: it ${leftChange.phrase}, while the right side stayed the same.`
    }

    if (!leftChange.changed && rightChange.changed) {
      return `Only the right side changed: it ${rightChange.phrase}, while the left side stayed the same.`
    }

    if (leftChange.changed && rightChange.changed) {
      return `The two sides changed differently: the left side ${leftChange.phrase}, while the right side ${rightChange.phrase}.`
    }
  } catch {
    // Fall through to the generic equation-balance explanation.
  }

  return 'The next line does not stay equivalent to the previous equation.'
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
  const stepFeatures = detectStepFeatures(previousStep, nextStep)

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

  const graphInterceptStep = checkGraphInterceptStep(previousStep, nextStep)
  if (graphInterceptStep) {
    return graphInterceptStep
  }

  const tableOfValuesStep = checkTableOfValuesStep(previousStep, nextStep)
  if (tableOfValuesStep) {
    return tableOfValuesStep
  }

  const statisticsSummaryStep = checkStatisticsSummaryStep(previousStep, nextStep)
  if (statisticsSummaryStep) {
    return statisticsSummaryStep
  }

  const probabilityModelStep = checkProbabilityModelStep(previousStep, nextStep)
  if (probabilityModelStep) {
    return probabilityModelStep
  }

  const coordinatePointStep = checkCoordinatePointStep(previousStep, nextStep)
  if (coordinatePointStep) {
    return coordinatePointStep
  }

  const slopeStep = checkSlopeStep(previousStep, nextStep)
  if (slopeStep) {
    return slopeStep
  }

  const coordinateDistanceStep = checkCoordinateDistanceStep(previousStep, nextStep)
  if (coordinateDistanceStep) {
    return coordinateDistanceStep
  }

  const angleRelationshipStep = checkAngleRelationshipStep(previousStep, nextStep)
  if (angleRelationshipStep) {
    return angleRelationshipStep
  }

  const compositeAreaStep = checkCompositeAreaStep(previousStep, nextStep)
  if (compositeAreaStep) {
    return compositeAreaStep
  }

  const triangleAreaStep = checkTriangleAreaStep(previousStep, nextStep)
  if (triangleAreaStep) {
    return triangleAreaStep
  }

  const rectangleAreaPerimeterStep = checkRectangleAreaPerimeterStep(previousStep, nextStep)
  if (rectangleAreaPerimeterStep) {
    return rectangleAreaPerimeterStep
  }

  const percentChangeStep = checkPercentChangeStep(previousStep, nextStep)
  if (percentChangeStep) {
    return percentChangeStep
  }

  const percentErrorStep = checkPercentErrorStep(previousStep, nextStep)
  if (percentErrorStep) {
    return percentErrorStep
  }

  const placeValueDigitStep = checkPlaceValueDigitStep(previousStep, nextStep)
  if (placeValueDigitStep) {
    return placeValueDigitStep
  }

  const decimalRoundingStep = checkDecimalRoundingStep(previousStep, nextStep)
  if (decimalRoundingStep) {
    return decimalRoundingStep
  }

  if (!prev.includes('=') && !next.includes('=')) {
    try {
      const prevComparable = evaluateComparableExpression(prev)
      const nextComparable = evaluateComparableExpression(next)
      const unitStatus = unitComparisonStatus(prevComparable, nextComparable)
      if (unitStatus === 'missing_unit') {
        return {
          verdict: 'unclear',
          reason: 'One line includes a unit and the other does not, so the conversion needs clearer units.',
          hintTarget: expressionStepHintTarget(stepFeatures),
        }
      }
      if (unitStatus === 'different_measurement') {
        return {
          verdict: 'invalid',
          reason: 'Those units measure different kinds of quantities, so they cannot be equivalent.',
          hintTarget: expressionStepHintTarget(stepFeatures),
        }
      }

      const prevValue = prevComparable.value
      const nextValue = nextComparable.value
      const valuesMatch = isNearlyEqual(prevValue, nextValue)
      const comparesRatios = prevComparable.kind === 'ratio' || nextComparable.kind === 'ratio'
      const comparesUnits = prevComparable.kind === 'unit' || nextComparable.kind === 'unit'

      return {
        verdict: valuesMatch ? 'valid' : 'invalid',
        reason: valuesMatch
          ? comparesUnits
            ? 'Both measurements are the same amount after converting units.'
            : comparesRatios
            ? `Both ratios have the same quotient, ${formatNumber(prevValue, 4)}.`
            : stepFeatures.hasMixedNumberWork
            ? `Both mixed-number expressions have the same value, ${formatNumber(prevValue, 4)}.`
            : hasOrderOfOperationsFocus(stepFeatures)
            ? `Both expressions have the same value, ${formatNumber(prevValue, 4)}, after following order of operations.`
            : `Both expressions have the same value, ${formatNumber(prevValue, 4)}.`
          : comparesUnits
            ? `The measurement changed after converting units, from ${formatNumber(prevValue, 4)} to ${formatNumber(nextValue, 4)} in base units.`
            : stepFeatures.hasMixedNumberWork
            ? `The mixed-number value changed from ${formatNumber(prevValue, 4)} to ${formatNumber(nextValue, 4)}.`
            : hasOrderOfOperationsFocus(stepFeatures)
            ? `Following order of operations, the previous line equals ${formatNumber(prevValue, 4)}, but the next line equals ${formatNumber(nextValue, 4)}.`
            : `The value changed from ${formatNumber(prevValue, 4)} to ${formatNumber(nextValue, 4)}.`,
        hintTarget: valuesMatch
          ? comparesUnits
            ? 'explain the conversion factor that kept the measurement equivalent'
            : comparesRatios
            ? 'explain the scale factor that kept the ratio equivalent'
            : stepFeatures.hasMixedNumberWork
            ? 'explain how the mixed numbers were converted or combined'
            : hasOrderOfOperationsFocus(stepFeatures)
            ? 'explain which operation was evaluated first'
            : 'explain why the value stayed the same'
          : expressionStepHintTarget(stepFeatures),
      }
    } catch {
      const variableExpressionStep = checkVariableExpressionStep(prev, next, stepFeatures)
      if (variableExpressionStep) {
        return variableExpressionStep
      }

      try {
        const difference = simplify(`(${prev})-(${next})`).toString()
        if (difference === '0') {
          return {
            verdict: 'valid',
            reason: 'The two expressions simplify to the same form.',
            hintTarget: 'explain the rule that preserves the expression value',
          }
        }
      } catch {
        // Fall through to the clearer user-facing message below.
      }

      return {
        verdict: 'unclear',
        reason:
          'This expression step could not be checked reliably. It may need clearer numbers, variables, or grouping.',
        hintTarget: 'rewrite each line with clearer math notation',
      }
    }
  }

  if (!prev.includes('=') || !next.includes('=')) {
    return {
      verdict: 'unclear',
      reason: 'One line is an equation and the other is an expression, so the step needs clearer notation.',
      hintTarget: 'rewrite both lines as expressions or both lines as full equations',
    }
  }

  const [prevLeft, prevRight] = prev.split('=')
  const [nextLeft, nextRight] = next.split('=')

  try {
    const prevLeftComparable = evaluateComparableExpression(prevLeft)
    const prevRightComparable = evaluateComparableExpression(prevRight)
    const nextLeftComparable = evaluateComparableExpression(nextLeft)
    const nextRightComparable = evaluateComparableExpression(nextRight)
    const prevUnitStatus = unitComparisonStatus(prevLeftComparable, prevRightComparable)
    const nextUnitStatus = unitComparisonStatus(nextLeftComparable, nextRightComparable)

    if (prevUnitStatus !== 'compatible' || nextUnitStatus !== 'compatible') {
      return {
        verdict: 'unclear',
        reason: 'A unit equality needs comparable units on both sides before the step can be checked.',
        hintTarget: expressionStepHintTarget(stepFeatures),
      }
    }

    const prevLeftValue = prevLeftComparable.value
    const prevRightValue = prevRightComparable.value
    const nextLeftValue = nextLeftComparable.value
    const nextRightValue = nextRightComparable.value
    const prevIsTrue = isNearlyEqual(prevLeftValue, prevRightValue)
    const nextIsTrue = isNearlyEqual(nextLeftValue, nextRightValue)

    if (prevIsTrue && nextIsTrue) {
      return {
        verdict: 'valid',
        reason: 'Both equality statements are true.',
        hintTarget: 'explain why the two sides stayed equal',
      }
    }

    return {
      verdict: 'invalid',
      reason: prevIsTrue
        ? `The previous equality is true, but the next one compares ${formatNumber(nextLeftValue, 4)} and ${formatNumber(nextRightValue, 4)}.`
        : 'The previous equality is not true, so this step should be rewritten before moving on.',
      hintTarget: expressionStepHintTarget(stepFeatures),
    }
  } catch {
    // Variable equations need algebraic equivalence checks below.
  }

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
    // Try the linear-solution check below before giving up.
  }

  try {
    const prevSolved = mathSolveLinear(prev)
    const nextSolved = mathSolveLinear(next)
    if (
      prevSolved.variable === nextSolved.variable &&
      isNearlyEqual(prevSolved.solution, nextSolved.solution)
    ) {
      return {
        verdict: 'valid',
        reason: `Both equations keep the same solution, ${prevSolved.variable} = ${formatNumber(prevSolved.solution, 4)}.`,
        hintTarget: 'explain which inverse operation preserved the solution',
      }
    }

    return {
      verdict: 'invalid',
      reason: explainLinearEquationMismatch(prevLeft, prevRight, nextLeft, nextRight),
      hintTarget: 'apply the same inverse operation to both sides',
    }
  } catch {
    return {
      verdict: 'unclear',
      reason: 'The equation step could not be checked reliably with the current linear checker.',
      hintTarget: 'rewrite the step with clearer linear algebra',
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
  highlightXValue?: number
  highlightLabel?: string
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
  const highlightXValue = typeof input.highlightXValue === 'number' ? coerceFiniteNumber(input.highlightXValue) : null
  const highlightedRowIndex =
    highlightXValue === null ? -1 : rows.findIndex((row) => isNearlyEqual(row.x, highlightXValue, 0.01))
  const highlightedRow = highlightedRowIndex >= 0 ? rows[highlightedRowIndex] : null
  const highlightLabel =
    highlightedRow
      ? input.highlightLabel?.trim().replace(/\s+/g, ' ').slice(0, 42) ||
        `Check x = ${formatNumber(highlightedRow.x)}`
      : ''

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
      )
    )
    if (index === highlightedRowIndex) {
      actions.push({
        id: createId(),
        type: 'highlight_region',
        x: tableX + 4,
        y: y + 4,
        width: totalWidth - 8,
        height: rowHeight - 8,
        color: 'yellow',
        opacity: 0.2,
        label: highlightLabel,
      })
    }
    actions.push(
      textLabel(tableX + 18, y + 12, formatNumber(row.x), { width: 56, color: 'black' }),
      textLabel(tableX + col1Width + 18, y + 12, formatNumber(row.y), { width: 120, color: 'black' })
    )
  })

  const noteLines = highlightedRow
    ? [
        'Check the highlighted row first.',
        `For x = ${formatNumber(highlightedRow.x)}, y should be ${formatNumber(highlightedRow.y)}.`,
      ]
    : [
        'Use the table to spot a pattern.',
        'Then plot the ordered pairs on the plane.',
      ]

  actions.push(
    ...noteParagraph(sceneX + 316, sceneY + 76, noteLines, {
      width: 176,
      color: 'black',
      lineHeight: 34,
    }),
    focusRegion(sceneX - 24, sceneY - 24, 568, 408)
  )

  return {
    expression,
    rows,
    highlightedRow: highlightedRow ? { x: highlightedRow.x, y: highlightedRow.y, label: highlightLabel } : null,
    summary: highlightedRow
      ? `Built a value table for y = ${expression} and highlighted the x = ${formatNumber(highlightedRow.x)} row.`
      : `Built a value table for y = ${expression}.`,
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
  baseUnits?: number
  heightUnits?: number
  unitLabel?: string
  showTriangleAreaModel?: boolean
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

  if (input.figureType === 'triangle' && input.showTriangleAreaModel) {
    const baseUnits = typeof input.baseUnits === 'number' ? coerceFiniteNumber(input.baseUnits) : null
    const heightUnits = typeof input.heightUnits === 'number' ? coerceFiniteNumber(input.heightUnits) : null
    const unitLabel = input.unitLabel?.trim() || 'unit'

    if (baseUnits && heightUnits && baseUnits > 0 && heightUnits > 0 && baseUnits <= 30 && heightUnits <= 30) {
      const cellSize = Math.min(36, 310 / Math.max(baseUnits, heightUnits))
      const rectWidth = baseUnits * cellSize
      const rectHeight = heightUnits * cellSize
      const x = TOOL_SCENE.x + 110
      const baseY = TOOL_SCENE.y + 400
      const y = baseY - rectHeight
      const rightX = x + rectWidth
      const rectangleArea = baseUnits * heightUnits
      const triangleArea = rectangleArea / 2

      actions.push(
        rectangle(x, y, rectWidth, rectHeight, {
          color: 'light-blue',
          fill: 'semi',
          opacity: 0.12,
          dash: 'dashed',
          size: 's',
          label: 'related rectangle',
        }),
        lineSegment({ x, y: baseY }, { x: rightX, y: baseY }, {
          color: 'orange',
          size: 'm',
          label: `base ${formatNumber(baseUnits)} ${formatUnitLabel(unitLabel, baseUnits)}`,
        }),
        lineSegment({ x, y: baseY }, { x, y }, {
          color: 'green',
          size: 'm',
          label: `height ${formatNumber(heightUnits)} ${formatUnitLabel(unitLabel, heightUnits)}`,
        }),
        lineSegment({ x, y }, { x: rightX, y: baseY }, {
          color: 'blue',
          size: 'm',
          label: 'diagonal splits rectangle',
        }),
        rectangle(x, baseY - 20, 20, 20, {
          color: 'grey',
          fill: 'none',
          dash: 'solid',
          size: 's',
        }),
        point(x, baseY, { label: labels[0] ?? 'A', color: 'blue', labelPosition: 'bottom-left' }),
        point(rightX, baseY, { label: labels[1] ?? 'B', color: 'blue', labelPosition: 'bottom-right' }),
        point(x, y, { label: labels[2] ?? 'C', color: 'blue', labelPosition: 'top-left' }),
        textLabel(x + rectWidth / 2 - 74, baseY + 22, `base = ${formatNumber(baseUnits)}`, {
          width: 150,
          color: 'orange',
        }),
        textLabel(x + 18, y + rectHeight / 2 - 18, `height = ${formatNumber(heightUnits)}`, {
          width: 160,
          color: 'green',
        }),
        rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
          color: 'light-green',
          fill: 'semi',
          opacity: 0.12,
          dash: 'solid',
          size: 's',
        }),
        textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Half-rectangle area', {
          width: NOTE_FRAME.width - 32,
          color: 'green',
        }),
        ...noteParagraph(
          NOTE_FRAME.x + 16,
          NOTE_FRAME.y + 52,
          [
            `Rectangle: ${formatNumber(baseUnits)} x ${formatNumber(heightUnits)} = ${formatNumber(rectangleArea)}`,
            `Triangle: ${formatNumber(rectangleArea)} / 2 = ${formatNumber(triangleArea)} ${formatSquareUnitLabel(unitLabel)}`,
            'The diagonal makes two equal triangle areas.',
          ],
          {
            width: NOTE_FRAME.width - 32,
            color: 'black',
            lineHeight: 32,
          }
        ),
        focusRegion(TOOL_SCENE.x - 80, TOOL_SCENE.y - 70, TOOL_SCENE.width + 160, TOOL_SCENE.height + 140)
      )

      return {
        figureType: 'triangle',
        summary: `Prepared a triangle area model with base ${formatNumber(baseUnits)}, height ${formatNumber(heightUnits)}, and area ${formatNumber(triangleArea)} ${formatSquareUnitLabel(unitLabel)}.`,
        canvasActions: actions,
      }
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
  relationshipType?: 'single' | 'complementary' | 'supplementary' | 'triangle_sum'
  knownAngle?: number
  secondKnownAngle?: number
  missingAngle?: number
}): CanvasActionResult {
  const relationshipType = input.relationshipType ?? 'single'
  if (relationshipType === 'complementary' || relationshipType === 'supplementary') {
    const total = relationshipType === 'complementary' ? 90 : 180
    const knownAngle = clamp(input.knownAngle ?? input.degrees, 0, total)
    const missingAngle = clamp(input.missingAngle ?? total - knownAngle, 0, total)
    const vertex = { x: TOOL_SCENE.x + 332, y: TOOL_SCENE.y + 350 }
    const rayLength = 250
    const arcRadius = 76
    const anglePoint = (angleDegrees: number, length = rayLength) => {
      const radians = (angleDegrees * Math.PI) / 180
      return {
        x: vertex.x + Math.cos(radians) * length,
        y: vertex.y - Math.sin(radians) * length,
      }
    }
    const arcBetween = (startDegrees: number, endDegrees: number, radius: number) => {
      const steps = 16
      return Array.from({ length: steps }, (_, index) => {
        const theta = ((startDegrees + ((endDegrees - startDegrees) * index) / (steps - 1)) * Math.PI) / 180
        return {
          x: vertex.x + Math.cos(theta) * radius,
          y: vertex.y - Math.sin(theta) * radius,
        }
      })
    }
    const labelAt = (startDegrees: number, endDegrees: number, radius: number) => {
      const theta = (((startDegrees + endDegrees) / 2) * Math.PI) / 180
      return {
        x: vertex.x + Math.cos(theta) * radius,
        y: vertex.y - Math.sin(theta) * radius,
      }
    }
    const title =
      input.title?.trim() ||
      (relationshipType === 'complementary' ? 'Complementary angles' : 'Supplementary angles')
    const totalLabel = relationshipType === 'complementary' ? '90 degree total' : '180 degree total'
    const missingLabel = input.label?.trim() || `? = ${formatNumber(missingAngle, 1)} degrees`
    const knownLabel = `${formatNumber(knownAngle, 1)} degrees`
    const knownLabelPoint = labelAt(0, knownAngle, arcRadius + 52)
    const missingLabelPoint = labelAt(knownAngle, total, arcRadius + 78)

    const actions: TutorCanvasAction[] = [
      clearToolLayer(),
      ...buildSceneChrome(title),
      point(vertex.x, vertex.y, { color: 'blue' }),
      textLabel(vertex.x - 20, vertex.y + 14, 'V', {
        width: 32,
        color: 'blue',
      }),
      lineSegment(vertex, anglePoint(0), { color: 'blue', size: 'm', dash: 'solid' }),
      lineSegment(vertex, anglePoint(total), { color: 'blue', size: 'm', dash: 'solid' }),
      lineSegment(vertex, anglePoint(knownAngle), { color: 'orange', size: 'm', dash: 'solid' }),
      polyline(arcBetween(0, knownAngle, arcRadius), { color: 'orange', size: 'm', dash: 'solid' }),
      polyline(arcBetween(knownAngle, total, arcRadius + 24), { color: 'green', size: 'm', dash: 'solid' }),
      textLabel(knownLabelPoint.x - 54, knownLabelPoint.y - 16, knownLabel, {
        width: 130,
        color: 'orange',
      }),
      textLabel(missingLabelPoint.x - 60, missingLabelPoint.y - 16, missingLabel, {
        width: 150,
        color: 'green',
      }),
      rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
        color: 'black',
        dash: 'solid',
        fill: 'semi',
      }),
      textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, totalLabel, {
        width: NOTE_FRAME.width - 32,
        color: 'black',
      }),
      textLabel(
        NOTE_FRAME.x + 16,
        NOTE_FRAME.y + 62,
        `${formatNumber(knownAngle, 1)} degrees + ${formatNumber(missingAngle, 1)} degrees = ${total} degrees`,
        {
          width: NOTE_FRAME.width - 32,
          color: 'black',
        }
      ),
      textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 124, `Missing: ${total} - ${formatNumber(knownAngle, 1)}`, {
        width: NOTE_FRAME.width - 32,
        color: 'green',
      }),
    ]

    if (relationshipType === 'complementary') {
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
      summary: `Prepared a ${relationshipType} angle relationship diagram with a ${formatNumber(
        knownAngle,
        1
      )} degree known angle and ${formatNumber(missingAngle, 1)} degree missing angle.`,
      canvasActions: actions,
    }
  }

  if (relationshipType === 'triangle_sum') {
    const firstAngle = clamp(input.knownAngle ?? 0, 0, 180)
    const secondAngle = clamp(input.secondKnownAngle ?? 0, 0, 180)
    const missingAngle = clamp(input.missingAngle ?? 180 - firstAngle - secondAngle, 0, 180)
    const a = { x: TOOL_SCENE.x + 152, y: TOOL_SCENE.y + 376 }
    const b = { x: TOOL_SCENE.x + 610, y: TOOL_SCENE.y + 376 }
    const c = { x: TOOL_SCENE.x + 382, y: TOOL_SCENE.y + 128 }
    const vertexArc = (center: { x: number; y: number }, startDegrees: number, endDegrees: number, radius: number) => {
      const steps = 12
      return Array.from({ length: steps }, (_, index) => {
        const theta = ((startDegrees + ((endDegrees - startDegrees) * index) / (steps - 1)) * Math.PI) / 180
        return {
          x: center.x + Math.cos(theta) * radius,
          y: center.y - Math.sin(theta) * radius,
        }
      })
    }
    const actions: TutorCanvasAction[] = [
      clearToolLayer(),
      ...buildSceneChrome(input.title?.trim() || 'Triangle angle sum'),
      lineSegment(a, b, { color: 'blue', size: 'm', dash: 'solid' }),
      lineSegment(b, c, { color: 'blue', size: 'm', dash: 'solid' }),
      lineSegment(c, a, { color: 'blue', size: 'm', dash: 'solid' }),
      point(a.x, a.y, { label: 'A', color: 'blue' }),
      point(b.x, b.y, { label: 'B', color: 'blue' }),
      point(c.x, c.y, { label: 'C', color: 'blue' }),
      polyline(vertexArc(a, 0, 46, 48), { color: 'orange', size: 'm', dash: 'solid' }),
      polyline(vertexArc(b, 134, 180, 48), { color: 'orange', size: 'm', dash: 'solid' }),
      polyline(vertexArc(c, 235, 305, 48), { color: 'green', size: 'm', dash: 'solid' }),
      textLabel(a.x + 34, a.y - 44, `${formatNumber(firstAngle, 1)} degrees`, {
        width: 116,
        color: 'orange',
      }),
      textLabel(b.x - 146, b.y - 44, `${formatNumber(secondAngle, 1)} degrees`, {
        width: 116,
        color: 'orange',
      }),
      textLabel(c.x - 58, c.y + 54, `? = ${formatNumber(missingAngle, 1)} degrees`, {
        width: 150,
        color: 'green',
      }),
      rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
        color: 'black',
        dash: 'solid',
        fill: 'semi',
      }),
      textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Triangle angles total 180 degrees', {
        width: NOTE_FRAME.width - 32,
        color: 'black',
      }),
      textLabel(
        NOTE_FRAME.x + 16,
        NOTE_FRAME.y + 68,
        `${formatNumber(firstAngle, 1)} + ${formatNumber(secondAngle, 1)} + ? = 180`,
        {
          width: NOTE_FRAME.width - 32,
          color: 'black',
        }
      ),
      textLabel(
        NOTE_FRAME.x + 16,
        NOTE_FRAME.y + 122,
        `? = 180 - (${formatNumber(firstAngle, 1)} + ${formatNumber(secondAngle, 1)})`,
        {
          width: NOTE_FRAME.width - 32,
          color: 'green',
        }
      ),
      textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 184, 'Diagram is labeled for the relationship.', {
        width: NOTE_FRAME.width - 32,
        color: 'grey',
      }),
      focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
    ]

    return {
      summary: `Prepared a triangle angle-sum diagram with known angles ${formatNumber(
        firstAngle,
        1
      )} and ${formatNumber(secondAngle, 1)}, and missing angle ${formatNumber(missingAngle, 1)} degrees.`,
      canvasActions: actions,
    }
  }

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
  highlightColumn?: string
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
  const normalizedHighlightColumn = input.highlightColumn?.trim().toLowerCase().replace(/\s+/g, ' ')
  const highlightColumnIndex = normalizedHighlightColumn
    ? columns.findIndex((column) => column.toLowerCase().replace(/\s+/g, ' ') === normalizedHighlightColumn)
    : -1

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

  if (highlightColumnIndex >= 0) {
    const highlightX = x + rowHeaderWidth + columnWidth * highlightColumnIndex
    actions.push({
      id: createId(),
      type: 'highlight_region',
      x: highlightX + 3,
      y: y + 3,
      width: columnWidth - 6,
      height: tableHeight - 6,
      color: 'yellow',
      opacity: 0.2,
    })
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

  if (highlightColumnIndex >= 0) {
    const highlightX = x + rowHeaderWidth + columnWidth * highlightColumnIndex
    const highlightLabel = columns[highlightColumnIndex]
    actions.push(
      textLabel(highlightX + 8, y + tableHeight + 14, `Focus: ${highlightLabel} place`, {
        width: Math.max(140, columnWidth + 48),
        color: 'orange',
      })
    )
  }

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

export function integerOperationScene(input: {
  left: number
  right: number
  operation: 'add' | 'subtract'
  title?: string
}): IntegerOperationResult {
  const left = Math.trunc(coerceFiniteNumber(input.left))
  const right = Math.trunc(coerceFiniteNumber(input.right))
  if (Math.abs(left) > 50 || Math.abs(right) > 50) {
    throw new Error('Integer operation model supports values from -50 to 50.')
  }

  const signedChange = input.operation === 'subtract' ? -right : right
  const result = left + signedChange
  const expression = `${left} ${input.operation === 'subtract' ? '-' : '+'} ${right} = ${result}`
  const minValue = Math.min(0, left, result, left + signedChange) - 2
  const maxValue = Math.max(0, left, result, left + signedChange) + 2
  const numberLine = numberLineScene({
    start: minValue,
    end: maxValue,
    highlightValues: [left, result, 0],
    hopPairs: [
      {
        from: left,
        to: result,
        label: signedChange >= 0 ? `+${signedChange}` : `${signedChange}`,
      },
    ],
    title: input.title?.trim() || 'Integer operation',
  })
  const positiveChipsBeforeCancel = [left, signedChange].filter((value) => value > 0).reduce((sum, value) => sum + value, 0)
  const negativeChipsBeforeCancel = [left, signedChange].filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0)
  const zeroPairs = Math.min(positiveChipsBeforeCancel, negativeChipsBeforeCancel)

  numberLine.canvasActions.splice(
    -1,
    0,
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, expression, {
      width: NOTE_FRAME.width - 32,
      color: result < 0 ? 'red' : 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        `Start at ${left}.`,
        input.operation === 'subtract'
          ? `Subtracting ${right} means move ${formatNumber(Math.abs(signedChange))} ${signedChange >= 0 ? 'right' : 'left'}.`
          : `Adding ${right} means move ${formatNumber(Math.abs(signedChange))} ${signedChange >= 0 ? 'right' : 'left'}.`,
        `Land on ${result}.`,
      ],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    )
  )

  return {
    expression,
    left,
    right,
    operation: input.operation,
    signedChange,
    result,
    steps: [
      `Start at ${left}.`,
      input.operation === 'subtract'
        ? `Change subtraction into adding the opposite: ${left} + ${signedChange}.`
        : `Add the signed change: ${left} + ${signedChange}.`,
      `Move ${Math.abs(signedChange)} step${Math.abs(signedChange) === 1 ? '' : 's'} ${signedChange >= 0 ? 'right' : 'left'}.`,
      `The result is ${result}.`,
    ],
    chipModel: {
      positiveChipsBeforeCancel,
      negativeChipsBeforeCancel,
      zeroPairs,
    },
    suggestedQuestion: 'Which direction did the signed change move us, and why?',
    canvasActions: numberLine.canvasActions,
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

export function fractionSimplify(input: {
  numerator: number
  denominator: number
}): FractionSimplifyResult {
  const numerator = Math.trunc(coerceFiniteNumber(input.numerator))
  const denominator = Math.trunc(coerceFiniteNumber(input.denominator))
  if (denominator === 0) {
    throw new Error('A fraction denominator cannot be 0.')
  }

  const sign = denominator < 0 ? -1 : 1
  const normalizedNumerator = numerator * sign
  const normalizedDenominator = Math.abs(denominator)
  const simplified = simplifyFractionParts(normalizedNumerator, normalizedDenominator)
  const whole = Math.trunc(simplified.numerator / simplified.denominator)
  const remainder = Math.abs(simplified.numerator % simplified.denominator)
  const mixedNumber =
    Math.abs(simplified.numerator) > simplified.denominator && remainder > 0
      ? `${whole} ${remainder}/${simplified.denominator}`
      : null

  return {
    original: formatFraction(normalizedNumerator, normalizedDenominator),
    simplified: formatFraction(simplified.numerator, simplified.denominator),
    decimal: roundPoint(normalizedNumerator / normalizedDenominator, 6),
    mixedNumber,
    explanation:
      'Divide the numerator and denominator by their greatest common factor so the fraction keeps the same value.',
    suggestedQuestion: 'What common factor can divide both the numerator and denominator?',
  }
}

export function percentOfNumber(input: {
  percent: number
  whole: number
}): PercentOfNumberResult {
  const percent = coerceFiniteNumber(input.percent)
  const whole = coerceFiniteNumber(input.whole)
  const part = (percent / 100) * whole
  const percentText = String(percent)
  const decimalPlaces = percentText.includes('.') ? percentText.split('.')[1]?.length ?? 0 : 0
  const scale = 10 ** Math.min(decimalPlaces, 6)
  const simplifiedPercentFraction = simplifyFractionParts(Math.round(percent * scale), 100 * scale)

  return {
    percent,
    whole,
    part: roundPoint(part, 6),
    equation: `${formatNumber(percent)}% of ${formatNumber(whole)} = ${formatNumber(part, 4)}`,
    fractionForm: formatFraction(simplifiedPercentFraction.numerator, simplifiedPercentFraction.denominator),
    suggestedTool: 'percent_bar',
    suggestedQuestion: `What does ${formatNumber(percent)}% mean out of 100?`,
  }
}

export function unitRate(input: {
  quantity: number
  value: number
  quantityLabel?: string
  valueLabel?: string
}): UnitRateResult {
  const quantity = coerceFiniteNumber(input.quantity)
  const value = coerceFiniteNumber(input.value)
  if (isNearlyEqual(quantity, 0)) {
    throw new Error('Unit rate needs a nonzero quantity.')
  }

  const quantityLabel = input.quantityLabel?.trim() || 'unit'
  const valueLabel = input.valueLabel?.trim() || 'value'
  const ratePerOne = value / quantity

  return {
    quantity,
    value,
    ratePerOne: roundPoint(ratePerOne, 6),
    rateLabel: `${formatNumber(ratePerOne, 4)} ${formatUnitLabel(valueLabel, ratePerOne)} per ${quantityLabel}`,
    equation: `${formatNumber(value, 4)} ÷ ${formatNumber(quantity, 4)} = ${formatNumber(ratePerOne, 4)}`,
    suggestedTool: 'double_number_line',
    suggestedQuestion: `If ${formatNumber(quantity)} ${formatUnitLabel(quantityLabel, quantity)} match ${formatNumber(value)} ${formatUnitLabel(valueLabel, value)}, what matches 1 ${quantityLabel}?`,
  }
}

export function decimalCompare(input: {
  left: number
  right: number
}): DecimalCompareResult {
  const left = coerceFiniteNumber(input.left)
  const right = coerceFiniteNumber(input.right)
  const comparison = isNearlyEqual(left, right)
    ? 'equal'
    : left > right
      ? 'left_greater'
      : 'right_greater'
  const leftText = String(left)
  const rightText = String(right)
  const maxDecimalPlaces = Math.max(
    leftText.includes('.') ? leftText.split('.')[1]?.length ?? 0 : 0,
    rightText.includes('.') ? rightText.split('.')[1]?.length ?? 0 : 0
  )

  return {
    left,
    right,
    comparison,
    explanation:
      comparison === 'equal'
        ? `${formatNumber(left)} and ${formatNumber(right)} have the same value when place values are aligned.`
        : `Align the decimals to ${maxDecimalPlaces} place${maxDecimalPlaces === 1 ? '' : 's'}, then compare from left to right.`,
    suggestedTool: maxDecimalPlaces <= 2 ? 'decimal_grid' : 'place_value_chart',
    suggestedQuestion: 'What place value should we compare first?',
  }
}

function resolveRoundingFactor(place: string) {
  const normalized = place.trim().toLowerCase().replace(/[\s_-]+/g, '')
  const factors: Record<string, number> = {
    ten: 10,
    tens: 10,
    hundred: 100,
    hundreds: 100,
    thousand: 1000,
    thousands: 1000,
    tenth: 0.1,
    tenths: 0.1,
    hundredth: 0.01,
    hundredths: 0.01,
    thousandth: 0.001,
    thousandths: 0.001,
    one: 1,
    ones: 1,
    unit: 1,
    units: 1,
  }
  const factor = factors[normalized]
  if (!factor) {
    throw new Error('Unsupported rounding place. Use ones, tens, hundreds, thousands, tenths, hundredths, or thousandths.')
  }
  return factor
}

function getRoundingCheckedDigit(value: number, factor: number) {
  if (factor >= 1) {
    return Math.abs(Math.trunc(value / (factor / 10))) % 10
  }
  const reciprocal = Math.round(1 / factor)
  return Math.abs(Math.trunc(value * reciprocal * 10)) % 10
}

export function roundNumber(input: {
  value: number
  place: string
}): RoundNumberResult {
  const value = coerceFiniteNumber(input.value)
  const factor = resolveRoundingFactor(input.place)
  const rounded =
    factor >= 1
      ? Math.round(value / factor) * factor
      : Math.round(value / factor) * factor
  const checkedDigit = getRoundingCheckedDigit(value, factor)
  const direction = Math.abs(rounded) > Math.abs(value) ? 'up' : 'down'

  return {
    value,
    place: input.place.trim(),
    rounded: roundPoint(rounded, 6),
    checkedDigit,
    direction,
    explanation:
      checkedDigit >= 5
        ? `The next digit is ${checkedDigit}, so we round up.`
        : `The next digit is ${checkedDigit}, so we keep the target place and round down.`,
    suggestedTool: factor >= 1 ? 'number_line' : 'place_value_chart',
  }
}

export function commonDenominator(input: {
  leftNumerator: number
  leftDenominator: number
  rightNumerator: number
  rightDenominator: number
  purpose?: 'compare' | 'add_subtract'
}): CommonDenominatorResult {
  const leftNumerator = Math.trunc(coerceFiniteNumber(input.leftNumerator))
  const leftDenominator = Math.trunc(coerceFiniteNumber(input.leftDenominator))
  const rightNumerator = Math.trunc(coerceFiniteNumber(input.rightNumerator))
  const rightDenominator = Math.trunc(coerceFiniteNumber(input.rightDenominator))
  if (leftDenominator === 0 || rightDenominator === 0) {
    throw new Error('Fraction denominators cannot be 0.')
  }

  const commonDenominator = leastCommonMultiple(Math.abs(leftDenominator), Math.abs(rightDenominator))
  const leftScale = commonDenominator / Math.abs(leftDenominator)
  const rightScale = commonDenominator / Math.abs(rightDenominator)
  const normalizedLeftNumerator = leftDenominator < 0 ? -leftNumerator : leftNumerator
  const normalizedRightNumerator = rightDenominator < 0 ? -rightNumerator : rightNumerator

  return {
    left: formatFraction(normalizedLeftNumerator, Math.abs(leftDenominator)),
    right: formatFraction(normalizedRightNumerator, Math.abs(rightDenominator)),
    commonDenominator,
    leftEquivalent: formatFraction(normalizedLeftNumerator * leftScale, commonDenominator),
    rightEquivalent: formatFraction(normalizedRightNumerator * rightScale, commonDenominator),
    explanation: `Use ${commonDenominator} because it is a common multiple of both denominators.`,
    suggestedTool: input.purpose === 'compare' ? 'fraction_compare' : 'fraction_operation',
    suggestedQuestion: 'What did we multiply each denominator by, and did the numerator get the same multiplier?',
  }
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

function classifyMistakePattern(input: {
  topic: CurriculumTopic
  studentWork: string
  studentExplanation: string
  expectedAnswer?: string
}): Pick<
  MistakePatternClassifierResult,
  'primaryPattern' | 'severity' | 'evidence' | 'likelyCause' | 'firstTutorMove' | 'diagnosticQuestion' | 'boardMove'
> {
  const text = `${input.studentWork} ${input.studentExplanation}`.toLowerCase()
  const evidence: string[] = []

  if (/\b(just answer|just tell|idk|don't know|do not know|guess)\b/.test(text) || input.studentExplanation.trim().length < 12) {
    return {
      primaryPattern: 'answer_without_reasoning',
      severity: 'watch',
      evidence: ['Little or no reasoning explanation was provided.'],
      likelyCause: 'The student may be trying to finish before making the reasoning visible.',
      firstTutorMove: 'Ask for one sentence explaining the chosen operation or comparison.',
      diagnosticQuestion: 'What did you do first, and why did that step make sense?',
      boardMove: 'Write "first step" and leave space for the student explanation.',
    }
  }

  if (
    input.topic === 'fractions' &&
    /\d+\s*\/\s*\d+\s*[+\-]\s*\d+\s*\/\s*\d+/.test(text) &&
    /\/\s*\d+\s*[+\-]\s*\d+/.test(text)
  ) {
    evidence.push('Fraction operation appears to combine denominators directly.')
    return {
      primaryPattern: 'denominator_operation',
      severity: 'blocker',
      evidence,
      likelyCause: 'The student may not yet see that denominators name the size of the parts.',
      firstTutorMove: 'Return to equal-sized parts before any arithmetic correction.',
      diagnosticQuestion: 'If thirds and fourths are different-sized pieces, what common-sized piece could both use?',
      boardMove: 'Draw or use a fraction operation model with a common denominator.',
    }
  }

  if (input.topic === 'decimals_percents' && /\b0\.\d+\b.*\b0\.\d+\b/.test(text) && /\b(longer|more digits|bigger digits)\b/.test(text)) {
    evidence.push('Decimal comparison refers to digit length instead of place value.')
    return {
      primaryPattern: 'decimal_place_value',
      severity: 'reteach',
      evidence,
      likelyCause: 'The student may be reading decimal digits like whole-number digits.',
      firstTutorMove: 'Line up tenths and hundredths before comparing.',
      diagnosticQuestion: 'What is each number in hundredths?',
      boardMove: 'Use a place value chart or decimal grid.',
    }
  }

  if (input.topic === 'decimals_percents' && /%|percent/.test(text) && !/\bwhole|total|100|hundred\b/.test(text)) {
    evidence.push('Percent work does not identify the whole.')
    return {
      primaryPattern: 'percent_whole',
      severity: 'reteach',
      evidence,
      likelyCause: 'The student may be treating percent as a standalone number instead of part per 100 of a whole.',
      firstTutorMove: 'Ask the student to name the whole before calculating.',
      diagnosticQuestion: 'What is 100% in this problem?',
      boardMove: 'Use a percent bar with part, whole, and percent labeled.',
    }
  }

  if (/\bnegative|minus|subtract|opposite\b|-\d/.test(text) && /\b(right|left|direction|sign)\b/.test(text)) {
    evidence.push('Signed-number language appears in the work.')
    return {
      primaryPattern: 'sign_direction',
      severity: 'reteach',
      evidence,
      likelyCause: 'The student may be unsure how the sign controls movement or inverse operations.',
      firstTutorMove: 'Make the signed change visible before simplifying.',
      diagnosticQuestion: 'Does this signed change move us left or right, and how far?',
      boardMove: 'Use integer_operation_scene or integer chips.',
    }
  }

  if (input.topic === 'expressions_equations' && (/=\s*.*=/.test(text) || /\bboth sides\b/.test(text) === false && /\bx\b.*=/.test(text))) {
    evidence.push('Equation work may not preserve the balance idea.')
    return {
      primaryPattern: 'equality_balance',
      severity: 'blocker',
      evidence,
      likelyCause: 'The student may be doing operations to expressions without tracking equality.',
      firstTutorMove: 'Ask what operation keeps both sides equal.',
      diagnosticQuestion: 'What did you do to both sides from one line to the next?',
      boardMove: 'Use an equation balance model or side-by-side step check.',
    }
  }

  if (input.topic === 'ratios_rates' && /\b(add|plus|more)\b/.test(text) && !/\bscale|times|multiply|per one|unit\b/.test(text)) {
    evidence.push('Ratio work uses additive language without scale or unit-rate language.')
    return {
      primaryPattern: 'unit_rate_scaling',
      severity: 'reteach',
      evidence,
      likelyCause: 'The student may be adding instead of scaling both quantities together.',
      firstTutorMove: 'Anchor the relationship with a unit rate or scale factor.',
      diagnosticQuestion: 'What happens to both quantities when one quantity doubles?',
      boardMove: 'Use a ratio table or double number line.',
    }
  }

  if (input.topic === 'geometry_measurement' && /area/.test(text) && /perimeter/.test(text)) {
    evidence.push('Area and perimeter both appear in the same explanation.')
    return {
      primaryPattern: 'area_perimeter_mixup',
      severity: 'reteach',
      evidence,
      likelyCause: 'The student may be mixing square-unit counting with boundary length.',
      firstTutorMove: 'Name the measured quantity before choosing a formula.',
      diagnosticQuestion: 'Are we counting inside squares or the distance around the outside?',
      boardMove: 'Use an area and perimeter model with units labeled.',
    }
  }

  if (input.topic === 'coordinate_graphing' && /\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(text) && /\by\b.*first|up.*then.*across/.test(text)) {
    evidence.push('Coordinate explanation may reverse x and y.')
    return {
      primaryPattern: 'coordinate_order',
      severity: 'reteach',
      evidence,
      likelyCause: 'The student may not be anchoring ordered pairs as x first, then y.',
      firstTutorMove: 'Ask the student to say what x controls before plotting y.',
      diagnosticQuestion: 'Which coordinate tells us the horizontal move?',
      boardMove: 'Plot the point on a coordinate plane and label x before y.',
    }
  }

  if (input.topic === 'data_probability' && /probability|chance/.test(text) && !/\btotal|out of|all outcomes\b/.test(text)) {
    evidence.push('Probability explanation does not name total outcomes.')
    return {
      primaryPattern: 'probability_denominator',
      severity: 'reteach',
      evidence,
      likelyCause: 'The student may be counting favorable outcomes but not the full sample space.',
      firstTutorMove: 'Ask for favorable outcomes and total outcomes separately.',
      diagnosticQuestion: 'Out of all possible outcomes, how many are favorable?',
      boardMove: 'Use a probability model with favorable and total outcomes.',
    }
  }

  if (/\bwrong|mistake|check|not correct\b/.test(text) && input.expectedAnswer) {
    evidence.push('Student is checking against an expected answer.')
    return {
      primaryPattern: 'arithmetic_slip',
      severity: 'watch',
      evidence,
      likelyCause: 'The concept may be close, but one arithmetic or copy step needs checking.',
      firstTutorMove: 'Check only one transition between two lines.',
      diagnosticQuestion: 'Which step changed the value, and can we verify that calculation?',
      boardMove: 'Use math_check_step or put the two lines side by side.',
    }
  }

  return {
    primaryPattern: 'unclear',
    severity: 'watch',
    evidence: ['No specific mistake pattern was confidently detected.'],
    likelyCause: 'The student work may be incomplete or the issue may need one diagnostic question.',
    firstTutorMove: CURRICULUM_GUIDE[input.topic].nextMove,
    diagnosticQuestion: 'Can you explain the step where you felt least sure?',
    boardMove: `Use ${CURRICULUM_GUIDE[input.topic].tools[0]} if the explanation stays unclear.`,
  }
}

export function mistakePatternClassifier(input: {
  topic: string
  studentWork: string
  studentExplanation: string
  expectedAnswer?: string
}): MistakePatternClassifierResult {
  const topic = resolveCurriculumTopic(input.topic)
  const guide = CURRICULUM_GUIDE[topic]
  const classified = classifyMistakePattern({
    topic,
    studentWork: input.studentWork.trim(),
    studentExplanation: input.studentExplanation.trim(),
    expectedAnswer: input.expectedAnswer?.trim(),
  })

  const toolMap: Record<MistakePatternClassifierResult['primaryPattern'], string[]> = {
    denominator_operation: ['fraction_operation', 'common_denominator', 'hint_ladder'],
    decimal_place_value: ['place_value_chart', 'decimal_grid', 'hint_ladder'],
    percent_whole: ['percent_bar', 'percent_of_number', 'hint_ladder'],
    sign_direction: ['integer_operation_scene', 'number_line', 'integer_chips'],
    equality_balance: ['equation_balance', 'math_check_step', 'solve_linear_on_canvas'],
    unit_rate_scaling: ['ratio_table', 'double_number_line', 'unit_rate'],
    area_perimeter_mixup: ['area_perimeter_model', 'composite_area_model', 'hint_ladder'],
    coordinate_order: ['plot_points_on_plane', 'coordinate_distance', 'slope_triangle'],
    probability_denominator: ['probability_model', 'data_display', 'hint_ladder'],
    answer_without_reasoning: ['socratic_move_planner', 'write_on_canvas', 'hint_ladder'],
    setup_unknown: ['word_problem_plan', 'bar_model', 'socratic_move_planner'],
    arithmetic_slip: ['math_check_step', 'math_calculate', 'next_step_coach'],
    unclear: [guide.tools[0], 'socratic_move_planner', 'next_step_coach'],
  }

  return {
    topic,
    label: guide.label,
    ...classified,
    recommendedTools: toolMap[classified.primaryPattern].slice(0, 3),
    avoid: [
      'Do not call the student wrong before naming the reasoning pattern.',
      'Do not fix more than one step at a time.',
      'Do not reveal the full solution unless the student has already tried and asks for it.',
    ],
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

function extractUnitsOrLabels(problemText: string) {
  const matches = [...problemText.matchAll(/-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s*([a-zA-Z][a-zA-Z-]*)/g)]
    .map((match) => match[1].toLowerCase())
    .filter((unit) => !['x', 'y'].includes(unit))
  const labelWords = problemText
    .toLowerCase()
    .match(/\b(cups?|muffins?|notebooks?|dollars?|meters?|centimeters?|students?|groups?|minutes?|hours?|miles?|books?|tiles?|squares?|outcomes?)\b/g)
  return [...new Set([...(labelWords ?? []), ...matches])].slice(0, 8)
}

export function problemUnderstandingMap(input: {
  problemText: string
  gradeLevel?: string
  studentWork?: string
}): ProblemUnderstandingMapResult {
  const problemText = input.problemText.trim().replace(/\s+/g, ' ')
  if (!problemText) {
    throw new Error('problem_understanding_map needs the problem text.')
  }

  const topic = inferWordProblemTopic(problemText)
  const guide = CURRICULUM_GUIDE[topic]
  const knownQuantities = extractWordProblemQuantities(problemText)
  const likelyUnknown = extractWordProblemQuestion(problemText)
  const unitsOrLabels = extractUnitsOrLabels(problemText)
  const visualModel = chooseVisualModel(topic, problemText)
  const missingInformation: string[] = []

  if (knownQuantities.length === 0) missingInformation.push('No clear quantities were detected.')
  if (!/\?/.test(problemText)) missingInformation.push('The exact question may need to be restated.')
  if (topic === 'ratios_rates' && unitsOrLabels.length < 2) {
    missingInformation.push('The two related units or labels are not both clear yet.')
  }
  if (topic === 'fractions' && !/\bwhole|total|all together|altogether\b/i.test(problemText)) {
    missingInformation.push('The whole may need to be named before using fractions.')
  }

  return {
    topic,
    label: guide.label,
    gradeLevel: input.gradeLevel?.trim() || 'grades 3 to 7',
    knownQuantities,
    likelyUnknown,
    unitsOrLabels,
    missingInformation,
    representationCandidates: [visualModel, ...guide.tools.filter((toolName) => toolName !== visualModel)].slice(0, 3),
    firstTutorQuestion:
      knownQuantities.length > 0
        ? `Which quantity are we trying to find: ${likelyUnknown}`
        : 'What numbers or measurements does the problem give us?',
    studentRestatementFrame:
      'We know ___. We need to find ___. The relationship is ___.',
    avoid: [
      'Do not calculate before the student names the unknown.',
      'Do not introduce a formula until the relationship is clear.',
      'Do not rewrite the whole problem aloud if one sentence is enough.',
    ],
  }
}

function normalizeRepresentation(value: string): RepresentationBridgeResult['fromRepresentation'] {
  const normalized = value.trim().toLowerCase()
  if (/word|verbal|story|sentence/.test(normalized)) return 'words'
  if (/visual|model|diagram|bar|number line|chips|picture/.test(normalized)) return 'visual'
  if (/table|chart|ratio table|values/.test(normalized)) return 'table'
  if (/equation|expression|formula|symbol/.test(normalized)) return 'equation'
  if (/graph|coordinate|plot|axis/.test(normalized)) return 'graph'
  return 'numeric'
}

export function representationBridge(input: {
  topic: string
  problemContext: string
  fromRepresentation: string
  toRepresentation: string
  studentWork?: string
}): RepresentationBridgeResult {
  const topic = resolveCurriculumTopic(input.topic || input.problemContext || input.studentWork || '')
  const guide = CURRICULUM_GUIDE[topic]
  const fromRepresentation = normalizeRepresentation(input.fromRepresentation)
  const toRepresentation = normalizeRepresentation(input.toRepresentation)
  const toolByTarget: Record<RepresentationBridgeResult['toRepresentation'], string> = {
    words: 'write_on_canvas',
    visual: guide.tools[0],
    table: topic === 'ratios_rates' ? 'ratio_table' : topic === 'coordinate_graphing' ? 'table_of_values' : 'write_on_canvas',
    equation: topic === 'expressions_equations' ? 'equation_balance' : 'write_on_canvas',
    graph: topic === 'coordinate_graphing' ? 'graph_function' : 'plot_points_on_plane',
    numeric: topic === 'fractions' ? 'fraction_simplify' : 'math_calculate',
  }
  const problemContext = input.problemContext.trim()

  return {
    topic,
    label: guide.label,
    fromRepresentation,
    toRepresentation,
    bridgeGoal: `Connect the ${fromRepresentation} form to the ${toRepresentation} form without changing the relationship.`,
    recommendedTool: toolByTarget[toRepresentation],
    translationSteps: [
      `Name what each part of the ${fromRepresentation} form represents.`,
      `Choose the matching part in the ${toRepresentation} form.`,
      'Check that the quantities, units, or relationships still mean the same thing.',
    ],
    bridgeQuestion:
      toRepresentation === 'equation'
        ? 'What quantity should the variable represent?'
        : toRepresentation === 'table'
          ? 'What should each row or column stand for?'
          : toRepresentation === 'graph'
            ? 'What does x represent, and what does y represent?'
            : 'Which part of the new representation matches the original problem?',
    misconceptionWatch: guide.misconceptions.slice(0, 2),
    boardNote: problemContext
      ? `Keep this meaning: ${problemContext.slice(0, 120)}`
      : `Keep the ${guide.label.toLowerCase()} relationship unchanged.`,
  }
}

export function workedExampleFader(input: {
  topic: string
  gradeLevel?: string
  exampleProblem: string
  studentWork?: string
}): WorkedExampleFaderResult {
  const topic = resolveCurriculumTopic(input.topic || input.exampleProblem || input.studentWork || '')
  const guide = CURRICULUM_GUIDE[topic]
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const recommendedTool =
    topic === 'expressions_equations'
      ? 'solve_linear_on_canvas'
      : topic === 'coordinate_graphing'
        ? 'table_of_values'
        : guide.tools[0]
  const problem = input.exampleProblem.trim() || `a ${guide.label.toLowerCase()} problem`

  return {
    topic,
    label: guide.label,
    gradeLevel,
    recommendedTool,
    phases: [
      {
        phase: 'i_do',
        tutorMove: `Model only the setup for: ${problem.slice(0, 120)}`,
        studentTask: 'Listen for the meaning of the first step, not the final answer.',
        revealLevel: 'full_model',
      },
      {
        phase: 'we_do',
        tutorMove: 'Leave the next step partially blank and ask the student to choose the move.',
        studentTask: 'Fill in the missing operation, unit, comparison, or model label.',
        revealLevel: 'partial',
      },
      {
        phase: 'you_do',
        tutorMove: 'Give a nearby problem with the same structure but changed numbers.',
        studentTask: 'Explain the first step before calculating.',
        revealLevel: 'student_owned',
      },
    ],
    fadedBoardLines: [
      'I do: show the setup and name why it works.',
      'We do: hide one key step and let the student supply it.',
      'You do: change the numbers and have the student start.',
    ],
    checkForUnderstanding: 'What part stayed the same when the numbers changed?',
    stopRule: 'Stop fading if the student cannot explain the first hidden step. Return to a visual model instead of giving the answer.',
    avoid: [
      'Do not model every step before the student participates.',
      'Do not use a harder you-do problem until the we-do step is secure.',
      'Do not hide the conceptual step and reveal only arithmetic.',
    ],
  }
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

function inferTeachingPhase(goal: string, hasStudentWork: boolean): TutorTeachingSequenceResult['phase'] {
  const normalized = goal.toLowerCase()
  if (/check|verify|answer|correct/.test(normalized)) return 'check'
  if (/practice|try|review|drill/.test(normalized)) return 'guided_practice'
  if (/extend|challenge|harder|why/.test(normalized)) return 'extend'
  if (hasStudentWork || /stuck|confus|mistake|wrong/.test(normalized)) return 'diagnose'
  return 'model'
}

function choosePhaseMove(phase: TutorTeachingSequenceResult['phase']) {
  if (phase === 'diagnose') {
    return {
      opening: 'Let us find the exact step that needs attention.',
      boardAction: 'Circle or rewrite the current step, then compare it to the previous one.',
      check: 'What changed from the previous line to this line?',
    }
  }
  if (phase === 'guided_practice') {
    return {
      opening: 'I will set up one similar problem, and you do the first move.',
      boardAction: 'Write a short worked setup with the final step hidden.',
      check: 'What should the next step be, and why?',
    }
  }
  if (phase === 'check') {
    return {
      opening: 'Let us check the reasoning before judging the answer.',
      boardAction: 'Put the student answer beside the expected relationship.',
      check: 'Does each part of the answer match the question?',
    }
  }
  if (phase === 'extend') {
    return {
      opening: 'Now let us connect the idea to a slightly harder version.',
      boardAction: 'Keep the same visual model and change one number or constraint.',
      check: 'What stayed the same, and what changed?',
    }
  }
  return {
    opening: 'Let us make the structure visible before calculating.',
    boardAction: 'Draw the simplest model that shows the knowns and the unknown.',
    check: 'What do we know, and what are we trying to find?',
  }
}

export function tutorTeachingSequence(input: {
  topic: string
  gradeLevel?: string
  studentGoal?: string
  studentWork?: string
}): TutorTeachingSequenceResult {
  const topic = resolveCurriculumTopic(input.topic)
  const guide = CURRICULUM_GUIDE[topic]
  const studentWork = input.studentWork?.trim() ?? ''
  const goal = input.studentGoal?.trim() ?? ''
  const phase = inferTeachingPhase(goal || studentWork, Boolean(studentWork))
  const phaseMove = choosePhaseMove(phase)
  const recommendedTool =
    phase === 'diagnose'
      ? 'misconception_diagnosis'
      : phase === 'check'
        ? topic === 'expressions_equations'
          ? 'math_check_step'
          : 'math_check_answer'
        : phase === 'guided_practice'
          ? 'practice_set_generator'
          : guide.tools[0]

  return {
    topic,
    label: guide.label,
    gradeLevel: input.gradeLevel?.trim() || 'grades 3 to 7',
    phase,
    recommendedTool,
    spokenBeats: [
      phaseMove.opening,
      guide.nextMove,
      'I will pause after the next question so the student does the thinking.',
    ],
    boardPlan: [
      {
        stage: 'orient',
        action: 'Name the knowns, unknown, and topic in one short line.',
        purpose: 'Reduce working-memory load before the student calculates.',
      },
      {
        stage: 'model',
        action: phaseMove.boardAction,
        purpose: 'Make the reasoning visible without overfilling the board.',
      },
      {
        stage: 'highlight',
        action: `Watch for: ${guide.misconceptions[0]}.`,
        purpose: 'Target the most likely misconception without blaming the student.',
      },
      {
        stage: 'student_turn',
        action: phaseMove.check,
        purpose: 'Return control to the student quickly.',
      },
    ],
    checksForUnderstanding: [
      phaseMove.check,
      'Can you explain why that step keeps the value or relationship the same?',
      'What would you write next if I stayed quiet for ten seconds?',
    ],
    guardrails: [
      'Use one visual or deterministic tool before giving a long explanation.',
      'Do not reveal the full solution unless the student asks for it.',
      'Ask one question, then wait.',
    ],
  }
}

function inferNextStepSituation(input: {
  studentWork?: string
  goal?: string
  lastToolResult?: string
}): NextStepCoachResult['situation'] {
  const combined = `${input.studentWork ?? ''} ${input.goal ?? ''} ${input.lastToolResult ?? ''}`.toLowerCase()
  if (input.lastToolResult?.trim()) return 'after_tool'
  if (/check|correct|right|wrong|verify/.test(combined)) return 'checking_work'
  if (/stuck|confus|lost|help|don't know|do not know|mistake/.test(combined)) return 'student_stuck'
  return 'new_problem'
}

export function nextStepCoach(input: {
  topic: string
  gradeLevel?: string
  studentWork?: string
  goal?: string
  lastToolName?: string
  lastToolResult?: string
}): NextStepCoachResult {
  const topic = resolveCurriculumTopic(input.topic || input.goal || input.studentWork || '')
  const guide = CURRICULUM_GUIDE[topic]
  const situation = inferNextStepSituation(input)
  const studentWork = input.studentWork?.trim() ?? ''
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const lastToolName = input.lastToolName?.trim()
  const recommendedTool =
    situation === 'checking_work'
      ? topic === 'expressions_equations'
        ? 'math_check_step'
        : 'math_check_answer'
      : situation === 'student_stuck'
        ? 'hint_ladder'
        : lastToolName || guide.tools[0]

  if (situation === 'after_tool') {
    return {
      topic,
      label: guide.label,
      gradeLevel,
      situation,
      recommendedTool: recommendedTool || guide.tools[0],
      sayThis: 'Let us use what the tool showed, but keep the next move yours.',
      writeThis: studentWork ? `Current work: ${studentWork.slice(0, 80)}` : undefined,
      askNext: 'Which part of the board result matches your thinking, and which part feels different?',
      waitFor: 'The student connects the visual or checked result to one step of their own reasoning.',
      avoid: [
        'Do not read the whole tool output aloud.',
        'Do not solve past the next student decision.',
      ],
    }
  }

  if (situation === 'student_stuck') {
    return {
      topic,
      label: guide.label,
      gradeLevel,
      situation,
      recommendedTool,
      sayThis: 'Let us shrink the problem to one decision.',
      writeThis: studentWork ? `Look at this step: ${studentWork.slice(0, 90)}` : 'Write the knowns and the question.',
      askNext: 'What is the one thing this step is trying to do?',
      waitFor: 'A partial explanation, even if it is uncertain.',
      avoid: [
        'Do not tell the final answer first.',
        'Do not introduce a second strategy until the student tries one move.',
      ],
    }
  }

  if (situation === 'checking_work') {
    return {
      topic,
      label: guide.label,
      gradeLevel,
      situation,
      recommendedTool,
      sayThis: 'Let us check the reasoning before we decide if the answer is right.',
      writeThis: studentWork ? `Check: ${studentWork.slice(0, 90)}` : 'Put the previous step and next step side by side.',
      askNext: 'What operation or relationship connects these two lines?',
      waitFor: 'A reason for the step, not just yes or no.',
      avoid: [
        'Do not mark it wrong without naming the reasoning issue.',
        'Do not reveal the corrected answer before the student explains the step.',
      ],
    }
  }

  return {
    topic,
    label: guide.label,
    gradeLevel,
    situation,
    recommendedTool,
    sayThis: 'Let us make the structure visible before calculating.',
    writeThis: 'Knowns, unknown, relationship',
    askNext: 'What do we know, what are we finding, and what relationship connects them?',
    waitFor: 'The student names the quantities or relationship in their own words.',
    avoid: [
      'Do not start with a formula unless the student already named the relationship.',
      'Do not fill the board with every step at once.',
    ],
  }
}

function hasStudentAttemptSignal(input: {
  studentRequest: string
  studentWork?: string
  hasStudentAttempt?: boolean
  attemptCount?: number
}) {
  const request = input.studentRequest.toLowerCase()
  return (
    Boolean(input.hasStudentAttempt) ||
    Math.max(0, Math.floor(input.attemptCount ?? 0)) > 0 ||
    Boolean(input.studentWork?.trim()) ||
    /\b(i tried|i got|i found|my answer|i think|check this|i changed|rewrote|i added|i subtracted|i multiplied|i divided|i solved)\b/.test(request) ||
    /[=<>]/.test(input.studentRequest)
  )
}

function inferTutorResponseSituation(input: {
  studentRequest: string
  studentWork?: string
  recentToolResult?: string
  hasStudentAttempt?: boolean
  attemptCount?: number
}): TutorResponsePlannerResult['situation'] {
  const request = input.studentRequest.toLowerCase()
  const hasAttempt = hasStudentAttemptSignal(input)

  if (input.recentToolResult?.trim()) return 'after_tool'
  if (/\b(just tell me|give me the answer|tell me the answer|full solution|show me the solution|solve it for me)\b/.test(request)) {
    return 'asks_for_answer'
  }
  if (/\b(practice|quiz|drill|another problem|new problem|test me)\b/.test(request)) return 'needs_practice'
  if (/\b(check|correct|right|wrong|mistake|is this right|is my step right)\b/.test(request) && hasAttempt) {
    return 'checking_work'
  }
  if (hasAttempt && /\b(what should|next step|do next|where next|what now)\b/.test(request)) {
    return 'checking_work'
  }
  if (/\b(draw|show|visual|model|diagram|graph|plot|number line|bar|tape|board)\b/.test(request)) {
    return 'needs_visual'
  }
  if (/\b(stuck|confused|lost|help|don't know|do not know|not sure|hint)\b/.test(request)) {
    return hasAttempt ? 'student_stuck' : 'missing_work'
  }
  if (!hasAttempt && /\b(start|begin|set up|what should|how do)\b/.test(request)) return 'missing_work'
  return 'new_problem'
}

function wantsWorkedExample(request: string) {
  return /\b(worked example|example like this|show an example|walk me through one|i do we do you do)\b/.test(request.toLowerCase())
}

function chooseResponsePlannerMove(input: {
  situation: TutorResponsePlannerResult['situation']
  studentRequest: string
}): TutorResponsePlannerResult['recommendedMove'] {
  if (input.situation === 'asks_for_answer') return 'answer_gate'
  if (wantsWorkedExample(input.studentRequest)) return 'worked_example'
  if (input.situation === 'needs_practice') return 'targeted_practice'
  if (input.situation === 'needs_visual') return 'board_action'
  if (input.situation === 'checking_work' || input.situation === 'after_tool') return 'check_question'
  if (input.situation === 'student_stuck') return 'hint'
  return 'clarify'
}

function choosePlannerPrimaryTool(input: {
  topic: CurriculumTopic
  move: TutorResponsePlannerResult['recommendedMove']
  studentRequest: string
  studentWork?: string
  recentToolName?: string
}) {
  const guide = CURRICULUM_GUIDE[input.topic]
  const combined = `${input.studentRequest} ${input.studentWork ?? ''}`.toLowerCase()
  if (input.move === 'answer_gate') return 'answer_disclosure_gate'
  if (input.move === 'worked_example') return 'worked_example_fader'
  if (input.move === 'targeted_practice') return 'practice_set_generator'
  if (input.move === 'board_action') return guide.tools[0]
  if (input.move === 'check_question') {
    if (input.recentToolName?.trim()) return 'student_check_question'
    if (/[=<>]/.test(combined) || /\b(step|changed|rewrote|from .* to )\b/.test(combined)) return 'math_check_step'
    return 'student_check_question'
  }
  if (input.move === 'hint') return 'hint_ladder'
  if (/\bword problem|story problem|set up|known|unknown\b/.test(combined)) return 'problem_understanding_map'
  return 'socratic_move_planner'
}

function buildPlannerToolSequence(input: {
  topic: CurriculumTopic
  move: TutorResponsePlannerResult['recommendedMove']
  primaryTool: string
  recentToolName?: string
}) {
  const guide = CURRICULUM_GUIDE[input.topic]
  if (input.move === 'answer_gate') return ['answer_disclosure_gate']
  if (input.move === 'worked_example') return ['worked_example_fader', 'student_check_question']
  if (input.move === 'targeted_practice') return ['practice_set_generator', 'student_check_question']
  if (input.move === 'board_action') return [input.primaryTool, 'student_check_question']
  if (input.move === 'check_question') {
    return input.primaryTool === 'math_check_step'
      ? ['math_check_step', 'student_check_question']
      : [input.recentToolName?.trim() || 'student_check_question', 'student_check_question']
  }
  if (input.move === 'hint') return ['hint_ladder', guide.tools[0], 'student_check_question']
  return [input.primaryTool]
}

function answerPolicyForPlan(input: {
  move: TutorResponsePlannerResult['recommendedMove']
  hasAttempt: boolean
  attemptCount?: number
}): TutorResponsePlannerResult['answerPolicy'] {
  if (input.move === 'answer_gate' && (input.hasAttempt || Math.max(0, Math.floor(input.attemptCount ?? 0)) >= 2)) {
    return 'solution_after_attempt'
  }
  if (input.hasAttempt) return 'next_step_only'
  return 'hint_first'
}

function buildTutorVoicePolicyCheck(text: string) {
  const trimmed = text.trim()
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const sentenceCount = trimmed.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean).length
  const questionCount = (trimmed.match(/\?/g) ?? []).length
  const multiPartQuestion =
    questionCount > 1 ||
    /(?:,\s*|\band\s+|\bor\s+)(?:what|which|why|how|where|when|who|can|could|do|does|is|are)\b/i.test(
      trimmed
    )

  return {
    wordCount,
    sentenceCount,
    questionCount,
    hasStudentQuestion: questionCount > 0,
    multiPartQuestion,
    oneQuestionOnly: questionCount === 1 && !multiPartQuestion,
    shortEnoughForVoice: wordCount <= 95 && sentenceCount <= 5,
    waitsAfterQuestion: questionCount > 0 && /\?\s*$/.test(trimmed),
  }
}

function countSpokenWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function cleanSpokenDraft(text: string) {
  return text
    .replace(/[*_`#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSpokenSentences(text: string) {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []
  return matches.map((sentence) => sentence.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function isStudentFacingQuestion(sentence: string) {
  return /\?\s*$/.test(sentence.trim())
}

function defaultShortTurnQuestion(topic: CurriculumTopic) {
  const questions: Record<CurriculumTopic, string> = {
    place_value: 'Which place should we look at first?',
    multiplication_division: 'What does one equal group represent?',
    fractions: 'What is the whole in this problem?',
    decimals_percents: 'Should we think in tenths, hundredths, or out of 100 first?',
    ratios_rates: 'What two quantities need to scale together?',
    expressions_equations: 'What operation should we undo first?',
    geometry_measurement: 'What are we measuring: length, area, or angle?',
    coordinate_graphing: 'What does the x-coordinate tell us first?',
    data_probability: 'What total are we comparing to?',
  }

  return questions[topic]
}

function normalizeShortTurnQuestion(candidate: string | undefined, fallback: string) {
  const cleaned = cleanSpokenDraft(candidate ?? '')
  if (!cleaned) return fallback
  if (/\?\s*$/.test(cleaned)) return cleaned
  if (/^(what|which|why|how|where|when|who|can|could|do|does|did|is|are|would|should)\b/i.test(cleaned)) {
    return `${cleaned.replace(/[.!]+$/, '')}?`
  }
  return fallback
}

function limitSpokenChunk(text: string, maxWords: number) {
  const cleaned = cleanSpokenDraft(text)
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) {
    return { text: cleaned, trimmed: false }
  }

  const terminal = /\?\s*$/.test(cleaned) ? '?' : '.'
  const shortened = words.slice(0, maxWords).join(' ').replace(/[,:;]+$/, '')
  return { text: `${shortened}${terminal}`, trimmed: true }
}

export function shortSpokenTurnFormatter(input: {
  topic: string
  gradeLevel?: string
  draftTurn: string
  requiredQuestion?: string
  mustAskQuestion?: boolean
  maxWordsPerChunk?: number
  maxChunks?: number
}): ShortSpokenTurnFormatterResult {
  const topic = resolveCurriculumTopic(input.topic || input.draftTurn || '')
  const guide = CURRICULUM_GUIDE[topic]
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const draft = cleanSpokenDraft(input.draftTurn)
  const sentences = splitSpokenSentences(draft)
  const maxWordsPerChunk = clamp(
    Number.isFinite(input.maxWordsPerChunk) ? Math.trunc(input.maxWordsPerChunk ?? 18) : 18,
    8,
    32
  )
  const maxChunks = clamp(Number.isFinite(input.maxChunks) ? Math.trunc(input.maxChunks ?? 2) : 2, 1, 3)
  const mustAskQuestion = input.mustAskQuestion ?? true
  const fallbackQuestion = defaultShortTurnQuestion(topic)
  const questionCandidates = sentences.filter(isStudentFacingQuestion)
  const askNext = mustAskQuestion
    ? normalizeShortTurnQuestion(input.requiredQuestion || questionCandidates[0], fallbackQuestion)
    : ''
  const explanationSlots = mustAskQuestion ? Math.max(0, maxChunks - 1) : maxChunks
  const explanationSentences = sentences.filter((sentence) => !isStudentFacingQuestion(sentence)).slice(0, explanationSlots)
  const chunks: ShortSpokenTurnFormatterResult['chunks'] = []
  let longChunkTrimmed = false

  for (const sentence of explanationSentences) {
    const limited = limitSpokenChunk(sentence, maxWordsPerChunk)
    longChunkTrimmed ||= limited.trimmed
    chunks.push({
      order: chunks.length + 1,
      say: limited.text,
      pauseAfter: true,
    })
  }

  if (mustAskQuestion) {
    const limitedQuestion = limitSpokenChunk(askNext, maxWordsPerChunk)
    longChunkTrimmed ||= limitedQuestion.trimmed
    chunks.push({
      order: chunks.length + 1,
      say: limitedQuestion.text,
      pauseAfter: true,
    })
  }

  if (!chunks.length) {
    const limited = limitSpokenChunk(fallbackQuestion, maxWordsPerChunk)
    longChunkTrimmed ||= limited.trimmed
    chunks.push({
      order: 1,
      say: limited.text,
      pauseAfter: true,
    })
  }

  const formattedTurn = chunks.map((chunk) => chunk.say).join(' ')
  const removedSignals: string[] = []
  if (sentences.length > explanationSentences.length + (mustAskQuestion ? 1 : 0)) {
    removedSignals.push('extra_sentences_removed')
  }
  if (questionCandidates.length > 1) {
    removedSignals.push('extra_questions_removed')
  }
  if (longChunkTrimmed) {
    removedSignals.push('long_chunk_trimmed')
  }
  if (mustAskQuestion && !input.requiredQuestion?.trim() && questionCandidates.length === 0) {
    removedSignals.push('student_question_added')
  }

  const originalWordCount = countSpokenWords(draft)
  const formattedWordCount = countSpokenWords(formattedTurn)

  return {
    topic,
    label: guide.label,
    gradeLevel,
    originalWordCount,
    formattedWordCount,
    chunks,
    formattedTurn,
    askNext: mustAskQuestion ? chunks[chunks.length - 1]?.say ?? askNext : '',
    voicePolicy: buildTutorVoicePolicyCheck(formattedTurn),
    trimmed: draft !== formattedTurn || formattedWordCount !== originalWordCount || removedSignals.length > 0,
    removedSignals: [...new Set(removedSignals)],
    stopRule: 'Say one chunk at a time, pause after the student-facing question, and wait before adding another explanation.',
  }
}

export function tutorResponsePlanner(input: {
  topic: string
  gradeLevel?: string
  studentRequest: string
  studentWork?: string
  recentToolName?: string
  recentToolResult?: string
  hasStudentAttempt?: boolean
  attemptCount?: number
}): TutorResponsePlannerResult {
  const topic = resolveCurriculumTopic(input.topic || input.studentRequest || input.studentWork || '')
  const guide = CURRICULUM_GUIDE[topic]
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const studentRequest = input.studentRequest.trim() || 'student needs help'
  const situation = inferTutorResponseSituation({
    studentRequest,
    studentWork: input.studentWork,
    recentToolResult: input.recentToolResult,
    hasStudentAttempt: input.hasStudentAttempt,
    attemptCount: input.attemptCount,
  })
  const recommendedMove = chooseResponsePlannerMove({
    situation,
    studentRequest,
  })
  const recommendedTool = choosePlannerPrimaryTool({
    topic,
    move: recommendedMove,
    studentRequest,
    studentWork: input.studentWork,
    recentToolName: input.recentToolName,
  })
  const hasAttempt = hasStudentAttemptSignal({
    studentRequest,
    studentWork: input.studentWork,
    hasStudentAttempt: input.hasStudentAttempt,
    attemptCount: input.attemptCount,
  })
  const answerPolicy = answerPolicyForPlan({
    move: recommendedMove,
    hasAttempt,
    attemptCount: input.attemptCount,
  })
  const toolSequence = buildPlannerToolSequence({
    topic,
    move: recommendedMove,
    primaryTool: recommendedTool,
    recentToolName: input.recentToolName,
  })

  const moveCopy: Record<
    TutorResponsePlannerResult['recommendedMove'],
    Pick<TutorResponsePlannerResult, 'sayFirst' | 'askNext' | 'waitFor' | 'boardMove'>
  > = {
    clarify: {
      sayFirst: 'Let us get the problem clear before we calculate.',
      askNext: 'What are we trying to find?',
      waitFor: 'The student names the unknown or shares the first missing piece.',
      boardMove: 'Write knowns, unknown, and first step as three short prompts.',
    },
    hint: {
      sayFirst: 'Let us shrink this to one decision.',
      askNext: guide.nextMove,
      waitFor: 'A partial student idea or a specific step they want checked.',
      boardMove: `Use ${guide.tools[0].replace(/_/g, ' ')} only if the idea needs to be visible.`,
    },
    check_question: {
      sayFirst: 'Let us check one part before moving on.',
      askNext:
        recommendedTool === 'math_check_step'
          ? 'What changed from the previous line to this line?'
          : 'Can you explain why that step matches the idea on the board?',
      waitFor: 'The student explains one operation, comparison, or relationship.',
      boardMove: 'Put the current step beside the relevant model or checked result.',
    },
    board_action: {
      sayFirst: 'I will make the structure visible, then you make the next move.',
      askNext: 'What part of the model matches the numbers in the problem?',
      waitFor: 'The student connects a label, point, bar, or quantity to the original problem.',
      boardMove: `Call ${recommendedTool.replace(/_/g, ' ')} and leave space for the student's next step.`,
    },
    worked_example: {
      sayFirst: 'I will model the setup only, then fade the next step back to you.',
      askNext: 'What part should you fill in when I leave one step blank?',
      waitFor: 'The student supplies the hidden step or explains what stays the same.',
      boardMove: 'Use an I-do, we-do, you-do setup with the final answer hidden at first.',
    },
    targeted_practice: {
      sayFirst: 'I will give one quick practice item at a time.',
      askNext: 'Try the first step out loud before I check the answer.',
      waitFor: 'A student attempt on the first practice item.',
      boardMove: 'Show only the current practice prompt, not the full answer key.',
    },
    answer_gate: {
      sayFirst:
        answerPolicy === 'solution_after_attempt'
          ? 'I can show a concise solution because you have already tried, but I will still name the reasoning.'
          : 'I will start with a hint or one next step so you still do the thinking.',
      askNext:
        answerPolicy === 'solution_after_attempt'
          ? 'Which step should I explain first?'
          : 'What is one step you can try before I reveal more?',
      waitFor:
        answerPolicy === 'solution_after_attempt'
          ? 'The student chooses a step to discuss or asks for the concise solution.'
          : 'A student attempt before any full solution.',
      boardMove: 'Use answer_disclosure_gate before writing any final answer.',
    },
  }
  const selectedMoveCopy = moveCopy[recommendedMove]
  const plannedTurnFormat = shortSpokenTurnFormatter({
    topic,
    gradeLevel,
    draftTurn: `${selectedMoveCopy.sayFirst} ${selectedMoveCopy.askNext}`,
    requiredQuestion: selectedMoveCopy.askNext,
    mustAskQuestion: true,
    maxWordsPerChunk: 24,
    maxChunks: 2,
  })
  const plannedSpokenTurn = plannedTurnFormat.formattedTurn

  return {
    topic,
    label: guide.label,
    gradeLevel,
    situation,
    recommendedMove,
    recommendedTool,
    toolSequence: [...new Set(toolSequence)],
    ...selectedMoveCopy,
    plannedSpokenTurn,
    voicePolicy: plannedTurnFormat.voicePolicy,
    answerPolicy,
    auditChecklist: [
      'One student-facing question only.',
      'No full solution unless the answer gate allows it.',
      'Use a deterministic math or board tool before correcting with certainty.',
      'Keep the spoken turn short enough for interruption.',
    ],
    avoid: [
      'Do not stack multiple explanations before the student responds.',
      'Do not reveal answer keys for practice or exit checks.',
      'Do not quote private learner or curriculum context in the student-facing turn.',
    ],
  }
}

function inferStudentCheckType(input: {
  checkType?: string
  studentWork?: string
  recentToolResult?: string
}): StudentCheckQuestionResult['checkType'] {
  const explicit = input.checkType?.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (
    explicit === 'concept' ||
    explicit === 'next_step' ||
    explicit === 'error_spotting' ||
    explicit === 'transfer'
  ) {
    return explicit
  }

  const combined = `${input.studentWork ?? ''} ${input.recentToolResult ?? ''}`.toLowerCase()
  if (/\bwrong|mistake|incorrect|not right|check\b/.test(combined)) return 'error_spotting'
  if (/\bnext|then|after this|now what|continue\b/.test(combined)) return 'next_step'
  if (/\banother|different|similar|new numbers|same idea\b/.test(combined)) return 'transfer'
  return 'concept'
}

function getTopicCheckTemplate(topic: CurriculumTopic, checkType: StudentCheckQuestionResult['checkType']) {
  const conceptTemplates: Record<CurriculumTopic, string> = {
    place_value: 'What does the key digit or place represent in the whole number?',
    multiplication_division: 'What equal groups or sharing situation does this represent?',
    fractions: 'What is the whole, and what size are the parts we are using?',
    decimals_percents: 'What does this value mean in tenths, hundredths, or out of 100?',
    ratios_rates: 'What two quantities are staying in the same relationship?',
    expressions_equations: 'What operation is being undone, and how do we keep both sides balanced?',
    geometry_measurement: 'Are we measuring length around, square units inside, or an angle?',
    coordinate_graphing: 'What does x represent, and what does y represent?',
    data_probability: 'What do the values, outcomes, or categories represent?',
  }
  const nextStepTemplates: Record<CurriculumTopic, string> = {
    place_value: 'Which place should we look at next, and why?',
    multiplication_division: 'What is the next equal group, partial quotient, or sharing step?',
    fractions: 'What common-sized part or equivalent fraction should we use next?',
    decimals_percents: 'Should we rewrite this as hundredths, a decimal, or a percent next?',
    ratios_rates: 'Should we find the unit rate or scale both quantities next?',
    expressions_equations: 'What operation would undo the last change on both sides?',
    geometry_measurement: 'What measurement should we calculate first?',
    coordinate_graphing: 'Which point, table row, or change should we plot or compare next?',
    data_probability: 'What total or comparison should we calculate next?',
  }
  const errorTemplates: Record<CurriculumTopic, string> = {
    place_value: 'Which place value could make this answer too large or too small?',
    multiplication_division: 'Where could an equal group, remainder, or place-value step have changed?',
    fractions: 'Did the work change the size of the pieces, or only the number of pieces?',
    decimals_percents: 'Did the work compare place values or just digits?',
    ratios_rates: 'Did both quantities scale by the same factor?',
    expressions_equations: 'Was the same operation done to both sides?',
    geometry_measurement: 'Did the work use the right measurement type and unit?',
    coordinate_graphing: 'Were x and y used in the correct order?',
    data_probability: 'Did the work use the correct total as the denominator or comparison group?',
  }
  const transferTemplates: Record<CurriculumTopic, string> = {
    place_value: 'How would the answer change if the key digit moved one place left or right?',
    multiplication_division: 'How would you solve a nearby problem with one number changed?',
    fractions: 'How would the strategy work with different denominators?',
    decimals_percents: 'How would you use the same idea for a new decimal or percent?',
    ratios_rates: 'How would you keep the same relationship with a different target amount?',
    expressions_equations: 'How would the same undoing idea work in a nearby equation?',
    geometry_measurement: 'How would the method change if one side length or angle changed?',
    coordinate_graphing: 'How would the graph or point change if x increased by 1?',
    data_probability: 'How would the result change if the total outcomes or data value changed?',
  }

  if (checkType === 'next_step') return nextStepTemplates[topic]
  if (checkType === 'error_spotting') return errorTemplates[topic]
  if (checkType === 'transfer') return transferTemplates[topic]
  return conceptTemplates[topic]
}

export function studentCheckQuestion(input: {
  topic: string
  gradeLevel?: string
  studentWork?: string
  recentToolName?: string
  recentToolResult?: string
  checkType?: string
}): StudentCheckQuestionResult {
  const topic = resolveCurriculumTopic(input.topic || input.studentWork || input.recentToolResult || '')
  const guide = CURRICULUM_GUIDE[topic]
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const checkType = inferStudentCheckType(input)
  const recommendedTool =
    input.recentToolName?.trim() ||
    (checkType === 'error_spotting'
      ? topic === 'expressions_equations'
        ? 'math_check_step'
        : 'mistake_pattern_classifier'
      : guide.tools[0])
  const question = getTopicCheckTemplate(topic, checkType)

  return {
    topic,
    label: guide.label,
    gradeLevel,
    checkType,
    question,
    expectedEvidence: [
      'Student answers in their own words before the tutor adds another step.',
      `Student names at least one ${guide.prerequisites[0].toLowerCase()} idea or uses it correctly.`,
      checkType === 'error_spotting'
        ? 'Student points to a specific step, quantity, or relationship that needs checking.'
        : 'Student connects the question to the visible work, not just the final answer.',
    ],
    ifStudentStruggles:
      checkType === 'error_spotting'
        ? `Return to ${guide.tools[0].replace(/_/g, ' ')} and ask them to compare one step at a time.`
        : guide.nextMove,
    ifStudentSucceeds:
      checkType === 'transfer'
        ? 'Give one nearby problem with changed numbers and keep the same reasoning structure.'
        : 'Let the student make the next move before adding another explanation.',
    recommendedTool,
    boardMove:
      input.studentWork?.trim()
        ? `Underline the part of the work connected to: ${question}`
        : `Write the question on the board and leave space for the student's reasoning.`,
    avoid: [
      'Do not ask more than one check question at once.',
      'Do not reveal the next worked step before the student responds.',
      'Do not turn the check into a long mini-lecture.',
    ],
  }
}

function resolveExitTicketDifficulty(value?: string): ExitTicketResult['difficulty'] {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'support' || normalized === 'core' || normalized === 'stretch') return normalized
  if (/\b(stuck|confused|reteach|easy|support)\b/.test(normalized ?? '')) return 'support'
  if (/\b(challenge|harder|extend|stretch)\b/.test(normalized ?? '')) return 'stretch'
  return 'core'
}

export function exitTicketBuilder(input: {
  topic: string
  gradeLevel?: string
  sessionGoal?: string
  studentEvidence?: string
  difficulty?: string
  count?: number
}): ExitTicketResult {
  const topic = resolveCurriculumTopic(input.topic || input.sessionGoal || input.studentEvidence || '')
  const guide = CURRICULUM_GUIDE[topic]
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const evidence = input.studentEvidence?.trim() ?? ''
  const difficulty = resolveExitTicketDifficulty(input.difficulty || evidence)
  const count = clamp(Math.trunc(input.count ?? 2), 1, 3)
  const practice = practiceSetGenerator({
    topic,
    difficulty,
    count,
  }).items

  return {
    topic,
    label: guide.label,
    gradeLevel,
    difficulty,
    title: `${guide.label} exit ticket`,
    studentInstructions:
      'Try these one at a time. Explain your first step before asking to check the answer.',
    items: practice.map((item) => ({
      prompt: item.prompt,
      expectedEvidence: [
        'Student states the first step or representation before calculating.',
        `Student uses ${guide.prerequisites[0].toLowerCase()} appropriately.`,
        'Student can explain why the answer matches the question.',
      ],
      hint: item.hint,
      suggestedTool: item.suggestedTool,
      answerKey: item.answer,
    })),
    teacherLookFor: [
      guide.misconceptions[0],
      `Whether the student can explain ${guide.prerequisites[0].toLowerCase()} without copying a model.`,
      'Whether the student asks for a hint before attempting the first step.',
    ],
    nextSessionRecommendation:
      difficulty === 'support'
        ? `Start next time with ${guide.tools[0].replace(/_/g, ' ')} and one easier check.`
        : difficulty === 'stretch'
          ? 'Offer a nearby challenge problem and ask what changed.'
          : `Use one ${guide.label.toLowerCase()} check, then move to guided practice if secure.`,
    privacyNote:
      'Use this as a learning handoff only. Do not include private personal details in teacher or parent summaries.',
    avoid: [
      'Do not read the answer key before the student attempts the item.',
      'Do not give all items at once if the student is already stuck.',
      'Do not grade tone or confidence. Look for mathematical evidence.',
    ],
  }
}

function inferReviewMode(input: {
  signals: string[]
  sessionGoal: string
  targetTopic: CurriculumTopic
}): AdaptiveReviewPlanResult['reviewMode'] {
  const combined = `${input.signals.join(' ')} ${input.sessionGoal}`.toLowerCase()
  if (/extend|challenge|harder|advanced/.test(combined)) return 'extend'
  if (/practice|drill|quiz|review/.test(combined)) return 'guided_practice'
  if (/stuck|confused|setup|where do i begin|do not know|don't know/.test(combined)) return 'rebuild'
  if (input.targetTopic === 'fractions' || input.targetTopic === 'expressions_equations') return 'diagnose'
  return 'guided_practice'
}

function topicFromHistory(input: {
  targetTopic?: string
  topics?: string[]
  recentExcerpts?: string[]
}) {
  const candidates = [
    input.targetTopic,
    ...(input.topics ?? []),
    ...(input.recentExcerpts ?? []),
  ]
  return resolveCurriculumTopic(candidates.find((candidate) => candidate?.trim()) ?? 'fractions')
}

export function adaptiveReviewPlan(input: {
  gradeLevel?: string
  targetTopic?: string
  sessionGoal?: string
  topics?: string[]
  struggleSignals?: string[]
  recentExcerpts?: string[]
}): AdaptiveReviewPlanResult {
  const topic = topicFromHistory(input)
  const guide = CURRICULUM_GUIDE[topic]
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const signals = (input.struggleSignals ?? []).map((signal) => signal.trim()).filter(Boolean).slice(0, 5)
  const sessionGoal = input.sessionGoal?.trim() || 'review recent learning'
  const reviewMode = inferReviewMode({ signals, sessionGoal, targetTopic: topic })
  const practice = practiceSetGenerator({
    topic,
    difficulty: reviewMode === 'rebuild' || reviewMode === 'diagnose' ? 'support' : 'core',
    count: 2,
  }).items
  const firstBoardTool =
    reviewMode === 'diagnose'
      ? topic === 'expressions_equations'
        ? 'equation_balance'
        : guide.tools[0]
      : reviewMode === 'rebuild'
        ? guide.tools[0]
        : practice[0]?.suggestedTool || guide.tools[0]

  return {
    topic,
    label: guide.label,
    gradeLevel,
    reviewMode,
    warmStartLine:
      reviewMode === 'extend'
        ? `Let us build on your recent ${guide.label.toLowerCase()} work with a slightly richer version.`
        : `Let us do a quick ${guide.label.toLowerCase()} check before we move on.`,
    diagnosticQuestion:
      reviewMode === 'rebuild'
        ? guide.nextMove
        : `What is one thing you remember about ${guide.prerequisites[0].toLowerCase()}?`,
    firstBoardTool,
    suggestedToolSequence: [firstBoardTool, ...guide.tools.filter((toolName) => toolName !== firstBoardTool)].slice(0, 3),
    microPractice: practice.map((item) => ({
      prompt: item.prompt,
      hint: item.hint,
      suggestedTool: item.suggestedTool,
    })),
    tutorMoves: [
      'Start with one diagnostic question and wait for the student response.',
      `Use ${firstBoardTool.replace(/_/g, ' ')} only if the student needs the idea made visible.`,
      'Give one micro-practice item at a time.',
      'End by asking the student to explain the pattern in their own words.',
    ],
    masteryCheck:
      reviewMode === 'extend'
        ? 'Can the student solve a slightly changed problem and explain what changed?'
        : 'Can the student make the next step without copying a full worked solution?',
    avoid: [
      'Do not list old private session details.',
      'Do not give a long recap before the student tries.',
      'Do not reveal practice answers until the student attempts the first step.',
    ],
  }
}

function hasStrongStudentEvidence(text: string) {
  return /\b(because|so|therefore|i know|that means|same value|both sides|scale factor|unit rate|common denominator|out of 100)\b/i.test(text)
}

function hasUncertaintyEvidence(text: string) {
  return /\b(stuck|confused|not sure|don't know|do not know|guess|maybe|wrong|mistake|help)\b/i.test(text)
}

export function sessionMasterySnapshot(input: {
  topic: string
  gradeLevel?: string
  transcriptExcerpt?: string
  studentWork?: string
  toolSummary?: string
}): SessionMasterySnapshotResult {
  const topic = resolveCurriculumTopic(input.topic)
  const guide = CURRICULUM_GUIDE[topic]
  const gradeLevel = input.gradeLevel?.trim() || 'grades 3 to 7'
  const combined = [input.transcriptExcerpt, input.studentWork, input.toolSummary]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .slice(0, 1400)
  const strongEvidence = hasStrongStudentEvidence(combined)
  const uncertainEvidence = hasUncertaintyEvidence(combined)
  const diagnosis = misconceptionDiagnosis({
    topic,
    studentWork: input.studentWork?.trim() || combined || guide.misconceptions[0],
  })
  const confidence: SessionMasterySnapshotResult['confidence'] =
    strongEvidence && !uncertainEvidence ? 'high' : strongEvidence || !uncertainEvidence ? 'medium' : 'low'
  const practice = practiceSetGenerator({
    topic,
    difficulty: confidence === 'low' ? 'support' : confidence === 'high' ? 'stretch' : 'core',
    count: 2,
  }).items

  return {
    topic,
    label: guide.label,
    gradeLevel,
    confidence,
    evidence: [
      strongEvidence
        ? 'Student used reasoning language or named a relationship.'
        : 'No strong reasoning explanation was detected in the excerpt.',
      input.studentWork?.trim() ? 'Student work was available for review.' : 'No student work excerpt was provided.',
      input.toolSummary?.trim() ? 'Tool output was available as supporting evidence.' : 'No tool summary was provided.',
    ],
    needsReview: confidence === 'high' ? [] : diagnosis.findings.slice(0, 3),
    nextPractice: practice.map((item) => ({
      prompt: item.prompt,
      hint: item.hint,
      suggestedTool: item.suggestedTool,
    })),
    suggestedNextTutorMove:
      confidence === 'high'
        ? 'Offer one extension problem and ask the student to explain the changed condition.'
        : guide.nextMove,
    teacherReviewNote:
      confidence === 'high'
        ? `Likely secure on ${guide.label.toLowerCase()} in this excerpt, but confirm with one independent problem.`
        : `Review ${guide.label.toLowerCase()} with a short diagnostic before moving faster.`,
    privacyNote:
      'This snapshot should summarize learning signals only. Do not include sensitive personal details in teacher or parent views.',
  }
}

export function tutorTurnAudit(input: {
  studentPrompt: string
  assistantDraft: string
  topic?: string
  toolUsed?: string
}): TutorTurnAuditResult {
  const prompt = input.studentPrompt.trim()
  const draft = input.assistantDraft.trim()
  const lowerDraft = draft.toLowerCase()
  const issues: TutorTurnAuditResult['issues'] = []
  const voicePolicy = buildTutorVoicePolicyCheck(draft)

  if (/\b(answer is|final answer|solution is|therefore x\s*=|so x\s*=)\b/.test(lowerDraft) && !/\bwhy|because|try|your turn|what\b/.test(lowerDraft)) {
    issues.push('answer_dumping')
  }
  if (voicePolicy.sentenceCount > 5 || /\bstep 4\b|\bstep 5\b|\bstep 6\b/i.test(draft)) {
    issues.push('too_many_steps')
  }
  if (!voicePolicy.hasStudentQuestion) {
    issues.push('missing_student_question')
  }
  if (!voicePolicy.oneQuestionOnly && voicePolicy.hasStudentQuestion) {
    issues.push('multiple_student_questions')
  }
  if (!voicePolicy.shortEnoughForVoice) {
    issues.push('too_long')
  }
  if (/\b(phone|address|password|private|secret|contact me)\b/.test(lowerDraft)) {
    issues.push('privacy_risk')
  }
  if (/\bdefinitely|guaranteed|always right|cannot be wrong\b/.test(lowerDraft)) {
    issues.push('unsupported_certainty')
  }
  if (/\bgame|dating|politics|crypto|stock|medical diagnosis\b/.test(`${prompt} ${draft}`.toLowerCase())) {
    issues.push('off_topic')
  }

  const uniqueIssues = [...new Set(issues)]
  const riskLevel: TutorTurnAuditResult['riskLevel'] =
    uniqueIssues.some((issue) => issue === 'privacy_risk' || issue === 'off_topic') ||
    uniqueIssues.length >= 3
      ? 'high'
      : uniqueIssues.length > 0
        ? 'medium'
        : 'low'
  const approved = uniqueIssues.length === 0
  const topic = input.topic?.trim() || 'this problem'
  const toolUsed = input.toolUsed?.trim()

  return {
    approved,
    riskLevel,
    voicePolicy,
    issues: uniqueIssues,
    revisedTutorMove: approved
      ? draft
      : `Let's focus on one part of ${topic}. ${toolUsed ? `The ${toolUsed.replace(/_/g, ' ')} result can help, but ` : ''}I want you to make the next move.`,
    mustAskStudent:
      approved && voicePolicy.hasStudentQuestion
        ? 'Use the question already in the draft.'
        : 'What is the next step you would try?',
    allowedNextAction:
      riskLevel === 'high'
        ? 'stop_and_redirect'
        : approved
          ? 'say_as_written'
          : uniqueIssues.includes('missing_student_question')
            ? 'ask_clarifying_question'
            : 'revise_then_say',
  }
}

export function answerDisclosureGate(input: {
  studentRequest: string
  hasStudentAttempt?: boolean
  attemptCount?: number
  isCheckingAnswer?: boolean
  askedForFullSolution?: boolean
}): AnswerDisclosureGateResult {
  const request = input.studentRequest.trim().toLowerCase()
  const attemptCount = Math.max(0, Math.floor(input.attemptCount ?? 0))
  const hasStudentAttempt = Boolean(input.hasStudentAttempt) || attemptCount > 0
  const askedForFullSolution =
    Boolean(input.askedForFullSolution) ||
    /\b(answer|solve it|full solution|show me the solution|just tell me)\b/.test(request)

  if (askedForFullSolution && (hasStudentAttempt || input.isCheckingAnswer)) {
    return {
      decision: 'solution_allowed',
      reason: 'The student explicitly asked for the full solution after making or checking an attempt.',
      sayThis: 'I can show the solution, but I will still name the reasoning behind each step.',
      allowedDetail: 'A concise full solution with the key reason for each step.',
      requiredPause: false,
    }
  }

  if (hasStudentAttempt || input.isCheckingAnswer) {
    return {
      decision: 'next_step_only',
      reason: 'The student has attempted the problem, so the tutor can reveal the next useful step without finishing everything.',
      sayThis: 'I will show the next step only, then I want you to explain why it works.',
      allowedDetail: 'One checked step, one hint, or one board mark.',
      requiredPause: true,
    }
  }

  return {
    decision: 'hint_only',
    reason: 'The student has not made an attempt yet, so preserve productive struggle.',
    sayThis: 'I will start with a hint so you still get to do the thinking.',
    allowedDetail: 'A question, setup, or visual model without the final answer.',
    requiredPause: true,
  }
}

export function hintLadder(input: {
  topic: string
  misconception?: string
  studentWork?: string
  correctIdea?: string
}): HintLadderResult {
  const topic = resolveCurriculumTopic(input.topic)
  const guide = CURRICULUM_GUIDE[topic]
  const misconception =
    input.misconception?.trim() ||
    misconceptionDiagnosis({
      topic,
      studentWork: input.studentWork?.trim() || guide.misconceptions[0],
    }).findings[0]
  const correctIdea = input.correctIdea?.trim() || guide.nextMove
  const recommendedTool =
    topic === 'expressions_equations'
      ? 'math_check_step'
      : topic === 'coordinate_graphing'
        ? 'plot_points_on_plane'
        : guide.tools[0]

  return {
    topic,
    label: guide.label,
    misconception,
    levels: [
      {
        level: 'gentle',
        say: `Look back at the part about ${guide.prerequisites[0].toLowerCase()}.`,
        studentAction: 'Ask the student to point to the step or number they used.',
        revealAnswer: false,
      },
      {
        level: 'stronger',
        say: `Try this idea: ${correctIdea}`,
        studentAction: 'Have the student redo only the next step, not the whole problem.',
        revealAnswer: false,
      },
      {
        level: 'near_answer',
        say: 'Now compare your step with the structure on the board.',
        studentAction: 'Ask for the final correction in the student voice.',
        revealAnswer: false,
      },
    ],
    stopRule: 'Stop at the first hint that gets a meaningful student attempt. Do not reveal the full solution unless asked.',
    recommendedTool,
  }
}

function chooseAnimationRenderer(input: {
  visualType: string
  wantsOfflineVideo?: boolean
}): BoardAnimationPlanResult['renderer'] {
  const visualType = input.visualType.toLowerCase()
  if (input.wantsOfflineVideo && /transform|proof|derivation|sequence|animation|video/.test(visualType)) {
    return 'manim_offline_candidate'
  }
  return 'tldraw_step_reveal'
}

export function boardAnimationPlan(input: {
  concept: string
  visualType?: string
  gradeLevel?: string
  wantsOfflineVideo?: boolean
}): BoardAnimationPlanResult {
  const concept = input.concept.trim().replace(/\s+/g, ' ')
  if (!concept) {
    throw new Error('board_animation_plan needs a concept or problem.')
  }

  const visualType = input.visualType?.trim() || 'structured board reveal'
  const renderer = chooseAnimationRenderer({
    visualType,
    wantsOfflineVideo: input.wantsOfflineVideo,
  })
  const title = concept.length > 48 ? `${concept.slice(0, 45).trim()}...` : concept
  const stageLines = [
    '1. Set up the knowns',
    '2. Reveal the model',
    '3. Highlight the key step',
    '4. Ask the student to continue',
  ]
  const actions: TutorCanvasAction[] = [
    clearToolLayer(),
    ...buildSceneChrome(title),
    rectangle(TOOL_SCENE.x + 72, TOOL_SCENE.y + 120, 520, 250, {
      color: 'light-blue',
      fill: 'semi',
      opacity: 0.1,
      dash: 'solid',
      size: 's',
      label: visualType,
    }),
    ...noteParagraph(TOOL_SCENE.x + 96, TOOL_SCENE.y + 168, stageLines, {
      width: 460,
      color: 'black',
      lineHeight: 42,
    }),
    rectangle(NOTE_FRAME.x, NOTE_FRAME.y, NOTE_FRAME.width, NOTE_FRAME.height, {
      color: 'light-green',
      fill: 'semi',
      opacity: 0.12,
      dash: 'solid',
      size: 's',
    }),
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, 'Tutor timing', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      ['Speak one beat.', 'Reveal one mark.', 'Ask one question.'],
      {
        width: NOTE_FRAME.width - 32,
        color: 'black',
        lineHeight: 34,
      }
    ),
    focusRegion(TOOL_SCENE.x - 72, TOOL_SCENE.y - 60, TOOL_SCENE.width + 144, TOOL_SCENE.height + 132),
  ]

  return {
    title,
    renderer,
    reason:
      renderer === 'manim_offline_candidate'
        ? 'Manim is better for polished offline concept animations, but not for low-latency live tutoring turns.'
        : 'tldraw step reveal is the safer live-tutoring default because it is instant, structured, and auditable.',
    stages: [
      {
        stage: 'setup',
        say: 'Let us write what we know first.',
        boardAction: 'Show knowns and unknown in one short line.',
        timingMs: 800,
      },
      {
        stage: 'reveal',
        say: 'Now I will add the model one piece at a time.',
        boardAction: 'Reveal the visual structure without solving everything.',
        timingMs: 1200,
      },
      {
        stage: 'annotate',
        say: 'This is the step I want you to notice.',
        boardAction: 'Highlight the relationship or operation.',
        timingMs: 900,
      },
      {
        stage: 'pause',
        say: 'Your turn: what should happen next?',
        boardAction: 'Stop drawing and wait for student reasoning.',
        timingMs: 1600,
      },
    ],
    canvasActions: actions,
    implementationNotes: [
      'Use this as a live board storyboard, not arbitrary drawing permission.',
      'For true Manim rendering, run offline/server-side and return a video artifact only after sandboxing generated code.',
      'Do not block voice response while a long animation renderer is working.',
    ],
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
  removedRectangles?: Array<{ xUnits: number; yUnits: number; widthUnits: number; heightUnits: number; label?: string }>
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
  const removedPieces = (input.removedRectangles ?? [])
    .slice(0, 3)
    .map((piece) => ({
      xUnits: Math.trunc(piece.xUnits),
      yUnits: Math.trunc(piece.yUnits),
      widthUnits: Math.trunc(piece.widthUnits),
      heightUnits: Math.trunc(piece.heightUnits),
      label: piece.label?.trim(),
    }))

  if (
    pieces.length === 0 ||
    [...pieces, ...removedPieces].some(
      (piece) => piece.widthUnits <= 0 || piece.heightUnits <= 0 || piece.xUnits < 0 || piece.yUnits < 0
    )
  ) {
    throw new Error('Composite area needs positive rectangle dimensions and non-negative positions.')
  }

  const allPieces = [...pieces, ...removedPieces]
  const maxX = Math.max(...allPieces.map((piece) => piece.xUnits + piece.widthUnits))
  const maxY = Math.max(...allPieces.map((piece) => piece.yUnits + piece.heightUnits))
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
  let removedArea = 0

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

  removedPieces.forEach((piece) => {
    const area = piece.widthUnits * piece.heightUnits
    removedArea += area
    totalArea -= area
    const x = originX + piece.xUnits * cellSize
    const y = originY + piece.yUnits * cellSize
    const width = piece.widthUnits * cellSize
    const height = piece.heightUnits * cellSize
    actions.push(
      rectangle(x, y, width, height, {
        color: 'red',
        fill: 'semi',
        opacity: 0.2,
        dash: 'dashed',
        size: 'm',
        label: piece.label || `-${area}`,
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
    textLabel(NOTE_FRAME.x + 16, NOTE_FRAME.y + 16, removedPieces.length > 0 ? 'Subtract the missing piece' : 'Add the parts', {
      width: NOTE_FRAME.width - 32,
      color: 'green',
    }),
    ...noteParagraph(
      NOTE_FRAME.x + 16,
      NOTE_FRAME.y + 52,
      [
        ...pieces.slice(0, 4).map((piece, index) => `Part ${index + 1}: ${piece.widthUnits} x ${piece.heightUnits} = ${piece.widthUnits * piece.heightUnits}`),
        ...removedPieces
          .slice(0, 2)
          .map((piece, index) => `Missing ${index + 1}: ${piece.widthUnits} x ${piece.heightUnits} = ${piece.widthUnits * piece.heightUnits}`),
        ...(removedPieces.length > 0 ? [`Subtract missing area: ${removedArea}`] : []),
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
    summary:
      removedPieces.length > 0
        ? `Prepared a missing-piece composite area model with total area ${totalArea} ${formatSquareUnitLabel(unitLabel)}.`
        : `Prepared a composite area model with total area ${totalArea} ${formatSquareUnitLabel(unitLabel)}.`,
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
