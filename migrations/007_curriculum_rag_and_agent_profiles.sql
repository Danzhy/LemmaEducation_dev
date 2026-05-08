CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS curriculum_documents (
  id UUID PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  classroom_id UUID REFERENCES classrooms (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source_name TEXT,
  source_kind TEXT NOT NULL DEFAULT 'text' CHECK (source_kind IN ('text', 'pdf_text', 'notes')),
  visibility TEXT NOT NULL DEFAULT 'teacher_private' CHECK (visibility IN ('teacher_private', 'classroom')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('processing', 'ready', 'failed', 'archived')),
  text_sha256 TEXT NOT NULL,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_documents_owner_created
  ON curriculum_documents (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_curriculum_documents_classroom_created
  ON curriculum_documents (classroom_id, created_at DESC)
  WHERE classroom_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS curriculum_chunks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES curriculum_documents (id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  classroom_id UUID REFERENCES classrooms (id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  embedding VECTOR(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_chunks_document
  ON curriculum_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_curriculum_chunks_owner
  ON curriculum_chunks (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_curriculum_chunks_classroom
  ON curriculum_chunks (classroom_id, created_at DESC)
  WHERE classroom_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_curriculum_chunks_embedding_hnsw
  ON curriculum_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS tutor_agent_profiles (
  id UUID PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  classroom_id UUID REFERENCES classrooms (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade_band TEXT,
  instructions TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'classroom' CHECK (scope IN ('teacher_private', 'classroom')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_agent_profiles_owner_created
  ON tutor_agent_profiles (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tutor_agent_profiles_classroom_active
  ON tutor_agent_profiles (classroom_id, created_at DESC)
  WHERE classroom_id IS NOT NULL AND status = 'active';
