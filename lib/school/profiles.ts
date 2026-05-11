import { randomInt, randomUUID } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'
import { getSessionUser, type SessionUser } from '@/lib/auth/current-user'

export type UserRole = 'student' | 'teacher' | 'parent' | 'admin'

export type UserProfile = {
  userId: string
  email: string | null
  displayName: string | null
  role: UserRole | null
  gradeLevel: string | null
  schoolName: string | null
  privacyNoticeAcceptedAt: Date | null
  pilotDataConsentAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type UserProfileRow = {
  user_id: string
  email: string | null
  display_name: string | null
  role: UserRole | null
  grade_level: string | null
  school_name: string | null
  privacy_notice_accepted_at: Date | string | null
  pilot_data_consent_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

type StudentAccessCodeRow = {
  id: string
  code: string
  created_at: Date | string
  expires_at: Date | string | null
  claimed_at: Date | string | null
}

function asDate(value: Date | string | null): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    gradeLevel: row.grade_level,
    schoolName: row.school_name,
    privacyNoticeAcceptedAt: asDate(row.privacy_notice_accepted_at),
    pilotDataConsentAt: asDate(row.pilot_data_consent_at),
    createdAt: asDate(row.created_at)!,
    updatedAt: asDate(row.updated_at)!,
  }
}

export function isOnboardingComplete(profile: UserProfile | null) {
  return Boolean(
    profile?.role &&
      profile.privacyNoticeAcceptedAt &&
      profile.pilotDataConsentAt
  )
}

export async function ensureUserProfile(user: SessionUser) {
  const sql = getNeonSql()
  await sql`
    INSERT INTO user_profiles (
      user_id,
      email,
      display_name,
      created_at,
      updated_at
    )
    VALUES (
      ${user.id},
      ${user.email},
      ${user.name},
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, user_profiles.email),
      display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), user_profiles.display_name),
      updated_at = NOW()
  `
}

export async function getUserProfileById(userId: string) {
  const sql = getNeonSql()
  const rows = await sql`
    SELECT
      user_id,
      email,
      display_name,
      role,
      grade_level,
      school_name,
      privacy_notice_accepted_at,
      pilot_data_consent_at,
      created_at,
      updated_at
    FROM user_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `

  const row = rows[0] as UserProfileRow | undefined
  return row ? toUserProfile(row) : null
}

export async function getCurrentUserProfile() {
  const user = await getSessionUser()
  if (!user) return null
  await ensureUserProfile(user)
  return getUserProfileById(user.id)
}

export async function saveOnboardingProfile(input: {
  user: SessionUser
  role: UserRole
  displayName: string
  gradeLevel?: string
  schoolName?: string
}) {
  const sql = getNeonSql()
  const gradeLevel = input.gradeLevel?.trim() || null
  const schoolName = input.schoolName?.trim() || null

  await sql`
    INSERT INTO user_profiles (
      user_id,
      email,
      display_name,
      role,
      grade_level,
      school_name,
      privacy_notice_accepted_at,
      pilot_data_consent_at,
      created_at,
      updated_at
    )
    VALUES (
      ${input.user.id},
      ${input.user.email},
      ${input.displayName},
      ${input.role},
      ${gradeLevel},
      ${schoolName},
      NOW(),
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, user_profiles.email),
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      grade_level = EXCLUDED.grade_level,
      school_name = EXCLUDED.school_name,
      privacy_notice_accepted_at = COALESCE(user_profiles.privacy_notice_accepted_at, NOW()),
      pilot_data_consent_at = COALESCE(user_profiles.pilot_data_consent_at, NOW()),
      updated_at = NOW()
  `
}

function generateAccessCode(prefix: string, length: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = prefix
  for (let i = 0; i < length; i += 1) {
    code += alphabet[randomInt(0, alphabet.length)]
  }
  return code
}

export async function createOrRotateStudentAccessCode(studentUserId: string) {
  const sql = getNeonSql()

  await sql`
    DELETE FROM student_access_codes
    WHERE student_user_id = ${studentUserId}
      AND purpose = 'guardian_link'
      AND claimed_at IS NULL
  `

  let code = generateAccessCode('LP-', 8)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const id = randomUUID()
      const rows = await sql`
        INSERT INTO student_access_codes (
          id,
          student_user_id,
          code,
          purpose,
          created_at,
          expires_at
        )
        VALUES (
          ${id}::uuid,
          ${studentUserId},
          ${code},
          'guardian_link',
          NOW(),
          NOW() + INTERVAL '7 days'
        )
        RETURNING id, code, created_at, expires_at, claimed_at
      `

      const row = rows[0] as StudentAccessCodeRow
      return {
        id: row.id,
        code: row.code,
        createdAt: asDate(row.created_at)!,
        expiresAt: asDate(row.expires_at),
        claimedAt: asDate(row.claimed_at),
      }
    } catch {
      code = generateAccessCode('LP-', 8)
    }
  }

  throw new Error('Could not create access code.')
}

export async function getActiveStudentAccessCode(studentUserId: string) {
  const sql = getNeonSql()
  const rows = await sql`
    SELECT id, code, created_at, expires_at, claimed_at
    FROM student_access_codes
    WHERE student_user_id = ${studentUserId}
      AND purpose = 'guardian_link'
      AND claimed_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
  `

  const row = rows[0] as StudentAccessCodeRow | undefined
  if (!row) return null

  return {
    id: row.id,
    code: row.code,
    createdAt: asDate(row.created_at)!,
    expiresAt: asDate(row.expires_at),
    claimedAt: asDate(row.claimed_at),
  }
}
