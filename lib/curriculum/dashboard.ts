import { getNeonSql } from '@/lib/tutor/db'

export type CurriculumDashboardDocument = {
  id: string
  classroomId: string | null
  title: string
  sourceName: string | null
  visibility: string
  status: string
  totalChunks: number
  updatedAt: Date
}

export type TutorAgentProfileSummary = {
  id: string
  classroomId: string | null
  name: string
  gradeBand: string | null
  scope: string
  updatedAt: Date
}

type CurriculumDocumentRow = {
  id: string
  classroom_id: string | null
  title: string
  source_name: string | null
  visibility: string
  status: string
  total_chunks: number
  updated_at: Date | string
}

type AgentProfileRow = {
  id: string
  classroom_id: string | null
  name: string
  grade_band: string | null
  scope: string
  updated_at: Date | string
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function isMissingCurriculumSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /curriculum_documents|tutor_agent_profiles|does not exist|relation .* does not exist/i.test(message)
}

export async function getTeacherCurriculumDashboardData(userId: string) {
  try {
    const sql = getNeonSql()
    const [documentRows, profileRows] = await Promise.all([
      sql`
        SELECT id, classroom_id, title, source_name, visibility, status, total_chunks, updated_at
        FROM curriculum_documents
        WHERE owner_user_id = ${userId}
          AND status != 'archived'
        ORDER BY updated_at DESC
        LIMIT 12
      `,
      sql`
        SELECT id, classroom_id, name, grade_band, scope, updated_at
        FROM tutor_agent_profiles
        WHERE owner_user_id = ${userId}
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 12
      `,
    ])

    return {
      documents: (documentRows as CurriculumDocumentRow[]).map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        title: row.title,
        sourceName: row.source_name,
        visibility: row.visibility,
        status: row.status,
        totalChunks: row.total_chunks,
        updatedAt: asDate(row.updated_at),
      })),
      profiles: (profileRows as AgentProfileRow[]).map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        name: row.name,
        gradeBand: row.grade_band,
        scope: row.scope,
        updatedAt: asDate(row.updated_at),
      })),
    }
  } catch (error) {
    if (isMissingCurriculumSchema(error)) {
      return { documents: [], profiles: [] }
    }
    throw error
  }
}
