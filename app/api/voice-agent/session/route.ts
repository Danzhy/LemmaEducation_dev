import { handleVoiceAgentSessionRequest } from '@/lib/voice-agent/session-api-route'

export async function POST(request: Request) {
  return handleVoiceAgentSessionRequest(request)
}
