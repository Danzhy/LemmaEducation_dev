/** Lifetime cap: active Realtime tutor seconds per user (pause excluded client-side). */
export const TUTOR_QUOTA_SECONDS = 1200

/** Max stored message length */
export const TUTOR_MESSAGE_MAX_CHARS = 32000

/** Max active seconds the client may send on `session/end` in one request (server chunks into smaller DB updates). */
export const TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST = 600
