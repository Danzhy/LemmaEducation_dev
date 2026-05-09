/** Pilot cap: each student can use up to four active tutor hours per week. */
export const TUTOR_WEEKLY_QUOTA_SECONDS = 4 * 60 * 60

/** Pilot cap: each tutor session can last for up to one active hour. */
export const TUTOR_MAX_SESSION_SECONDS = 60 * 60

/** Weekly active-time cap used by tutor session and token gates. */
export const TUTOR_QUOTA_SECONDS = TUTOR_WEEKLY_QUOTA_SECONDS

/** Quota periods reset Monday at 00:00 UTC. */
export const TUTOR_QUOTA_PERIOD = 'week'

/** Auto-pause sessions after this many idle seconds. */
export const TUTOR_INACTIVITY_PAUSE_SECONDS = 5 * 60

/** Max stored message length */
export const TUTOR_MESSAGE_MAX_CHARS = 32000

/** Max active seconds the client may send on `session/end` in one request (server chunks into smaller DB updates). */
export const TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST = 600

/** Max canvas artifact payload accepted for a saved session snapshot. */
export const TUTOR_CANVAS_ARTIFACT_MAX_BASE64_CHARS = 4_000_000
