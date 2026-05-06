ALTER TABLE tutor_sessions
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS grade_level TEXT;

CREATE TABLE IF NOT EXISTS tutor_session_artifacts (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES tutor_sessions (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('canvas_snapshot')),
  mime_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, artifact_kind)
);

CREATE INDEX IF NOT EXISTS idx_tutor_session_artifacts_user_id
  ON tutor_session_artifacts (user_id);

CREATE INDEX IF NOT EXISTS idx_tutor_session_artifacts_session_id
  ON tutor_session_artifacts (session_id);
