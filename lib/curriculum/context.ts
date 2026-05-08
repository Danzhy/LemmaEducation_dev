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

export type LabTutorCurriculumContextPack = {
  agentProfiles: Array<{ name: string; gradeBand: string | null; instructions: string }>
  documentTitles: string[]
  instruction: string
}

const EMPTY_CURRICULUM_CONTEXT_PACK: LabTutorCurriculumContextPack = {
  agentProfiles: [],
  documentTitles: [],
  instruction: '',
}

function isMissingCurriculumSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /curriculum_documents|tutor_agent_profiles|does not exist|relation .* does not exist/i.test(message)
}

export async function getLabTutorCurriculumContextPackForUser(userId: string): Promise<LabTutorCurriculumContextPack> {
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

    const agentProfiles = (profileRows as AgentProfileRow[]).map((row) => ({
      name: row.name,
      gradeBand: row.grade_band,
      instructions: row.instructions,
    }))
    const documentTitles = (documentRows as DocumentTitleRow[]).map((row) => row.title)

    return {
      agentProfiles,
      documentTitles,
      instruction: buildCurriculumContextInstruction({
        agentProfiles,
        documentTitles,
      }),
    }
  } catch (error) {
    if (isMissingCurriculumSchema(error)) return EMPTY_CURRICULUM_CONTEXT_PACK
    throw error
  }
}

export async function getLabTutorCurriculumContextForUser(userId: string) {
  const pack = await getLabTutorCurriculumContextPackForUser(userId)
  return pack.instruction
}

export function buildCurriculumContextToolResult(pack: LabTutorCurriculumContextPack) {
  return {
    ok: true,
    hasContext: pack.agentProfiles.length > 0 || pack.documentTitles.length > 0,
    agentProfiles: pack.agentProfiles.map((profile) => ({
      name: profile.name,
      gradeBand: profile.gradeBand,
      instructions: profile.instructions.slice(0, 900),
    })),
    documentTitles: pack.documentTitles,
    instruction: pack.instruction,
    tutorUse:
      pack.agentProfiles.length > 0 || pack.documentTitles.length > 0
        ? 'Use this profile and document context to choose vocabulary, pacing, examples, and tool choice. Do not reveal private teacher notes verbatim.'
        : 'No teacher-provided curriculum context is available for this user yet. Continue with general grade-level math tutoring.',
  }
}
