-- Tutor usage (lifetime active seconds per Neon Auth user.id)
CREATE TABLE IF NOT EXISTS tutor_usage (
  user_id TEXT PRIMARY KEY,
  total_active_seconds BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per Start tutoring → End (or disconnect)
CREATE TABLE IF NOT EXISTS tutor_sessions (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  active_seconds BIGINT NOT NULL DEFAULT 0,
  ended_reason TEXT,
  model_snapshot TEXT
);

CREATE INDEX IF NOT EXISTS idx_tutor_sessions_user_id ON tutor_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_sessions_open ON tutor_sessions (user_id) WHERE ended_at IS NULL;

-- Minimal chat logging: user + assistant text turns only
CREATE TABLE IF NOT EXISTS tutor_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES tutor_sessions (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_messages_session ON tutor_messages (session_id);

-- Feedback (public submissions)
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  message TEXT NOT NULL,
  rating INT,
  page_context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
