import { getNeonSql } from '@/lib/tutor/db'

/** Ensures a `tutor_usage` row exists so UPDATEs never affect 0 rows silently. */
export async function ensureTutorUsageRow(userId: string): Promise<void> {
  const sql = getNeonSql()
  await sql`
    INSERT INTO tutor_usage (user_id, total_active_seconds, updated_at)
    VALUES (${userId}, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING
  `
}
