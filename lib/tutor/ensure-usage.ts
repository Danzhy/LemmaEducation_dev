import { getNeonSql } from '@/lib/tutor/db'

type Sql = ReturnType<typeof getNeonSql>

/** Ensures a `tutor_usage` row exists so UPDATEs never affect 0 rows silently. */
export async function ensureTutorUsageRow(userId: string, sql: Sql = getNeonSql()): Promise<void> {
  await sql`
    INSERT INTO tutor_usage (user_id, total_active_seconds, total_completed_sessions, updated_at)
    VALUES (${userId}, 0, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING
  `
}
