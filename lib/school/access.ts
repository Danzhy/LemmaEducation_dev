import { randomUUID } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'
import type { UserRole } from '@/lib/school/profiles'

type StudentRow = {
  user_id: string
  display_name: string | null
  grade_level: string | null
}

type ClassroomRow = {
  id: string
  teacher_user_id: string
  name: string
  grade_label: string | null
  school_name: string | null
  join_code: string
  created_at: Date | string
}

export type TeacherClassroomSummary = {
  id: string
  name: string
  gradeLabel: string | null
  schoolName: string | null
  joinCode: string
  createdAt: Date
  students: Array<{
    userId: string
    displayName: string
    gradeLevel: string | null
    sessionCount: number
    lastSessionAt: Date | null
    recentSessions: Array<{
      id: string
      firstUserMessage: string | null
      startedAt: Date
      activeSeconds: number
    }>
  }>
}

export type ParentStudentSummary = {
  userId: string
  displayName: string
  gradeLevel: string | null
  sessionCount: number
  lastSessionAt: Date | null
  recentSessions: Array<{
    id: string
    firstUserMessage: string | null
    startedAt: Date
    activeSeconds: number
  }>
}

function asDate(value: Date | string | null): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function generateClassJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'CLASS-'
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

export async function canViewStudentRecords(viewerUserId: string, studentUserId: string) {
  if (viewerUserId === studentUserId) return true

  const sql = getNeonSql()
  const teacherRows = await sql`
    SELECT 1
    FROM classroom_memberships teacher_membership
    INNER JOIN classroom_memberships student_membership
      ON student_membership.classroom_id = teacher_membership.classroom_id
    WHERE teacher_membership.user_id = ${viewerUserId}
      AND teacher_membership.membership_role = 'teacher'
      AND student_membership.user_id = ${studentUserId}
      AND student_membership.membership_role = 'student'
    LIMIT 1
  `
  if (teacherRows[0]) return true

  const guardianRows = await sql`
    SELECT 1
    FROM guardian_student_links
    WHERE guardian_user_id = ${viewerUserId}
      AND student_user_id = ${studentUserId}
    LIMIT 1
  `
  return Boolean(guardianRows[0])
}

export async function createClassroomForTeacher(input: {
  teacherUserId: string
  name: string
  gradeLabel?: string
  schoolName?: string
}) {
  const sql = getNeonSql()
  const classroomId = randomUUID()

  let joinCode = generateClassJoinCode()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await sql`
        INSERT INTO classrooms (
          id,
          teacher_user_id,
          name,
          grade_label,
          school_name,
          join_code,
          created_at
        )
        VALUES (
          ${classroomId}::uuid,
          ${input.teacherUserId},
          ${input.name},
          ${input.gradeLabel?.trim() || null},
          ${input.schoolName?.trim() || null},
          ${joinCode},
          NOW()
        )
      `

      await sql`
        INSERT INTO classroom_memberships (
          id,
          classroom_id,
          user_id,
          membership_role,
          joined_at
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${classroomId}::uuid,
          ${input.teacherUserId},
          'teacher',
          NOW()
        )
        ON CONFLICT (classroom_id, user_id) DO NOTHING
      `

      return {
        classroomId,
        joinCode,
      }
    } catch {
      joinCode = generateClassJoinCode()
    }
  }

  throw new Error('Could not create classroom.')
}

export async function joinClassroomAsStudent(input: {
  studentUserId: string
  joinCode: string
}) {
  const sql = getNeonSql()
  const normalized = input.joinCode.trim().toUpperCase()
  const rows = await sql`
    SELECT id, teacher_user_id, name, grade_label, school_name, join_code, created_at
    FROM classrooms
    WHERE join_code = ${normalized} AND archived_at IS NULL
    LIMIT 1
  `

  const classroom = rows[0] as ClassroomRow | undefined
  if (!classroom) {
    return { ok: false as const, code: 'INVALID_CLASS_CODE' as const }
  }

  await sql`
    INSERT INTO classroom_memberships (
      id,
      classroom_id,
      user_id,
      membership_role,
      joined_at
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${classroom.id}::uuid,
      ${input.studentUserId},
      'student',
      NOW()
    )
    ON CONFLICT (classroom_id, user_id)
    DO NOTHING
  `

  return {
    ok: true as const,
    classroom: {
      id: classroom.id,
      name: classroom.name,
      joinCode: classroom.join_code,
    },
  }
}

export async function claimGuardianAccessCode(input: {
  guardianUserId: string
  code: string
}) {
  const sql = getNeonSql()
  const normalizedCode = input.code.trim().toUpperCase()
  const rows = await sql`
    SELECT id, student_user_id
    FROM student_access_codes
    WHERE code = ${normalizedCode}
      AND purpose = 'guardian_link'
      AND claimed_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
  `

  const codeRow = rows[0] as { id: string; student_user_id: string } | undefined
  if (!codeRow) {
    return { ok: false as const, code: 'INVALID_STUDENT_CODE' as const }
  }

  await sql`
    INSERT INTO guardian_student_links (
      id,
      guardian_user_id,
      student_user_id,
      linked_at
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${input.guardianUserId},
      ${codeRow.student_user_id},
      NOW()
    )
    ON CONFLICT (guardian_user_id, student_user_id)
    DO NOTHING
  `

  await sql`
    UPDATE student_access_codes
    SET claimed_by_user_id = ${input.guardianUserId}, claimed_at = NOW()
    WHERE id = ${codeRow.id}::uuid
  `

  return { ok: true as const, studentUserId: codeRow.student_user_id }
}

export async function getStudentClassrooms(studentUserId: string) {
  const sql = getNeonSql()
  const rows = await sql`
    SELECT c.id, c.teacher_user_id, c.name, c.grade_label, c.school_name, c.join_code, c.created_at
    FROM classroom_memberships membership
    INNER JOIN classrooms c ON c.id = membership.classroom_id
    WHERE membership.user_id = ${studentUserId}
      AND membership.membership_role = 'student'
      AND c.archived_at IS NULL
    ORDER BY c.created_at DESC
  `

  return (rows as ClassroomRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    gradeLabel: row.grade_label,
    schoolName: row.school_name,
    joinCode: row.join_code,
    createdAt: asDate(row.created_at)!,
  }))
}

export async function getTeacherDashboardData(teacherUserId: string) {
  const sql = getNeonSql()
  const classroomRows = await sql`
    SELECT id, teacher_user_id, name, grade_label, school_name, join_code, created_at
    FROM classrooms
    WHERE teacher_user_id = ${teacherUserId}
      AND archived_at IS NULL
    ORDER BY created_at DESC
  `

  const classrooms = [] as TeacherClassroomSummary[]
  for (const classroom of classroomRows as ClassroomRow[]) {
    const students = await sql`
      SELECT
        profile.user_id,
        profile.display_name,
        profile.grade_level,
        COALESCE(session_stats.session_count, 0)::int AS session_count,
        session_stats.last_session_at
      FROM classroom_memberships membership
      INNER JOIN user_profiles profile ON profile.user_id = membership.user_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS session_count, MAX(started_at) AS last_session_at
        FROM tutor_sessions
        WHERE user_id = membership.user_id
      ) session_stats ON true
      WHERE membership.classroom_id = ${classroom.id}::uuid
        AND membership.membership_role = 'student'
      ORDER BY profile.display_name ASC NULLS LAST, profile.user_id ASC
    `

    classrooms.push({
      id: classroom.id,
      name: classroom.name,
      gradeLabel: classroom.grade_label,
      schoolName: classroom.school_name,
      joinCode: classroom.join_code,
      createdAt: asDate(classroom.created_at)!,
      students: await Promise.all(
        (students as Array<StudentRow & { session_count: number | string; last_session_at: Date | string | null }>).map(
          async (row) => {
            const recentSessions = await sql`
              SELECT
                s.id,
                s.started_at,
                s.active_seconds,
                (
                  SELECT content
                  FROM tutor_messages
                  WHERE session_id = s.id AND role = 'user'
                  ORDER BY created_at ASC
                  LIMIT 1
                ) AS first_user_message
              FROM tutor_sessions s
              WHERE s.user_id = ${row.user_id}
              ORDER BY s.started_at DESC
              LIMIT 3
            `

            return {
              userId: row.user_id,
              displayName: row.display_name?.trim() || 'Student',
              gradeLevel: row.grade_level,
              sessionCount: Number(row.session_count ?? 0),
              lastSessionAt: asDate(row.last_session_at),
              recentSessions: (
                recentSessions as Array<{
                  id: string
                  first_user_message: string | null
                  started_at: Date | string
                  active_seconds: string | number
                }>
              ).map((session) => ({
                id: session.id,
                firstUserMessage: session.first_user_message?.trim() || null,
                startedAt: asDate(session.started_at)!,
                activeSeconds: Number(session.active_seconds ?? 0),
              })),
            }
          }
        )
      ),
    })
  }

  return {
    classrooms,
    totalStudents: classrooms.reduce((sum, classroom) => sum + classroom.students.length, 0),
    totalSessions: classrooms.reduce(
      (sum, classroom) => sum + classroom.students.reduce((inner, student) => inner + student.sessionCount, 0),
      0
    ),
  }
}

export async function getParentDashboardData(guardianUserId: string) {
  const sql = getNeonSql()
  const studentRows = await sql`
    SELECT
      profile.user_id,
      profile.display_name,
      profile.grade_level,
      COALESCE(session_stats.session_count, 0)::int AS session_count,
      session_stats.last_session_at
    FROM guardian_student_links link
    INNER JOIN user_profiles profile ON profile.user_id = link.student_user_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS session_count, MAX(started_at) AS last_session_at
      FROM tutor_sessions
      WHERE user_id = link.student_user_id
    ) session_stats ON true
    WHERE link.guardian_user_id = ${guardianUserId}
    ORDER BY profile.display_name ASC NULLS LAST, profile.user_id ASC
  `

  const students = [] as ParentStudentSummary[]
  for (const student of studentRows as Array<StudentRow & { session_count: number | string; last_session_at: Date | string | null }>) {
    const recentSessions = await sql`
      SELECT
        s.id,
        s.started_at,
        s.active_seconds,
        (
          SELECT content
          FROM tutor_messages
          WHERE session_id = s.id AND role = 'user'
          ORDER BY created_at ASC
          LIMIT 1
        ) AS first_user_message
      FROM tutor_sessions s
      WHERE s.user_id = ${student.user_id}
      ORDER BY s.started_at DESC
      LIMIT 3
    `

    students.push({
      userId: student.user_id,
      displayName: student.display_name?.trim() || 'Student',
      gradeLevel: student.grade_level,
      sessionCount: Number(student.session_count ?? 0),
      lastSessionAt: asDate(student.last_session_at),
      recentSessions: (recentSessions as Array<{ id: string; first_user_message: string | null; started_at: Date | string; active_seconds: string | number }>).map((row) => ({
        id: row.id,
        firstUserMessage: row.first_user_message?.trim() || null,
        startedAt: asDate(row.started_at)!,
        activeSeconds: Number(row.active_seconds ?? 0),
      })),
    })
  }

  return {
    students,
    totalSessions: students.reduce((sum, student) => sum + student.sessionCount, 0),
  }
}

export async function getAccessibleStudentIds(viewerUserId: string, viewerRole: UserRole | null) {
  if (viewerRole === 'student' || viewerRole === 'admin') {
    return [viewerUserId]
  }

  const sql = getNeonSql()
  if (viewerRole === 'teacher') {
    const rows = await sql`
      SELECT DISTINCT student_membership.user_id
      FROM classroom_memberships teacher_membership
      INNER JOIN classroom_memberships student_membership
        ON student_membership.classroom_id = teacher_membership.classroom_id
      WHERE teacher_membership.user_id = ${viewerUserId}
        AND teacher_membership.membership_role = 'teacher'
        AND student_membership.membership_role = 'student'
    `
    return rows.map((row) => (row as { user_id: string }).user_id)
  }

  if (viewerRole === 'parent') {
    const rows = await sql`
      SELECT student_user_id
      FROM guardian_student_links
      WHERE guardian_user_id = ${viewerUserId}
    `
    return rows.map((row) => (row as { student_user_id: string }).student_user_id)
  }

  return []
}
