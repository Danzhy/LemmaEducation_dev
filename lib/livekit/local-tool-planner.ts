export type LocalToolPlan = {
  toolName: string
  input: Record<string, unknown>
}

type LocalToolPlannerContext = {
  boardDescription?: string
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

type LocalTapeDiagramInput = {
  title: string
  bars: Array<{
    label: string
    segments: Array<{
      label: string
      value: number | string
      shaded: boolean
    }>
  }>
}

type LocalComparisonLabelHints = {
  firstName?: string
  secondName?: string
  unitLabel?: string
}

type LocalNamedQuantityMention = {
  name: string
  amount: number
  unitLabel?: string
}

type LocalCompositeAreaPiece = {
  width: number
  height: number
}

type LocalCompositeMissingPiece = {
  outer: LocalCompositeAreaPiece
  missing: LocalCompositeAreaPiece
}

type LocalTriangleVertex = {
  label: string
  x: number
  y: number
}

type LocalFraction = {
  numerator: number
  denominator: number
  label: string
}

const LOCAL_NUMBER_PATTERN = String.raw`-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)`
const LOCAL_NAME_PATTERN = String.raw`[A-Z][A-Za-z'-]{1,30}`
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

function formatLocalNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/g, '')
}

function normalizeLocalEntityName(name?: string | null) {
  const trimmed = name?.trim().replace(/[^\w'-]+$/g, '')
  if (!trimmed) return undefined
  if (/^(?:how|what|when|where|which|why|who|there|the|a|an)$/i.test(trimmed)) return undefined
  return trimmed
}

function normalizeLocalUnitLabel(unit?: string | null) {
  const trimmed = unit?.trim().toLowerCase().replace(/[^a-z-]+$/g, '')
  if (!trimmed) return undefined
  if (
    /^(?:more|fewer|less|than|who|what|how|many|much|does|do|did|has|have|had|is|are|was|were|left|remaining)$/i.test(
      trimmed
    )
  ) {
    return undefined
  }
  return trimmed
}

function chooseLocalComparisonUnit(...units: Array<string | undefined>) {
  const normalized = units.map((unit) => normalizeLocalUnitLabel(unit)).filter((unit): unit is string => Boolean(unit))
  if (normalized.length === 0) return undefined
  const unique = new Set(normalized)
  return unique.size === 1 ? normalized[0] : undefined
}

function formatComparisonBarLabel(role: 'Larger' | 'Smaller', value: number, name?: string, unitLabel?: string) {
  const amount = formatLocalNumber(value)
  const normalizedName = normalizeLocalEntityName(name)
  const normalizedUnit = normalizeLocalUnitLabel(unitLabel)
  if (normalizedName) {
    return `${normalizedName} ${amount}${normalizedUnit ? ` ${normalizedUnit}` : ''}`
  }
  return `${role} ${amount}`
}

function extractNumbers(text: string) {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
}

function normalizeLocalPromptText(text: string) {
  return text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
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

function extractLocalPercentOfRequest(text: string) {
  const match = text.match(
    new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:%|percent(?:age)?)\\s+of\\s+(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (!match) return null

  const percent = parseLocalPlainNumber(match[1])
  const whole = parseLocalPlainNumber(match[2])
  if (percent === null || whole === null) return null

  return { percent, whole }
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

function extractVisualFractions(text: string): LocalFraction[] {
  const characters = [...text]
  const fractions: LocalFraction[] = []
  const mixedPattern = /(^|[^A-Za-z0-9_.])(-?\d+)\s+(\d+)\s*\/\s*(\d+)(?=$|[^A-Za-z0-9_])/g

  for (const match of text.matchAll(mixedPattern)) {
    const prefix = match[1] ?? ''
    const start = (match.index ?? 0) + prefix.length
    const end = (match.index ?? 0) + match[0].length
    for (let index = start; index < end; index += 1) {
      characters[index] = ' '
    }

    const whole = Number(match[2])
    const numerator = Number(match[3])
    const denominator = Number(match[4])
    if (!Number.isFinite(whole) || !Number.isFinite(numerator) || !Number.isFinite(denominator)) continue
    if (whole < 0 || numerator < 0 || denominator <= 0) continue

    const improperNumerator = whole * denominator + numerator
    fractions.push({
      numerator: improperNumerator,
      denominator,
      label: `${whole} ${numerator}/${denominator} = ${improperNumerator}/${denominator}`,
    })
  }

  const maskedText = characters.join('')
  for (const match of maskedText.matchAll(/(-?\d+)\s*\/\s*(-?\d+)/g)) {
    const numerator = Number(match[1])
    const denominator = Number(match[2])
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) continue
    if (numerator < 0 || denominator <= 0) continue
    fractions.push({
      numerator,
      denominator,
      label: `${numerator}/${denominator}`,
    })
  }

  return fractions
}

function wantsLocalFractionStrip(prompt: string) {
  const lower = prompt.toLowerCase()
  return (
    /\bfraction\s+(?:bar|strip|model)\b/.test(lower) ||
    /\b(?:show|draw|model|visualize)\b.{0,80}\bfraction\b/.test(lower) ||
    /\bfraction\b.{0,80}\b(?:bar|strip|model|visual)\b/.test(lower)
  )
}

function wantsEquivalentFractionBars(prompt: string) {
  const lower = prompt.toLowerCase()
  return (
    /\b(?:equivalent|same\s+value|equal\s+fractions?)\b/.test(lower) &&
    /\b(?:fraction|bar|strip|model|visual|show|draw|compare)\b/.test(lower)
  )
}

function wantsLocalTapeDiagram(prompt: string) {
  const lower = prompt.toLowerCase()
  return /\b(?:tape\s+diagram|tape\s+model|bar\s+model|part[- ]?whole\s+model|comparison\s+(?:bar|model))\b/.test(
    lower
  )
}

function buildPartWholeTapeDiagramInput(whole: number, known: number, title: string): LocalTapeDiagramInput | null {
  if (!Number.isFinite(whole) || !Number.isFinite(known) || whole < 0 || known < 0 || whole < known) {
    return null
  }

  const unknown = Number((whole - known).toFixed(6))
  return {
    title,
    bars: [
      {
        label: `Whole ${formatLocalNumber(whole)}`,
        segments: [
          { label: `Known ${formatLocalNumber(known)}`, value: known, shaded: true },
          {
            label: unknown > 0 ? `Unknown ${formatLocalNumber(unknown)}` : 'Unknown',
            value: unknown > 0 ? unknown : '?',
            shaded: false,
          },
        ],
      },
    ],
  }
}

function extractNamedQuantityMentions(prompt: string): LocalNamedQuantityMention[] {
  const namePattern = `(${LOCAL_NAME_PATTERN})`
  const amountPattern = `(${LOCAL_NUMBER_PATTERN})`
  const verbPattern =
    String.raw`(?:has|have|had|read|reads|collected|scored|earned|saved|made|ran|walked|spent|used|sold|ate|found|picked|owns|got|gets|bought|needs)`
  const regex = new RegExp(
    String.raw`\b${namePattern}\s+${verbPattern}\s+(?:\w+\s+){0,4}?${amountPattern}(?:\s+([A-Za-z][A-Za-z-]*))?`,
    'g'
  )

  const mentions: LocalNamedQuantityMention[] = []
  for (const match of prompt.matchAll(regex)) {
    const name = normalizeLocalEntityName(match[1])
    const amount = parseLocalPlainNumber(match[2])
    if (!name || amount === null || amount < 0) continue

    const unitLabel = normalizeLocalUnitLabel(match[3])
    const mention: LocalNamedQuantityMention = { name, amount }
    if (unitLabel) mention.unitLabel = unitLabel
    mentions.push(mention)
  }

  return mentions
}

function buildDirectComparisonLabelHints(prompt: string): LocalComparisonLabelHints | undefined {
  const mentions = extractNamedQuantityMentions(prompt).slice(0, 2)
  if (mentions.length < 2) return undefined

  return {
    firstName: mentions[0].name,
    secondName: mentions[1].name,
    unitLabel: chooseLocalComparisonUnit(mentions[0].unitLabel, mentions[1].unitLabel),
  }
}

function buildDifferenceBeforeAnchorLabelHints(
  prompt: string,
  direction: 'more' | 'fewer' | 'less'
): LocalComparisonLabelHints | undefined {
  const match = prompt.match(
    new RegExp(
      String.raw`\b(${LOCAL_NAME_PATTERN})\s+(?:has|have|had|is|are|read|reads|collected|scored|earned|saved|made|owns|got|gets)?\s+(${LOCAL_NUMBER_PATTERN})\s+(more|fewer|less)(?:\s+([A-Za-z][A-Za-z-]*))?\s+than\s+(${LOCAL_NAME_PATTERN})\b[\s\S]{0,90}?(${LOCAL_NUMBER_PATTERN})(?:\s+([A-Za-z][A-Za-z-]*))?`,
      'i'
    )
  )
  if (!match || match[3].toLowerCase() !== direction) return undefined

  const subjectName = normalizeLocalEntityName(match[1])
  const anchorName = normalizeLocalEntityName(match[5])
  if (!subjectName && !anchorName) return undefined

  return {
    firstName: anchorName,
    secondName: subjectName,
    unitLabel: chooseLocalComparisonUnit(match[4], match[7]),
  }
}

function buildAnchorBeforeDifferenceLabelHints(
  prompt: string,
  direction: 'more' | 'fewer' | 'less'
): LocalComparisonLabelHints | undefined {
  const match = prompt.match(
    new RegExp(
      String.raw`\b(${LOCAL_NAME_PATTERN})\s+(?:has|have|had|is|are|read|reads|collected|scored|earned|saved|made|owns|got|gets)\s+(${LOCAL_NUMBER_PATTERN})(?:\s+([A-Za-z][A-Za-z-]*))?\b[\s\S]{0,140}?\b(${LOCAL_NAME_PATTERN})\s+(?:has|have|had|is|are|read|reads|collected|scored|earned|saved|made|owns|got|gets)?\s+(${LOCAL_NUMBER_PATTERN})\s+(more|fewer|less)(?:\s+([A-Za-z][A-Za-z-]*))?\s+than\s+(${LOCAL_NAME_PATTERN})\b`,
      'i'
    )
  )
  if (!match || match[6].toLowerCase() !== direction) return undefined

  const anchorName = normalizeLocalEntityName(match[1])
  const subjectName = normalizeLocalEntityName(match[4])
  if (!anchorName && !subjectName) return undefined

  return {
    firstName: anchorName,
    secondName: subjectName,
    unitLabel: chooseLocalComparisonUnit(match[3], match[7]),
  }
}

function buildComparisonTapeDiagramInput(
  first: number,
  second: number,
  title: string,
  labelHints?: LocalComparisonLabelHints
): LocalTapeDiagramInput | null {
  if (!Number.isFinite(first) || !Number.isFinite(second) || first < 0 || second < 0) {
    return null
  }

  const larger = Math.max(first, second)
  const smaller = Math.min(first, second)
  const difference = Number((larger - smaller).toFixed(6))
  const firstIsLarger = first >= second
  const largerName = firstIsLarger ? labelHints?.firstName : labelHints?.secondName
  const smallerName = firstIsLarger ? labelHints?.secondName : labelHints?.firstName
  const largerSegments = [
    { label: `Matching ${formatLocalNumber(smaller)}`, value: smaller, shaded: true },
  ]
  const smallerSegments = [
    { label: `Compared ${formatLocalNumber(smaller)}`, value: smaller, shaded: true },
  ]

  if (difference > 0) {
    largerSegments.push({ label: `More ${formatLocalNumber(difference)}`, value: difference, shaded: false })
    smallerSegments.push({ label: `Gap ${formatLocalNumber(difference)}`, value: difference, shaded: false })
  }

  return {
    title,
    bars: [
      {
        label: formatComparisonBarLabel('Larger', larger, largerName, labelHints?.unitLabel),
        segments: largerSegments,
      },
      {
        label: formatComparisonBarLabel('Smaller', smaller, smallerName, labelHints?.unitLabel),
        segments: smallerSegments,
      },
    ],
  }
}

function buildDifferenceKnownComparisonTapeDiagramInput(
  anchorAmount: number,
  difference: number,
  direction: 'more' | 'fewer' | 'less',
  title: string,
  labelHints?: LocalComparisonLabelHints
): LocalTapeDiagramInput | null {
  if (
    !Number.isFinite(anchorAmount) ||
    !Number.isFinite(difference) ||
    anchorAmount < 0 ||
    difference < 0
  ) {
    return null
  }

  const comparedAmount = Number(
    (direction === 'more' ? anchorAmount + difference : anchorAmount - difference).toFixed(6)
  )
  if (comparedAmount < 0) return null

  return buildComparisonTapeDiagramInput(anchorAmount, comparedAmount, title, labelHints)
}

function buildInferredPartWholeTapeDiagramInput(prompt: string): LocalTapeDiagramInput | null {
  const lower = prompt.toLowerCase()
  const values = extractNumbers(prompt).filter((value) => Number.isFinite(value) && value >= 0).slice(0, 5)
  if (values.length < 2) return null
  if (/%|\b(percent|ratio|rate|probability|chance|mean|median|mode|range|coordinate|graph|equation)\b/.test(lower)) {
    return null
  }

  const asksForUnknownPart =
    /\bhow\s+(?:many|much)\b/.test(lower) &&
    /\b(left|remain(?:ing)?|rest|missing|unknown|still\s+need|not|are|were|is)\b/.test(lower)
  const partWholeCue =
    /\b(total|altogether|in all|whole|left|remaining|rest|started with|now\s+\w{0,20}\s*has|there (?:are|were)|has|had|used|gave|spent|ate|read|sold|lost|out of|of the|are|were)\b/.test(
      lower
    )
  if (!asksForUnknownPart || !partWholeCue) return null

  const numberPattern = new RegExp(`(${LOCAL_NUMBER_PATTERN})`, 'i')
  const outOfMatch = lower.match(new RegExp(`(${LOCAL_NUMBER_PATTERN})\\s*(?:out\\s+of|of)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i'))
  if (outOfMatch) {
    const known = parseLocalPlainNumber(outOfMatch[1])
    const whole = parseLocalPlainNumber(outOfMatch[2])
    if (known !== null && whole !== null) return buildPartWholeTapeDiagramInput(whole, known, 'Part-whole tape diagram')
  }

  const startNowMatch = lower.match(
    new RegExp(
      `\\b(?:started\\s+with|had|has)\\s+(${LOCAL_NUMBER_PATTERN})\\b[\\s\\S]{0,140}\\b(?:now\\s+(?:\\w+\\s+){0,3}(?:has|have)|total(?:s)?|altogether|in\\s+all)\\s+(${LOCAL_NUMBER_PATTERN})\\b`,
      'i'
    )
  )
  if (startNowMatch) {
    const known = parseLocalPlainNumber(startNowMatch[1])
    const whole = parseLocalPlainNumber(startNowMatch[2])
    if (known !== null && whole !== null) return buildPartWholeTapeDiagramInput(whole, known, 'Part-whole tape diagram')
  }

  const ofWholeMatch = lower.match(
    new RegExp(`\\bof\\s+(?:the\\s+|a\\s+)?(${LOCAL_NUMBER_PATTERN})\\b[\\s\\S]{0,120}?\\b(${LOCAL_NUMBER_PATTERN})\\b`, 'i')
  )
  if (ofWholeMatch) {
    const whole = parseLocalPlainNumber(ofWholeMatch[1])
    const known = parseLocalPlainNumber(ofWholeMatch[2])
    if (known !== null && whole !== null) return buildPartWholeTapeDiagramInput(whole, known, 'Part-whole tape diagram')
  }

  if (values[0] >= values[1]) {
    return buildPartWholeTapeDiagramInput(values[0], values[1], 'Part-whole tape diagram')
  }

  const secondNumberHasWholeCue = lower.match(
    new RegExp(`\\b(?:now|total|altogether|in\\s+all)\\b[\\s\\S]{0,50}?${numberPattern.source}`, 'i')
  )
  if (secondNumberHasWholeCue && values[1] >= values[0]) {
    return buildPartWholeTapeDiagramInput(values[1], values[0], 'Part-whole tape diagram')
  }

  return null
}

function buildInferredComparisonTapeDiagramInput(prompt: string): LocalTapeDiagramInput | null {
  const lower = prompt.toLowerCase()
  const values = extractNumbers(prompt).filter((value) => Number.isFinite(value) && value >= 0).slice(0, 5)
  if (values.length < 2) return null
  if (/%|\b(percent|ratio|rate|probability|chance|mean|median|mode|range|coordinate|graph|equation)\b/.test(lower)) {
    return null
  }

  const asksForDifference =
    /\bhow\s+(?:many|much)\s+(?:more|fewer|less)\b/.test(lower) ||
    /\bdifference\s+between\b/.test(lower) ||
    /\bcomparison\s+(?:tape|bar|model|diagram)\b/.test(lower)
  const comparesKnownAmounts = /\b(?:more|fewer|less)\b[\s\S]{0,80}\bthan\b/.test(lower)
  if (!asksForDifference && !comparesKnownAmounts) return null

  const numberPattern = `(${LOCAL_NUMBER_PATTERN})`
  const differenceBeforeAnchorMatch = lower.match(
    new RegExp(
      `${numberPattern}\\s+(?:\\w+\\s+){0,4}(more|fewer|less)\\b[\\s\\S]{0,80}\\bthan\\b[\\s\\S]{0,80}?${numberPattern}`,
      'i'
    )
  )
  if (differenceBeforeAnchorMatch) {
    const difference = parseLocalPlainNumber(differenceBeforeAnchorMatch[1])
    const direction = differenceBeforeAnchorMatch[2].toLowerCase() as 'more' | 'fewer' | 'less'
    const anchorAmount = parseLocalPlainNumber(differenceBeforeAnchorMatch[3])
    if (anchorAmount !== null && difference !== null) {
      const input = buildDifferenceKnownComparisonTapeDiagramInput(
        anchorAmount,
        difference,
        direction,
        'Difference-known comparison tape diagram',
        buildDifferenceBeforeAnchorLabelHints(prompt, direction)
      )
      if (input) return input
    }
  }

  const anchorBeforeDifferenceMatch = lower.match(
    new RegExp(
      `${numberPattern}\\b[\\s\\S]{0,120}?${numberPattern}\\s+(?:\\w+\\s+){0,4}(more|fewer|less)\\b`,
      'i'
    )
  )
  if (anchorBeforeDifferenceMatch) {
    const anchorAmount = parseLocalPlainNumber(anchorBeforeDifferenceMatch[1])
    const difference = parseLocalPlainNumber(anchorBeforeDifferenceMatch[2])
    const direction = anchorBeforeDifferenceMatch[3].toLowerCase() as 'more' | 'fewer' | 'less'
    if (anchorAmount !== null && difference !== null) {
      const input = buildDifferenceKnownComparisonTapeDiagramInput(
        anchorAmount,
        difference,
        direction,
        'Difference-known comparison tape diagram',
        buildAnchorBeforeDifferenceLabelHints(prompt, direction)
      )
      if (input) return input
    }
  }

  return buildComparisonTapeDiagramInput(
    values[0],
    values[1],
    'Comparison tape diagram',
    buildDirectComparisonLabelHints(prompt)
  )
}

function buildLocalTapeDiagramInput(prompt: string) {
  const lower = prompt.toLowerCase()
  const values = extractNumbers(prompt).filter((value) => Number.isFinite(value) && value >= 0).slice(0, 5)
  const title = /comparison/.test(lower) ? 'Comparison tape diagram' : 'Tape diagram'

  if (!wantsLocalTapeDiagram(prompt)) {
    return buildInferredPartWholeTapeDiagramInput(prompt) ?? buildInferredComparisonTapeDiagramInput(prompt)
  }

  const comparisonInput = buildInferredComparisonTapeDiagramInput(prompt)
  if (comparisonInput) return comparisonInput

  if (values.length === 0) {
    return {
      title,
      bars: [
        {
          label: 'Whole',
          segments: [
            { label: 'Known part', value: 'known', shaded: true },
            { label: 'Unknown part', value: '?', shaded: false },
          ],
        },
      ],
    }
  }

  if (values.length >= 2) {
    const hasWholeCue = /\b(total|altogether|in all|whole)\b/.test(lower)
    const whole = values[0]
    const known = values[1]
    if (hasWholeCue && whole >= known) {
      const partWholeInput = buildPartWholeTapeDiagramInput(whole, known, title)
      if (partWholeInput) return partWholeInput
    }

    const remainingValues = values.slice(1)
    const remainingTotal = remainingValues.reduce((sum, value) => sum + value, 0)
    if (remainingValues.length >= 2 && Math.abs(whole - remainingTotal) < 1e-6) {
      return {
        title,
        bars: [
          {
            label: `Whole ${formatLocalNumber(whole)}`,
            segments: remainingValues.map((value, index) => ({
              label: `Part ${index + 1}`,
              value,
              shaded: index === 0,
            })),
          },
        ],
      }
    }

    return {
      title,
      bars: [
        {
          label: 'Parts',
          segments: values.slice(0, 4).map((value, index) => ({
            label: index === 0 ? `Known ${formatLocalNumber(value)}` : `Part ${index + 1}`,
            value,
            shaded: index === 0,
          })),
        },
      ],
    }
  }

  return {
    title,
    bars: [
      {
        label: 'Whole',
        segments: [
          { label: `Known ${formatLocalNumber(values[0])}`, value: values[0], shaded: true },
          { label: 'Unknown', value: '?', shaded: false },
        ],
      },
    ],
  }
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

function extractTableXValues(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const explicitMatch = normalized.match(
    /\bx(?:\s*[- ]?values?)?\s*(?:=|are|:)?\s*((?:-?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:,|and|to|through|\s)+){0,7}-?(?:\d+(?:\.\d+)?|\.\d+))/i
  )
  if (!explicitMatch) return []

  return [...explicitMatch[1].matchAll(new RegExp(LOCAL_NUMBER_PATTERN, 'g'))]
    .map((match) => parseLocalPlainNumber(match[0]))
    .filter((value): value is number => typeof value === 'number')
    .slice(0, 6)
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

function extractLocalNumberLineRequest(text: string) {
  const normalized = normalizeLocalPromptText(text)
  if (!/\bnumber line\b/i.test(normalized) || /\bdouble number line\b/i.test(normalized)) return null

  const numericMatches = [...normalized.matchAll(new RegExp(LOCAL_NUMBER_PATTERN, 'g'))]
    .map((match) => ({
      value: parseLocalPlainNumber(match[0]),
      index: match.index ?? -1,
      raw: match[0],
    }))
    .filter(
      (match): match is { value: number; index: number; raw: string } =>
        match.value !== null && Number.isFinite(match.value) && match.index >= 0
    )

  if (numericMatches.length === 0) return null

  const rangeMatch = normalized.match(
    new RegExp(`\\b(?:from|between)\\s+(${LOCAL_NUMBER_PATTERN})\\s+(?:to|and|through)\\s+(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  const start = rangeMatch ? parseLocalPlainNumber(rangeMatch[1]) : null
  const end = rangeMatch ? parseLocalPlainNumber(rangeMatch[2]) : null
  const rangeStart = rangeMatch?.index ?? -1
  const rangeEnd = rangeMatch ? rangeStart + rangeMatch[0].length : -1

  const highlightValues = numericMatches
    .filter((match) => !(rangeMatch && match.index >= rangeStart && match.index < rangeEnd))
    .map((match) => match.value)
    .slice(0, 8)

  if (start !== null && end !== null && start !== end) {
    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
      highlightValues,
      title: 'Number line',
    }
  }

  const values = highlightValues.length > 0 ? highlightValues : numericMatches.map((match) => match.value).slice(0, 8)
  const minValue = Math.min(...values, 0)
  const maxValue = Math.max(...values, 0)
  const padding = minValue === maxValue ? 2 : Math.max(1, Math.ceil((maxValue - minValue) * 0.15))

  return {
    start: Math.floor(minValue - padding),
    end: Math.ceil(maxValue + padding),
    highlightValues: values,
    title: 'Number line',
  }
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
    /\b(probability|chance|outcomes?|favorable|out\s+of)\b/i.test(value) ||
    /\b(intercept|root|zero|x-axis|y-axis)\b/i.test(value) ||
    /\b(unit rate|rate|per|speed|cost)\b/i.test(value) ||
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

function extractGraphInterceptType(text: string): 'x' | 'y' | null {
  if (/\b(?:x\s*[- ]?intercepts?|roots?|zeros?|cross(?:es|ing)?\s+the\s+x-axis|x-axis)\b/i.test(text)) {
    return 'x'
  }

  if (/\b(?:y\s*[- ]?intercepts?|cross(?:es|ing)?\s+the\s+y-axis|y-axis|where\s+it\s+starts)\b/i.test(text)) {
    return 'y'
  }

  return null
}

function extractFunctionExpressionForTableAttempt(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const match = normalized.match(
    /\by\s*=\s*(.+?)(?=\s+(?:using|with|for|at|when|where|table|values?|rows?|ordered|from|and|i\s+got|i\s+found|my\s+answer|my\s+table)\b|\s*,\s*(?:my|the|table|values?|rows?|\(?-?\d|x\s*=)|[?!.;]|$)/i
  )
  return match?.[1]?.trim().replace(/\s+$/g, '') || ''
}

function extractTableOfValuesAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(table|values?|rows?|ordered\s+pairs?)\b/i.test(normalized)) return null

  const expression = extractFunctionExpressionForTableAttempt(normalized)
  const points = extractCoordinatePoints(normalized)
  if (!expression || points.length === 0) return null

  return buildStepPair(`table for y = ${expression}`, points.map((point) => point.raw).join(', '))
}

function extractTableOfValuesRequest(text: string) {
  if (!/\b(table|values?|rows?)\b/i.test(text)) return null

  const expression = extractFunctionExpressionForTableAttempt(text) || extractGraphExpression(text)
  if (!expression) return null

  const xValues = extractTableXValues(text)
  return {
    expression,
    ...(xValues.length > 0 ? { xValues } : {}),
  }
}

function buildLocalTableOfValuesInputFromStepPair(stepPair: StudentStepPair) {
  if (!/\b(table|values?|rows?|ordered\s+pairs?)\b/i.test(stepPair.previousStep)) return null

  const expression = extractFunctionExpressionForTableAttempt(stepPair.previousStep)
  if (!expression) return null

  const rowPoints = extractCoordinatePoints(stepPair.nextStep)
  const xValues = rowPoints.length > 0 ? rowPoints.map((point) => point.x).slice(0, 6) : extractTableXValues(stepPair.previousStep)
  return {
    expression,
    ...(xValues.length > 0 ? { xValues } : {}),
  }
}

type LocalStatisticsKind = 'mean' | 'median' | 'mode' | 'range'

type LocalLabeledDataItem = {
  label: string
  value: number
}

function extractLocalStatisticsKind(text: string): { kind: LocalStatisticsKind; label: string; index: number } | null {
  const match = text.match(/\b(mean|average|median|mode|range)\b/i)
  if (!match || typeof match.index !== 'number') return null

  const label = match[1].toLowerCase()
  return {
    kind: label === 'average' ? 'mean' : (label as LocalStatisticsKind),
    label,
    index: match.index,
  }
}

function formatLocalDataValues(values: number[]) {
  return values.map((value) => String(value)).join(', ')
}

function extractStatisticsAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const statistic = extractLocalStatisticsKind(normalized)
  if (!statistic) return null

  const stopBeforeQuestion = String.raw`(?=\s*(?:[?!]|$|[.](?:\s|$)|\b(?:why|where|what|is that|is this|was that|was this)\b))`
  const answerPattern = String.raw`(?:no\s+mode|none|${LOCAL_NUMBER_PATTERN}(?:\s*(?:,|and)\s*${LOCAL_NUMBER_PATTERN})*)`
  const answerMatch = normalized.match(
    new RegExp(`\\b(?:and\\s+)?(?:got|gets|equals?|is|was|as|=)\\s+(${answerPattern})${stopBeforeQuestion}`, 'i')
  )
  if (!answerMatch || typeof answerMatch.index !== 'number') return null

  const values = extractLocalStatisticsValues(normalized, statistic).slice(0, 24)
  if (values.length < 2) return null

  return buildStepPair(`${statistic.kind} of ${formatLocalDataValues(values)}`, answerMatch[1])
}

function extractStatisticsSummaryRequest(text: string) {
  const statistic = extractLocalStatisticsKind(text)
  if (!statistic) return null

  const values = extractLocalStatisticsValues(text, statistic)
  if (values.length < 2) return null

  return {
    values,
    title: 'Statistics summary',
  }
}

function extractLocalStatisticsValues(
  text: string,
  statistic: { label: string; index: number }
) {
  const afterStatistic = text.slice(statistic.index + statistic.label.length)
  const dataMatch = afterStatistic.match(/\b(?:of|for|from|with|values?|data(?:\s+set)?)\b([\s\S]{0,260})/i)
  const candidate = dataMatch?.[1] ?? afterStatistic
  const answerLeadPattern = String.raw`\b(?:i\s+(?:got|found|think)|my\s+answer|and\s+got|got|equals?|is|was|=)\s+(?:no\s+mode|none|${LOCAL_NUMBER_PATTERN})`
  const stopMatch = candidate.search(new RegExp(`${answerLeadPattern}|[?!]`, 'i'))
  const dataSegment = stopMatch >= 0 ? candidate.slice(0, stopMatch) : candidate
  const valuesAfter = extractNumbers(dataSegment).slice(0, 24)
  if (valuesAfter.length >= 2) return valuesAfter

  const beforeStatistic = text.slice(0, statistic.index)
  const explicitBeforeMatch = beforeStatistic.match(
    /\b(?:data(?:\s+set)?|values?|numbers?)\s*(?:are|is|:)?\s*([^?!.]{3,260})$/i
  )
  const forBeforeMatch = beforeStatistic.match(/\b(?:of|for|from|with)\s+([^?!.]{3,260})$/i)
  const fallbackBefore = beforeStatistic
    .replace(/\b(?:what(?:'s| is)|find|calculate|compute)\s+(?:the\s+)?$/i, '')
    .replace(/[,;:\s]+$/g, '')
  const beforeCandidate = explicitBeforeMatch?.[1] ?? forBeforeMatch?.[1] ?? fallbackBefore
  return extractNumbers(beforeCandidate).slice(-24)
}

function buildLocalStatisticsSummaryInputFromStepPair(stepPair: StudentStepPair) {
  if (!extractLocalStatisticsKind(stepPair.previousStep)) return null

  const values = extractNumbers(stepPair.previousStep).slice(0, 24)
  if (values.length < 2) return null

  return {
    values,
    title: 'Statistics summary',
  }
}

function cleanLocalDataLabel(label: string) {
  return label
    .replace(/\b(?:bar\s+chart|line\s+plot|line\s+graph|data\s+display|data\s+set|data|chart|values?|shows?|with|for|of|the|a|an|has|had)\b/gi, ' ')
    .replace(/[^A-Za-z0-9' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function titleCaseLocalLabel(label: string) {
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatLocalDataItems(items: LocalLabeledDataItem[]) {
  return items.map((item) => `${item.label} ${formatLocalNumber(item.value)}`).join(', ')
}

function parseLocalLabeledDataItems(text: string): LocalLabeledDataItem[] {
  const normalized = normalizeLocalPromptText(text)
  const beforeClaim = normalized.split(
    /\b(?:(?:value|amount|count|number)\s+(?:for|of|at)|how\s+many\s+(?:more|fewer|less)|difference\s+between|total\s+(?:for|of)?|sum\s+(?:for|of)?|altogether|in\s+all|combined|increase(?:d)?\s+from|decrease(?:d)?\s+from|went\s+up\s+from|went\s+down\s+from|rose\s+from|fell\s+from|change(?:d)?\s+from)\b/i
  )[0]
  const afterChartLabel =
    beforeClaim.match(
      /\b(?:bar\s+chart|line\s+plot|line\s+graph|data\s+display|data\s+set|data|chart|values?)\s*(?:are|is|has|had|shows?|:)?\s*([\s\S]{0,320})/i
    )?.[1] ?? beforeClaim
  const dataSegment = afterChartLabel.replace(/^\s*data\s*:\s*/i, '').split(/[;?!.]/)[0]
  const items = new Map<string, LocalLabeledDataItem>()

  dataSegment
    .split(/\s*(?:,|\band\b)\s*/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const match = chunk.match(
        new RegExp(
          `^\\s*([A-Za-z][A-Za-z0-9' -]{0,44}?)\\s*(?:=|:|is|has|had|shows?)?\\s*(${LOCAL_NUMBER_PATTERN})\\s*(?:items?|votes?|points?|students?|books?)?\\s*$`,
          'i'
        )
      )
      if (!match) return

      const label = cleanLocalDataLabel(match[1])
      const value = parseLocalPlainNumber(match[2])
      if (!label || value === null) return

      items.set(label, {
        label,
        value,
      })
    })

  return [...items.values()]
}

function escapeLocalRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findLocalDataItem(items: LocalLabeledDataItem[], label: string) {
  const cleaned = cleanLocalDataLabel(label)
  return (
    items.find((item) => item.label === cleaned) ??
    items.find((item) => item.label.endsWith(` ${cleaned}`) || cleaned.endsWith(` ${item.label}`)) ??
    null
  )
}

function findMentionedLocalDataItems(items: LocalLabeledDataItem[], phrase: string) {
  const normalized = cleanLocalDataLabel(phrase)
  return items.filter((item) => {
    const pattern = new RegExp(`\\b${escapeLocalRegExp(item.label).replace(/\s+/g, '\\s+')}\\b`, 'i')
    return pattern.test(normalized)
  })
}

function extractLocalDataPair(items: LocalLabeledDataItem[], firstPhrase: string, secondPhrase: string) {
  const first = findLocalDataItem(items, firstPhrase) ?? findMentionedLocalDataItems(items, firstPhrase)[0] ?? null
  const second = findLocalDataItem(items, secondPhrase) ?? findMentionedLocalDataItems(items, secondPhrase)[0] ?? null

  return first && second && first.label !== second.label ? { first, second } : null
}

function extractLocalDataItemAndGroup(
  items: LocalLabeledDataItem[],
  firstPhrase: string,
  groupPhrase: string
) {
  const first = findLocalDataItem(items, firstPhrase) ?? findMentionedLocalDataItems(items, firstPhrase)[0] ?? null
  if (!first) return null

  const groupItems = findMentionedLocalDataItems(items, groupPhrase).filter((item) => item.label !== first.label)
  return groupItems.length >= 2 ? { first, items: groupItems } : null
}

function extractLocalDataDisplayComputation(
  text: string,
  items: LocalLabeledDataItem[]
): { canonical: string; endIndex: number } | null {
  const normalized = normalizeLocalPromptText(text)
  const trendPatterns: Array<{ label: 'increase' | 'decrease'; patterns: RegExp[] }> = [
    {
      label: 'increase',
      patterns: [
        /\b(?:increase(?:d)?|went\s+up|rose)\s+(?:from\s+)?([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:to|through)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)(?=\s+(?:by|is|was|equals?|=|should|right|wrong|got)\b|[?!.;,]|$)/i,
        /\bfrom\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:to|through)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:it\s+)?(?:increase(?:d)?|went\s+up|rose)\b/i,
      ],
    },
    {
      label: 'decrease',
      patterns: [
        /\b(?:decrease(?:d)?|went\s+down|fell|dropped)\s+(?:from\s+)?([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:to|through)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)(?=\s+(?:by|is|was|equals?|=|should|right|wrong|got)\b|[?!.;,]|$)/i,
        /\bfrom\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:to|through)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:it\s+)?(?:decrease(?:d)?|went\s+down|fell|dropped)\b/i,
      ],
    },
  ]

  for (const trend of trendPatterns) {
    for (const pattern of trend.patterns) {
      const match = normalized.match(pattern)
      const pair = match ? extractLocalDataPair(items, match[1], match[2]) : null
      if (match && typeof match.index === 'number' && pair) {
        return {
          canonical: `${trend.label} from ${pair.first.label} to ${pair.second.label}`,
          endIndex: match.index + match[0].length,
        }
      }
    }
  }

  const combinedComparisonPattern =
    /\b(?:how\s+many\s+)?(more|fewer|less)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:than|compared\s+to)\s+(?:the\s+)?(?:total\s+(?:of|for)\s+)?([A-Za-z0-9' ,+&-]{1,140}?)(?:\s+together)?(?=\s+(?:is|was|equals?|=|should|right|wrong|got)\b|[?!.;,]|$)/i
  const combinedComparisonMatch = normalized.match(combinedComparisonPattern)
  const combinedComparison = combinedComparisonMatch
    ? extractLocalDataItemAndGroup(items, combinedComparisonMatch[2], combinedComparisonMatch[3])
    : null
  if (combinedComparisonMatch && typeof combinedComparisonMatch.index === 'number' && combinedComparison) {
    const operation = combinedComparisonMatch[1].toLowerCase() === 'more' ? 'more' : 'fewer'
    return {
      canonical: `how many ${operation} ${combinedComparison.first.label} than ${combinedComparison.items
        .map((item) => item.label)
        .join(' and ')} together`,
      endIndex: combinedComparisonMatch.index + combinedComparisonMatch[0].length,
    }
  }

  const combinedDifferencePattern =
    /\bdifference\s+(?:between|of|for)?\s*([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:and|vs\.?|versus|to)\s+(?:the\s+)?(?:total\s+(?:of|for)\s+)?([A-Za-z0-9' ,+&-]{1,140}?)(?:\s+together)?(?=\s+(?:is|was|equals?|=|should|right|wrong|got)\b|[?!.;,]|$)/i
  const combinedDifferenceMatch = normalized.match(combinedDifferencePattern)
  const combinedDifference = combinedDifferenceMatch
    ? extractLocalDataItemAndGroup(items, combinedDifferenceMatch[1], combinedDifferenceMatch[2])
    : null
  if (combinedDifferenceMatch && typeof combinedDifferenceMatch.index === 'number' && combinedDifference) {
    return {
      canonical: `difference between ${combinedDifference.first.label} and ${combinedDifference.items
        .map((item) => item.label)
        .join(' and ')} together`,
      endIndex: combinedDifferenceMatch.index + combinedDifferenceMatch[0].length,
    }
  }

  const pairPatterns = [
    /\b(?:how\s+many\s+)?(?:more|fewer|less)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:than|compared\s+to)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)(?=\s+(?:is|was|equals?|=|should|right|wrong|got)\b|[?!.;,]|$)/i,
    /\bdifference\s+(?:between|of|for)?\s*([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:and|vs\.?|versus|to)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)(?=\s+(?:is|was|equals?|=|should|right|wrong|got)\b|[?!.;,]|$)/i,
  ]

  for (const pattern of pairPatterns) {
    const match = normalized.match(pattern)
    const pair = match ? extractLocalDataPair(items, match[1], match[2]) : null
    if (match && typeof match.index === 'number' && pair) {
      return {
        canonical: `difference between ${pair.first.label} and ${pair.second.label}`,
        endIndex: match.index + match[0].length,
      }
    }
  }

  const totalPatterns = [
    /\b(?:total|sum|altogether|in\s+all|combined)\s*(?:for|of|from)?\s*([A-Za-z0-9' ,+-]{0,140}?)(?=\s+(?:is|was|equals?|=|should|right|wrong|got)\b|[?!.;]|$)/i,
    /\b([A-Za-z0-9' ,+-]{1,140}?)\s+(?:total|sum|altogether|in\s+all|combined)\b/i,
  ]

  for (const pattern of totalPatterns) {
    const match = normalized.match(pattern)
    if (!match || typeof match.index !== 'number') continue

    const scope = match[1] ?? ''
    const mentioned = findMentionedLocalDataItems(items, scope)
    const useAllItems = mentioned.length === 0 && /\b(all|whole|entire|chart|values?|categories|everything)\b/i.test(scope)
    const totalItems = useAllItems ? items : mentioned
    if (totalItems.length >= 1) {
      return {
        canonical: `total for ${totalItems.map((item) => item.label).join(' and ')}`,
        endIndex: match.index + match[0].length,
      }
    }
  }

  const totalMatch = normalized.match(/\b(total|sum|altogether|in\s+all|combined)\b/i)
  if (totalMatch && typeof totalMatch.index === 'number' && items.length >= 2) {
    return {
      canonical: `total for ${items.map((item) => item.label).join(' and ')}`,
      endIndex: totalMatch.index + totalMatch[0].length,
    }
  }

  return null
}

function extractLocalDataDisplayTarget(text: string): { label: string; endIndex: number } | null {
  const normalized = normalizeLocalPromptText(text)
  const targetPatterns = [
    /\b(?:value|amount|count|number)\s+(?:for|of|at)\s+([A-Za-z][A-Za-z0-9' -]{0,44}?)(?=\s+(?:is|was|equals?|=|should|right|wrong)\b|[?!.;,]|$)/i,
    /\b([A-Za-z][A-Za-z0-9' -]{0,44}?)\s+(?:value|amount|count|number)\s*(?:is|was|equals?|=)\b/i,
  ]

  for (const pattern of targetPatterns) {
    const match = normalized.match(pattern)
    if (!match || typeof match.index !== 'number') continue
    const label = cleanLocalDataLabel(match[1])
    if (label) return { label, endIndex: match.index + match[0].length }
  }

  return null
}

function extractLocalDataDisplayAttempt(text: string): StudentStepPair | null {
  const normalized = normalizeLocalPromptText(text)
  if (!/\b(bar\s+chart|line\s+plot|line\s+graph|data\s+display|data\s+set|chart)\b/i.test(normalized)) {
    return null
  }

  const data = parseLocalLabeledDataItems(normalized).slice(0, 8)
  const chartKind = /\bline\s+(?:plot|graph)\b/i.test(normalized) ? 'line plot' : 'bar chart'
  const computation = extractLocalDataDisplayComputation(normalized, data)
  if (data.length >= 1 && computation) {
    const answerSegment = normalized.slice(computation.endIndex)
    const answerMatch = answerSegment.match(
      new RegExp(`(?:\\b(?:is|was|equals?|=|got|should\\s+be|i\\s+got)\\s*)?(${LOCAL_NUMBER_PATTERN})`, 'i')
    )
    if (answerMatch) {
      return buildStepPair(
        `${chartKind} data: ${formatLocalDataItems(data)}; ${computation.canonical}`,
        answerMatch[1]
      )
    }
  }

  const target = extractLocalDataDisplayTarget(normalized)
  if (data.length < 1 || !target) return null

  const answerSegment = normalized.slice(target.endIndex)
  const answerMatch = answerSegment.match(
    new RegExp(`(?:\\b(?:is|was|equals?|=|got|should\\s+be)\\s*)?(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (!answerMatch) return null

  return buildStepPair(
    `${chartKind} data: ${formatLocalDataItems(data)}; value for ${target.label}`,
    answerMatch[1]
  )
}

function extractLocalDataDisplayRequest(text: string) {
  const normalized = normalizeLocalPromptText(text)
  if (!/\b(bar\s+chart|line\s+plot|line\s+graph|data\s+display)\b/i.test(normalized)) return null

  const data = parseLocalLabeledDataItems(normalized).slice(0, 8)
  if (data.length < 1) return null

  const displayType = /\bline\s+(?:plot|graph)\b/i.test(normalized) ? 'line_plot' : 'bar_chart'
  return {
    displayType,
    title: displayType === 'line_plot' ? 'Line plot' : 'Bar chart',
    data: data.map((item) => ({
      label: titleCaseLocalLabel(item.label),
      value: item.value,
    })),
  }
}

function buildLocalDataDisplayInputFromStepPair(stepPair: StudentStepPair) {
  if (!/\b(bar\s+chart|line\s+plot|line\s+graph|data\s+display|data\s+set|chart)\b/i.test(stepPair.previousStep)) {
    return null
  }

  const data = parseLocalLabeledDataItems(stepPair.previousStep).slice(0, 8)
  if (data.length < 1) return null

  const displayType = /\bline\s+(?:plot|graph)\b/i.test(stepPair.previousStep) ? 'line_plot' : 'bar_chart'
  return {
    displayType,
    title: displayType === 'line_plot' ? 'Line plot' : 'Bar chart',
    data: data.map((item) => ({
      label: titleCaseLocalLabel(item.label),
      value: item.value,
    })),
  }
}

type LocalProbabilitySetup = {
  favorable: number
  total: number
  useComplement: boolean
}

function extractLocalProbabilitySetup(text: string): LocalProbabilitySetup | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(probability|chance|outcomes?|favorable|likely|out\s+of)\b/i.test(normalized)) return null

  const outOfMatch = normalized.match(
    new RegExp(
      `(${LOCAL_NUMBER_PATTERN})(?:\\s+(?:favorable|successful|desired|winning|possible|total|outcomes?|results?|ways?|items?|marbles?|cubes?|cards?|spins?|rolls?))*\\s+out\\s+of\\s+(${LOCAL_NUMBER_PATTERN})`,
      'i'
    )
  )
  const favorableMatch = normalized.match(
    new RegExp(`\\b(?:favorable|successful|desired|winning)\\s+(?:outcomes?|results?|ways?)?\\s*(?:is|are|=|:)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  const totalMatch = normalized.match(
    new RegExp(`\\b(?:total|possible|all)\\s+(?:outcomes?|results?|ways?)?\\s*(?:is|are|=|:)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  const favorable = outOfMatch ? parseLocalPlainNumber(outOfMatch[1]) : favorableMatch ? parseLocalPlainNumber(favorableMatch[1]) : null
  const total = outOfMatch ? parseLocalPlainNumber(outOfMatch[2]) : totalMatch ? parseLocalPlainNumber(totalMatch[1]) : null
  if (favorable === null || total === null || total <= 0) return null

  return {
    favorable,
    total,
    useComplement: /\b(not|complement|opposite|doesn'?t|without)\b/i.test(normalized),
  }
}

function probabilityModelInputFromSetup(setup: LocalProbabilitySetup) {
  const favorableOutcomes = setup.useComplement ? setup.total - setup.favorable : setup.favorable
  if (favorableOutcomes < 0 || favorableOutcomes > setup.total) return null

  return {
    favorableOutcomes,
    totalOutcomes: setup.total,
    title: setup.useComplement ? 'Complement probability model' : 'Probability model',
    label: `${favorableOutcomes} out of ${setup.total}`,
  }
}

function extractProbabilityAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const setup = extractLocalProbabilitySetup(normalized)
  if (!setup) return null

  const stopBeforeQuestion = String.raw`(?=\s*(?:[?!]|$|[.](?:\s|$)|\b(?:why|where|what|is that|is this|was that|was this)\b))`
  const answerPattern = String.raw`(?:${LOCAL_NUMBER_PATTERN}\s*/\s*${LOCAL_NUMBER_PATTERN}|${LOCAL_NUMBER_PATTERN}\s*(?:%|percent(?:age)?)|${LOCAL_NUMBER_PATTERN}(?:\s+out\s+of\s+${LOCAL_NUMBER_PATTERN})?)`
  const answerMatch = normalized.match(
    new RegExp(`\\b(?:and\\s+)?(?:got|gets|equals?|is|was|as|=)\\s+(${answerPattern})${stopBeforeQuestion}`, 'i')
  )
  if (!answerMatch) return null

  const descriptor = setup.useComplement ? 'complement probability' : 'probability'
  return buildStepPair(`${descriptor} of ${setup.favorable} favorable outcomes out of ${setup.total}`, answerMatch[1])
}

function extractProbabilityModelRequest(text: string) {
  const setup = extractLocalProbabilitySetup(text)
  if (!setup) return null
  return probabilityModelInputFromSetup(setup)
}

function buildLocalProbabilityModelInputFromStepPair(stepPair: StudentStepPair) {
  const setup = extractLocalProbabilitySetup(stepPair.previousStep)
  if (!setup) return null
  return probabilityModelInputFromSetup(setup)
}

type LocalUnitRateRequest = {
  quantity: number
  value: number
  quantityLabel: string
  valueLabel: string
  target?: number
}

function extractLocalUnitRateRequest(text: string): LocalUnitRateRequest | null {
  const normalized = normalizeLocalPromptText(text)
  const speedMatch = normalized.match(
    new RegExp(
      String.raw`\b(${LOCAL_NUMBER_PATTERN})\s+([A-Za-z][A-Za-z-]*)(?:s)?\s+(?:in|over|for)\s+(${LOCAL_NUMBER_PATTERN})\s+([A-Za-z][A-Za-z-]*)(?:s)?\b`,
      'i'
    )
  )
  if (speedMatch && isLocalDistanceUnit(speedMatch[2]) && isLocalTimeUnit(speedMatch[4])) {
    const value = parseLocalPlainNumber(speedMatch[1])
    const quantity = parseLocalPlainNumber(speedMatch[3])
    const valueLabel = normalizeLocalUnitLabel(speedMatch[2])
    const quantityLabel = normalizeLocalUnitLabel(speedMatch[4])
    if (quantity !== null && value !== null && quantity > 0 && quantityLabel && valueLabel) {
      return {
        quantity,
        value,
        quantityLabel,
        valueLabel,
        ...extractLocalRateTarget(normalized, (speedMatch.index ?? 0) + speedMatch[0].length, quantityLabel),
      }
    }
  }

  const quantityFirstMatch = normalized.match(
    new RegExp(
      String.raw`\b(${LOCAL_NUMBER_PATTERN})\s+([A-Za-z][A-Za-z-]*)(?:s)?\s+(?:costs?|costing|priced\s+at|for|make|makes|making|serves|yields?|=|is|are)\s+\$?\s*(${LOCAL_NUMBER_PATTERN})(?:\s+([A-Za-z][A-Za-z-]*)(?:s)?)?`,
      'i'
    )
  )
  if (quantityFirstMatch) {
    const firstValue = parseLocalPlainNumber(quantityFirstMatch[1])
    const secondValue = parseLocalPlainNumber(quantityFirstMatch[3])
    const firstLabel = normalizeLocalUnitLabel(quantityFirstMatch[2])
    const secondLabel = normalizeLocalUnitLabel(quantityFirstMatch[4])
    const hasCurrency = /\$|dollars?|cost|price/i.test(quantityFirstMatch[0])
    if (firstValue !== null && secondValue !== null && firstValue > 0 && firstLabel) {
      if (secondLabel && !hasCurrency) {
        const afterIndex = (quantityFirstMatch.index ?? 0) + quantityFirstMatch[0].length
        const firstLabelTarget = extractLocalRateTarget(normalized, afterIndex, firstLabel)
        const secondLabelTarget = extractLocalRateTarget(normalized, afterIndex, secondLabel)
        const asksForSecondPerFirst = hasLocalPerDirection(normalized, secondLabel, firstLabel)
        const asksForFirstPerSecond = hasLocalPerDirection(normalized, firstLabel, secondLabel)
        const asksForGenericRecipeRate =
          /\bunit rate\b/i.test(normalized) &&
          /\b(?:make|makes|making|serves|yields?)\b/i.test(quantityFirstMatch[0])

        if (
          asksForSecondPerFirst ||
          asksForGenericRecipeRate ||
          (firstLabelTarget.target !== undefined && !asksForFirstPerSecond)
        ) {
          return {
            quantity: firstValue,
            value: secondValue,
            quantityLabel: firstLabel,
            valueLabel: secondLabel,
            ...firstLabelTarget,
          }
        }

        return {
          quantity: secondValue,
          value: firstValue,
          quantityLabel: secondLabel,
          valueLabel: firstLabel,
          ...secondLabelTarget,
        }
      }

      return {
        quantity: firstValue,
        value: secondValue,
        quantityLabel: firstLabel,
        valueLabel: hasCurrency ? 'dollars' : 'value',
        ...extractLocalRateTarget(
          normalized,
          (quantityFirstMatch.index ?? 0) + quantityFirstMatch[0].length,
          firstLabel
        ),
      }
    }
  }

  const valueFirstMatch = normalized.match(
    new RegExp(
      String.raw`\$?\s*(${LOCAL_NUMBER_PATTERN})\s+(?:for|per)\s+(${LOCAL_NUMBER_PATTERN})\s+([A-Za-z][A-Za-z-]*)(?:s)?\b`,
      'i'
    )
  )
  if (valueFirstMatch) {
    const value = parseLocalPlainNumber(valueFirstMatch[1])
    const quantity = parseLocalPlainNumber(valueFirstMatch[2])
    const quantityLabel = normalizeLocalUnitLabel(valueFirstMatch[3])
    if (quantity !== null && value !== null && quantity > 0 && quantityLabel) {
      return {
        quantity,
        value,
        quantityLabel,
        valueLabel: /\$|dollars?|cost|price/i.test(valueFirstMatch[0]) ? 'dollars' : 'value',
        ...extractLocalRateTarget(normalized, (valueFirstMatch.index ?? 0) + valueFirstMatch[0].length, quantityLabel),
      }
    }
  }

  return null
}

function formatLocalUnitRateStepSetup(request: LocalUnitRateRequest) {
  const quantity = formatLocalNumber(request.quantity)
  const value = formatLocalNumber(request.value)
  if (request.valueLabel === 'dollars') {
    return `${quantity} ${request.quantityLabel} cost ${value} dollars`
  }
  if (isLocalTimeUnit(request.quantityLabel) && isLocalDistanceUnit(request.valueLabel)) {
    return `${value} ${request.valueLabel} in ${quantity} ${request.quantityLabel}`
  }
  return `unit rate for ${quantity} ${request.quantityLabel} make ${value} ${request.valueLabel}`
}

function formatLocalUnitRateScalingSetup(request: LocalUnitRateRequest) {
  const setup = formatLocalUnitRateStepSetup(request)
  if (typeof request.target !== 'number') return setup
  return `${setup}; target ${formatLocalNumber(request.target)} ${request.quantityLabel}`
}

function extractLocalRateTargetValueClaim(text: string, valueLabel: string) {
  const normalized = normalizeLocalPromptText(text)
  const valuePattern = localUnitMatchPattern(valueLabel)
  const labelPattern = String.raw`[A-Za-z$][A-Za-z$-]*`
  const claimMatch =
    normalized.match(
      new RegExp(
        String.raw`\b(?:i\s+)?(?:got|found|calculated|think|answer(?:\s+is)?|that\s+(?:is|was)|it\s+(?:costs?|will\s+cost|would\s+cost)|equals?|is|was)\s+\$?\s*(${LOCAL_NUMBER_PATTERN})(?:\s+(${labelPattern})(?:s)?)?\b`,
        'i'
      )
    ) ?? normalized.match(new RegExp(String.raw`=\s*\$?\s*(${LOCAL_NUMBER_PATTERN})(?:\s+(${labelPattern})(?:s)?)?\b`, 'i'))

  if (!claimMatch) return null

  const rawLabel = claimMatch[0].includes('$') ? 'dollars' : normalizeLocalUnitLabel(claimMatch[2])
  if (rawLabel && valuePattern && !new RegExp(`^${valuePattern}$`, 'i').test(rawLabel)) {
    return null
  }

  const value = parseLocalPlainNumber(claimMatch[1])
  if (value === null) return null

  return `${formatLocalNumber(value)} ${valueLabel}`
}

function extractUnitRateScalingAttempt(text: string): StudentStepPair | null {
  const request = extractLocalUnitRateRequest(text)
  if (!request || typeof request.target !== 'number') return null
  if (!/\b(i got|i found|i calculated|i think|my answer|answer is|is that right|is this right|check my work|correct)\b/i.test(text)) {
    return null
  }

  const claim = extractLocalRateTargetValueClaim(text, request.valueLabel)
  if (!claim) return null

  return buildStepPair(formatLocalUnitRateScalingSetup(request), claim)
}

function extractLocalUnitRateClaim(text: string) {
  const normalized = normalizeLocalPromptText(text)
  const rateClaimMatches = [
    ...normalized.matchAll(
      new RegExp(
        String.raw`\$?\s*(${LOCAL_NUMBER_PATTERN})(?:\s+[A-Za-z][A-Za-z-]*(?:s)?)?\s+per\s+(?:one\s+|each\s+|1\s+)?[A-Za-z][A-Za-z-]*(?:s)?\b`,
        'gi'
      )
    ),
  ]
  const claimMatch =
    rateClaimMatches.find((match) => {
      const index = match.index ?? 0
      const before = normalized.slice(Math.max(0, index - 40), index)
      return /\b(?:i\s+)?(?:got|found|calculated|think|answer(?:\s+is)?|rate(?:\s+is)?)\b/i.test(before)
    }) ?? rateClaimMatches[0]

  if (claimMatch) return claimMatch[0].trim()

  const answerMatch = normalized.match(
    new RegExp(`\\b(?:i\\s+)?(?:got|found|calculated|think|answer(?:\\s+is)?)\\s+\\$?\\s*(${LOCAL_NUMBER_PATTERN})\\b`, 'i')
  )
  if (!answerMatch) return null

  return answerMatch[0].replace(/^\s*(?:i\s+)?(?:got|found|calculated|think|answer(?:\s+is)?)\s+/i, '').trim()
}

function extractUnitRateAttempt(text: string): StudentStepPair | null {
  const request = extractLocalUnitRateRequest(text)
  if (!request) return null
  if (!/\b(unit rate|rate|per|each|speed|cost)\b/i.test(text)) return null

  const claim = extractLocalUnitRateClaim(text)
  if (!claim) return null

  const nextStep = /\bper\b/i.test(claim) ? claim : `${claim} ${request.valueLabel} per ${request.quantityLabel}`
  return buildStepPair(formatLocalUnitRateStepSetup(request), nextStep)
}

function buildLocalUnitRateVisualInputFromStepPair(pair: StudentStepPair) {
  const request = extractLocalUnitRateRequest(pair.previousStep)
  if (!request) return null

  return {
    unitRate: {
      quantity: request.quantity,
      value: request.value,
      quantityLabel: request.quantityLabel,
      valueLabel: request.valueLabel,
    },
    doubleNumberLine: {
      topLabel: request.quantityLabel,
      bottomLabel: request.valueLabel === 'dollars' ? 'cost' : request.valueLabel,
      pairs: [
        { top: 0, bottom: 0, label: 'start' },
        { top: request.quantity, bottom: request.value, label: 'given' },
        ...(typeof request.target === 'number'
          ? [{ top: request.target, bottom: (request.value / request.quantity) * request.target, label: 'target' }]
          : []),
      ],
      title: 'Double number line',
    },
  }
}

function isLocalDistanceUnit(unit: string) {
  return /^(?:miles?|kilometers?|kilometres?|meters?|metres?|feet|foot|yards?)$/i.test(unit)
}

function isLocalTimeUnit(unit: string) {
  return /^(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)$/i.test(unit)
}

function escapeLocalRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function localUnitMatchPattern(unitLabel: string) {
  const normalized = normalizeLocalUnitLabel(unitLabel)
  if (!normalized) return null

  const variants = new Set([normalized])
  if (normalized.endsWith('s') && normalized.length > 1) {
    variants.add(normalized.slice(0, -1))
  } else {
    variants.add(`${normalized}s`)
  }

  return `(?:${[...variants].map(escapeLocalRegex).join('|')})`
}

function hasLocalPerDirection(text: string, valueLabel: string, quantityLabel: string) {
  const valuePattern = localUnitMatchPattern(valueLabel)
  const quantityPattern = localUnitMatchPattern(quantityLabel)
  if (!valuePattern || !quantityPattern) return false

  return new RegExp(
    `\\b${valuePattern}\\s+per\\s+(?:one\\s+|each\\s+|1\\s+)?${quantityPattern}\\b`,
    'i'
  ).test(text)
}

function extractLocalRateTarget(text: string, afterIndex: number, quantityLabel: string): { target?: number } {
  const unitPattern = localUnitMatchPattern(quantityLabel)
  if (!unitPattern) return {}

  const afterGiven = text.slice(afterIndex)
  const targetMatch =
    afterGiven.match(
      new RegExp(
        `\\b(?:for|in|over|at|when|if|to|make|makes|making)\\s+(${LOCAL_NUMBER_PATTERN})\\s+${unitPattern}\\b`,
        'i'
      )
    ) ?? afterGiven.match(new RegExp(`\\b(${LOCAL_NUMBER_PATTERN})\\s+${unitPattern}\\b`, 'i'))
  const target = targetMatch ? parseLocalPlainNumber(targetMatch[1]) : null

  return target !== null && target > 0 ? { target } : {}
}

function extractFunctionExpressionForInterceptAttempt(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const match = normalized.match(
    /\by\s*=\s*(.+?)(?=\s+(?:is|equals?|was|to|has|have|with|where|crosses?|intercepts?|and|i\s+got|i\s+found|my\s+answer)\b|\s*,\s*(?:point|\(?-?\d)|[?!.;]|$)/i
  )
  return match?.[1]?.trim().replace(/\s+$/g, '') || ''
}

function extractGraphInterceptAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const interceptType = extractGraphInterceptType(normalized)
  if (!interceptType) return null

  const expression = extractFunctionExpressionForInterceptAttempt(normalized)
  if (!expression) return null

  const points = extractCoordinatePoints(normalized)
  if (points.length > 0) {
    return buildStepPair(`${interceptType}-intercept of y = ${expression}`, points[0].raw)
  }

  if (/\b(?:no|none|neither|does\s+not|doesn't|never)\b/i.test(normalized)) {
    return buildStepPair(`${interceptType}-intercept of y = ${expression}`, `no ${interceptType}-intercept`)
  }

  const answerAfterExpressionMatch = normalized.match(
    new RegExp(`\\by\\s*=\\s*.+?\\s+(?:is|equals?|was|to|at)\\s*(${LOCAL_NUMBER_PATTERN})\\b`, 'i')
  )
  if (answerAfterExpressionMatch) {
    return buildStepPair(`${interceptType}-intercept of y = ${expression}`, answerAfterExpressionMatch[1])
  }

  const interceptNumberMatch = normalized.match(
    new RegExp(
      `\\b(?:${interceptType}\\s*[- ]?intercept|intercept|root|zero|answer|got|found|think)\\s*(?:is|equals?|=|was|to|at)?\\s*(${LOCAL_NUMBER_PATTERN})\\b`,
      'i'
    )
  )
  if (interceptNumberMatch) {
    return buildStepPair(`${interceptType}-intercept of y = ${expression}`, interceptNumberMatch[1])
  }

  return null
}

function buildLocalGraphInterceptBoardInputFromStepPair(stepPair: StudentStepPair) {
  const interceptType = extractGraphInterceptType(stepPair.previousStep)
  const expression = extractFunctionExpressionForInterceptAttempt(stepPair.previousStep)
  if (!interceptType || !expression) return null

  return {
    expression,
    domainStart: -5,
    domainEnd: 5,
    graphType: 'cartesian',
    title: `Graph of y = ${expression}`,
    showXIntercepts: interceptType === 'x',
    showYIntercept: interceptType === 'y',
  }
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

function normalizeLocalTriangleVertexLabel(label: string | undefined, fallback: string) {
  const cleaned = (label || fallback).trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8)
  return cleaned || fallback
}

function extractLocalTriangleVertices(text: string): LocalTriangleVertex[] | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(triangle|vertices?|points?|coordinate|diagram|board)\b/i.test(normalized)) return null

  const labeledPattern = new RegExp(
    `\\b([A-Z])\\s*(?:=|:)?\\s*\\(\\s*(${LOCAL_NUMBER_PATTERN})\\s*,\\s*(${LOCAL_NUMBER_PATTERN})\\s*\\)`,
    'gi'
  )
  const vertices: LocalTriangleVertex[] = []
  const seenLabels = new Set<string>()
  for (const match of normalized.matchAll(labeledPattern)) {
    const label = normalizeLocalTriangleVertexLabel(match[1], String.fromCharCode(65 + vertices.length))
    const x = parseLocalPlainNumber(match[2])
    const y = parseLocalPlainNumber(match[3])
    if (x === null || y === null || Math.abs(x) > 1000 || Math.abs(y) > 1000) continue
    if (seenLabels.has(label.toLowerCase())) continue
    seenLabels.add(label.toLowerCase())
    vertices.push({ label, x, y })
    if (vertices.length >= 3) return vertices
  }

  const unlabeledPattern = new RegExp(
    `\\(\\s*(${LOCAL_NUMBER_PATTERN})\\s*,\\s*(${LOCAL_NUMBER_PATTERN})\\s*\\)`,
    'g'
  )
  const unlabeledMatches = [...normalized.matchAll(unlabeledPattern)]
  if (vertices.length === 0 && unlabeledMatches.length >= 3 && /\b(vertices?|points?|coordinates?)\b/i.test(normalized)) {
    return unlabeledMatches.slice(0, 3).map((match, index) => ({
      label: String.fromCharCode(65 + index),
      x: parseLocalPlainNumber(match[1]) ?? 0,
      y: parseLocalPlainNumber(match[2]) ?? 0,
    }))
  }

  return vertices.length >= 3 ? vertices : null
}

function extractLocalTriangleBaseLabels(text: string, vertices: LocalTriangleVertex[]) {
  const vertexLabels = new Set(vertices.map((vertex) => vertex.label.toLowerCase()))
  const basePatterns = [
    /\bbase\s*(?:is|=|:|as|to|onto|along)?\s*([A-Z])\s*([A-Z])\b/i,
    /\b(?:to|onto|on)\s+(?:the\s+)?(?:base|side|segment)?\s*([A-Z])\s*([A-Z])\b/i,
    /\bbetween\s+([A-Z])\s*(?:and|&)\s*([A-Z])\b/i,
  ]

  for (const pattern of basePatterns) {
    const match = text.match(pattern)
    if (!match) continue
    const first = match[1]
    const second = match[2]
    if (
      first.toLowerCase() !== second.toLowerCase() &&
      vertexLabels.has(first.toLowerCase()) &&
      vertexLabels.has(second.toLowerCase())
    ) {
      return [first, second]
    }
  }

  return [vertices[0].label, vertices[1].label]
}

function buildLocalTriangleAltitudeInput(prompt: string, boardDescription = '') {
  const combined = `${boardDescription} ${prompt}`.trim()
  const lowerPrompt = prompt.toLowerCase()
  if (!/\b(triangle|triangular|vertices?|points?|diagram|board)\b/i.test(combined)) return null
  if (!/\b(altitude|height|perpendicular|base|area)\b/.test(lowerPrompt)) return null

  const vertices = extractLocalTriangleVertices(combined)
  if (!vertices) return null

  return {
    figureType: 'triangle',
    labels: vertices.map((vertex) => vertex.label),
    triangleVertices: vertices,
    showAltitude: true,
    showTriangleAreaModel: /\b(area|height|altitude|perpendicular)\b/.test(lowerPrompt),
    baseVertexLabels: extractLocalTriangleBaseLabels(`${prompt} ${boardDescription}`, vertices),
    unitLabel: 'units',
  }
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

function formatLocalTriangleVerticesForStep(vertices: LocalTriangleVertex[]) {
  return vertices
    .map((vertex) => `${vertex.label}(${formatLocalNumber(vertex.x)}, ${formatLocalNumber(vertex.y)})`)
    .join(', ')
}

function buildCoordinateTriangleStepPair(
  vertices: LocalTriangleVertex[],
  baseLabels: string[],
  target: 'area' | 'height' | 'base',
  answer: number
) {
  const verticesText = formatLocalTriangleVerticesForStep(vertices)
  const baseName = baseLabels.join('')
  const previousStep =
    target === 'area'
      ? `area of coordinate triangle with vertices ${verticesText} using base ${baseName}`
      : target === 'height'
        ? `height to base ${baseName} of coordinate triangle with vertices ${verticesText}`
        : `base ${baseName} length of coordinate triangle with vertices ${verticesText}`

  return buildStepPair(previousStep, String(answer))
}

function extractLocalCoordinateTriangleAreaAnswer(text: string) {
  const gotAreaMatch = text.match(
    new RegExp(`\\b(?:got|found|calculated|think|answer(?:\\s+is)?)\\s+(?:the\\s+)?area\\s*(?:is|=|as)?\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (gotAreaMatch) {
    const answer = parseLocalPlainNumber(gotAreaMatch[1])
    if (answer !== null) return answer
  }

  const beforeAreaMatch = text.match(
    new RegExp(
      `\\b(?:got|found|calculated|answer(?:\\s+is)?|think)\\s+(${LOCAL_NUMBER_PATTERN})\\s+(?:square\\s+\\w+\\s+)?(?:for\\s+)?(?:the\\s+)?area\\b`,
      'i'
    )
  )
  if (beforeAreaMatch) {
    const answer = parseLocalPlainNumber(beforeAreaMatch[1])
    if (answer !== null) return answer
  }

  const afterAreaMatch = text.match(
    new RegExp(`\\barea\\b[^.?!]{0,80}?\\b(?:is|=|as|equals?|got)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (afterAreaMatch) {
    const answer = parseLocalPlainNumber(afterAreaMatch[1])
    if (answer !== null) return answer
  }

  return null
}

function extractLocalCoordinateTriangleMeasurementAnswer(text: string, kind: 'base' | 'height') {
  const labelPattern = kind === 'base' ? 'base(?:\\s+[A-Z]\\s*[A-Z])?' : '(?:height|altitude)'
  const beforeMeasureMatch = text.match(
    new RegExp(`\\b(?:got|found|calculated|answer(?:\\s+is)?|think)\\s+(${LOCAL_NUMBER_PATTERN})\\s+(?:for\\s+)?(?:the\\s+)?${labelPattern}\\b`, 'i')
  )
  if (beforeMeasureMatch) {
    const answer = parseLocalPlainNumber(beforeMeasureMatch[1])
    if (answer !== null) return answer
  }

  const afterMeasureMatch = text.match(
    new RegExp(`\\b${labelPattern}\\b[^.?!]{0,80}?\\b(?:is|=|:|as|equals?)\\s*(${LOCAL_NUMBER_PATTERN})`, 'i')
  )
  if (afterMeasureMatch) {
    const answer = parseLocalPlainNumber(afterMeasureMatch[1])
    if (answer !== null) return answer
  }

  return null
}

function extractCoordinateTriangleAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const vertices = extractLocalTriangleVertices(normalized)
  if (!vertices) return null

  const baseLabels = extractLocalTriangleBaseLabels(normalized, vertices)
  const areaAnswer = extractLocalCoordinateTriangleAreaAnswer(normalized)
  if (areaAnswer !== null && /\barea\b/i.test(normalized)) {
    return buildCoordinateTriangleStepPair(vertices, baseLabels, 'area', areaAnswer)
  }

  const heightAnswer = extractLocalCoordinateTriangleMeasurementAnswer(normalized, 'height')
  if (heightAnswer !== null && /\b(height|altitude)\b/i.test(normalized)) {
    return buildCoordinateTriangleStepPair(vertices, baseLabels, 'height', heightAnswer)
  }

  const baseAnswer = extractLocalCoordinateTriangleMeasurementAnswer(normalized, 'base')
  if (baseAnswer !== null && /\bbase\b/i.test(normalized)) {
    return buildCoordinateTriangleStepPair(vertices, baseLabels, 'base', baseAnswer)
  }

  return null
}

function buildLocalTriangleAreaModelInput(text: string) {
  const dimensions = extractLocalTriangleBaseHeight(text)
  if (!dimensions || dimensions.base > 30 || dimensions.height > 30) return null

  return {
    figureType: 'triangle',
    labels: ['A', 'B', 'C'],
    baseUnits: dimensions.base,
    heightUnits: dimensions.height,
    unitLabel: 'units',
    showTriangleAreaModel: true,
  }
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

function buildLocalAngleDiagramInputFromText(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const trianglePrompt = normalized.match(
    new RegExp(
      `\\b(?:triangle|triangular)\\b[^.?!]*?(${LOCAL_NUMBER_PATTERN})\\s*(?:degrees?|deg)?\\s*(?:and|,)\\s*(${LOCAL_NUMBER_PATTERN})`,
      'i'
    )
  )
  if (trianglePrompt && /\b(angle|degrees?|missing|third)\b/i.test(normalized)) {
    const firstAngle = parseLocalPlainNumber(trianglePrompt[1])
    const secondAngle = parseLocalPlainNumber(trianglePrompt[2])
    if (firstAngle !== null && secondAngle !== null && firstAngle >= 0 && secondAngle >= 0) {
      const missingAngle = 180 - firstAngle - secondAngle
      if (missingAngle >= 0) {
        return {
          degrees: missingAngle,
          relationshipType: 'triangle_sum',
          knownAngle: firstAngle,
          secondKnownAngle: secondAngle,
          missingAngle,
          title: 'Triangle angle sum',
        }
      }
    }
  }

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
  const knownAngle = parseLocalPlainNumber((directMatch ?? oneAngleMatch)?.[1] ?? '')
  if (knownAngle === null || knownAngle < 0) return null

  const total = isComplementary ? 90 : 180
  const missingAngle = total - knownAngle
  if (missingAngle < 0) return null

  return {
    degrees: knownAngle,
    relationshipType: isComplementary ? 'complementary' : 'supplementary',
    knownAngle,
    missingAngle,
    title: isComplementary ? 'Complementary angles' : 'Supplementary angles',
  }
}

function buildLocalAngleDiagramInputFromStepPair(pair: StudentStepPair) {
  const input = buildLocalAngleDiagramInputFromText(pair.previousStep)
  const attemptedAngle = parseLocalPlainNumber(pair.nextStep)
  if (!input || attemptedAngle === null || attemptedAngle < 0) return input

  return {
    ...input,
    attemptedAngle,
  }
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

function extractProportionEquationSnippet(text: string) {
  const valuePattern = String.raw`(?:x|${LOCAL_NUMBER_PATTERN})`
  const ratioPattern = String.raw`${valuePattern}\s*(?:\/|:)\s*${valuePattern}`
  const match = text.match(new RegExp(`(${ratioPattern}\\s*=\\s*${ratioPattern})`, 'i'))
  if (!match) return null

  return {
    equation: match[1],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[1].length,
  }
}

function extractProportionAnswerSegment(text: string) {
  const assignmentMatch = text.match(new RegExp(`\\bx\\s*=\\s*(${LOCAL_NUMBER_PATTERN})\\b`, 'i'))
  if (assignmentMatch) return `x = ${assignmentMatch[1]}`

  const reversedAssignmentMatch = text.match(new RegExp(`\\b(${LOCAL_NUMBER_PATTERN})\\s*=\\s*x\\b`, 'i'))
  if (reversedAssignmentMatch) return `x = ${reversedAssignmentMatch[1]}`

  const answerMatch = text.match(
    new RegExp(`\\b(?:got|gets|found|answer(?:\\s+is)?|think|equals?|is|was)\\s+(${LOCAL_NUMBER_PATTERN})\\b`, 'i')
  )
  return answerMatch ? `x = ${answerMatch[1]}` : null
}

function extractProportionAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(?:proportion|cross[- ]?multiply|cross[- ]?products?|solved?|got|found|answer|right|correct|is that|is this)\b/i.test(normalized)) {
    return null
  }

  const snippet = extractProportionEquationSnippet(normalized)
  if (!snippet || !/\bx\b/i.test(snippet.equation)) return null

  const after = normalized.slice(snippet.end)
  const before = normalized.slice(0, snippet.start)
  const answer = extractProportionAnswerSegment(after) ?? extractProportionAnswerSegment(before)
  if (!answer) return null

  return buildStepPair(snippet.equation, answer)
}

type LocalProportionToken =
  | {
      kind: 'number'
      value: number
      label: string
    }
  | {
      kind: 'variable'
      label: string
    }

type LocalProportionPart = {
  numerator: LocalProportionToken
  denominator: LocalProportionToken
}

function parseLocalProportionToken(token: string): LocalProportionToken | null {
  const trimmed = token.trim()
  if (/^x$/i.test(trimmed)) {
    return {
      kind: 'variable',
      label: 'x',
    }
  }

  const value = parseLocalPlainNumber(trimmed)
  if (value === null) return null

  return {
    kind: 'number',
    value,
    label: formatLocalNumber(value),
  }
}

function parseLocalProportionPart(text: string): LocalProportionPart | null {
  const valuePattern = String.raw`(x|${LOCAL_NUMBER_PATTERN})`
  const match = text.trim().match(new RegExp(`^${valuePattern}\\s*(?:\\/|:)\\s*${valuePattern}$`, 'i'))
  if (!match) return null

  const numerator = parseLocalProportionToken(match[1])
  const denominator = parseLocalProportionToken(match[2])
  if (!numerator || !denominator) return null

  return { numerator, denominator }
}

function parseLocalProportionEquation(text: string) {
  const parts = text.split('=')
  if (parts.length !== 2) return null

  const left = parseLocalProportionPart(parts[0])
  const right = parseLocalProportionPart(parts[1])
  if (!left || !right) return null

  return { left, right }
}

function parseLocalStepRatio(text: string): LocalProportionPart | null {
  const match = text.trim().match(new RegExp(`^(${LOCAL_NUMBER_PATTERN})\\s*:\\s*(${LOCAL_NUMBER_PATTERN})$`, 'i'))
  if (!match) return null

  const numerator = parseLocalProportionToken(match[1])
  const denominator = parseLocalProportionToken(match[2])
  if (!numerator || !denominator || numerator.kind !== 'number' || denominator.kind !== 'number') return null

  return { numerator, denominator }
}

function parseLocalProportionStepAnswer(text: string) {
  const assignmentMatch =
    text.match(new RegExp(`\\bx\\s*=\\s*(${LOCAL_NUMBER_PATTERN})\\b`, 'i')) ??
    text.match(new RegExp(`\\b(${LOCAL_NUMBER_PATTERN})\\s*=\\s*x\\b`, 'i'))
  if (assignmentMatch) return parseLocalPlainNumber(assignmentMatch[1])

  const plainMatch = text.trim().match(new RegExp(`^${LOCAL_NUMBER_PATTERN}$`))
  return plainMatch ? parseLocalPlainNumber(plainMatch[0]) : null
}

function resolveLocalProportionToken(token: LocalProportionToken, xValue?: number) {
  if (token.kind === 'number') {
    return {
      value: token.value,
      label: token.label,
    }
  }

  if (typeof xValue !== 'number' || !Number.isFinite(xValue)) return null

  return {
    value: xValue,
    label: formatLocalNumber(xValue),
  }
}

function buildLocalCrossProductTableInputFromParts(
  left: LocalProportionPart,
  right: LocalProportionPart,
  xValue?: number
) {
  const leftNumerator = resolveLocalProportionToken(left.numerator, xValue)
  const leftDenominator = resolveLocalProportionToken(left.denominator, xValue)
  const rightNumerator = resolveLocalProportionToken(right.numerator, xValue)
  const rightDenominator = resolveLocalProportionToken(right.denominator, xValue)
  if (!leftNumerator || !leftDenominator || !rightNumerator || !rightDenominator) return null

  return {
    leftLabel: 'Cross product',
    rightLabel: 'Value',
    title: 'Cross-product check',
    rows: [
      {
        left: `${leftNumerator.label} * ${rightDenominator.label}`,
        right: formatLocalNumber(leftNumerator.value * rightDenominator.value),
      },
      {
        left: `${rightNumerator.label} * ${leftDenominator.label}`,
        right: formatLocalNumber(rightNumerator.value * leftDenominator.value),
      },
    ],
  }
}

function buildLocalCrossProductTableInputFromStepPair(pair: StudentStepPair): LocalToolPlan['input'] | null {
  const proportion = parseLocalProportionEquation(pair.previousStep)
  if (proportion) {
    const xValue = parseLocalProportionStepAnswer(pair.nextStep)
    return buildLocalCrossProductTableInputFromParts(proportion.left, proportion.right, xValue ?? undefined)
  }

  const leftRatio = parseLocalStepRatio(pair.previousStep)
  const rightRatio = parseLocalStepRatio(pair.nextStep)
  if (leftRatio && rightRatio) {
    return buildLocalCrossProductTableInputFromParts(leftRatio, rightRatio)
  }

  return null
}

function extractRatioEquivalenceAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  if (!/\b(?:same|equivalent|equal\s+ratios?|proportional|proportion|match)\b/i.test(normalized)) {
    return null
  }

  const ratioMatches = [
    ...normalized.matchAll(new RegExp(`(${LOCAL_NUMBER_PATTERN}\\s*:\\s*${LOCAL_NUMBER_PATTERN})`, 'gi')),
  ]
  if (ratioMatches.length < 2) return null

  return buildStepPair(ratioMatches[0][1], ratioMatches[1][1])
}

function extractMixedNumberOperationAttempt(text: string): StudentStepPair | null {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const valuePattern = String.raw`-?(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*-?\d+|\d+(?:\.\d+)?|\.\d+)`
  const answerVerb = String.raw`(?:got|gets|equals?|is|=)`
  const hasMixedOperand = (...values: string[]) => values.some((value) => /\d+\s+\d+\s*\/\s*\d+/.test(value))

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

  const multiplyByMatch = normalized.match(
    new RegExp(
      `\\b(?:i\\s+)?(?:multiplied|multiply)\\s+(${valuePattern})\\s+(?:by|times|x|×|\\*)\\s+(${valuePattern})\\s+(?:and\\s+)?${answerVerb}\\s+(${valuePattern})`,
      'i'
    )
  )
  if (multiplyByMatch && hasMixedOperand(multiplyByMatch[1], multiplyByMatch[2], multiplyByMatch[3])) {
    return buildStepPair(`${multiplyByMatch[1]} * ${multiplyByMatch[2]}`, multiplyByMatch[3])
  }

  const timesMatch = normalized.match(
    new RegExp(
      `\\b(${valuePattern})\\s+(?:times|x|×|\\*)\\s+(${valuePattern})\\s+(?:and\\s+)?${answerVerb}\\s+(${valuePattern})`,
      'i'
    )
  )
  if (timesMatch && hasMixedOperand(timesMatch[1], timesMatch[2], timesMatch[3])) {
    return buildStepPair(`${timesMatch[1]} * ${timesMatch[2]}`, timesMatch[3])
  }

  const divideByMatch = normalized.match(
    new RegExp(
      `\\b(?:i\\s+)?(?:divided|divide)\\s+(${valuePattern})\\s+by\\s+(${valuePattern})\\s+(?:and\\s+)?${answerVerb}\\s+(${valuePattern})`,
      'i'
    )
  )
  if (divideByMatch && hasMixedOperand(divideByMatch[1], divideByMatch[2], divideByMatch[3])) {
    return buildStepPair(`${divideByMatch[1]} / ${divideByMatch[2]}`, divideByMatch[3])
  }

  const dividedMatch = normalized.match(
    new RegExp(
      `\\b(${valuePattern})\\s+(?:divided\\s+by|÷|/)\\s+(${valuePattern})\\s+(?:and\\s+)?${answerVerb}\\s+(${valuePattern})`,
      'i'
    )
  )
  if (dividedMatch && hasMixedOperand(dividedMatch[1], dividedMatch[2], dividedMatch[3])) {
    return buildStepPair(`${dividedMatch[1]} / ${dividedMatch[2]}`, dividedMatch[3])
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

  const unitRateScalingAttempt = extractUnitRateScalingAttempt(normalized)
  if (unitRateScalingAttempt) return unitRateScalingAttempt

  const unitRateAttempt = extractUnitRateAttempt(normalized)
  if (unitRateAttempt) return unitRateAttempt

  const proportionAttempt = extractProportionAttempt(normalized)
  if (proportionAttempt) return proportionAttempt

  const ratioEquivalenceAttempt = extractRatioEquivalenceAttempt(normalized)
  if (ratioEquivalenceAttempt) return ratioEquivalenceAttempt

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

  const statisticsAttempt = extractStatisticsAttempt(normalized)
  if (statisticsAttempt) return statisticsAttempt

  const dataDisplayAttempt = extractLocalDataDisplayAttempt(normalized)
  if (dataDisplayAttempt) return dataDisplayAttempt

  const probabilityAttempt = extractProbabilityAttempt(normalized)
  if (probabilityAttempt) return probabilityAttempt

  const tableOfValuesAttempt = extractTableOfValuesAttempt(normalized)
  if (tableOfValuesAttempt) return tableOfValuesAttempt

  const graphInterceptAttempt = extractGraphInterceptAttempt(normalized)
  if (graphInterceptAttempt) return graphInterceptAttempt

  const slopeAttempt = extractSlopeAttempt(normalized)
  if (slopeAttempt) return slopeAttempt

  const coordinateDistanceAttempt = extractCoordinateDistanceAttempt(normalized)
  if (coordinateDistanceAttempt) return coordinateDistanceAttempt

  const coordinateTriangleAttempt = extractCoordinateTriangleAttempt(normalized)
  if (coordinateTriangleAttempt) return coordinateTriangleAttempt

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
  if (/\bratio|rate|per one|unit rate|scale|proportion|proportional\b/.test(lower)) return 'ratios'
  if (/\bequation|variable|solve for x|\bx\b/.test(lower)) return 'equations'
  if (/\bnegative|positive|integer|signed|minus\b|-\d/.test(lower)) return 'integers'
  if (/\barea|perimeter|angle|geometry|rectangle|triangle|convert|measurement|meters?|centimeters?|kilometers?|grams?|kilograms?|liters?|milliliters?|seconds?|minutes?|hours?\b/.test(lower)) return 'geometry'
  if (/\bgraph|coordinate|slope|point|axis|distance|intercept|table of values|value table\b/.test(lower)) return 'graphing'
  if (/\bmean|median|mode|probability|chance|data|bar\s+chart|line\s+plot|line\s+graph\b/.test(lower)) return 'data'
  return text.slice(0, 120)
}

function isLocalAnswerDisclosureRequest(prompt: string) {
  const lower = prompt.toLowerCase()
  const asksForExplanationOrVisual =
    /\b(show (?:me )?(?:the )?(?:thinking|work|steps|why|how|visual|model|diagram)|draw|graph|plot|model|diagram|table|chart|visual|data summary|double number line|number line|explain|hint|help me start)\b/.test(
      lower
    )

  if (asksForExplanationOrVisual) {
    return false
  }

  if (
    /\b(just tell me|give me the answer|tell me the answer|full solution|show me the solution|solve it for me|what(?:'s| is) the answer|answer to|answer only|final answer)\b/.test(
      lower
    )
  ) {
    return true
  }

  const hasMathContent = /\d|%|\d+\s*\/\s*\d+|[=<>+\-*/^×÷]/.test(prompt)

  if (/\b(solve|calculate|compute|evaluate)\b/.test(lower) && hasMathContent) {
    return true
  }

  if (
    /\b(find)\b/.test(lower) &&
    /\b(answer|final answer|value of|find\s+x|find\s+the\s+value)\b/.test(lower) &&
    /\d/.test(prompt)
  ) {
    return true
  }

  const directExpressionQuestion =
    /\bwhat(?:'s| is)|how much is\b/.test(lower) &&
    (/%\s*of|\bpercent(?:age)?\s+of\b|\d+\s*\/\s*\d+|[=+\-*/^×÷]|\b\d+(?:\.\d+)?\s*(?:times|divided by|plus|minus)\s*\d/i.test(
      prompt
    ))

  if (hasMathContent && directExpressionQuestion) {
    return true
  }

  const directDataQuestion =
    /\b(?:what(?:'s| is)|find|calculate|compute)\b/.test(lower) &&
    /\b(?:mean|average|median|mode|range)\b/.test(lower)
  if (directDataQuestion) {
    return true
  }

  const directProbabilityQuestion =
    /\b(?:what(?:'s| is)|find|calculate|compute|what chance|how likely)\b/.test(lower) &&
    /\b(?:probability|chance|likelihood)\b/.test(lower) &&
    /\b(?:out of|favorable|outcomes?|total|possible)\b/.test(lower)
  if (directProbabilityQuestion) {
    return true
  }

  const directRatioRateQuestion =
    /\b(?:what(?:'s| is)|find|calculate|compute|how much|how many|how far|how long|how fast)\b/.test(lower) &&
    /\b(?:unit rate|rate|ratio|proportion|proportional|scale factor|per one|per each)\b/.test(lower)
  const directRateSetupQuestion =
    /\b(?:what(?:'s| is)|find|calculate|compute|how much|how many|how far|how long|how fast)\b/.test(lower) &&
    /\b(?:recipe|muffins?|cups?|notebooks?|cost|priced?|miles?|kilometers?|kilometres?|hours?|minutes?|seconds?)\b/.test(
      lower
    ) &&
    Boolean(extractLocalUnitRateRequest(prompt))
  if (directRatioRateQuestion || directRateSetupQuestion) {
    return true
  }

  return false
}

export function planLocalToolTurn(
  prompt: string,
  gradeLevel: string,
  context: LocalToolPlannerContext = {}
): LocalToolPlan[] {
  const lower = prompt.toLowerCase()
  const liveBoardDescription = context.boardDescription?.trim().slice(0, 1800) ?? ''
  const fractions = extractFractions(prompt)
  const visualFractions = extractVisualFractions(prompt)
  const numbers = extractNumbers(prompt)
  const unitConversionRequest = extractUnitConversionRequest(prompt)
  const slopeRequest = extractSlopeRequest(prompt)
  const coordinateDistanceRequest = extractCoordinateDistanceRequest(prompt)
  const tableOfValuesRequest = extractTableOfValuesRequest(prompt)
  const statisticsSummaryRequest = extractStatisticsSummaryRequest(prompt)
  const dataDisplayRequest = extractLocalDataDisplayRequest(prompt)
  const probabilityModelRequest = extractProbabilityModelRequest(prompt)
  const unitRateRequest = extractLocalUnitRateRequest(prompt)
  const percentOfRequest = extractLocalPercentOfRequest(prompt)
  const studentStepPair = extractStudentStepPair(prompt)
  const tapeDiagramInput = buildLocalTapeDiagramInput(prompt)
  const numberLineRequest = extractLocalNumberLineRequest(prompt)
  const triangleAltitudeInput = buildLocalTriangleAltitudeInput(prompt, liveBoardDescription)
  const plans: LocalToolPlan[] = []
  const asksForFullSolution = isLocalAnswerDisclosureRequest(prompt)
  const hasExplicitStudentAttempt =
    /\b(i tried|i got|i found|my answer|i think|check this|i changed|changed|rewrote)\b/.test(lower) ||
    /\b(my table|my row|my values?|my ordered pairs?)\b/.test(lower) ||
    /\b(i added|i subtracted|i multiplied|i divided|i calculated|i evaluated|i did|i worked out|i simplified|i rounded|rounded|and got)\b/.test(lower) ||
    /\b(went from|changed from|increased from|decreased from|percent change)\b/.test(lower) ||
    /\b(percent error|actual value|accepted value|measured value|estimate)\b/.test(lower) ||
    /\b(mean|average|median|mode|range)\b.{0,120}\b(is|was|equals?|got)\b/.test(lower) ||
    /\b(bar\s+chart|line\s+plot|line\s+graph|data\s+display)\b.{0,180}\b(value|amount|count|number)\b.{0,80}\b(is|was|equals?|got)\b/.test(lower) ||
    /\b(bar\s+chart|line\s+plot|line\s+graph|data\s+display)\b.{0,220}\b(more|fewer|less|difference|total|sum|altogether|in\s+all|combined)\b.{0,80}\b(is|was|equals?|got)\b/.test(lower) ||
    /\b(bar\s+chart|line\s+plot|line\s+graph|data\s+display)\b.{0,220}\b(increase(?:d)?|decrease(?:d)?|went\s+up|went\s+down|rose|fell|dropped)\b.{0,100}\b(by|is|was|equals?|got)\b/.test(lower) ||
    /\b(probability|chance)\b.{0,140}\b(is|was|equals?|got|as)\b/.test(lower)
  const hasStudentAttempt = hasExplicitStudentAttempt || Boolean(studentStepPair)
  const asksForCurriculumContext =
    /\b(homework|worksheet|teacher|class notes|uploaded|lesson|curriculum|rubric|directions|from class|my class)\b/.test(lower)
  const asksForLearnerContext =
    /\b(last time|previous session|continue|remember|review what|what did i struggle|my progress|again like before|same as yesterday)\b/.test(lower)
  const hasSpecificMathAction =
    /\b(graph|plot|parabola|function|coordinate|distance|intercept|table|values?|rows?|fraction|percent|decimal|round|linear|equation|solve|ratio|rate|proportion|proportional|area|perimeter|rectangle|triangle|base|height|word problem|plan|tape|bar\s+model|bar\s+chart|line\s+plot|line\s+graph|data\s+display|part[- ]?whole|integer|negative|positive|signed|convert|measurement|meters?|centimeters?|kilometers?|grams?|kilograms?|liters?|milliliters?|seconds?|minutes?|hours?|mean|average|median|mode|range|data|statistics|probability|chance)\b/.test(lower)
  const referencesVisibleBoard =
    /\b(this diagram|the diagram|my diagram|this drawing|my drawing|on the board|the board|whiteboard|canvas|visible work|what i drew|the picture|this figure|the figure)\b/.test(
      lower
    )
  const asksForBoardStateHelp =
    referencesVisibleBoard &&
    /\b(what should|what do|how do|find|missing|next|check|right|wrong|see|use|from this|using this|what can)\b/.test(
      lower
    )
  const asksForResponsePlanning =
    /\b(what should (?:we|i|you) do next|how should (?:we|i|you) start|choose the next move|plan the next move|best next step|how should you help|what is the next tutoring move)\b/.test(lower)
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

  if (
    studentStepPair &&
    !asksForMistakeHelp &&
    /\b(?:same|equivalent|equal\s+ratios?|proportional|proportion|match)\b/.test(lower)
  ) {
    plans.push({
      toolName: 'math_check_step',
      input: studentStepPair,
    })
    const crossProductTableInput = buildLocalCrossProductTableInputFromStepPair(studentStepPair)
    if (crossProductTableInput) {
      plans.push({
        toolName: 'ratio_table',
        input: crossProductTableInput,
      })
    }
    return plans
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

  if (asksForBoardStateHelp) {
    plans.push({
      toolName: 'board_state_summarizer',
      input: {
        boardDescription: liveBoardDescription || prompt.slice(0, 800),
        studentRequest: prompt.slice(0, 300),
        gradeLevel,
        studentWork: hasStudentAttempt ? prompt.slice(0, 500) : '',
        recentToolName: '',
        recentToolResult: '',
      },
    })
  }

  if (asksForResponsePlanning) {
    plans.push({
      toolName: 'tutor_response_planner',
      input: {
        topic: inferLocalTopic(prompt),
        gradeLevel,
        studentRequest: prompt.slice(0, 500),
        studentWork: hasStudentAttempt ? prompt.slice(0, 500) : '',
        recentToolName: '',
        recentToolResult: '',
        hasStudentAttempt,
        attemptCount: hasStudentAttempt ? 1 : 0,
      },
    })
    return plans
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
      const coordinateTriangleAltitudeInput = buildLocalTriangleAltitudeInput(studentStepPair.previousStep)
      if (coordinateTriangleAltitudeInput) {
        plans.push({
          toolName: 'geometry_figure',
          input: coordinateTriangleAltitudeInput,
        })
      }
      const triangleAreaModelInput = buildLocalTriangleAreaModelInput(studentStepPair.previousStep)
      if (triangleAreaModelInput) {
        plans.push({
          toolName: 'geometry_figure',
          input: triangleAreaModelInput,
        })
      }
      const angleDiagramInput = buildLocalAngleDiagramInputFromStepPair(studentStepPair)
      if (angleDiagramInput) {
        plans.push({
          toolName: 'angle_diagram',
          input: angleDiagramInput,
        })
      }
      const graphInterceptBoardInput = buildLocalGraphInterceptBoardInputFromStepPair(studentStepPair)
      if (graphInterceptBoardInput) {
        plans.push({
          toolName: 'graph_function',
          input: graphInterceptBoardInput,
        })
      }
      const tableOfValuesInput = buildLocalTableOfValuesInputFromStepPair(studentStepPair)
      if (tableOfValuesInput) {
        plans.push({
          toolName: 'table_of_values',
          input: tableOfValuesInput,
        })
      }
      const dataDisplayInput = buildLocalDataDisplayInputFromStepPair(studentStepPair)
      if (dataDisplayInput) {
        plans.push({
          toolName: 'data_display',
          input: dataDisplayInput,
        })
      }
      const statisticsSummaryInput = buildLocalStatisticsSummaryInputFromStepPair(studentStepPair)
      if (statisticsSummaryInput) {
        plans.push({
          toolName: 'statistics_summary',
          input: statisticsSummaryInput,
        })
      }
      const probabilityModelInput = buildLocalProbabilityModelInputFromStepPair(studentStepPair)
      if (probabilityModelInput) {
        plans.push({
          toolName: 'probability_model',
          input: probabilityModelInput,
        })
      }
      const unitRateVisualInput = buildLocalUnitRateVisualInputFromStepPair(studentStepPair)
      if (unitRateVisualInput) {
        plans.push({
          toolName: 'unit_rate',
          input: unitRateVisualInput.unitRate,
        })
        plans.push({
          toolName: 'double_number_line',
          input: unitRateVisualInput.doubleNumberLine,
        })
      }
      const crossProductTableInput = buildLocalCrossProductTableInputFromStepPair(studentStepPair)
      if (crossProductTableInput) {
        plans.push({
          toolName: 'ratio_table',
          input: crossProductTableInput,
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

  if (tableOfValuesRequest) {
    plans.push({
      toolName: 'table_of_values',
      input: tableOfValuesRequest,
    })
    return plans
  }

  if (dataDisplayRequest) {
    plans.push({
      toolName: 'data_display',
      input: dataDisplayRequest,
    })
    return plans
  }

  if (statisticsSummaryRequest) {
    plans.push({
      toolName: 'statistics_summary',
      input: statisticsSummaryRequest,
    })
    return plans
  }

  if (probabilityModelRequest) {
    plans.push({
      toolName: 'probability_model',
      input: probabilityModelRequest,
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

  if (numberLineRequest) {
    plans.push({
      toolName: 'number_line',
      input: numberLineRequest,
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

  if (wantsEquivalentFractionBars(prompt) && visualFractions.length >= 2) {
    plans.push({
      toolName: 'fraction_compare',
      input: {
        leftNumerator: visualFractions[0].numerator,
        leftDenominator: visualFractions[0].denominator,
        rightNumerator: visualFractions[1].numerator,
        rightDenominator: visualFractions[1].denominator,
        title: 'Equivalent fraction bars',
      },
    })
    return plans
  }

  const comparisonFractions = visualFractions.length >= 2 ? visualFractions : fractions
  if (/compare/.test(lower) && comparisonFractions.length >= 2) {
    plans.push({
      toolName: 'fraction_compare',
      input: {
        leftNumerator: comparisonFractions[0].numerator,
        leftDenominator: comparisonFractions[0].denominator,
        rightNumerator: comparisonFractions[1].numerator,
        rightDenominator: comparisonFractions[1].denominator,
        title: 'Compare the fractions',
      },
    })
    return plans
  }

  if (wantsLocalFractionStrip(prompt) && visualFractions.length >= 1) {
    const fraction = visualFractions[0]
    plans.push({
      toolName: 'fraction_strip',
      input: {
        numerator: fraction.numerator,
        denominator: fraction.denominator,
        title: fraction.label.includes('=') ? 'Mixed-number fraction bar' : 'Fraction bar',
        label: fraction.label,
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

  if (tapeDiagramInput) {
    plans.push({
      toolName: 'bar_model',
      input: tapeDiagramInput,
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

  if (percentOfRequest) {
    plans.push({
      toolName: 'percent_of_number',
      input: {
        percent: percentOfRequest.percent,
        whole: percentOfRequest.whole,
      },
    })
    plans.push({
      toolName: 'percent_bar',
      input: {
        part: percentOfRequest.percent,
        total: 100,
        title: `${percentOfRequest.percent}% of ${percentOfRequest.whole}`,
        label: `${percentOfRequest.percent}%`,
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

  const hasRateVisualRequest =
    /\b(double number line|unit rate|cost|ratio|notebook|recipe|muffin)s?\b/.test(lower) ||
    Boolean(
      unitRateRequest &&
        /\b(rate|speed|per|how far|how long|how fast|travel|travels|drive|drives|walk|walks|run|runs|miles?|kilometers?|kilometres?|meters?|metres?|hours?|minutes?|seconds?)\b/.test(
          lower
        )
    )

  if (hasRateVisualRequest && (unitRateRequest || numbers.length >= 2)) {
    const quantity = unitRateRequest?.quantity ?? numbers[0]
    const value = unitRateRequest?.value ?? numbers[1]
    const target = unitRateRequest ? unitRateRequest.target : numbers[2]
    const quantityLabel = unitRateRequest?.quantityLabel ?? (/notebook/.test(lower) ? 'notebooks' : 'units')
    const valueLabel = unitRateRequest?.valueLabel ?? (/\$|cost/.test(lower) ? 'dollars' : 'value')
    if (/\b(unit rate|rate|cost|per|speed|how far|how long|how fast)\b/.test(lower)) {
      plans.push({
        toolName: 'unit_rate',
        input: {
          quantity,
          value,
          quantityLabel,
          valueLabel,
        },
      })
    }
    plans.push({
      toolName: 'double_number_line',
      input: {
        topLabel: quantityLabel,
        bottomLabel: valueLabel === 'dollars' ? 'cost' : valueLabel,
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

  if (triangleAltitudeInput) {
    plans.push({
      toolName: 'geometry_figure',
      input: triangleAltitudeInput,
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

  const triangleAreaModelInput = buildLocalTriangleAreaModelInput(prompt)
  if (triangleAreaModelInput) {
    plans.push({
      toolName: 'geometry_figure',
      input: triangleAreaModelInput,
    })
    return plans
  }

  const angleDiagramInput = buildLocalAngleDiagramInputFromText(prompt)
  if (angleDiagramInput) {
    plans.push({
      toolName: 'angle_diagram',
      input: angleDiagramInput,
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

  if (plans.some((plan) => plan.toolName === 'board_state_summarizer')) {
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

function findTableRowBoardFocus(outputs: unknown[]) {
  return (
    outputs
      .map((output) =>
        output && typeof output === 'object' ? (output as Record<string, unknown>).boardFocus : null
      )
      .find((focus): focus is { kind: 'table_row'; x: number; studentY: number; expectedY: number } => {
        if (!focus || typeof focus !== 'object') return false
        const record = focus as Record<string, unknown>
        return (
          record.kind === 'table_row' &&
          typeof record.x === 'number' &&
          typeof record.studentY === 'number' &&
          typeof record.expectedY === 'number'
        )
      }) ?? null
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
  if (plan.toolName === 'table_of_values') {
    const focus = findTableRowBoardFocus(previousOutputs)
    if (!focus) return plan.input

    return {
      ...plan.input,
      highlightXValue: focus.x,
      highlightLabel: `Check x = ${formatLocalNumber(focus.x)} row`,
    }
  }

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

  if (firstTool === 'board_state_summarizer') {
    const summary = outputs.find(
      (output): output is { askNext?: string; recommendedTool?: string; confidence?: string } =>
        Boolean(output && typeof output === 'object' && 'recommendedTool' in output)
    )
    if (summary?.askNext) {
      return `I read the visible board state first. ${summary.askNext}`
    }
    return 'I read the visible board state first. What label or number should we confirm before solving?'
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
    const hasTriangleAltitudeModel = plans.some(
      (plan) => plan.toolName === 'geometry_figure' && plan.input.showAltitude === true
    )
    const hasTriangleAreaModel = plans.some(
      (plan) => plan.toolName === 'geometry_figure' && plan.input.showTriangleAreaModel === true
    )
    const hasAngleDiagram = plans.some((plan) => plan.toolName === 'angle_diagram')
    const hasTableOfValues = plans.some((plan) => plan.toolName === 'table_of_values')
    const hasDataDisplay = plans.some((plan) => plan.toolName === 'data_display')
    const hasStatisticsSummary = plans.some((plan) => plan.toolName === 'statistics_summary')
    const hasProbabilityModel = plans.some((plan) => plan.toolName === 'probability_model')
    const hasRatioTable = plans.some((plan) => plan.toolName === 'ratio_table')
    const boardCue = hasPlaceValueChart
      ? ' I also highlighted the place-value chart so the target column is visible.'
      : hasCompositeAreaModel
        ? ' I also put the whole rectangle and missing piece on the board.'
        : hasTriangleAltitudeModel
          ? ' I also drew the coordinate-triangle altitude on the board.'
          : hasTriangleAreaModel
            ? ' I also put the half-rectangle triangle model on the board.'
            : hasAngleDiagram
              ? ' I also put the angle relationship diagram on the board.'
              : hasTableOfValues
                ? ' I also put the value table on the board.'
                : hasDataDisplay
                  ? ' I also put the data display on the board.'
                  : hasStatisticsSummary
                    ? ' I also put the data summary on the board.'
                    : hasProbabilityModel
                      ? ' I also put the probability model on the board.'
                      : hasRatioTable
                        ? ' I also put the cross-product table on the board.'
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

  if (firstTool === 'tutor_response_planner') {
    const planned = outputs.find(
      (output): output is {
        sayFirst?: string
        askNext?: string
        plannedSpokenTurn?: string
        recommendedMove?: string
      } =>
        Boolean(output && typeof output === 'object' && 'recommendedMove' in output)
    )
    if (planned?.plannedSpokenTurn) {
      return planned.plannedSpokenTurn
    }
    if (planned?.sayFirst && planned.askNext) {
      return `${planned.sayFirst} ${planned.askNext}`
    }
    return 'I planned the next tutor move. I will ask one question, then wait for your thinking.'
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

  if (firstTool === 'table_of_values') {
    return 'I put the value table on the board. Pick one x-value and tell me how substituting it gives the matching y-value.'
  }

  if (firstTool === 'statistics_summary') {
    return 'I put the data summary on the board. Start by checking the ordered data, then tell me which statistic you need.'
  }

  if (firstTool === 'data_display') {
    return 'I put the data display on the board. Match one category label to its bar or point before reading the value.'
  }

  if (firstTool === 'probability_model') {
    return 'I put the probability model on the board. Start with favorable outcomes over total outcomes, then tell me what the denominator represents.'
  }

  if (firstTool === 'bar_model') {
    const title = plans[0]?.input?.title
    if (typeof title === 'string' && /comparison/i.test(title)) {
      return 'I set up a comparison tape diagram on the board. Match the equal parts first, then tell me what the gap represents.'
    }
    return 'I set up a tape diagram on the board. Point to the known part first, then tell me what the unknown part represents.'
  }

  if (firstTool === 'angle_diagram') {
    return 'I put the angle relationship on the board. Use the total first, then tell me what angle is still missing.'
  }

  if (firstTool === 'geometry_figure') {
    if (plans[0]?.input?.showAltitude === true) {
      return 'I drew the triangle altitude to the chosen base. Check the right angle first, then tell me which length is the height.'
    }
    if (plans[0]?.input?.showTriangleAreaModel === true) {
      return 'I put the triangle area model on the board. Find the related rectangle first, then halve it for the triangle.'
    }
    return 'I put the geometry diagram on the board. Name the useful base, height, or angle before calculating.'
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
