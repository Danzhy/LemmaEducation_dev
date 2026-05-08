import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function assertIncludes(path: string, expected: string) {
  const content = read(path)
  if (!content.includes(expected)) {
    throw new Error(`${path} is missing expected guard: ${expected}`)
  }
}

function assertExcludes(path: string, forbidden: string) {
  const content = read(path)
  if (content.includes(forbidden)) {
    throw new Error(`${path} exposes forbidden server-only value: ${forbidden}`)
  }
}

function main() {
  const clientFiles = [
    'hooks/useLiveKitTutor.ts',
    'app/tutor-livekit-lab/page.tsx',
    'components/tutor/TutorWorkspace.tsx',
  ]

  for (const file of clientFiles) {
    assertExcludes(file, 'LIVEKIT_API_SECRET')
    assertExcludes(file, 'LIVEKIT_API_KEY')
    assertExcludes(file, 'OPENAI_API_KEY')
  }

  assertIncludes('app/api/livekit/session/route.ts', 'getSessionUserId()')
  assertIncludes('app/api/livekit/session/route.ts', 'takeTutorApiRateLimit')
  assertIncludes('app/api/livekit/session/route.ts', "ttl: '10m'")
  assertIncludes('app/api/livekit/session/route.ts', 'RoomAgentDispatch')
  assertIncludes('app/api/livekit/session/route.ts', 'canPublishSources')
  assertIncludes('app/api/livekit/session/route.ts', 'canPublishData: true')
  assertIncludes('workers/livekit-tutor-agent.ts', 'AutoSubscribe.AUDIO_ONLY')
  assertIncludes('workers/livekit-tutor-agent.ts', 'maxToolSteps: 6')
  assertIncludes('lib/livekit/worker-tools.ts', 'DEFAULT_MAX_TOOL_CALLS_PER_SESSION')
  assertIncludes('lib/livekit/worker-tools.ts', 'DEFAULT_MAX_CANVAS_ACTIONS_PER_SESSION')

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedClientFiles: clientFiles.length,
        checkedServerGuards: 10,
      },
      null,
      2
    )
  )
}

main()
