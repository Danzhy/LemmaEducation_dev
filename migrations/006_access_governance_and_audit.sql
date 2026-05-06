CREATE TABLE IF NOT EXISTS session_access_audits (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES tutor_sessions (id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL,
  viewer_user_id TEXT NOT NULL,
  viewer_role TEXT NOT NULL CHECK (viewer_role IN ('teacher', 'parent', 'admin')),
  access_type TEXT NOT NULL DEFAULT 'session_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_access_audits_student_user_id
  ON session_access_audits (student_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_access_audits_viewer_user_id
  ON session_access_audits (viewer_user_id, created_at DESC);
