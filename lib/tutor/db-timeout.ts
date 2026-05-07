export const TUTOR_DB_TIMEOUT_MS = 15000

export function createTutorDbTimeout(timeoutMs = TUTOR_DB_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
    timedOut: () => controller.signal.aborted,
  }
}
