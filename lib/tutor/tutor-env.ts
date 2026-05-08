export function getRequiredEnv(value: string | undefined) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

export function getRequiredInstructionEnv(value: string | undefined) {
  const normalized = getRequiredEnv(value)
  if (!normalized) return null
  return normalized.replace(/\\n/g, '\n')
}
