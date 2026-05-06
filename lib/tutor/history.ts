import { getNeonSql } from '@/lib/tutor/db'
import { getQuotaSnapshot } from '@/lib/tutor/quota'

type SessionRow = {
  id: string
  started_at: Date | string
  ended_at: Date | string | null
  active_seconds: number | string
  ended_reason: string | null
  model_snapshot: string | null
  language: string | null
  grade_level: string | null
  user_message_count: number | string
  assistant_message_count: number | string
  first_user_message: string | null
  has_canvas_snapshot: boolean
  artifact_updated_at: Date | string | null
}

type ArtifactRow = {
  mime_type: string
  data_base64: string
  updated_at: Date | string
}

type MessageRow = {
  id: string
  role: 'user' | 'assistant'
  content: string
  source: string | null
  created_at: Date | string
}

export type TutorSessionListItem = {
  id: string
  startedAt: Date
  endedAt: Date | null
  activeSeconds: number
  endedReason: string | null
  modelSnapshot: string | null
  language: string
  gradeLevel: string | null
  userMessageCount: number
  assistantMessageCount: number
  firstUserMessage: string | null
  hasCanvasSnapshot: boolean
  artifactUpdatedAt: Date | null
}

export type TutorSessionDetail = TutorSessionListItem & {
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    source: string | null
    createdAt: Date
  }>
  canvasSnapshot: {
    mimeType: string
    dataBase64: string
    updatedAt: Date
  } | null
}

function asDate(value: Date | string | null): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function toListItem(row: SessionRow): TutorSessionListItem {
  return {
    id: row.id,
    startedAt: asDate(row.started_at)!,
    endedAt: asDate(row.ended_at),
    activeSeconds: Number(row.active_seconds ?? 0),
    endedReason: row.ended_reason,
    modelSnapshot: row.model_snapshot,
    language: row.language?.trim() || 'en',
    gradeLevel: row.grade_level?.trim() || null,
    userMessageCount: Number(row.user_message_count ?? 0),
    assistantMessageCount: Number(row.assistant_message_count ?? 0),
    firstUserMessage: row.first_user_message?.trim() || null,
    hasCanvasSnapshot: Boolean(row.has_canvas_snapshot),
    artifactUpdatedAt: asDate(row.artifact_updated_at),
  }
}

export async function listTutorSessionsForUser(userId: string) {
  const sql = getNeonSql()

  const rows = await sql`
    SELECT
      s.id,
      s.started_at,
      s.ended_at,
      s.active_seconds,
      s.ended_reason,
      s.model_snapshot,
      s.language,
      s.grade_level,
      COALESCE(stats.user_message_count, 0)::int AS user_message_count,
      COALESCE(stats.assistant_message_count, 0)::int AS assistant_message_count,
      first_message.content AS first_user_message,
      (artifact.session_id IS NOT NULL) AS has_canvas_snapshot,
      artifact.updated_at AS artifact_updated_at
    FROM tutor_sessions s
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE role = 'user') AS user_message_count,
        COUNT(*) FILTER (WHERE role = 'assistant') AS assistant_message_count
      FROM tutor_messages
      WHERE session_id = s.id
    ) stats ON true
    LEFT JOIN LATERAL (
      SELECT content
      FROM tutor_messages
      WHERE session_id = s.id AND role = 'user'
      ORDER BY created_at ASC
      LIMIT 1
    ) first_message ON true
    LEFT JOIN tutor_session_artifacts artifact
      ON artifact.session_id = s.id AND artifact.artifact_kind = 'canvas_snapshot'
    WHERE s.user_id = ${userId}
    ORDER BY s.started_at DESC
  `

  const sessions = (rows as SessionRow[]).map(toListItem)
  const quota = await getQuotaSnapshot(sql, userId)

  return {
    sessions,
    summary: {
      totalSessions: sessions.length,
      totalPracticeSeconds: sessions.reduce((total, session) => total + session.activeSeconds, 0),
      remainingSeconds: quota.remainingSeconds,
      quotaSeconds: quota.quotaSeconds,
    },
  }
}

export async function getTutorSessionDetailForUser(userId: string, sessionId: string) {
  const sql = getNeonSql()

  const sessionRows = await sql`
    SELECT
      s.id,
      s.started_at,
      s.ended_at,
      s.active_seconds,
      s.ended_reason,
      s.model_snapshot,
      s.language,
      s.grade_level,
      COALESCE(stats.user_message_count, 0)::int AS user_message_count,
      COALESCE(stats.assistant_message_count, 0)::int AS assistant_message_count,
      first_message.content AS first_user_message,
      (artifact.session_id IS NOT NULL) AS has_canvas_snapshot,
      artifact.updated_at AS artifact_updated_at
    FROM tutor_sessions s
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE role = 'user') AS user_message_count,
        COUNT(*) FILTER (WHERE role = 'assistant') AS assistant_message_count
      FROM tutor_messages
      WHERE session_id = s.id
    ) stats ON true
    LEFT JOIN LATERAL (
      SELECT content
      FROM tutor_messages
      WHERE session_id = s.id AND role = 'user'
      ORDER BY created_at ASC
      LIMIT 1
    ) first_message ON true
    LEFT JOIN tutor_session_artifacts artifact
      ON artifact.session_id = s.id AND artifact.artifact_kind = 'canvas_snapshot'
    WHERE s.user_id = ${userId} AND s.id = ${sessionId}::uuid
    LIMIT 1
  `

  const sessionRow = sessionRows[0] as SessionRow | undefined
  if (!sessionRow) {
    return null
  }

  const messagesRows = await sql`
    SELECT id, role, content, source, created_at
    FROM tutor_messages
    WHERE user_id = ${userId} AND session_id = ${sessionId}::uuid
    ORDER BY created_at ASC, id ASC
  `

  const artifactRows = await sql`
    SELECT mime_type, data_base64, updated_at
    FROM tutor_session_artifacts
    WHERE user_id = ${userId}
      AND session_id = ${sessionId}::uuid
      AND artifact_kind = 'canvas_snapshot'
    LIMIT 1
  `

  const artifact = artifactRows[0] as ArtifactRow | undefined

  return {
    ...toListItem(sessionRow),
    messages: (messagesRows as MessageRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      source: row.source,
      createdAt: asDate(row.created_at)!,
    })),
    canvasSnapshot: artifact
      ? {
          mimeType: artifact.mime_type,
          dataBase64: artifact.data_base64,
          updatedAt: asDate(artifact.updated_at)!,
        }
      : null,
  } satisfies TutorSessionDetail
}
