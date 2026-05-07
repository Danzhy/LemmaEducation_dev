CREATE TABLE IF NOT EXISTS tutor_tool_events (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  input_json JSONB,
  output_json JSONB,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tutor_tool_events_session_created_idx
  ON tutor_tool_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tutor_tool_events_user_created_idx
  ON tutor_tool_events (user_id, created_at DESC);
