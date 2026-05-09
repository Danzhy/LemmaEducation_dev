import { canvasArtifactIdMatches } from '@/lib/tutor/canvas-action-artifacts'

type CanvasArtifactShape = {
  meta?: Record<string, unknown>
}

type CanvasArtifactPageReader<ShapeId extends string = string> = {
  getCurrentPageShapeIds: () => Iterable<ShapeId>
  getShape: (shapeId: ShapeId) => CanvasArtifactShape | undefined
}

type CanvasArtifactEditor<ShapeId extends string = string> = CanvasArtifactPageReader<ShapeId> & {
  deleteShapes: (shapeIds: ShapeId[]) => void
}

export function getCanvasArtifactShapeIds<ShapeId extends string>(
  page: CanvasArtifactPageReader<ShapeId>,
  artifactId: string
) {
  return [...page.getCurrentPageShapeIds()].filter((shapeId) => {
    const shape = page.getShape(shapeId)
    return canvasArtifactIdMatches(shape?.meta?.lemmaArtifactId, artifactId)
  })
}

export function deleteExistingCanvasArtifactShapes<ShapeId extends string>(
  editor: CanvasArtifactEditor<ShapeId>,
  artifactId: string
) {
  const matchingShapeIds = getCanvasArtifactShapeIds(editor, artifactId)

  if (matchingShapeIds.length > 0) {
    editor.deleteShapes(matchingShapeIds)
  }

  return matchingShapeIds
}
