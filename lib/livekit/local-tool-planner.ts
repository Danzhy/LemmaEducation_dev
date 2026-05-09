export type LocalToolPlan = {
  toolName: string
  input: Record<string, unknown>
}

type LearnerContextOutput = {
  likelyTopics?: unknown
  struggleSignals?: unknown
  recentExcerpts?: unknown
}

type StudentStepPair = {
  previousStep: string
  nextStep: string
}

type LocalCompositeAreaPiece = {
  width: number
  height: number
}

type LocalCompositeMissingPiece = {
  outer: LocalCompositeAreaPiece
  missing: LocalCompositeAreaPiece
}

const LOCAL_NUMBER_PATTERN = String.raw`-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)`
const LOCAL_PLACE_VALUE_PATTERN =
  String.raw`thousandths?|hundredths?|tenths?|thousands?|hundreds?|tens?|ones?|units?`
const LOCAL_PLACE_VALUE_EXPONENTS: Record<string, number> = {
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
const LOCAL_PLACE_VALUE_LABELS_BY_EXPONENT: Record<number, string> = {
  [-3]: 'thousandths',
  [-2]: 'hundredths',
  [-1]: 'tenths',
  0: 'ones',
  1: 'tens',
  2: 'hundreds',
  3: 'thousands',
}

function formatToolNameForStudent(toolName: string) {
  return toolName.replace(/_/g, ' ')
}

function extractNumbers(text: string) {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
}

type LocalMeasurementType = 'length' | 'mass' | 'capacity' | 'time'

type LocalUnitQuantity = {
  value: number
  unit: string
  measurementType: LocalMeasurementType
}

const LOCAL_UNIT_ALIASES: Record<string, { unit: string; measurementType: LocalMeasurementType }> = {
  mm: { unit: 'mm', measurementType: 'length' },
  millimeter: { unit: 'mm', measurementType: 'length' },
  millimeters: { unit: 'mm', measurementType: 'length' },
  cm: { unit: 'cm', measurementType: 'length' },
  centimeter: { unit: 'cm', measurementType: 'length' },
  centimeters: { unit: 'cm', measurementType: 'length' },
  m: { unit: 'm', measurementType: 'length' },
  meter: { unit: 'm', measurementType: 'length' },
  meters: { unit: 'm', measurementType: 'length' },
  metre: { unit: 'm', measurementType: 'length' },
  metres: { unit: 'm', measurementType: 'length' },
  km: { unit: 'km', measurementType: 'length' },
  kilometer: { unit: 'km', measurementType: 'length' },
  kilometers: { unit: 'km', measurementType: 'length' },
  kilometre: { unit: 'km', measurementType: 'length' },
  kilometres: { unit: 'km', measurementType: 'length' },
  g: { unit: 'g', measurementType: 'mass' },
  gram: { unit: 'g', measurementType: 'mass' },
  grams: { unit: 'g', measurementType: 'mass' },
  kg: { unit: 'kg', measurementType: 'mass' },
  kilogram: { unit: 'kg', measurementType: 'mass' },
  kilograms: { unit: 'kg', measurementType: 'mass' },
  ml: { unit: 'mL', measurementType: 'capacity' },
  milliliter: { unit: 'mL', measurementType: 'capacity' },
  milliliters: { unit: 'mL', measurementType: 'capacity' },
  millilitre: { unit: 'mL', measurementType: 'capacity' },
  millilitres: { unit: 'mL', measurementType: 'capacity' },
  l: { unit: 'L', measurementType: 'capacity' },
  liter: { unit: 'L', measurementType: 'capacity' },
  liters: { unit: 'L', measurementType: 'capacity' },
  litre: { unit: 'L', measurementType: 'capacity' },
  litres: { unit: 'L', measurementType: 'capacity' },
  s: { unit: 'seconds', measurementType: 'time' },
  sec: { unit: 'seconds', measurementType: 'time' },
  second: { unit: 'seconds', measurementType: 'time' },
  seconds: { unit: 'seconds', measurementType: 'time' },
  min: { unit: 'minutes', measurementType: 'time' },
  minute: { unit: 'minutes', measurementType: 'time' },
  minutes: { unit: 'minutes', measurementType: 'time' },
  h: { unit: 'hours', measurementType: 'time' },
  hr: { unit: 'hours', measurementType: 'time' },
  hour: { unit: 'hours', measurementType: 'time' },
  hours: { unit: 'hours', measurementType: 'time' },
}

function parseLocalNumberToken(token: string) {
  const compact = token.replace(/\s+/g, '')
  if (compact.includes('/')) {
    const [numerator, denominator] = compact.split('/').map(Number)
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
    return numerator / denominator
  }

  const value = Number(compact)
  return Number.isFinite(value) ? value : null
}

function parseLocalPlainNumber(token: string) {
  const value = Number(token.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

function normalizeLocalPlaceValue(place: string) {
  const match = place.toLowerCase().match(new RegExp(`\\b(${LOCAL_PLACE_VALUE_PATTERN})\\b`))
  return match ? match[1] : null
}

function localPlaceValueExponent(place: string) {
  const normalized = normalizeLocalPlaceValue(place)
  return normalized ? LOCAL_PLACE_VALUE_EXPONENTS[normalized] ?? null : null
}

function localPlaceValueLabel(exponent: number) {
  return LOCAL_PLACE_VALUE_LABELS_BY_EXPONENT[exponent] ?? 'place'
}

function splitLocalPlaceValueNumber(numberText: string) {
  const compact = numberText.replace(/,/g, '').trim()
  const match = compact.match(/^[-+]?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/)
  if (!match) return null

  return {
    integerDigits: (match[1] ?? '0').replace(/^0+(?=\d)/, '') || '0',
    fractionalDigits: match[2] ?? match[3] ?? '',
  }
}

function localDigitAtExponent(
  split: { integerDigits: string; fractionalDigits: string },
  exponent: number
) {
  if (exponent >= 0) {
    const index = split.integerDigits.length - 1 - exponent
    return index >= 0 ? split.integerDigits[index] : '0'
  }

  const index = Math.abs(exponent) - 1
  return index < split.fractionalDigits.length ? split.fractionalDigits[index] : '0'
}

function findLocalSingleDigitExponent(numberText: string, targetDigit: string) {
  const split = splitLocalPlaceValueNumber(numberText)
  if (!split) return null

  const exponents: number[] = []
  for (let index = 0; index < split.integerDigits.length; index += 1) {
    if (split.integerDigits[index] === targetDigit) {
      exponents.push(split.integerDigits.length - 1 - index)
    }
  }
  for (let index = 0; index < split.fractionalDigits.length; index += 1) {
    if (split.fractionalDigits[index] === targetDigit) {
      exponents.push(-(index + 1))
    }
  }

  return exponents.length === 1 ? exponents[0] : null
}

function buildLocalPlaceValueChartInput(numberText: string, highlightExponent: number) {
  const split = splitLocalPlaceValueNumber(numberText)
  if (!split) return null

  const highestExponent = Math.min(3, Math.max(split.integerDigits.length - 1, highlightExponent, 0))
  const lowestNumberExponent = split.fractionalDigits.length > 0 ? -split.fractionalDigits.length : 0
  const lowestExponent = Math.max(-3, Math.min(lowestNumberExponent, highlightExponent, 0))
  const columns: string[] = []
  const values: string[] = []

  for (let exponent = highestExponent; exponent >= lowestExponent; exponent -= 1) {
    columns.push(localPlaceValueLabel(exponent))
    values.push(localDigitAtExponent(split, exponent))
  }

  if (columns.length < 2) {
    columns.unshift('tens')
    values.unshift('0')
  }

  return {
    title: `Place value in ${numberText}`,
    columns,
    rows: [{ label: numberText, values }],
    highlightColumn: localPlaceValueLabel(highlightExponent),
  }
}

function buildLocalPlaceValueChartInputFromStepPair(pair: StudentStepPair) {
  const digitAtPlaceMatch = pair.previousStep.match(
    new RegExp(`\\bdigit\\s+in\\s+(${LOCAL_PLACE_VALUE_PATTERN})\\s+place\\s+of\\s+(${LOCAL_NUMBER_PATTERN})\\b`, 'i')
  )
  if (digitAtPlaceMatch) {
    const exponent = localPlaceValueExponent(digitAtPlaceMatch[1])
    if (exponent === null) return null
    return buildLocalPlaceValueChartInput(digitAtPlaceMatch[2], exponent)
  }

  const digitValueMatch = pair.previousStep.match(
    new RegExp(`\\bvalue\\s+of\\s+([0-9])\\s+in\\s+(${LOCAL_NUMBER_PATTERN})\\b`, 'i')
  )
  if (digitValueMatch) {
    const exponent = findLocalSingleDigitExponent(digitValueMatch[2], digitValueMatch[1])
    if (exponent === null) return null
    return buildLocalPlaceValueChartInput(digitValueMatch[2], exponent)
  }

  return null
}

function lookupLocalUnit(unitToken: string) {
  return LOCAL_UNIT_ALIASES[unitToken.toLowerCase()] ?? null
}

function extractUnitQuantities(text: string): LocalUnitQuantity[] {
  const quantities: LocalUnitQuantity[] = []
  const matches = text.matchAll(
    /(-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(?:\d+(?:\.\d+)?|\.\d+))?)\s*([a-zA-Z]+)/g
  )

  for (const match of matches) {
    const value = parseLocalNumberToken(match[1])
    const unit = lookupLocalUnit(match[2])
    if (value === null || !unit) continue
    quantities.push({
      value,
      unit: unit.unit,
      measurementType: unit.measurementType,
    })
  }

  return quantities
}

function hasKnownUnitQuantity(text: string) {
  return extractUnitQuantities(text).length > 0
}

function extractUnitConversionRequest(text: string) {
  const quantities = extractUnitQuantities(text)
  if (quantities.length === 0) return null

  const targetMatch = text.match(/\b(?:to|in|as)\s+([a-zA-Z]+)\b/i)
  const targetUnit = targetMatch ? lookupLocalUnit(targetMatch[1]) : null
  const source = quantities[0]
  if (!targetUnit || targetUnit.measurementType !== source.measurementType || targetUnit.unit === source.unit) {
    return null
  }

  return {
    value: source.value,
    fromUnit: source.unit,
    toUnit: targetUnit.unit,
    measurementType: source.measurementType,
  }
}

function extractFractions(text: string) {
  return [...text.matchAll(/(-?\d+)\s*\/\s*(-?\d+)/g)].map((match) => ({
    numerator: Number(match[1]),
    denominator: Number(match[2]),
  }))
}

function extractGraphExpression(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const equationMatch = normalized.match(/(?:graph|plot|draw)\s+(?:the\s+)?(?:function\s+)?(?:y\s*=\s*)?([^.,;\n]+?)(?:\s+from|\s+for|\s+and|\s+with|$)/i)
  const yEqualsMatch = normalized.match(/y\s*=\s*([^.,;\n]+)/i)
  const rawExpression = (yEqualsMatch?.[1] ?? equationMatch?.[1] ?? '')
    .split(/\s+(?:from|for|and|with|where|between|over)\b/i)[0]
    .trim()
  return rawExpression.replace(/^y\s*=\s*/i, '').replace(/\s+/g, ' ').trim()
}

function extractGraphDomain(text: string) {
  const domainMatch = text.match(/x\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:to|through|until|\.{2}|-)\s*(-?\d+(?:\.\d+)?)/i)
  if (!domainMatch) return null
  const start = Number(domainMatch[1])
  const end = Number(domainMatch[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

function extractCoordinatePoints(text: string) {
  return [...text.matchAll(/\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/g)]
    .map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      raw: match[0],
      index: match.index ?? -1,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.index >= 0)
}

function extractCoordinateDistanceRequest(text: string) {
  if (!/\bdistance|length|between|from\b/i.test(text)) return null
  const points = extractCoordinatePoints(text)
  if (points.length < 2) return null
  return {
    pointA: { x: points[0].x, y: points[0].y },
    pointB: { x: points[1].x, y: points[1].y },
  }
}

function extractSlopeRequest(text: string) {
  if (!/\b(slope|rate of change|rise\s*\/\s*run)\b/i.test(text)) return null
  const points = extractCoordinatePoints(text)
  if (points.length < 2) return null
  return {
    pointA: { x: points[0].x, y: points[0].y },
    pointB: { x: points[1].x, y: points[1].y },
  }
}

function pickPlaceValue(lower: string) {
  return extractLocalRoundingPlace(lower) ?? 'tens'
}

function extractLocalRoundingPlace(text: string) {
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

function extractIntegerOperation(text: string) {
  const match = text.match(/(-?\d+)\s*([+-])\s*(-?\d+)/)
  if (!match) return null
  const left = Number(match[1])
  const right = Number(match[3])
  if (!Number.isInteger(left) || !Number.isInteger(right)) return null
  return {
    left,
    right,
    operation: match[2] === '-' ? 'subtract' : 'add',
  } as const
}

function cleanStepText(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/^\s*(?:i\s+(?:got|wrote|tried|changed|think|said)\s+|check\s+this:?\s*|that\s+|then\s+|so\s+|is\s+)/i, '')
    .replace(/\s+\b(?:why|where|what|because|is that|is this|was that|was this|right|wrong|correct|incorrect)\b.*$/i, '')
    .replace(/[?!.,;:]+$/g, '')
    .trim()
}

function hasMathToken(value: string) {
  return /[0-9xX]/.test(value) || /\b(undefined|no\s+slope|vertical)\b/i.test(value)
}

function hasMathStructure(value: string) {
  return (
    /[+\-*/=:%^()]|\/|\bof\b/i.test(value) ||
    /\b(round|rounded|nearest|tenths?|hundredths?|thousandths?|ones?|tens?|hundreds?|thousands?)\b/i.test(value) ||
    /\b(area|perimeter|rectangle|rectangular|triangle|triangular|base|height|altitude)\b/i.test(value) ||
    /\b(angle|degrees?|complementary|complement|supplementary|supplement|linear\s+pair|straight\s+line)\b/i.test(value) ||
    hasKnownUnitQuantity(value)
  )
}

function buildStepPair(previousStep: string, nextStep: string): StudentStepPair | null {
  const previous = cleanStepText(previousStep)
  const next = cleanStepText(nextStep)
  if (!previous || !next || previous.length > 140 || next.length > 140) return null
  if (!hasMathToken(previous) || !hasMathToken(next)) return null
  if (!hasMathStructure(previous) && !hasMathStructure(next)) return null
  return { previousStep: previous, nextStep: next }
}

function splitSingleNumericEquality(candidate: string) {
  const parts = candidate.split('=')
  if (parts.length !== 2) return null
  if (
    (/[a-z]/i.test(parts[0]) || /[a-z]/i.test(parts[1])) &&
    !(hasKnownUnitQuantity(parts[0]) && hasKnownUnitQuantity(parts[1]))
  ) {
    return null
  }
  return buildStepPair(parts[0], parts[1])
}

function extractCoordinatePointAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const expressionMatch = normalized.match(
    /\by\s*=\s*(.+?)(?=\s+(?:at|when|for|where)\b|\s*,\s*(?:point|i\s+plotted|\(?-?\d)|[?!.;]|$)/i
  )
  const pointMatch = normalized.match(
    /(?:plotted|plot|point|coordinate|ordered pair)?\s*\(?\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)?/i
  )
  const expression = expressionMatch?.[1]?.trim()
  if (!expression || !pointMatch) return null

  return buildStepPair(`y = ${expression}`, `(${pointMatch[1]}, ${pointMatch[2]})`)
}

function extractCoordinateDistanceAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const points = extractCoordinatePoints(normalized)
  if (points.length < 2 || !/\bdistance|length|between|from\b/i.test(normalized)) return null

  const firstPointIndex = points[0].index
  const secondPointEnd = points[1].index + points[1].raw.length
  const beforeFirstPoint = normalized.slice(0, firstPointIndex)
  const afterSecondPoint = normalized.slice(secondPointEnd)
  const answerAfter = afterSecondPoint.match(
    /\b(?:is|equals?|was|=|to)\s*(-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*-?(?:\d+(?:\.\d+)?|\.\d+))?)/i
  )
  const answerBefore = beforeFirstPoint.match(
    /\b(?:got|found|answer(?: is)?|think)\s*(-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*-?(?:\d+(?:\.\d+)?|\.\d+))?)\b/i
  )
  const answer = answerAfter?.[1] ?? answerBefore?.[1]
  if (!answer) return null

  return buildStepPair(
    `distance from (${points[0].x}, ${points[0].y}) to (${points[1].x}, ${points[1].y})`,
    answer
  )
}

function extractSlopeAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const points = extractCoordinatePoints(normalized)
  if (points.length < 2 || !/\b(slope|rate of change|rise\s*\/\s*run)\b/i.test(normalized)) return null

  const numericSlopePattern = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*-?(?:\d+(?:\.\d+)?|\.\d+))?`
  const slopeValuePattern = String.raw`(undefined|no\s+slope|vertical|${numericSlopePattern})`
  const firstPointIndex = points[0].index
  const secondPointEnd = points[1].index + points[1].raw.length
  const beforeFirstPoint = normalized.slice(0, firstPointIndex)
  const afterSecondPoint = normalized.slice(secondPointEnd)
  const answerAfter = afterSecondPoint.match(
    new RegExp(`\\b(?:slope|rate\\s+of\\s+change|m)?\\s*(?:is|equals?|=|was|to)\\s*${slopeValuePattern}`, 'i')
  )
  const answerBefore = beforeFirstPoint.match(
    new RegExp(`\\b(?:got|found|answer(?: is)?|think|slope(?: is)?|m\\s*=)\\s*${slopeValuePattern}`, 'i')
  )
  const answer = answerAfter?.[1] ?? answerBefore?.[1]
  if (!answer) return null

  return buildStepPair(
    `slope from (${points[0].x}, ${points[0].y}) to (${points[1].x}, ${points[1].y})`,
    answer
  )
}

function extractLocalRectangleDimensions(text: string) {
  const byMatch = text.match(new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:by|x|×)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i'))
  if (byMatch) {
    const width = parseLocalPlainNumber(byMatch[1])
    const height = parseLocalPlainNumber(byMatch[2])
    if (width !== null && height !== null && width > 0 && height > 0) {
      return { width, height }
    }
  }

  const widthMatch = text.match(new RegExp(`\\b(?:width|wide)\\s*(?:is|=|:)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i'))
  const heightMatch = text.match(new RegExp(`\\b(?:length|height|tall)\\s*(?:is|=|:)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i'))
  if (widthMatch && heightMatch) {
    const width = parseLocalPlainNumber(widthMatch[1])
    const height = parseLocalPlainNumber(heightMatch[1])
    if (width !== null && height !== null && width > 0 && height > 0) {
      return { width, height }
    }
  }

  return null
}

function extractRectangleMeasurementAnswer(text: string, kind: 'area' | 'perimeter') {
  const kindPattern = kind === 'area' ? 'area' : 'perimeter'
  const nearKindMatch =
    text.match(new RegExp(`\\b${kindPattern}\\b\\s*(?:is|was|equals?|=|:|as)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')) ??
    text.match(new RegExp(`\\b(?:got|found|calculated|answer(?:\\s+is)?|think)\\s+(${LOCAL_NUMBER_PATTERN})\\s+(?:for\\s+)?(?:the\\s+)?${kindPattern}\\b`, 'i'))
  if (nearKindMatch) {
    const answer = parseLocalPlainNumber(nearKindMatch[1])
    if (answer !== null) return answer
  }

  const byMatch = text.match(new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:by|x|×)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i'))
  const afterDimensions = byMatch ? text.slice((byMatch.index ?? 0) + byMatch[0].length) : text
  const afterDimensionsMatch = afterDimensions.match(
    new RegExp(`\\b(?:as|is|was|equals?|=|got|answer(?:\\s+is)?)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (afterDimensionsMatch) {
    const answer = parseLocalPlainNumber(afterDimensionsMatch[1])
    if (answer !== null) return answer
  }

  return null
}

function extractRectangleMeasurementAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const hasArea = /\barea\b/i.test(normalized)
  const hasPerimeter = /\bperimeter\b/i.test(normalized)
  if (hasArea === hasPerimeter) return null
  if (!/\b(rectangle|rectangular)\b/i.test(normalized)) return null

  const dimensions = extractLocalRectangleDimensions(normalized)
  if (!dimensions) return null

  const kind = hasArea ? 'area' : 'perimeter'
  const answer = extractRectangleMeasurementAnswer(normalized, kind)
  if (answer === null) return null

  return buildStepPair(
    `${kind} of rectangle ${dimensions.width} by ${dimensions.height}`,
    String(answer)
  )
}

function hasLocalCompositeAreaCue(text: string) {
  return (
    /\barea\b/i.test(text) &&
    /\b(composite|combined|decomposed|split|made\s+(?:up\s+)?of|made\s+from|attached|l[-\s]?shaped|rectangles|parts?)\b/i.test(
      text
    )
  )
}

function extractLocalCompositeAreaPieces(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!hasLocalCompositeAreaCue(normalized)) return null

  const matches = [
    ...normalized.matchAll(new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:by|x|×)\\s*(${LOCAL_NUMBER_PATTERN})`, 'gi')),
  ]
  const pieces = matches
    .map((match) => ({
      width: parseLocalPlainNumber(match[1]),
      height: parseLocalPlainNumber(match[2]),
      endIndex: (match.index ?? 0) + match[0].length,
    }))
    .filter((piece): piece is LocalCompositeAreaPiece & { endIndex: number } => {
      return piece.width !== null && piece.height !== null && piece.width > 0 && piece.height > 0
    })

  if (pieces.length < 2) return null
  return {
    pieces: pieces.map(({ width, height }) => ({ width, height })),
    endIndex: Math.max(...pieces.map((piece) => piece.endIndex)),
  }
}

function extractCompositeAreaAnswer(text: string, piecesEndIndex: number) {
  const beforeAreaMatch = text.match(
    new RegExp(`\\b(?:got|found|calculated|answer(?:\\s+is)?|think)\\s+(${LOCAL_NUMBER_PATTERN})\\s+(?:square\\s+\\w+\\s+)?(?:for\\s+)?(?:the\\s+)?(?:total\\s+)?area\\b`, 'i')
  )
  if (beforeAreaMatch) {
    const answer = parseLocalPlainNumber(beforeAreaMatch[1])
    if (answer !== null) return answer
  }

  const afterPieces = text.slice(piecesEndIndex)
  const afterPiecesMatch = afterPieces.match(
    new RegExp(`\\b(?:as|is|was|equals?|=|got|answer(?:\\s+is)?)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (afterPiecesMatch) {
    const answer = parseLocalPlainNumber(afterPiecesMatch[1])
    if (answer !== null) return answer
  }

  return null
}

function hasLocalMissingPieceCompositeAreaCue(text: string) {
  return (
    /\barea\b/i.test(text) &&
    /\b(rectangle|rectangular|shape|composite|l[-\s]?shaped)\b/i.test(text) &&
    /\b(notch|cut\s*out|cutout|removed|missing|taken\s+out|hole|subtracted?)\b/i.test(text)
  )
}

function extractLocalCompositeMissingPiece(text: string): (LocalCompositeMissingPiece & { endIndex: number }) | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!hasLocalMissingPieceCompositeAreaCue(normalized)) return null

  const matches = [
    ...normalized.matchAll(new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:by|x|×)\\s*(${LOCAL_NUMBER_PATTERN})`, 'gi')),
  ]
  const dimensions = matches
    .map((match) => ({
      width: parseLocalPlainNumber(match[1]),
      height: parseLocalPlainNumber(match[2]),
      index: match.index ?? 0,
      endIndex: (match.index ?? 0) + match[0].length,
    }))
    .filter(
      (dimension): dimension is LocalCompositeAreaPiece & { index: number; endIndex: number } =>
        dimension.width !== null && dimension.height !== null && dimension.width > 0 && dimension.height > 0
    )

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
    endIndex: Math.max(...dimensions.map((dimension) => dimension.endIndex)),
  }
}

function extractCompositeMissingAreaAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const missingPiece = extractLocalCompositeMissingPiece(normalized)
  if (!missingPiece) return null

  const answer = extractCompositeAreaAnswer(normalized, missingPiece.endIndex)
  if (answer === null) return null

  return buildStepPair(
    `area of composite rectangle ${missingPiece.outer.width} by ${missingPiece.outer.height} with ${missingPiece.missing.width} by ${missingPiece.missing.height} missing`,
    String(answer)
  )
}

function extractCompositeAreaAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const composite = extractLocalCompositeAreaPieces(normalized)
  if (!composite) return null

  const answer = extractCompositeAreaAnswer(normalized, composite.endIndex)
  if (answer === null) return null

  return buildStepPair(
    `total area of composite rectangles ${composite.pieces.map((piece) => `${piece.width} by ${piece.height}`).join(' and ')}`,
    String(answer)
  )
}

function buildCompositeAreaBoardRectangles(pieces: LocalCompositeAreaPiece[]) {
  let cursorX = 0
  const rectangles = pieces.slice(0, 6).map((piece, index) => {
    const widthUnits = Math.trunc(piece.width)
    const heightUnits = Math.trunc(piece.height)
    const rectangle = {
      xUnits: cursorX,
      yUnits: 0,
      widthUnits,
      heightUnits,
      label: `Part ${index + 1}`,
    }
    cursorX += widthUnits
    return rectangle
  })

  if (
    rectangles.length < 2 ||
    pieces.some((piece) => !Number.isInteger(piece.width) || !Number.isInteger(piece.height)) ||
    cursorX > 20 ||
    Math.max(...rectangles.map((rectangle) => rectangle.heightUnits)) > 16
  ) {
    return null
  }

  return rectangles
}

function buildCompositeMissingPieceBoardInput(setup: LocalCompositeMissingPiece) {
  const outerWidth = Math.trunc(setup.outer.width)
  const outerHeight = Math.trunc(setup.outer.height)
  const missingWidth = Math.trunc(setup.missing.width)
  const missingHeight = Math.trunc(setup.missing.height)
  if (
    outerWidth <= 0 ||
    outerHeight <= 0 ||
    missingWidth <= 0 ||
    missingHeight <= 0 ||
    outerWidth > 20 ||
    outerHeight > 16 ||
    missingWidth >= outerWidth ||
    missingHeight >= outerHeight
  ) {
    return null
  }

  return {
    rectangles: [{ xUnits: 0, yUnits: 0, widthUnits: outerWidth, heightUnits: outerHeight, label: 'Whole' }],
    removedRectangles: [
      {
        xUnits: outerWidth - missingWidth,
        yUnits: 0,
        widthUnits: missingWidth,
        heightUnits: missingHeight,
        label: 'Missing',
      },
    ],
  }
}

function extractLocalTriangleBaseHeight(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(triangle|triangular)\b/i.test(normalized) || !/\barea\b/i.test(normalized)) return null

  const baseMatch = normalized.match(new RegExp(`\\bbase\\b\\s*(?:is|=|:|of)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i'))
  const heightMatch = normalized.match(
    new RegExp(`\\b(?:height|altitude)\\b\\s*(?:is|=|:|of)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (!baseMatch || !heightMatch) return null

  const base = parseLocalPlainNumber(baseMatch[1])
  const height = parseLocalPlainNumber(heightMatch[1])
  if (base === null || height === null || base <= 0 || height <= 0) return null

  const baseEnd = (baseMatch.index ?? 0) + baseMatch[0].length
  const heightEnd = (heightMatch.index ?? 0) + heightMatch[0].length
  return { base, height, endIndex: Math.max(baseEnd, heightEnd) }
}

function extractTriangleAreaAnswer(text: string, dimensionEndIndex: number) {
  const beforeAreaMatch = text.match(
    new RegExp(`\\b(?:got|found|calculated|answer(?:\\s+is)?|think)\\s+(${LOCAL_NUMBER_PATTERN})\\s+(?:square\\s+\\w+\\s+)?(?:for\\s+)?(?:the\\s+)?area\\b`, 'i')
  )
  if (beforeAreaMatch) {
    const answer = parseLocalPlainNumber(beforeAreaMatch[1])
    if (answer !== null) return answer
  }

  const afterDimensions = text.slice(dimensionEndIndex)
  const afterDimensionsMatch = afterDimensions.match(
    new RegExp(`\\b(?:as|is|was|equals?|=|got|answer(?:\\s+is)?)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (afterDimensionsMatch) {
    const answer = parseLocalPlainNumber(afterDimensionsMatch[1])
    if (answer !== null) return answer
  }

  return null
}

function extractTriangleAreaAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const dimensions = extractLocalTriangleBaseHeight(normalized)
  if (!dimensions) return null

  const answer = extractTriangleAreaAnswer(normalized, dimensions.endIndex)
  if (answer === null) return null

  return buildStepPair(
    `area of triangle with base ${dimensions.base} and height ${dimensions.height}`,
    String(answer)
  )
}

function extractAngleAnswerAfter(text: string) {
  const answerMatch = text.match(
    new RegExp(`\\b(?:as|is|was|equals?|=|got|answer(?:\\s+is)?|think)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (!answerMatch) return null
  return parseLocalPlainNumber(answerMatch[1])
}

function extractAngleAnswerBefore(text: string) {
  const answerMatch =
    text.match(new RegExp(`\\b(?:got|found|calculated|answer(?:\\s+is)?|think)\\s+(${LOCAL_NUMBER_PATTERN})\\s+(?:for|as)\\b`, 'i')) ??
    text.match(new RegExp(`\\b(?:got|found|calculated|think)\\b[^.?!]*?\\b(?:as|is)\\s+(${LOCAL_NUMBER_PATTERN})`, 'i'))
  if (!answerMatch) return null
  return parseLocalPlainNumber(answerMatch[1])
}

function extractPairAngleAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const isComplementary = /\b(complementary|complement)\b/i.test(normalized)
  const isSupplementary = /\b(supplementary|supplement|linear\s+pair|straight\s+line)\b/i.test(normalized)
  if (isComplementary === isSupplementary) return null

  const directMatch = normalized.match(
    new RegExp(
      isComplementary
        ? `\\b(?:complementary|complement)(?:\\s+angle)?\\s+(?:to|of|with)?\\s*(${LOCAL_NUMBER_PATTERN})`
        : `\\b(?:supplementary|supplement)(?:\\s+angle)?\\s+(?:to|of|with)?\\s*(${LOCAL_NUMBER_PATTERN})`,
      'i'
    )
  )
  const oneAngleMatch = normalized.match(
    new RegExp(`\\b(?:one\\s+)?angle\\s*(?:is|=|measures?|measured)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  const fallbackNumberMatch = normalized.match(new RegExp(LOCAL_NUMBER_PATTERN, 'i'))
  const knownMatch = directMatch ?? oneAngleMatch ?? fallbackNumberMatch
  if (!knownMatch) return null

  const knownAngle = parseLocalPlainNumber(knownMatch[1] ?? knownMatch[0])
  if (knownAngle === null || knownAngle < 0) return null

  const knownEnd = (knownMatch.index ?? 0) + knownMatch[0].length
  const answer = extractAngleAnswerAfter(normalized.slice(knownEnd)) ?? extractAngleAnswerBefore(normalized.slice(0, knownEnd))
  if (answer === null) return null

  const relationship = isComplementary ? 'complementary' : 'supplementary'
  return buildStepPair(`${relationship} angle to ${knownAngle}`, String(answer))
}

function extractTriangleAngleAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(triangle|triangular)\b/i.test(normalized) || !/\b(angle|degrees?|missing|third)\b/i.test(normalized)) {
    return null
  }

  const pairMatch = normalized.match(
    new RegExp(
      `\\b(?:triangle|triangular)\\b[^.?!]*?(${LOCAL_NUMBER_PATTERN})\\s*(?:degrees?|deg)?\\s*(?:and|,)\\s*(${LOCAL_NUMBER_PATTERN})`,
      'i'
    )
  )
  if (!pairMatch) return null

  const firstAngle = parseLocalPlainNumber(pairMatch[1])
  const secondAngle = parseLocalPlainNumber(pairMatch[2])
  if (firstAngle === null || secondAngle === null || firstAngle < 0 || secondAngle < 0) return null

  const pairEnd = (pairMatch.index ?? 0) + pairMatch[0].length
  const answer = extractAngleAnswerAfter(normalized.slice(pairEnd)) ?? extractAngleAnswerBefore(normalized.slice(0, pairEnd))
  if (answer === null) return null

  return buildStepPair(`missing angle in triangle with angles ${firstAngle} and ${secondAngle}`, String(answer))
}

function extractAngleRelationshipAttempt(text: string) {
  return extractTriangleAngleAttempt(text) ?? extractPairAngleAttempt(text)
}

function extractLinearEquationSnippets(text: string) {
  const equationPattern =
    /(?:[+-]?(?:\d+(?:\.\d+)?)?\s*x\s*(?:[+-]\s*\d+(?:\.\d+)?)?\s*=\s*-?\d+(?:\.\d+)?|-?\d+(?:\.\d+)?\s*=\s*[+-]?(?:\d+(?:\.\d+)?)?\s*x\s*(?:[+-]\s*\d+(?:\.\d+)?)?)/gi

  return [...text.matchAll(equationPattern)]
    .map((match) => cleanStepText(match[0]))
    .filter(Boolean)
}

function extractLinearEquationAttempt(text: string): StudentStepPair | null {
  if (
    !/\b(?:got|gets|became|becomes|changed|rewrote|ended|subtracted|added|divided|multiplied|both sides|is that|is this|right|correct|mistake|wrong)\b/i.test(
      text
    )
  ) {
    return null
  }

  const equations = extractLinearEquationSnippets(text)
  if (equations.length < 2) return null

  return buildStepPair(equations[0], equations[1])
}

function extractMixedNumberOperationAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const valuePattern = String.raw`-?(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*-?\d+|\d+(?:\.\d+)?|\.\d+)`
  const answerVerb = String.raw`(?:got|gets|equals?|is|=)`

  const additionMatch = normalized.match(
    new RegExp(
      `\\b(?:i\\s+)?(?:added|add)\\s+(${valuePattern})\\s+(?:and|plus|\\+)\\s+(${valuePattern})\\s+(?:and\\s+)?${answerVerb}\\s+(${valuePattern})`,
      'i'
    )
  )
  if (additionMatch) {
    return buildStepPair(`${additionMatch[1]} + ${additionMatch[2]}`, additionMatch[3])
  }

  const subtractFromMatch = normalized.match(
    new RegExp(
      `\\b(?:i\\s+)?(?:subtracted|subtract)\\s+(${valuePattern})\\s+from\\s+(${valuePattern})\\s+(?:and\\s+)?${answerVerb}\\s+(${valuePattern})`,
      'i'
    )
  )
  if (subtractFromMatch) {
    return buildStepPair(`${subtractFromMatch[2]} - ${subtractFromMatch[1]}`, subtractFromMatch[3])
  }

  const minusMatch = normalized.match(
    new RegExp(
      `\\b(${valuePattern})\\s+(?:minus|-)\\s+(${valuePattern})\\s+(?:and\\s+)?${answerVerb}\\s+(${valuePattern})`,
      'i'
    )
  )
  if (minusMatch) {
    return buildStepPair(`${minusMatch[1]} - ${minusMatch[2]}`, minusMatch[3])
  }

  return null
}

function extractPercentChangeAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/%|\bpercent\b/i.test(normalized)) return null
  if (!/\b(percent\s+change|increase|increased|decrease|decreased|went\s+from|changed\s+from|from)\b/i.test(normalized)) {
    return null
  }

  const amountMatch =
    normalized.match(
      new RegExp(
        `\\bfrom\\s+\\$?\\s*(${LOCAL_NUMBER_PATTERN})\\s+(?:to|into|up\\s+to|down\\s+to)\\s+\\$?\\s*(${LOCAL_NUMBER_PATTERN})`,
        'i'
      )
    ) ??
    normalized.match(
      new RegExp(`\\$?\\s*(${LOCAL_NUMBER_PATTERN})\\s*(?:->|→|⇒|to)\\s*\\$?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
    )
  if (!amountMatch) return null

  const from = parseLocalPlainNumber(amountMatch[1])
  const to = parseLocalPlainNumber(amountMatch[2])
  if (from === null || to === null) return null

  const percentMatches = [
    ...normalized.matchAll(new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:%|percent(?:age)?)`, 'gi')),
  ]
  const answerMatch = percentMatches.at(-1)
  const percentValue = answerMatch ? parseLocalPlainNumber(answerMatch[1]) : null
  if (percentValue === null) return null

  const lower = normalized.toLowerCase()
  const direction = /\b(decrease|decreased|decreasing|drop|dropped|loss|lower|less|down|discount)\b/.test(lower)
    ? 'decrease'
    : /\b(increase|increased|increasing|gain|grew|growth|more|up|rise|rose|raised)\b/.test(lower)
      ? 'increase'
      : null

  return buildStepPair(
    `from ${from} to ${to}`,
    `${percentValue}%${direction ? ` ${direction}` : ''}`
  )
}

function extractPercentErrorAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/%|\bpercent\b/i.test(normalized)) return null
  if (!/\b(percent\s+error|error)\b/i.test(normalized)) return null

  const actualMatch = normalized.match(
    new RegExp(
      `\\b(?:actual|accepted|exact|true|correct)\\s+(?:value\\s+)?(?:was|is|=|of)?\\s*\\$?\\s*(${LOCAL_NUMBER_PATTERN})`,
      'i'
    )
  )
  const measuredMatch = normalized.match(
    new RegExp(
      `\\b(?:estimate|estimated|measured|measurement|experimental|observed|approximation|approximate|predicted)\\s+(?:value\\s+)?(?:was|is|=|of)?\\s*\\$?\\s*(${LOCAL_NUMBER_PATTERN})`,
      'i'
    )
  )
  if (!actualMatch || !measuredMatch) return null

  const actual = parseLocalPlainNumber(actualMatch[1])
  const measured = parseLocalPlainNumber(measuredMatch[1])
  if (actual === null || measured === null) return null

  const percentMatches = [
    ...normalized.matchAll(new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:%|percent(?:age)?)`, 'gi')),
  ]
  const answerMatch = percentMatches.at(-1)
  const percentValue = answerMatch ? parseLocalPlainNumber(answerMatch[1]) : null
  if (percentValue === null) return null

  return buildStepPair(
    `actual ${actual}, measured ${measured}`,
    `${percentValue}% error`
  )
}

function extractDecimalRoundingAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(round|rounded|nearest)\b/i.test(normalized)) return null

  const place = extractLocalRoundingPlace(normalized)
  if (!place) return null

  const sourceMatch =
    normalized.match(new RegExp(`\\bround(?:ed)?\\s+\\$?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')) ??
    normalized.match(new RegExp(`\\$?\\s*(${LOCAL_NUMBER_PATTERN})\\s+rounded\\s+to\\s+(?:the\\s+)?(?:nearest\\s+)?`, 'i'))
  if (!sourceMatch) return null

  const source = parseLocalPlainNumber(sourceMatch[1])
  if (source === null) return null

  const afterSource = normalized.slice((sourceMatch.index ?? 0) + sourceMatch[0].length)
  const answerMatch =
    afterSource.match(new RegExp(`\\b(?:got|gets|equals?|is|as)\\s+\\$?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')) ??
    afterSource.match(new RegExp(`=\\s*\\$?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i'))
  const answer = answerMatch ? parseLocalPlainNumber(answerMatch[1]) : null
  if (answer === null) return null

  return buildStepPair(`round ${source} to nearest ${place}`, String(answer))
}

function extractPlaceValueAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(digit|place\s+value|value\s+of|ones?|tens?|hundreds?|thousands?|tenths?|hundredths?|thousandths?)\b/i.test(normalized)) {
    return null
  }

  const digitPlaceMatches = [
    normalized.match(
      new RegExp(
        `\\b(?:digit|number)\\s+(?:is\\s+)?(?:in|at)\\s+(?:the\\s+)?(${LOCAL_PLACE_VALUE_PATTERN})\\s+place\\s+(?:of|in)\\s+(${LOCAL_NUMBER_PATTERN})`,
        'i'
      )
    ),
    normalized.match(
      new RegExp(
        `\\b(?:the\\s+)?(${LOCAL_PLACE_VALUE_PATTERN})\\s+(?:place\\s+)?(?:digit|number)\\s+(?:of|in)\\s+(${LOCAL_NUMBER_PATTERN})`,
        'i'
      )
    ),
  ].filter(Boolean) as RegExpMatchArray[]

  const digitPlaceMatch = digitPlaceMatches[0]
  if (digitPlaceMatch) {
    const before = normalized.slice(0, digitPlaceMatch.index ?? 0)
    const after = normalized.slice((digitPlaceMatch.index ?? 0) + digitPlaceMatch[0].length)
    const answerAfter = after.match(/\b(?:is|was|equals?|=|got|as|answer(?: is)?|think)\s+([0-9])\b/i)
    const answerBefore = before.match(/\b(?:got|wrote|said|think|answer(?: is)?)\s+([0-9])\b/i)
    const answer = answerAfter?.[1] ?? answerBefore?.[1]
    if (!answer) return null

    return buildStepPair(`digit in ${digitPlaceMatch[1]} place of ${digitPlaceMatch[2]}`, answer)
  }

  const valueOfDigitMatch = normalized.match(
    new RegExp(`\\bvalue\\s+of\\s+(?:the\\s+)?([0-9])\\s+(?:in|of)\\s+(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (valueOfDigitMatch) {
    const before = normalized.slice(0, valueOfDigitMatch.index ?? 0)
    const after = normalized.slice((valueOfDigitMatch.index ?? 0) + valueOfDigitMatch[0].length)
    const answerAfter = after.match(new RegExp(`\\b(?:is|was|equals?|=|got|as|answer(?: is)?|think)\\s+(${LOCAL_NUMBER_PATTERN})`, 'i'))
    const answerBefore = before.match(new RegExp(`\\b(?:got|wrote|said|think|answer(?: is)?)\\s+(${LOCAL_NUMBER_PATTERN})`, 'i'))
    const answer = answerAfter?.[1] ?? answerBefore?.[1]
    if (!answer) return null

    return buildStepPair(`value of ${valueOfDigitMatch[1]} in ${valueOfDigitMatch[2]}`, answer)
  }

  return null
}

function extractAlgebraExpressionAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const stopBeforeQuestion = String.raw`(?=\s*(?:[?!]|$|[.](?:\s|$)|\b(?:why|where|what|is that|is this|was that|was this)\b))`
  const connector = String.raw`(?:\s+(?:and\s+)?(?:got|gets|equals?|is)\s+|\s*(?:=|->|→|⇒)\s*|\s+(?:to|into|as)\s+)`

  const actionMatch = normalized.match(
    new RegExp(
      `\\b(?:i\\s+)?(?:distributed|distribute|expanded|expand|simplified|simplify|rewrote|rewrite)\\s+(.{1,120}?)${connector}(.{1,120}?)${stopBeforeQuestion}`,
      'i'
    )
  )
  if (actionMatch) {
    const pair = buildStepPair(actionMatch[1], actionMatch[2])
    if (pair) return pair
  }

  const combineLikeTermsMatch = normalized.match(
    new RegExp(
      `\\b(?:i\\s+)?(?:combined|combine)\\s+(?:like\\s+terms\\s+(?:in\\s+)?)?(.{1,120}?)${connector}(.{1,120}?)${stopBeforeQuestion}`,
      'i'
    )
  )
  if (combineLikeTermsMatch) {
    const pair = buildStepPair(combineLikeTermsMatch[1], combineLikeTermsMatch[2])
    if (pair) return pair
  }

  return null
}

function extractArithmeticOperationAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")

  const stopBeforeQuestion = String.raw`(?=\s*(?:[?!]|$|[.](?:\s|$)|\b(?:why|where|what|is that|is this|was that|was this)\b))`
  const valuePattern = String.raw`-?(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*-?\d+|\d+(?:\.\d+)?|\.\d+)`
  const expressionPattern = String.raw`(?:[-+*/÷×^().\d\s%]|\bof\b){3,120}?`
  const connector = String.raw`(?:\s+(?:and\s+)?(?:got|gets|equals?|is|as)\s+|\s*(?:=|->|→|⇒)\s*)`
  const actionMatch = normalized.match(
    new RegExp(
      `\\b(?:i\\s+)?(?:calculated|calculate|evaluated|evaluate|did|worked\\s+out|simplified|simplify)\\s+(${expressionPattern})${connector}(${valuePattern})${stopBeforeQuestion}`,
      'i'
    )
  )

  if (!actionMatch) return null

  const expression = actionMatch[1].trim()
  if (/[A-Za-z]/.test(expression.replace(/\bof\b/gi, ''))) return null
  if (!/[+\-*/÷×^()]|\bof\b/i.test(expression)) return null

  return buildStepPair(expression, actionMatch[2])
}

function extractStudentStepPair(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const stopBeforeQuestion = String.raw`(?=\s*(?:[?!]|$|[.](?:\s|$)|\b(?:why|where|what|is that|is this|was that|was this)\b))`

  const arrowMatch = normalized.match(new RegExp(`(.{1,140}?)\\s*(?:->|→|⇒)\\s*(.{1,140}?)${stopBeforeQuestion}`, 'i'))
  if (arrowMatch) {
    const pair = buildStepPair(arrowMatch[1], arrowMatch[2])
    if (pair) return pair
  }

  const linearEquationAttempt = extractLinearEquationAttempt(normalized)
  if (linearEquationAttempt) return linearEquationAttempt

  const algebraExpressionAttempt = extractAlgebraExpressionAttempt(normalized)
  if (algebraExpressionAttempt) return algebraExpressionAttempt

  const mixedNumberOperationAttempt = extractMixedNumberOperationAttempt(normalized)
  if (mixedNumberOperationAttempt) return mixedNumberOperationAttempt

  const arithmeticOperationAttempt = extractArithmeticOperationAttempt(normalized)
  if (arithmeticOperationAttempt) return arithmeticOperationAttempt

  const percentErrorAttempt = extractPercentErrorAttempt(normalized)
  if (percentErrorAttempt) return percentErrorAttempt

  const percentChangeAttempt = extractPercentChangeAttempt(normalized)
  if (percentChangeAttempt) return percentChangeAttempt

  const placeValueAttempt = extractPlaceValueAttempt(normalized)
  if (placeValueAttempt) return placeValueAttempt

  const decimalRoundingAttempt = extractDecimalRoundingAttempt(normalized)
  if (decimalRoundingAttempt) return decimalRoundingAttempt

  const slopeAttempt = extractSlopeAttempt(normalized)
  if (slopeAttempt) return slopeAttempt

  const coordinateDistanceAttempt = extractCoordinateDistanceAttempt(normalized)
  if (coordinateDistanceAttempt) return coordinateDistanceAttempt

  const angleRelationshipAttempt = extractAngleRelationshipAttempt(normalized)
  if (angleRelationshipAttempt) return angleRelationshipAttempt

  const compositeMissingAreaAttempt = extractCompositeMissingAreaAttempt(normalized)
  if (compositeMissingAreaAttempt) return compositeMissingAreaAttempt

  const compositeAreaAttempt = extractCompositeAreaAttempt(normalized)
  if (compositeAreaAttempt) return compositeAreaAttempt

  const triangleAreaAttempt = extractTriangleAreaAttempt(normalized)
  if (triangleAreaAttempt) return triangleAreaAttempt

  const rectangleMeasurementAttempt = extractRectangleMeasurementAttempt(normalized)
  if (rectangleMeasurementAttempt) return rectangleMeasurementAttempt

  const rewriteMatch = normalized.match(
    new RegExp(
      `\\b(?:changed|change|went from|go from|from|rewrote|rewrite|turned|turn)\\s+(.{1,140}?)\\s+(?:to|into|as)\\s+(.{1,140}?)${stopBeforeQuestion}`,
      'i'
    )
  )
  if (rewriteMatch) {
    const pair = buildStepPair(rewriteMatch[1], rewriteMatch[2])
    if (pair) return pair
  }

  const coordinateAttempt = extractCoordinatePointAttempt(normalized)
  if (coordinateAttempt) return coordinateAttempt

  const attemptMatch = normalized.match(
    new RegExp(`\\b(?:i got|i wrote|my answer(?: is)?|i think|check this:?)\\s+(.{1,180}?)${stopBeforeQuestion}`, 'i')
  )
  const equalityCandidate = attemptMatch?.[1] ?? normalized
  return splitSingleNumericEquality(equalityCandidate)
}

function inferLocalTopic(text: string) {
  const lower = text.toLowerCase()
  if (extractFractions(text).length > 0 || /\bfraction|denominator|numerator\b/.test(lower)) return 'fractions'
  if (/\b(place value|digit|ones?|tens?|hundreds?|thousands?|tenths?|hundredths?|thousandths?)\b/.test(lower) && !/\bround|rounded|nearest\b/.test(lower)) {
    return 'place value'
  }
  if (/\bdecimal|percent|%|round|rounded|nearest|place value|tenths?|hundredths?|thousandths?|ones?|tens?|hundreds?|thousands?\b/.test(lower)) return 'decimals and percents'
  if (/\bratio|rate|per one|unit rate|scale\b/.test(lower)) return 'ratios'
  if (/\bequation|variable|solve for x|\bx\b/.test(lower)) return 'equations'
  if (/\bnegative|positive|integer|signed|minus\b|-\d/.test(lower)) return 'integers'
  if (/\barea|perimeter|angle|geometry|rectangle|triangle|convert|measurement|meters?|centimeters?|kilometers?|grams?|kilograms?|liters?|milliliters?|seconds?|minutes?|hours?\b/.test(lower)) return 'geometry'
  if (/\bgraph|coordinate|slope|point|axis|distance\b/.test(lower)) return 'graphing'
  if (/\bmean|median|mode|probability|chance|data\b/.test(lower)) return 'data'
  return text.slice(0, 120)
}

export function planLocalToolTurn(prompt: string, gradeLevel: string): LocalToolPlan[] {
  const lower = prompt.toLowerCase()
  const fractions = extractFractions(prompt)
  const numbers = extractNumbers(prompt)
  const unitConversionRequest = extractUnitConversionRequest(prompt)
  const slopeRequest = extractSlopeRequest(prompt)
  const coordinateDistanceRequest = extractCoordinateDistanceRequest(prompt)
  const studentStepPair = extractStudentStepPair(prompt)
  const plans: LocalToolPlan[] = []
  const asksForFullSolution =
    /\b(just tell me|give me the answer|tell me the answer|full solution|show me the solution|solve it for me)\b/.test(lower)
  const hasStudentAttempt =
    /\b(i tried|i got|i found|my answer|i think|check this|i changed|changed|rewrote)\b/.test(lower) ||
    /\b(i added|i subtracted|i calculated|i evaluated|i did|i worked out|i simplified|i rounded|rounded|and got)\b/.test(lower) ||
    /\b(went from|changed from|increased from|decreased from|percent change)\b/.test(lower) ||
    /\b(percent error|actual value|accepted value|measured value|estimate)\b/.test(lower) ||
    prompt.includes('=')
  const asksForCurriculumContext =
    /\b(homework|worksheet|teacher|class notes|uploaded|lesson|curriculum|rubric|directions|from class|my class)\b/.test(lower)
  const asksForLearnerContext =
    /\b(last time|previous session|continue|remember|review what|what did i struggle|my progress|again like before|same as yesterday)\b/.test(lower)
  const hasSpecificMathAction =
    /\b(graph|plot|parabola|function|coordinate|distance|fraction|percent|decimal|round|linear|equation|solve|ratio|rate|area|perimeter|rectangle|triangle|base|height|word problem|plan|integer|negative|positive|signed|convert|measurement|meters?|centimeters?|kilometers?|grams?|kilograms?|liters?|milliliters?|seconds?|minutes?|hours?)\b/.test(lower)
  const asksForMistakeHelp =
    /\b(why.*wrong|what.*wrong|where.*mistake|mistake|incorrect|not right|check my work|check this|is this right|is that right|am i right|is my step right|correct)\b/.test(lower)
  const needsSafetyBoundary =
    /\b(cheat|test answers|exam answers|do my test|phone number|address|password|where do you live|meet me|private photo|secret|kill myself|hurt myself|self harm|suicide|abuse|violence)\b/.test(lower) ||
    (!hasSpecificMathAction &&
      !asksForCurriculumContext &&
      /\b(game|dating|romance|joke|story|politics|medical|diagnose|buy|sell|crypto|stock)\b/.test(lower))

  if (needsSafetyBoundary) {
    plans.push({
      toolName: 'safety_boundary_check',
      input: {
        studentRequest: prompt.slice(0, 500),
        gradeLevel,
        context: 'livekit typed preview',
      },
    })
    return plans
  }

  if (asksForFullSolution) {
    plans.push({
      toolName: 'answer_disclosure_gate',
      input: {
        studentRequest: prompt.slice(0, 240),
        hasStudentAttempt,
        attemptCount: hasStudentAttempt ? 1 : 0,
        isCheckingAnswer: /\b(check|correct|right|wrong)\b/.test(lower),
        askedForFullSolution: true,
      },
    })

    if (!hasStudentAttempt) {
      return plans
    }
  }

  if (asksForLearnerContext) {
    plans.push({
      toolName: 'learner_context',
      input: {
        sessionId: '',
        reason: prompt.slice(0, 240),
      },
    })
    plans.push({
      toolName: 'adaptive_review_plan',
      input: {
        gradeLevel,
        targetTopic: '',
        sessionGoal: prompt.slice(0, 240),
        topics: [],
        struggleSignals: [],
        recentExcerpts: [],
      },
    })

    if (!hasSpecificMathAction && !asksForCurriculumContext) {
      plans.push({
        toolName: 'socratic_move_planner',
        input: {
          topic: 'review from recent learner history',
          gradeLevel,
          studentWork: '',
          tutorGoal: 'diagnose',
        },
      })
      return plans
    }
  }

  if (asksForCurriculumContext) {
    plans.push({
      toolName: 'curriculum_context',
      input: {
        reason: prompt.slice(0, 240),
      },
    })
    plans.push({
      toolName: 'curriculum_search',
      input: {
        query: prompt.slice(0, 300),
        classroomId: '',
        limit: 4,
      },
    })

    if (!hasSpecificMathAction) {
      return plans
    }
  }

  if (/\b(another way|different way|represent|representation|turn.*into|as a table|as an equation|as a graph|with a visual|show visually)\b/.test(lower)) {
    plans.push({
      toolName: 'representation_bridge',
      input: {
        topic: inferLocalTopic(prompt),
        problemContext: prompt.slice(0, 500),
        fromRepresentation: /word|story/.test(lower) ? 'words' : /table/.test(lower) ? 'table' : /graph/.test(lower) ? 'graph' : 'numeric',
        toRepresentation: /table/.test(lower) ? 'table' : /equation|formula/.test(lower) ? 'equation' : /graph/.test(lower) ? 'graph' : /visual|model|diagram/.test(lower) ? 'visual' : 'words',
        studentWork: prompt.slice(0, 500),
      },
    })
    return plans
  }

  if (/\b(worked example|example like this|show an example|i do we do you do|walk me through one|similar example)\b/.test(lower)) {
    plans.push({
      toolName: 'worked_example_fader',
      input: {
        topic: inferLocalTopic(prompt),
        gradeLevel,
        exampleProblem: prompt.slice(0, 500),
        studentWork: '',
      },
    })
    return plans
  }

  if (/\b(exit ticket|wrap up|end of session|end the session|final check|last check|quick check before we finish)\b/.test(lower)) {
    plans.push({
      toolName: 'exit_ticket_builder',
      input: {
        topic: inferLocalTopic(prompt),
        gradeLevel,
        sessionGoal: prompt.slice(0, 240),
        studentEvidence: hasStudentAttempt ? prompt.slice(0, 500) : '',
        difficulty: /harder|challenge|stretch|advanced/.test(lower)
          ? 'stretch'
          : /easy|support|stuck|confused/.test(lower)
            ? 'support'
            : 'core',
        count: /one|1\b/.test(lower) ? 1 : /three|3\b/.test(lower) ? 3 : 2,
      },
    })
    return plans
  }

  if (/\b(quiz me|test me|check if i understand|do i understand|ask me a question|am i ready|before moving on|can i try)\b/.test(lower)) {
    plans.push({
      toolName: 'student_check_question',
      input: {
        topic: inferLocalTopic(prompt),
        gradeLevel,
        studentWork: hasStudentAttempt ? prompt.slice(0, 500) : '',
        recentToolName: '',
        recentToolResult: '',
        checkType: /another|different|similar|new numbers|transfer/.test(lower)
          ? 'transfer'
          : /wrong|mistake|incorrect|check my work/.test(lower)
            ? 'error_spotting'
            : /next|then|after/.test(lower)
              ? 'next_step'
              : 'concept',
      },
    })
    return plans
  }

  if (asksForMistakeHelp && hasStudentAttempt) {
    if (studentStepPair) {
      plans.push({
        toolName: 'math_check_step',
        input: studentStepPair,
      })
      const placeValueChartInput = buildLocalPlaceValueChartInputFromStepPair(studentStepPair)
      if (placeValueChartInput) {
        plans.push({
          toolName: 'place_value_chart',
          input: placeValueChartInput,
        })
      }
      const missingPiece = extractLocalCompositeMissingPiece(studentStepPair.previousStep)
      const missingPieceBoardInput = missingPiece ? buildCompositeMissingPieceBoardInput(missingPiece) : null
      if (missingPieceBoardInput) {
        plans.push({
          toolName: 'composite_area_model',
          input: {
            ...missingPieceBoardInput,
            unitLabel: 'units',
            title: 'Missing-piece area',
          },
        })
      }
    }
    plans.push({
      toolName: 'mistake_pattern_classifier',
      input: {
        topic: inferLocalTopic(prompt),
        studentWork: prompt.slice(0, 700),
        studentExplanation: prompt.slice(0, 700),
        expectedAnswer: '',
      },
    })
    return plans
  }

  if (/\b(animate|animation|step by step|write while|explain while|reveal)\b/i.test(prompt)) {
    plans.push({
      toolName: 'board_animation_plan',
      input: {
        concept: prompt.slice(0, 220),
        visualType: /graph|plot|coordinate|parabola|function/.test(lower)
          ? 'coordinate graph reveal'
          : /fraction|percent|ratio/.test(lower)
            ? 'part-whole visual reveal'
            : 'structured board reveal',
        gradeLevel,
        wantsOfflineVideo: /manim|video|polished/.test(lower),
      },
    })
    if (!/\b(graph|plot|parabola|function)\b/i.test(prompt)) {
      plans.push({
        toolName: 'tutor_teaching_sequence',
        input: {
          topic: prompt.slice(0, 160),
          gradeLevel,
          studentGoal: prompt.slice(0, 220),
          studentWork: '',
        },
      })
      return plans
    }
  }

  if (slopeRequest) {
    plans.push({
      toolName: 'slope_triangle',
      input: {
        ...slopeRequest,
        title: 'Slope triangle',
      },
    })
    return plans
  }

  if (/\b(graph|plot|parabola|function)\b/i.test(prompt)) {
    const expression = extractGraphExpression(prompt) || 'x'
    const domain = extractGraphDomain(prompt)
    plans.push({
      toolName: 'graph_function',
      input: {
        expression,
        domainStart: domain?.start ?? -5,
        domainEnd: domain?.end ?? 5,
        graphType: 'cartesian',
        title: `Graph of y = ${expression}`,
        showXIntercepts: /intercept|root|zero/.test(lower),
        showYIntercept: /intercept|y-axis|where it starts/.test(lower),
        showVertex: /vertex|parabola|\^2|squared/.test(lower),
      },
    })
    return plans
  }

  if (coordinateDistanceRequest) {
    plans.push({
      toolName: 'coordinate_distance',
      input: {
        ...coordinateDistanceRequest,
        title: 'Coordinate distance',
      },
    })
    return plans
  }

  const integerOperation = extractIntegerOperation(prompt)
  if (
    integerOperation &&
    /\b(integer|negative|positive|signed|number line|chips|add|subtract|plus|minus)\b|-\d/.test(lower)
  ) {
    plans.push({
      toolName: 'integer_operation_scene',
      input: {
        left: integerOperation.left,
        right: integerOperation.right,
        operation: integerOperation.operation,
        title: 'Integer operation',
      },
    })
    return plans
  }

  if (/common denominator|denominator/.test(lower) && fractions.length >= 2) {
    plans.push({
      toolName: 'common_denominator',
      input: {
        leftNumerator: fractions[0].numerator,
        leftDenominator: fractions[0].denominator,
        rightNumerator: fractions[1].numerator,
        rightDenominator: fractions[1].denominator,
        purpose: /add|subtract|\+|-/.test(lower) ? 'add_subtract' : 'compare',
      },
    })
    return plans
  }

  if (/compare/.test(lower) && fractions.length >= 2) {
    plans.push({
      toolName: 'fraction_compare',
      input: {
        leftNumerator: fractions[0].numerator,
        leftDenominator: fractions[0].denominator,
        rightNumerator: fractions[1].numerator,
        rightDenominator: fractions[1].denominator,
        title: 'Compare the fractions',
      },
    })
    return plans
  }

  if (/simplify|reduce|equivalent fraction/.test(lower) && fractions.length >= 1) {
    plans.push({
      toolName: 'fraction_simplify',
      input: {
        numerator: fractions[0].numerator,
        denominator: fractions[0].denominator,
      },
    })
    return plans
  }

  if (/percent bar|out of/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'percent_bar',
      input: {
        part: numbers[0],
        total: numbers[1],
        title: 'Percent bar',
        label: `${numbers[0]} out of ${numbers[1]}`,
      },
    })
    return plans
  }

  if (/%\s*of|percent of/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'percent_of_number',
      input: {
        percent: numbers[0],
        whole: numbers[1],
      },
    })
    plans.push({
      toolName: 'percent_bar',
      input: {
        part: numbers[0],
        total: 100,
        title: `${numbers[0]}% of ${numbers[1]}`,
        label: `${numbers[0]}%`,
      },
    })
    return plans
  }

  if (/decimal|compare/.test(lower) && numbers.length >= 2 && numbers.some((number) => !Number.isInteger(number))) {
    plans.push({
      toolName: 'decimal_compare',
      input: {
        left: numbers[0],
        right: numbers[1],
      },
    })
    return plans
  }

  if (/round/.test(lower) && numbers.length >= 1) {
    plans.push({
      toolName: 'round_number',
      input: {
        value: numbers[0],
        place: pickPlaceValue(lower),
      },
    })
    return plans
  }

  if (unitConversionRequest && /\b(convert|conversion|to|in|as|measurement|unit)\b/.test(lower)) {
    plans.push({
      toolName: 'unit_conversion',
      input: {
        ...unitConversionRequest,
        title: 'Unit conversion',
      },
    })
    return plans
  }

  if (/linear|equation|solve|x\s*=|[+-]?\d*x\s*[+-]\s*\d+\s*=/.test(lower) && /x/.test(lower) && /=/.test(prompt)) {
    const equation = prompt.match(/([+-]?\d*\s*x\s*(?:[+-]\s*\d+)?\s*=\s*-?\d+(?:\.\d+)?)/i)?.[1] ?? prompt
    plans.push({
      toolName: 'solve_linear_on_canvas',
      input: {
        problem: equation.trim(),
        maxSteps: 2,
      },
    })
    return plans
  }

  if (/\b(double number line|unit rate|cost|ratio|notebook|recipe|muffin)s?\b/.test(lower) && numbers.length >= 2) {
    const quantity = numbers[0]
    const value = numbers[1]
    const target = numbers[2]
    if (/unit rate|cost/.test(lower)) {
      plans.push({
        toolName: 'unit_rate',
        input: {
          quantity,
          value,
          quantityLabel: /notebook/.test(lower) ? 'notebooks' : 'units',
          valueLabel: /\$|cost/.test(lower) ? 'dollars' : 'value',
        },
      })
    }
    plans.push({
      toolName: 'double_number_line',
      input: {
        topLabel: /notebook/.test(lower) ? 'notebooks' : 'quantity',
        bottomLabel: /\$|cost/.test(lower) ? 'cost' : 'value',
        pairs: [
          { top: 0, bottom: 0, label: 'start' },
          { top: quantity, bottom: value, label: 'given' },
          ...(typeof target === 'number'
            ? [{ top: target, bottom: (value / quantity) * target, label: 'target' }]
            : []),
        ],
        title: 'Double number line',
      },
    })
    return plans
  }

  const missingPieceArea = extractLocalCompositeMissingPiece(prompt)
  const missingPieceBoardInput = missingPieceArea ? buildCompositeMissingPieceBoardInput(missingPieceArea) : null
  if (missingPieceBoardInput) {
    plans.push({
      toolName: 'composite_area_model',
      input: {
        ...missingPieceBoardInput,
        unitLabel: 'units',
        title: 'Missing-piece area',
      },
    })
    return plans
  }

  const compositeArea = extractLocalCompositeAreaPieces(prompt)
  const compositeRectangles = compositeArea ? buildCompositeAreaBoardRectangles(compositeArea.pieces) : null
  if (compositeRectangles) {
    plans.push({
      toolName: 'composite_area_model',
      input: {
        rectangles: compositeRectangles,
        unitLabel: 'units',
        title: 'Composite area',
      },
    })
    return plans
  }

  if (/\b(triangle|triangular)\b/.test(lower) && /\barea\b/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'geometry_figure',
      input: {
        figureType: 'triangle',
        labels: ['A', 'B', 'C'],
      },
    })
    return plans
  }

  if (/area|perimeter|rectangle/.test(lower) && !/\b(triangle|triangular)\b/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'area_perimeter_model',
      input: {
        widthUnits: numbers[0],
        heightUnits: numbers[1],
        unitLabel: 'units',
        title: 'Area and perimeter model',
        showUnitSquares: true,
      },
    })
    return plans
  }

  if (/word problem|plan|recipe|muffin/.test(lower)) {
    plans.push({
      toolName: 'problem_understanding_map',
      input: {
        problemText: prompt,
        gradeLevel,
        studentWork: '',
      },
    })
    plans.push({
      toolName: 'word_problem_plan',
      input: {
        problemText: prompt,
        gradeLevel,
      },
    })
    return plans
  }

  plans.push({
    toolName: 'socratic_move_planner',
    input: {
      topic: prompt.slice(0, 180),
      gradeLevel,
      studentWork: prompt,
      tutorGoal: 'unstick',
    },
  })
  plans.push({
    toolName: 'write_on_canvas',
    input: {
      title: 'Let us set this up',
      textLines: ['Tell me what you tried first.', 'Then we can check the step where it got confusing.'],
      clearExisting: true,
    },
  })
  return plans
}

function findLearnerContextOutput(outputs: unknown[]): LearnerContextOutput | null {
  return (
    outputs.find(
      (output): output is LearnerContextOutput =>
        Boolean(output && typeof output === 'object' && 'likelyTopics' in output)
    ) ?? null
  )
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, limit)
    : []
}

function excerptArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object' && 'content' in item) {
        const content = (item as { content?: unknown }).content
        return typeof content === 'string' ? content.trim() : ''
      }
      return ''
    })
    .filter(Boolean)
    .slice(0, limit)
}

export function hydrateLocalToolPlanInput(
  plan: LocalToolPlan,
  previousOutputs: unknown[],
  prompt: string,
  gradeLevel: string
) {
  if (plan.toolName !== 'adaptive_review_plan') return plan.input

  const learnerContext = findLearnerContextOutput(previousOutputs)
  if (!learnerContext) return plan.input

  const topics = stringArray(learnerContext.likelyTopics, 5)
  const struggleSignals = stringArray(learnerContext.struggleSignals, 5)
  const recentExcerpts = excerptArray(learnerContext.recentExcerpts, 6)

  return {
    ...plan.input,
    gradeLevel,
    targetTopic: topics[0] ?? '',
    sessionGoal: prompt.slice(0, 240),
    topics,
    struggleSignals,
    recentExcerpts,
  }
}

export function buildLocalAssistantReply(_prompt: string, plans: LocalToolPlan[], outputs: unknown[]) {
  const firstTool = plans[0]?.toolName
  if (!firstTool) {
    return 'I am ready. Type a math problem and I will help you reason through it.'
  }

  if (firstTool === 'graph_function') {
    return 'I put the graph on the board. Start by reading the key points, then tell me which part you want to reason through first.'
  }

  if (firstTool === 'answer_disclosure_gate') {
    const gate = outputs.find(
      (output): output is { sayThis?: string; decision?: string } =>
        Boolean(output && typeof output === 'object' && 'decision' in output)
    )
    if (gate?.sayThis) return gate.sayThis
    return 'I will start with the next useful hint so you still get to do the thinking.'
  }

  if (firstTool === 'board_animation_plan') {
    return 'I set up a staged board reveal. I will show one useful mark at a time, then pause so you can make the next move.'
  }

  if (firstTool === 'learner_context') {
    return 'I checked your recent tutoring history and made a quick review plan. I will start with one diagnostic question, then use the board only where it helps.'
  }

  if (firstTool === 'curriculum_context' || firstTool === 'curriculum_search') {
    return 'I checked the class context first. I will use it for vocabulary, examples, and pacing without reading long notes back at you.'
  }

  if (firstTool === 'safety_boundary_check') {
    const boundary = outputs.find(
      (output): output is { sayThis?: string } =>
        Boolean(output && typeof output === 'object' && 'sayThis' in output)
    )
    return boundary?.sayThis || 'I can help with math here. Send me a problem or a step you want to check.'
  }

  if (firstTool === 'mistake_pattern_classifier') {
    const classified = outputs.find(
      (output): output is { diagnosticQuestion?: string; primaryPattern?: string } =>
        Boolean(output && typeof output === 'object' && 'diagnosticQuestion' in output)
    )
    return classified?.diagnosticQuestion
      ? `I found the likely reasoning pattern. ${classified.diagnosticQuestion}`
      : 'I checked the mistake pattern. Let us focus on one step and explain why it changes.'
  }

  if (firstTool === 'math_check_step') {
    const checkedStep = outputs.find(
      (output): output is { verdict?: string; reason?: string; hintTarget?: string } =>
        Boolean(output && typeof output === 'object' && 'verdict' in output)
    )
    const hasPlaceValueChart = plans.some((plan) => plan.toolName === 'place_value_chart')
    const hasCompositeAreaModel = plans.some((plan) => plan.toolName === 'composite_area_model')
    const boardCue = hasPlaceValueChart
      ? ' I also highlighted the place-value chart so the target column is visible.'
      : hasCompositeAreaModel
        ? ' I also put the whole rectangle and missing piece on the board.'
        : ''
    if (checkedStep?.verdict === 'valid') {
      return `I checked that step first, and it stays equivalent. ${checkedStep.reason}${boardCue} What rule made that step work?`
    }
    if (checkedStep?.verdict === 'invalid') {
      return `I checked that step first, and something changed. ${checkedStep.reason}${boardCue} What should we check about ${checkedStep.hintTarget}?`
    }
    if (checkedStep?.verdict === 'unclear') {
      const reason = checkedStep.reason ? ` ${checkedStep.reason}` : ''
      const question = checkedStep.hintTarget
        ? ` Can you ${checkedStep.hintTarget}?`
        : ' Can you rewrite the previous line and the next line separately?'
      return `I tried to check that step first, but I need one clarification.${reason}${question}`
    }
    return 'I tried to check that step first, but the notation needs to be clearer. Can you rewrite the previous line and the next line separately?'
  }

  if (firstTool === 'problem_understanding_map') {
    return 'I mapped the knowns, the unknown, and the useful representation first. Tell me which quantity the problem is asking us to find.'
  }

  if (firstTool === 'representation_bridge') {
    return 'I planned how to connect those representations. Keep the meaning the same, then tell me which part matches across both forms.'
  }

  if (firstTool === 'worked_example_fader') {
    return 'I planned this as I do, we do, you do. I will model only the setup first, then leave the next step for you.'
  }

  if (firstTool === 'tutor_teaching_sequence') {
    return 'I planned this like a tutor turn: one short explanation, one board move, and one question for you to answer.'
  }

  if (firstTool === 'student_check_question') {
    const check = outputs.find(
      (output): output is { question?: string } =>
        Boolean(output && typeof output === 'object' && 'question' in output)
    )
    return check?.question
      ? `Let me check one thing before we move on: ${check.question}`
      : 'Let me ask one quick check question before we move on.'
  }

  if (firstTool === 'exit_ticket_builder') {
    const ticket = outputs.find(
      (output): output is { items?: Array<{ prompt?: string }> } =>
        Boolean(output && typeof output === 'object' && 'items' in output)
    )
    const firstPrompt = ticket?.items?.find((item) => item.prompt)?.prompt
    return firstPrompt
      ? `Let us wrap with a quick exit ticket. First: ${firstPrompt}`
      : 'Let us wrap with a quick exit ticket. Try the first problem out loud before I check it.'
  }

  if (firstTool === 'solve_linear_on_canvas') {
    return 'I wrote the next algebra steps on the board. Before going further, check which operation undoes the last change.'
  }

  if (firstTool === 'percent_bar') {
    return 'I drew a percent bar so the part and whole are visible. Use the shaded part to explain the percent before jumping to the answer.'
  }

  if (firstTool === 'unit_conversion') {
    return 'I set up the unit conversion on the board. Use the conversion factor first, then check whether the measurement still means the same amount.'
  }

  if (firstTool === 'slope_triangle') {
    return 'I put a slope triangle on the board. Compare rise to run first, then tell me what the slope means.'
  }

  if (firstTool === 'double_number_line' || firstTool === 'unit_rate') {
    return 'I set up the rate visually. Look for the value per 1 unit first, then scale from there.'
  }

  if (firstTool === 'integer_operation_scene') {
    return 'I put the signed integer move on the number line. Say which direction the change moves before we decide the answer.'
  }

  if (firstTool.includes('fraction') || firstTool === 'common_denominator') {
    return 'I added a fraction visual or checked fraction step on the board. Focus on the size of the parts before calculating.'
  }

  const summary = outputs
    .map((output) => {
      if (!output || typeof output !== 'object') return null
      const record = output as Record<string, unknown>
      if (typeof record.summary === 'string') return record.summary
      if (typeof record.suggestedQuestion === 'string') return record.suggestedQuestion
      if (typeof record.reason === 'string') return record.reason
      return null
    })
    .find(Boolean)

  return summary ?? `I used the ${formatToolNameForStudent(firstTool)} tool and put the useful structure on the board. What should we check next?`
}
