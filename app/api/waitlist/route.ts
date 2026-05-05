import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const connectionString = process.env.NEON_DATABASE_URL

export async function POST(request: Request) {
  try {
    // Check if database is configured
    if (!connectionString) {
      console.error('NEON_DATABASE_URL is not configured')
      return NextResponse.json(
        {
          ok: false,
          error: 'Server configuration error. Please try again later.',
        },
        { status: 500 }
      )
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request format.' },
        { status: 400 }
      )
    }

    const { email, roleSelection, customRole, goals, willingToPay } = body

    // Validate email presence
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Email is required.' },
        { status: 400 }
      )
    }

    const trimmed = email.trim().toLowerCase()

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      return NextResponse.json(
        { ok: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    // Validate email length (prevent extremely long strings)
    if (trimmed.length > 255) {
      return NextResponse.json(
        { ok: false, error: 'Email address is too long.' },
        { status: 400 }
      )
    }

    const normalizedRoleSelection = typeof roleSelection === 'string' ? roleSelection.trim() : ''
    if (!normalizedRoleSelection) {
      return NextResponse.json(
        { ok: false, error: 'Please tell us which option best describes you.' },
        { status: 400 }
      )
    }

    if (normalizedRoleSelection.length > 80) {
      return NextResponse.json(
        { ok: false, error: 'Role description is too long.' },
        { status: 400 }
      )
    }

    const normalizedCustomRole = typeof customRole === 'string' ? customRole.trim() : ''
    if (normalizedCustomRole.length > 160) {
      return NextResponse.json(
        { ok: false, error: 'Please keep your custom role under 160 characters.' },
        { status: 400 }
      )
    }

    const normalizedGoals = typeof goals === 'string' ? goals.trim() : ''
    if (!normalizedGoals) {
      return NextResponse.json(
        { ok: false, error: 'Please share how you would want to use Lemma.' },
        { status: 400 }
      )
    }

    if (normalizedGoals.length > 2000) {
      return NextResponse.json(
        { ok: false, error: 'Please keep your note under 2000 characters.' },
        { status: 400 }
      )
    }

    const normalizedWillingToPay = Boolean(willingToPay)

    // Initialize database connection
    let sql
    try {
      sql = neon(connectionString)
    } catch (err) {
      console.error('Failed to initialize database connection:', err)
      return NextResponse.json(
        {
          ok: false,
          error: 'Database connection error. Please try again later.',
        },
        { status: 500 }
      )
    }

    // Insert email into database
    try {
      await sql`
        INSERT INTO public.waitlist_signups (
          email,
          role_selection,
          custom_role,
          goals,
          willing_to_pay
        )
        VALUES (
          ${trimmed},
          ${normalizedRoleSelection},
          ${normalizedCustomRole || null},
          ${normalizedGoals},
          ${normalizedWillingToPay}
        )
      `
      
      return NextResponse.json(
        { 
          ok: true, 
          message: 'You’re on the list. We’ll reach out as we open up more spots.' 
        },
        { status: 200 }
      )
    } catch (err: any) {
      // Handle duplicate email (PostgreSQL unique constraint violation)
      if (err?.code === '23505') {
        return NextResponse.json(
          { 
            ok: true, 
            message: 'You’re already on the list. We’ll be in touch when more spots open.' 
          },
          { status: 200 }
        )
      }

      // Handle other database errors
      if (err?.code === '23514') {
        // Check constraint violation
        return NextResponse.json(
          { ok: false, error: 'Invalid email format.' },
          { status: 400 }
        )
      }

      // Connection/timeout errors
      if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT') {
        console.error('Database connection failed:', err)
        return NextResponse.json(
          {
            ok: false,
            error: 'Unable to connect to database. Please try again later.',
          },
          { status: 503 }
        )
      }

      // Log unexpected errors
      console.error('Unexpected database error:', err)
      throw err
    }
  } catch (error) {
    // Catch-all for any unexpected errors
    console.error('Unexpected error in waitlist API:', error)
    return NextResponse.json(
      {
        ok: false,
        error: 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    )
  }
}
