// @ts-expect-error - createShapeId/getIndices exist at runtime
import { createShapeId, getIndices, toRichText } from 'tldraw'
// @ts-expect-error - Editor runtime export is available
import type { Editor } from 'tldraw'
import type {
  TutorCanvasAction,
  TutorCanvasColor,
  TutorCanvasDash,
  TutorCanvasLabelPosition,
  TutorCanvasSize,
} from '@/lib/tutor/session-adapter'
import { deleteExistingCanvasArtifactShapes } from '@/lib/tutor/canvas-artifact-renderer'

const TOOL_META = { lemmaToolOwned: true } as const

function buildToolMeta(action: TutorCanvasAction, suffix?: string) {
  const artifactId = action.artifactId ? `${action.artifactId}${suffix ? `:${suffix}` : ''}` : undefined
  return {
    ...TOOL_META,
    ...(artifactId ? { lemmaArtifactId: artifactId } : {}),
    ...(action.artifactGroupId ? { lemmaArtifactGroupId: action.artifactGroupId } : {}),
  }
}

function resolveColor(color?: TutorCanvasColor) {
  return color ?? 'black'
}

function resolveDash(dash?: TutorCanvasDash) {
  return dash ?? 'solid'
}

function resolveSize(size?: TutorCanvasSize) {
  return size ?? 'm'
}

function resolveOpacity(opacity: number | undefined, fallback = 0.18) {
  if (typeof opacity !== 'number' || Number.isNaN(opacity)) return fallback
  return Math.max(0.05, Math.min(opacity, 1))
}

function createText(editor: Editor, action: Extract<TutorCanvasAction, { type: 'place_text_label' }>): string[] {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'text',
    x: action.x,
    y: action.y,
    meta: buildToolMeta(action),
    props: {
      w: action.width ?? 220,
      richText: toRichText(action.text),
      color: resolveColor(action.color),
    },
  })

  return [id]
}

function createMathBlock(editor: Editor, action: Extract<TutorCanvasAction, { type: 'place_math_block' }>): string[] {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'math-block',
    x: action.x,
    y: action.y,
    meta: buildToolMeta(action),
    props: {
      latex: action.latex,
      displayMode: action.displayMode ?? true,
      w: action.width ?? 220,
      h: action.height ?? (action.displayMode === false ? 58 : 86),
    },
  })

  return [id]
}

function createPoint(editor: Editor, action: Extract<TutorCanvasAction, { type: 'place_point' }>): string[] {
  const createdIds: string[] = []
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'geo',
    x: action.x - 6,
    y: action.y - 6,
    meta: buildToolMeta(action),
    props: {
      geo: 'ellipse',
      w: 12,
      h: 12,
      fill: 'solid',
      color: resolveColor(action.color),
    },
  })
  createdIds.push(id)

  if (action.label) {
    const position = action.labelPosition ?? 'top-right'
    const labelWidth = action.labelWidth ?? 100
    const labelOffsets: Record<TutorCanvasLabelPosition, { x: number; y: number }> = {
      top: { x: -labelWidth / 2, y: -40 },
      bottom: { x: -labelWidth / 2, y: 18 },
      left: { x: -labelWidth - 16, y: -12 },
      right: { x: 16, y: -12 },
      'top-left': { x: -labelWidth - 12, y: -40 },
      'top-right': { x: 16, y: -40 },
      'bottom-left': { x: -labelWidth - 12, y: 18 },
      'bottom-right': { x: 16, y: 18 },
    }
    const offset = labelOffsets[position]
    createdIds.push(
      ...createText(editor, {
        id: `${action.id}-label`,
        artifactId: action.artifactId ? `${action.artifactId}:label` : undefined,
        artifactGroupId: action.artifactGroupId,
        type: 'place_text_label',
        x: action.x + offset.x,
        y: action.y + offset.y,
        text: action.label,
        width: labelWidth,
        color: action.color,
      })
    )
  }

  return createdIds
}

function createLine(editor: Editor, action: Extract<TutorCanvasAction, { type: 'draw_line_segment' }>): string[] {
  const createdIds: string[] = []
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'arrow',
    x: 0,
    y: 0,
    meta: buildToolMeta(action),
    props: {
      start: action.start,
      end: action.end,
      arrowheadEnd: 'none',
      arrowheadStart: 'none',
      color: resolveColor(action.color),
      dash: resolveDash(action.dash),
      size: resolveSize(action.size),
    },
  })
  createdIds.push(id)

  if (action.label) {
    createdIds.push(
      ...createText(editor, {
        id: `${action.id}-label`,
        artifactId: action.artifactId ? `${action.artifactId}:label` : undefined,
        artifactGroupId: action.artifactGroupId,
        type: 'place_text_label',
        x: (action.start.x + action.end.x) / 2 + 10,
        y: (action.start.y + action.end.y) / 2 - 24,
        text: action.label,
        width: 140,
        color: action.color,
      })
    )
  }

  return createdIds
}

function createAxes(editor: Editor, action: Extract<TutorCanvasAction, { type: 'draw_axes' }>): string[] {
  const { origin, xLength, yLength } = action
  const createdIds: string[] = []
  const commonProps = {
    color: resolveColor(action.color),
    dash: resolveDash(action.dash),
    size: resolveSize(action.size),
  }

  const xAxisId = createShapeId()
  editor.createShape({
    id: xAxisId,
    type: 'arrow',
    x: 0,
    y: 0,
    meta: buildToolMeta(action, 'x-axis'),
    props: {
      start: { x: origin.x - xLength / 2, y: origin.y },
      end: { x: origin.x + xLength / 2, y: origin.y },
      arrowheadEnd: 'arrow',
      arrowheadStart: 'none',
      ...commonProps,
    },
  })
  createdIds.push(xAxisId)

  const yAxisId = createShapeId()
  editor.createShape({
    id: yAxisId,
    type: 'arrow',
    x: 0,
    y: 0,
    meta: buildToolMeta(action, 'y-axis'),
    props: {
      start: { x: origin.x, y: origin.y + yLength / 2 },
      end: { x: origin.x, y: origin.y - yLength / 2 },
      arrowheadEnd: 'arrow',
      arrowheadStart: 'none',
      ...commonProps,
    },
  })
  createdIds.push(yAxisId)

  if (action.xLabel) {
    createdIds.push(
      ...createText(editor, {
        id: `${action.id}-xlabel`,
        artifactId: action.artifactId ? `${action.artifactId}:x-label` : undefined,
        artifactGroupId: action.artifactGroupId,
        type: 'place_text_label',
        x: origin.x + xLength / 2 - 10,
        y: origin.y + 10,
        text: action.xLabel,
        width: 40,
        color: action.color,
      })
    )
  }

  if (action.yLabel) {
    createdIds.push(
      ...createText(editor, {
        id: `${action.id}-ylabel`,
        artifactId: action.artifactId ? `${action.artifactId}:y-label` : undefined,
        artifactGroupId: action.artifactGroupId,
        type: 'place_text_label',
        x: origin.x + 10,
        y: origin.y - yLength / 2 - 24,
        text: action.yLabel,
        width: 40,
        color: action.color,
      })
    )
  }

  return createdIds
}

function createRectangle(editor: Editor, action: Extract<TutorCanvasAction, { type: 'draw_rectangle' }>): string[] {
  const createdIds: string[] = []
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'geo',
    x: action.x,
    y: action.y,
    opacity: resolveOpacity(action.opacity, action.fill === 'solid' ? 0.22 : 0.16),
    meta: buildToolMeta(action),
    props: {
      geo: 'rectangle',
      w: action.width,
      h: action.height,
      color: resolveColor(action.color),
      dash: resolveDash(action.dash),
      size: resolveSize(action.size),
      fill: action.fill ?? 'semi',
    },
  })
  createdIds.push(id)

  if (action.label) {
    createdIds.push(
      ...createText(editor, {
        id: `${action.id}-label`,
        artifactId: action.artifactId ? `${action.artifactId}:label` : undefined,
        artifactGroupId: action.artifactGroupId,
        type: 'place_text_label',
        x: action.x + 14,
        y: action.y + 12,
        text: action.label,
        width: Math.max(120, action.width - 28),
        color: action.color,
      })
    )
  }

  return createdIds
}

function createPolyline(editor: Editor, action: Extract<TutorCanvasAction, { type: 'plot_polyline' }>): string[] {
  if (action.points.length < 2) return []

  const origin = action.points[0]
  const indices = getIndices(action.points.length)
  const points = Object.fromEntries(
    action.points.map((point, index) => {
      const pointIndex = indices[index]
      return [
        pointIndex,
        {
          id: pointIndex,
          index: pointIndex,
          x: point.x - origin.x,
          y: point.y - origin.y,
        },
      ]
    })
  )

  const createdIds: string[] = []
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'line',
    x: origin.x,
    y: origin.y,
    meta: buildToolMeta(action),
    props: {
      points,
      color: resolveColor(action.color ?? 'blue'),
      dash: resolveDash(action.dash),
      size: resolveSize(action.size),
      spline: 'line',
    },
  })
  createdIds.push(id)

  if (action.label) {
    const lastPoint = action.points[action.points.length - 1]
    createdIds.push(
      ...createText(editor, {
        id: `${action.id}-label`,
        artifactId: action.artifactId ? `${action.artifactId}:label` : undefined,
        artifactGroupId: action.artifactGroupId,
        type: 'place_text_label',
        x: lastPoint.x + 12,
        y: lastPoint.y - 32,
        text: action.label,
        width: 160,
        color: action.color ?? 'blue',
      })
    )
  }

  return createdIds
}

function createHighlight(editor: Editor, action: Extract<TutorCanvasAction, { type: 'highlight_region' }>): string[] {
  const createdIds: string[] = []
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'geo',
    x: action.x,
    y: action.y,
    opacity: resolveOpacity(action.opacity, 0.18),
    meta: buildToolMeta(action),
    props: {
      geo: 'rectangle',
      w: action.width,
      h: action.height,
      fill: 'solid',
      color: resolveColor(action.color ?? 'yellow'),
      dash: 'draw',
    },
  })
  createdIds.push(id)

  if (action.label) {
    createdIds.push(
      ...createText(editor, {
        id: `${action.id}-label`,
        artifactId: action.artifactId ? `${action.artifactId}:label` : undefined,
        artifactGroupId: action.artifactGroupId,
        type: 'place_text_label',
        x: action.x,
        y: action.y - 28,
        text: action.label,
        width: Math.max(120, Math.min(action.width, 240)),
        color: action.color ?? 'yellow',
      })
    )
  }

  return createdIds
}

export function applyTutorCanvasAction(editor: Editor, action: TutorCanvasAction): string[] {
  if (action.artifactId) {
    deleteExistingCanvasArtifactShapes(editor, action.artifactId)
  }

  switch (action.type) {
    case 'clear_tool_layer':
    case 'focus_region':
      return []
    case 'place_text_label':
      return createText(editor, action)
    case 'place_math_block':
      return createMathBlock(editor, action)
    case 'place_point':
      return createPoint(editor, action)
    case 'draw_line_segment':
      return createLine(editor, action)
    case 'draw_axes':
      return createAxes(editor, action)
    case 'draw_rectangle':
      return createRectangle(editor, action)
    case 'plot_polyline':
      return createPolyline(editor, action)
    case 'highlight_region':
      return createHighlight(editor, action)
  }
}
