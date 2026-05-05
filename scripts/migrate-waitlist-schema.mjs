import fs from 'node:fs'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

const envPath = path.join(process.cwd(), '.env.local')

if (!fs.existsSync(envPath)) {
  throw new Error('.env.local not found')
}

const env = fs.readFileSync(envPath, 'utf8')
for (const line of env.split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

const connectionString = process.env.NEON_DATABASE_URL

if (!connectionString) {
  throw new Error('NEON_DATABASE_URL is not configured')
}

const sql = neon(connectionString)

await sql`
  ALTER TABLE public.waitlist_signups
  ADD COLUMN IF NOT EXISTS role_selection TEXT,
  ADD COLUMN IF NOT EXISTS custom_role TEXT,
  ADD COLUMN IF NOT EXISTS goals TEXT,
  ADD COLUMN IF NOT EXISTS willing_to_pay BOOLEAN NOT NULL DEFAULT FALSE
`

console.log('waitlist_signups schema updated successfully')
