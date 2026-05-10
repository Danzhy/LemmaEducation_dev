import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertIncludes(path: string, needle: string) {
  assert(read(path).includes(needle), `${path} should include ${needle}`)
}

function assertExcludes(path: string, needle: string) {
  assert(!read(path).includes(needle), `${path} should not include ${needle}`)
}

const logRoute = 'app/api/realtime/log-error/route.ts'
const mathEditor = 'components/MathEditor.tsx'
const mathBlockShape = 'components/MathBlockShape.tsx'

assertIncludes(logRoute, 'takeRateLimit')
assertIncludes(logRoute, "endpoint: 'realtime-log-error'")
assertIncludes(logRoute, 'MAX_LOG_ERROR_BODY_BYTES')
assertIncludes(logRoute, 'redactSensitiveLogText')
assertIncludes(logRoute, 'sk-[redacted]')
assertIncludes(logRoute, 'postgresql://[redacted]')
assertExcludes(logRoute, 'await request.json()')

assertIncludes(mathEditor, 'trust: false')
assertIncludes(mathBlockShape, 'trust: false')
assertIncludes(mathEditor, 'sanitizeMathHtml')
assertIncludes(mathBlockShape, 'sanitizeMathHtml')

console.log(JSON.stringify({ ok: true, checked: 11 }))
