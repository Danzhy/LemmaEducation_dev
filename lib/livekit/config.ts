export type LiveKitServerConfig =
  | {
      configured: true
      url: string
      apiKey: string
      apiSecret: string
      agentName: string
    }
  | {
      configured: false
      missing: string[]
      url?: string
      agentName: string
    }

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

export function normalizeLiveKitUrl(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`
  return trimmed
}

export function isAllowedLiveKitUrl(value: string | null) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.protocol === 'wss:') return true
    if (url.protocol !== 'ws:') return false
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

export function getLiveKitServerConfig(): LiveKitServerConfig {
  const url = normalizeLiveKitUrl(requiredEnv('LIVEKIT_URL'))
  const apiKey = requiredEnv('LIVEKIT_API_KEY')
  const apiSecret = requiredEnv('LIVEKIT_API_SECRET')
  const agentName = requiredEnv('LIVEKIT_AGENT_NAME') || 'lemma-livekit-tutor'
  const missing: string[] = []

  if (!url || !isAllowedLiveKitUrl(url)) missing.push('LIVEKIT_URL')
  if (!apiKey) missing.push('LIVEKIT_API_KEY')
  if (!apiSecret) missing.push('LIVEKIT_API_SECRET')

  if (missing.length > 0) {
    return {
      configured: false,
      missing,
      url: url ?? undefined,
      agentName,
    }
  }

  return {
    configured: true,
    url: url!,
    apiKey: apiKey!,
    apiSecret: apiSecret!,
    agentName,
  }
}

export function buildLiveKitRoomName(sessionId: string) {
  return `lemma-livekit-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`
}

export function buildLiveKitStudentIdentity(userId: string, sessionId: string) {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12)
  return `student-${safeUser}-${safeSession}`
}
