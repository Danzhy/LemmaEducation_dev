import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'

const MAX_ARTIFACT_ID_LENGTH = 96

export function normalizeCanvasArtifactId(value: unknown) {
  if (typeof value !== 'string') return undefined

  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ARTIFACT_ID_LENGTH)

  return normalized || undefined
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function canvasActionFingerprint(action: TutorCanvasAction) {
  const stableAction = { ...action } as Record<string, unknown>
  delete stableAction.id
  delete stableAction.artifactId
  delete stableAction.artifactGroupId
  return stableHash(stableStringify(stableAction))
}

export function assignCanvasArtifactIds(toolName: string, actions: TutorCanvasAction[]) {
  const groupId = normalizeCanvasArtifactId(`tool:${toolName}`) ?? 'tool:unknown'

  return actions.map((action, index) => {
    if (action.type === 'clear_tool_layer' || action.type === 'focus_region') {
      const nonDrawingAction = { ...action }
      delete (nonDrawingAction as { artifactId?: unknown }).artifactId
      delete (nonDrawingAction as { artifactGroupId?: unknown }).artifactGroupId
      return nonDrawingAction
    }

    const artifactId =
      normalizeCanvasArtifactId(action.artifactId) ??
      normalizeCanvasArtifactId(`${groupId}:${index}:${canvasActionFingerprint(action)}`)

    return {
      ...action,
      artifactId,
      artifactGroupId: normalizeCanvasArtifactId(action.artifactGroupId) ?? groupId,
    }
  })
}

export function canvasArtifactIdMatches(candidate: unknown, artifactId: string) {
  return typeof candidate === 'string' && (candidate === artifactId || candidate.startsWith(`${artifactId}:`))
}
