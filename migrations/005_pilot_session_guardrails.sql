ALTER TABLE tutor_usage
  ADD COLUMN IF NOT EXISTS total_completed_sessions INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tutor_sessions
  ADD COLUMN IF NOT EXISTS session_state TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_resumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tutor_sessions_session_state_check'
  ) THEN
    ALTER TABLE tutor_sessions
      ADD CONSTRAINT tutor_sessions_session_state_check
      CHECK (session_state IN ('active', 'paused', 'ended'));
  END IF;
END $$;

UPDATE tutor_sessions
SET
  session_state = CASE WHEN ended_at IS NULL THEN 'active' ELSE 'ended' END,
  last_resumed_at = COALESCE(last_resumed_at, started_at),
  last_activity_at = COALESCE(last_activity_at, ended_at, started_at),
  paused_at = CASE WHEN ended_at IS NULL THEN paused_at ELSE NULL END
WHERE
  last_resumed_at IS NULL
  OR last_activity_at IS NULL
  OR session_state NOT IN ('active', 'paused', 'ended');

CREATE INDEX IF NOT EXISTS idx_tutor_sessions_state
  ON tutor_sessions (user_id, session_state);
