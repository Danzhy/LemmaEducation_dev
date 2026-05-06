CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  role TEXT CHECK (role IN ('student', 'teacher', 'parent', 'admin')),
  grade_level TEXT,
  school_name TEXT,
  privacy_notice_accepted_at TIMESTAMPTZ,
  pilot_data_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY,
  teacher_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grade_label TEXT,
  school_name TEXT,
  join_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_user_id
  ON classrooms (teacher_user_id);

CREATE TABLE IF NOT EXISTS classroom_memberships (
  id UUID PRIMARY KEY,
  classroom_id UUID NOT NULL REFERENCES classrooms (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  membership_role TEXT NOT NULL CHECK (membership_role IN ('teacher', 'student')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (classroom_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_memberships_user_id
  ON classroom_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_classroom_memberships_classroom_id
  ON classroom_memberships (classroom_id);

CREATE TABLE IF NOT EXISTS guardian_student_links (
  id UUID PRIMARY KEY,
  guardian_user_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  relationship_label TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guardian_user_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_guardian_student_links_guardian_user_id
  ON guardian_student_links (guardian_user_id);

CREATE INDEX IF NOT EXISTS idx_guardian_student_links_student_user_id
  ON guardian_student_links (student_user_id);

CREATE TABLE IF NOT EXISTS student_access_codes (
  id UUID PRIMARY KEY,
  student_user_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('guardian_link')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  claimed_by_user_id TEXT,
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_access_codes_student_user_id
  ON student_access_codes (student_user_id);
