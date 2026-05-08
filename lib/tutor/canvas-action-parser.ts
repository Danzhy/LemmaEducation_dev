import type {
  TutorCanvasAction,
  TutorCanvasColor,
  TutorCanvasDash,
  TutorCanvasLabelPosition,
  TutorCanvasSize,
} from '@/lib/tutor/session-adapter'

const CANVAS_COLORS = [
  'black',
  'grey',
  'blue',
  'green',
  'red',
  'yellow',
  'orange',
  'violet',
  'light-blue',
  'light-red',
  'light-green',
] as const satisfies readonly TutorCanvasColor[]

const CANVAS_DASHES = ['draw', 'dashed', 'dotted', 'solid'] as const satisfies readonly TutorCanvasDash[]
const CANVAS_SIZES = ['s', 'm', 'l', 'xl'] as const satisfies readonly TutorCanvasSize[]
const CANVAS_FILLS = ['none', 'semi', 'solid'] as const
const CANVAS_LABEL_POSITIONS = [
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const satisfies readonly TutorCanvasLabelPosition[]

function parseCanvasColor(value: unknown) {
  return typeof value === 'string' && (CANVAS_COLORS as readonly string[]).includes(value)
    ? (value as TutorCanvasColor)
    : undefined
}

function parseCanvasDash(value: unknown) {
  return typeof value === 'string' && (CANVAS_DASHES as readonly string[]).includes(value)
    ? (value as TutorCanvasDash)
    : undefined
}

function parseCanvasSize(value: unknown) {
  return typeof value === 'string' && (CANVAS_SIZES as readonly string[]).includes(value)
    ? (value as TutorCanvasSize)
    : undefined
}

function parseCanvasFill(value: unknown) {
  return typeof value === 'string' && (CANVAS_FILLS as readonly string[]).includes(value)
    ? (value as 'none' | 'semi' | 'solid')
    : undefined
}

function parseCanvasLabelPosition(value: unknown) {
  return typeof value === 'string' &&
    (CANVAS_LABEL_POSITIONS as readonly string[]).includes(value)
    ? (value as TutorCanvasLabelPosition)
    : undefined
}

export function parseJsonSafely(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function buildCanvasActionFromPayload(
  actionType: string,
  payload: Record<string, any>
): TutorCanvasAction | null {
  const actionId = typeof payload.id === 'string' && payload.id.trim() ? payload.id : crypto.randomUUID()

  switch (actionType) {
    case 'clear_tool_layer':
      return {
        id: actionId,
        type: 'clear_tool_layer',
      }
    case 'focus_region':
      if (
        typeof payload.x !== 'number' ||
        typeof payload.y !== 'number' ||
        typeof payload.width !== 'number' ||
        typeof payload.height !== 'number'
      ) {
        return null
      }
      return {
        id: actionId,
        type: 'focus_region',
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
      }
    case 'place_text_label':
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number' || typeof payload.text !== 'string') {
        return null
      }
      return {
        id: actionId,
        type: 'place_text_label',
        x: payload.x,
        y: payload.y,
        text: payload.text,
        width: typeof payload.width === 'number' ? payload.width : undefined,
        color: parseCanvasColor(payload.color),
      }
    case 'place_math_block':
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number' || typeof payload.latex !== 'string') {
        return null
      }
      return {
        id: actionId,
        type: 'place_math_block',
        x: payload.x,
        y: payload.y,
        latex: payload.latex,
        width: typeof payload.width === 'number' ? payload.width : undefined,
        height: typeof payload.height === 'number' ? payload.height : undefined,
        displayMode: typeof payload.displayMode === 'boolean' ? payload.displayMode : undefined,
      }
    case 'place_point':
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number') {
        return null
      }
      return {
        id: actionId,
        type: 'place_point',
        x: payload.x,
        y: payload.y,
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        labelPosition: parseCanvasLabelPosition(payload.labelPosition),
        labelWidth: typeof payload.labelWidth === 'number' ? payload.labelWidth : undefined,
      }
    case 'draw_line_segment':
      if (
        typeof payload.start?.x !== 'number' ||
        typeof payload.start?.y !== 'number' ||
        typeof payload.end?.x !== 'number' ||
        typeof payload.end?.y !== 'number'
      ) {
        return null
      }
      return {
        id: actionId,
        type: 'draw_line_segment',
        start: { x: payload.start.x, y: payload.start.y },
        end: { x: payload.end.x, y: payload.end.y },
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
      }
    case 'draw_axes':
      if (
        typeof payload.origin?.x !== 'number' ||
        typeof payload.origin?.y !== 'number' ||
        typeof payload.xLength !== 'number' ||
        typeof payload.yLength !== 'number'
      ) {
        return null
      }
      return {
        id: actionId,
        type: 'draw_axes',
        origin: { x: payload.origin.x, y: payload.origin.y },
        xLength: payload.xLength,
        yLength: payload.yLength,
        xLabel: typeof payload.xLabel === 'string' ? payload.xLabel : undefined,
        yLabel: typeof payload.yLabel === 'string' ? payload.yLabel : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
      }
    case 'draw_rectangle':
      if (
        typeof payload.x !== 'number' ||
        typeof payload.y !== 'number' ||
        typeof payload.width !== 'number' ||
        typeof payload.height !== 'number'
      ) {
        return null
      }
      return {
        id: actionId,
        type: 'draw_rectangle',
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
        fill: parseCanvasFill(payload.fill),
        opacity: typeof payload.opacity === 'number' ? payload.opacity : undefined,
      }
    case 'plot_polyline':
      if (!Array.isArray(payload.points)) return null
      return {
        id: actionId,
        type: 'plot_polyline',
        points: payload.points
          .filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
          .map((point) => ({ x: point.x, y: point.y })),
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
      }
    case 'highlight_region':
      if (
        typeof payload.x !== 'number' ||
        typeof payload.y !== 'number' ||
        typeof payload.width !== 'number' ||
        typeof payload.height !== 'number'
      ) {
        return null
      }
      return {
        id: actionId,
        type: 'highlight_region',
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        opacity: typeof payload.opacity === 'number' ? payload.opacity : undefined,
      }
    default:
      return null
  }
}

export function extractCanvasActionsFromToolResult(
  toolName: string,
  parsed: any,
  maxActions = 80
): TutorCanvasAction[] {
  if (!parsed || typeof parsed !== 'object') return []

  if (Array.isArray(parsed.canvasActions)) {
    return parsed.canvasActions
      .map((action: Record<string, any>) => buildCanvasActionFromPayload(action.type, action))
      .filter(Boolean)
      .slice(0, maxActions) as TutorCanvasAction[]
  }

  if (
    toolName === 'canvas_action' &&
    typeof parsed.actionType === 'string' &&
    parsed.payload &&
    typeof parsed.payload === 'object'
  ) {
    const action = buildCanvasActionFromPayload(parsed.actionType, parsed.payload as Record<string, any>)
    return action ? [action] : []
  }

  return []
}
