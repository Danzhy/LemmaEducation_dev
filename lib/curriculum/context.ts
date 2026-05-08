import { getNeonSql } from '@/lib/tutor/db'
import { buildCurriculumContextInstruction } from '@/lib/curriculum/rag'

type AgentProfileRow = {
  name: string
  grade_band: string | null
  instructions: string
}

type DocumentTitleRow = {
  title: string
}

function isMissingCurriculumSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /curriculum_documents|tutor_agent_profiles|does not exist|relation .* does not exist/i.test(message)
}

export async function getLabTutorCurriculumContextForUser(userId: string) {
  try {
    const sql = getNeonSql()
    const profileRows = await sql`
      SELECT name, grade_band, instructions
      FROM tutor_agent_profiles profile
      WHERE profile.status = 'active'
        AND (
          profile.owner_user_id = ${userId}
          OR EXISTS (
            SELECT 1
            FROM classroom_memberships membership
            WHERE membership.classroom_id = profile.classroom_id
              AND membership.user_id = ${userId}
          )
        )
      ORDER BY profile.updated_at DESC
      LIMIT 3
    `

    const documentRows = await sql`
      SELECT title
      FROM curriculum_documents document
      WHERE document.status = 'ready'
        AND (
          document.owner_user_id = ${userId}
          OR (
            document.visibility = 'classroom'
            AND EXISTS (
              SELECT 1
              FROM classroom_memberships membership
              WHERE membership.classroom_id = document.classroom_id
                AND membership.user_id = ${userId}
            )
          )
        )
      ORDER BY document.updated_at DESC
      LIMIT 6
    `

    return buildCurriculumContextInstruction({
      agentProfiles: (profileRows as AgentProfileRow[]).map((row) => ({
        name: row.name,
        gradeBand: row.grade_band,
        instructions: row.instructions,
      })),
      documentTitles: (documentRows as DocumentTitleRow[]).map((row) => row.title),
    })
  } catch (error) {
    if (isMissingCurriculumSchema(error)) return ''
    throw error
  }
}
