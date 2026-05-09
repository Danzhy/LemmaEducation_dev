import {
  handleLiveKitToolRequest,
  LIVEKIT_TOOL_ENDPOINT_CONFIGS,
} from '@/lib/livekit/tool-api-route'

export async function POST(request: Request) {
  return handleLiveKitToolRequest(request, LIVEKIT_TOOL_ENDPOINT_CONFIGS.preview)
}
