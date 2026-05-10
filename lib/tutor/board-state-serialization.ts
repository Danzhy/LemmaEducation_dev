type BoardShapeBounds = {
  x: number
  y: number
  w: number
  h: number
}

type BoardShapeRecord = {
  id?: unknown
  type?: unknown
  x?: unknown
  y?: unknown
  props?: Record<string, unknown>
  meta?: Record<string, unknown>
}

export type BoardStateReader<ShapeId extends string = string> = {
  getCurrentPageShapeIds: () => Iterable<ShapeId>
  getShape: (shapeId: ShapeId) => BoardShapeRecord | undefined
  getShapePageBounds?: (shapeId: ShapeId) => BoardShapeBounds | null | undefined
}

type SerializeBoardStateOptions = {
  maxShapes?: number
  maxLabels?: number
  maxMathBlocks?: number
  maxVisuals?: number
  maxChars?: number
}

const DEFAULT_MAX_SHAPES = 80
const DEFAULT_MAX_LABELS = 14
const DEFAULT_MAX_MATH_BLOCKS = 8
const DEFAULT_MAX_VISUALS = 18
const DEFAULT_MAX_CHARS = 1800

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, maxLength: number) {
  const cleaned = cleanText(value)
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trim()}...`
}

function uniquePush(target: string[], value: string, maxItems: number) {
  const cleaned = cleanText(value)
  if (!cleaned || target.includes(cleaned) || target.length >= maxItems) return
  target.push(cleaned)
}

function extractRichText(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap((item) => extractRichText(item, depth + 1))
  if (typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const directText = typeof record.text === 'string' ? [record.text] : []
  const contentText = 'content' in record ? extractRichText(record.content, depth + 1) : []
  return [...directText, ...contentText]
}

function normalizeToolGroup(value: unknown) {
  if (typeof value !== 'string') return ''
  const normalized = value
    .replace(/^tool:/, '')
    .replace(/[:._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized
}

function formatBounds(bounds: BoardShapeBounds | null | undefined) {
  if (!bounds) return ''
  const x = Math.round(bounds.x)
  const y = Math.round(bounds.y)
  const w = Math.round(bounds.w)
  const h = Math.round(bounds.h)
  return `near (${x}, ${y}), ${w} by ${h}`
}

function describeShapeKind(shape: BoardShapeRecord) {
  const type = typeof shape.type === 'string' ? shape.type : 'shape'
  const props = shape.props ?? {}
  const meta = shape.meta ?? {}

  if (meta.lemmaPdfPage) return 'imported PDF page'
  if (type === 'math-block') return 'math block'
  if (type === 'text') return 'text label'
  if (type === 'image') return 'image or uploaded page'
  if (type === 'geo') {
    const geo = typeof props.geo === 'string' ? props.geo : 'geometric shape'
    return geo === 'ellipse' ? 'point or circle' : geo
  }
  if (type === 'arrow') return 'line or axis'
  if (type === 'line') return 'polyline or graph curve'
  if (type === 'draw') return 'freehand drawing'
  return type.replace(/[-_]+/g, ' ')
}

function shapeText(shape: BoardShapeRecord) {
  const props = shape.props ?? {}
  const richText = extractRichText(props.richText).join(' ')
  if (richText) return richText
  if (typeof props.text === 'string') return props.text
  if (typeof props.label === 'string') return props.label
  return ''
}

function shapeLatex(shape: BoardShapeRecord) {
  const props = shape.props ?? {}
  return typeof props.latex === 'string' ? props.latex : ''
}

export function serializeTutorBoardState<ShapeId extends string>(
  reader: BoardStateReader<ShapeId>,
  options: SerializeBoardStateOptions = {}
) {
  const maxShapes = options.maxShapes ?? DEFAULT_MAX_SHAPES
  const maxLabels = options.maxLabels ?? DEFAULT_MAX_LABELS
  const maxMathBlocks = options.maxMathBlocks ?? DEFAULT_MAX_MATH_BLOCKS
  const maxVisuals = options.maxVisuals ?? DEFAULT_MAX_VISUALS
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS

  const shapeIds = [...reader.getCurrentPageShapeIds()].slice(0, maxShapes)
  if (shapeIds.length === 0) return ''

  const toolGroups: string[] = []
  const labels: string[] = []
  const mathBlocks: string[] = []
  const visuals: string[] = []
  const pdfPages: string[] = []
  const pdfTextExcerpts: string[] = []
  let toolOwnedCount = 0
  let studentOwnedCount = 0

  for (const shapeId of shapeIds) {
    const shape = reader.getShape(shapeId)
    if (!shape) continue

    const meta = shape.meta ?? {}
    const isToolOwned = Boolean(meta.lemmaToolOwned)
    if (isToolOwned) toolOwnedCount += 1
    else studentOwnedCount += 1

    const toolGroup = normalizeToolGroup(meta.lemmaArtifactGroupId)
    if (toolGroup) uniquePush(toolGroups, toolGroup, 10)

    if (meta.lemmaPdfPage) {
      const sourceFileName =
        typeof meta.sourceFileName === 'string' ? truncate(meta.sourceFileName, 80) : 'PDF'
      const pageNumber =
        typeof meta.pageNumber === 'number' && Number.isFinite(meta.pageNumber)
          ? Math.max(1, Math.round(meta.pageNumber))
          : undefined
      const bounds = formatBounds(reader.getShapePageBounds?.(shapeId))
      uniquePush(
        pdfPages,
        `${sourceFileName}${pageNumber ? ` page ${pageNumber}` : ''}${bounds ? ` ${bounds}` : ''}`,
        8
      )
      if (typeof meta.sourceDocumentTextExcerpt === 'string') {
        uniquePush(
          pdfTextExcerpts,
          `${sourceFileName}: ${truncate(meta.sourceDocumentTextExcerpt, 260)}`,
          3
        )
      }
    }

    const text = shapeText(shape)
    if (text) uniquePush(labels, truncate(text, 120), maxLabels)

    const latex = shapeLatex(shape)
    if (latex) uniquePush(mathBlocks, truncate(latex, 120), maxMathBlocks)

    const kind = describeShapeKind(shape)
    const bounds = formatBounds(reader.getShapePageBounds?.(shapeId))
    const ownership = isToolOwned ? 'tool-owned' : 'student-drawn'
    uniquePush(visuals, `${ownership} ${kind}${bounds ? ` ${bounds}` : ''}`, maxVisuals)
  }

  const lines = [
    `Visible board summary: ${shapeIds.length} shape${shapeIds.length === 1 ? '' : 's'} on the current page.`,
    toolGroups.length ? `Tool visuals: ${toolGroups.join(', ')}.` : '',
    pdfPages.length ? `Imported PDF pages visible: ${pdfPages.join('; ')}.` : '',
    pdfTextExcerpts.length ? `Imported PDF text excerpt: ${pdfTextExcerpts.join(' | ')}.` : '',
    labels.length ? `Text labels visible: ${labels.map((label) => `"${label}"`).join('; ')}.` : '',
    mathBlocks.length ? `Math blocks visible: ${mathBlocks.map((latex) => `"${latex}"`).join('; ')}.` : '',
    visuals.length ? `Visual objects: ${visuals.join('; ')}.` : '',
    `Ownership: ${toolOwnedCount} tool-owned shape${toolOwnedCount === 1 ? '' : 's'}, ${studentOwnedCount} student-drawn shape${studentOwnedCount === 1 ? '' : 's'}.`,
  ].filter(Boolean)

  return truncate(lines.join(' '), maxChars)
}
