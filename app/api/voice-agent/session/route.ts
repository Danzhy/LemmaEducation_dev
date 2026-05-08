import { NextResponse } from 'next/server'
import { getLanguageRestrictionInstruction } from '@/lib/languageInstructions'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById, getQuotaSnapshot, pauseSessionById } from '@/lib/tutor/quota'
import { TUTOR_INACTIVITY_PAUSE_SECONDS } from '@/lib/tutor/constants'
import { createTutorDbTimeout } from '@/lib/tutor/db-timeout'
import { resolveOpenAIRealtimeModel } from '@/lib/tutor/realtime-model-policy'

function getRequiredEnv(value: string | undefined) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function getRequiredInstructionEnv(value: string | undefined) {
  const normalized = getRequiredEnv(value)
  if (!normalized) return null
  return normalized.replace(/\\n/g, '\n')
}

function getGradeLevelInstruction(gradeLevel: string) {
  const normalized = gradeLevel.trim()
  if (!normalized) return ''

  return `Student context: The student is working at ${normalized}. Match the level of explanation, vocabulary, pacing, hints, and question difficulty to ${normalized}.`
}

function buildLabInstructions(baseInstructions: string, gradeLevel: string, language: string) {
  return [
    baseInstructions,
    getGradeLevelInstruction(gradeLevel),
    getLanguageRestrictionInstruction(language),
    'Experimental lab instructions: You are testing a tool-enabled math tutor workflow for students in grades 3 to 7.',
    'Stay strictly within math. Use hints before answers unless the student explicitly asks for the full answer.',
    'Use answer_disclosure_gate before giving a final answer or full solution. If it says hint_only or next_step_only, stop there and wait.',
    'When a deterministic math tool is available, prefer it over mental arithmetic or algebra.',
    'Tool arguments must be valid JSON with literal values only. Never put arithmetic expressions like (18/60)*100 inside a numeric argument. Use the original numbers directly when the schema supports them, or call math_calculate first.',
    'If you use a tool, briefly use its result to guide the student instead of dumping the whole solution.',
    'If the student asks for a graph, diagram, worked setup, or visual explanation, use the structured canvas tools instead of describing an imaginary drawing.',
    'Your board toolkit is intentionally structured, not arbitrary. Use curriculum_coach for choosing a teaching move, socratic_move_planner for the next probe or nudge, tutor_teaching_sequence for a short human-tutor sequence before complex explanations, answer_disclosure_gate before revealing answers or full solutions, next_step_coach after tool results or confusing work when you need a concise tutor move, board_animation_plan for staged live board reveals or offline Manim candidates, word_problem_plan for parsing word problems before solving, misconception_diagnosis for targeted hints from student work, hint_generator for turning tool results into one targeted hint, hint_ladder for a gentle-to-stronger sequence that avoids answer dumping, practice_set_generator for short practice sets, math_calculate for reliable arithmetic, math_check_step for checking one algebra step, math_solve_linear for a deterministic simple equation result, fraction_simplify for reducing fractions, common_denominator for comparing or adding unlike fractions, percent_of_number for percent-of-whole calculations, unit_rate for cost-per-item or rate-per-one reasoning, decimal_compare for careful decimal comparison, round_number for place-value rounding, graph_function for polished function graphs from equations, plot_points_on_plane for plotting and connecting ordered pairs, table_of_values for coordinate tables, coordinate_distance for distance between points, slope_triangle for rise-run and slope, number_line for number-line models, fraction_strip for fraction bars, fraction_compare for comparing fractions, fraction_operation for adding, subtracting, multiplying, or dividing fractions, decimal_grid for tenths, hundredths, percents, and decimal models, percent_bar for percent-of-a-number and discount/tax/tip reasoning, array_model for multiplication and area arrays, long_division for whole-number division setup, integer_chips for positive and negative integer models, ratio_table and double_number_line for ratios and rates, data_display for bar charts and line plots, statistics_summary for mean, median, mode, and range, probability_model for simple probability, unit_conversion for measurement conversions, bar_model for tape diagrams and word-problem setup, place_value_chart for digit value and decimals, factor_tree for factors and prime factorization, area_perimeter_model and composite_area_model for rectangles and measurement, order_of_operations for PEMDAS and arithmetic order, angle_diagram for angle reasoning, equation_balance for equality models, geometry_figure for standard diagrams, solve_linear_on_canvas for algebra steps, write_on_canvas for short worked notes, annotate_graph_features for graph follow-up labels or highlights, and canvas_action only for the smallest precise follow-up annotations.',
    'Do not try to free-sketch unrelated art, decorative shapes, or arbitrary whiteboard layouts. Stay within the structured math teaching tools.',
    'For a normal graph request, do not set domainStart or domainEnd unless the student explicitly asks for a particular interval. Let graph_function choose a teaching-friendly view by default.',
    'If the student asks for a graph to be drawn neatly, cleanly, or clearly, call graph_function once and let it own the board. Do not stack a second canvas-writing tool on top unless the student asked for an extra worked note or follow-up annotation.',
    'For simple linear equations in x, if the student wants steps on the board or asks you to show the next steps visually, use solve_linear_on_canvas instead of trying to compose the board by hand.',
    'When a student asks you to write, show, set up, or model the next idea on the board, prefer exactly one of solve_linear_on_canvas, table_of_values, geometry_figure, write_on_canvas, or plot_points_on_plane based on the request.',
    'For visual model requests, prefer exactly one purpose-built tool first: number_line, fraction_strip, fraction_compare, fraction_operation, decimal_grid, percent_bar, array_model, long_division, integer_chips, ratio_table, double_number_line, data_display, statistics_summary, probability_model, unit_conversion, bar_model, place_value_chart, factor_tree, area_perimeter_model, composite_area_model, order_of_operations, slope_triangle, coordinate_distance, angle_diagram, equation_balance, graph_function, plot_points_on_plane, geometry_figure, table_of_values, or solve_linear_on_canvas. Do not layer write_on_canvas or canvas_action on top unless the student explicitly asks for extra written notes or extra labels on the board.',
    'When the student gives unclear work, use misconception_diagnosis before correcting them. When the topic is broad, use curriculum_coach or socratic_move_planner to decide the next tutoring move and which visual tool fits best. For word problems, call word_problem_plan before choosing an operation or visual model.',
    'For longer explanations, call tutor_teaching_sequence first, then execute only the next useful board tool. For requests to animate or write while explaining, use board_animation_plan and prefer live tldraw step reveal; treat Manim as an offline future renderer, not a live dependency.',
    'For answer checking, use math_check_answer before telling a student whether an arithmetic, fraction, decimal, percent, or simple linear-equation answer is right. If the answer is wrong, give one targeted hint instead of immediately solving the whole problem.',
    'When a student is stuck after one hint, use hint_ladder so the next hint gets gradually more specific while still preserving student thinking.',
    'For graph_function and plot_points_on_plane, default to a clean board with the math drawing itself. Keep the explanation in your spoken or chat response unless the student explicitly asks for written notes on the board.',
    'Do not pass noteLines into graph_function or plot_points_on_plane unless the student explicitly asks for a summary box, written notes, or a key ideas box on the canvas.',
    'If the student explicitly asks you to label the x-intercepts, y-intercept, or vertex, pass showXIntercepts, showYIntercept, and showVertex into graph_function so the board reflects the exact request.',
    'When graph_function already has the key labels turned on, avoid generic noteLines like "vertex labeled" or "intercepts shown". If you truly need to pass noteLines, make them contentful and concrete, ideally with the actual relationship or coordinates.',
    'For custom plotting or point-by-point graphing, prefer plot_points_on_plane. Use table_of_values first if the student needs the pattern made visible before graphing.',
    'After graph_function, the tool output includes featureCoordinates and graph domains. If you need a follow-up label or highlight on that same graph, prefer annotate_graph_features first. If you use canvas_action for math coordinates, set coordinateSpace to graph and provide graph domains when needed.',
    'Use the canvas to make thinking visible. Clear and replace your own tool drawings when needed, but do not overwhelm the student with too much at once.',
    'When using write_on_canvas, keep the board neat: prefer one short title, at most three brief text lines, and only the minimum math blocks needed for the next step.',
    'When you pass noteLines into a graph or writing tool, keep them very short and concrete. One or two brief lines is better than a paragraph.',
    'For multi-step algebra help, write only the next useful step or setup first, then wait for the student to respond before filling the board with more.',
    'If the student asks you to draw something on the board, do not say that you cannot draw. Use the available canvas tools.',
    'If the work is ambiguous, ask a clarifying question instead of guessing.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
  }

  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' },
      { status: 401 }
    )
  }

  const dbTimeout = createTutorDbTimeout()
  try {
    const sql = getNeonSql({ signal: dbTimeout.signal })
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'voice-agent-session',
      userId,
      maxHits: 48,
      windowSeconds: 60 * 60,
      sql,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'RATE_LIMITED',
          message: 'Too many connection attempts. Please try again later.',
        },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    let quota = await getQuotaSnapshot(sql, userId)
    if (
      quota.activeSessionId &&
      quota.activeSessionState === 'active' &&
      quota.inactivitySeconds >= TUTOR_INACTIVITY_PAUSE_SECONDS
    ) {
      await pauseSessionById(sql, userId, quota.activeSessionId)
      quota = await getQuotaSnapshot(sql, userId)
    }

    if (
      quota.activeSessionId &&
      (quota.remainingSeconds <= 0 || quota.activeSessionSeconds >= quota.maxSessionSeconds)
    ) {
      await finalizeSessionById(
        sql,
        userId,
        quota.activeSessionId,
        quota.activeSessionSeconds >= quota.maxSessionSeconds ? 'session_limit' : 'quota'
      )
      quota = await getQuotaSnapshot(sql, userId)
    }

    if (!quota.activeSessionId) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SESSION_REQUIRED',
          message: 'Start a tutor session before connecting.',
        },
        { status: 400 }
      )
    }

    if (quota.remainingSeconds <= 0) {
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          message: 'Tutoring time limit reached.',
          remainingSeconds: 0,
        },
        { status: 429 }
      )
    }

    if (quota.activeSessionState === 'paused') {
      return NextResponse.json(
        {
          ok: false,
          code: 'SESSION_PAUSED',
          message: 'Resume the tutor session before reconnecting.',
        },
        { status: 409 }
      )
    }
  } catch (error) {
    const databaseTimedOut = dbTimeout.timedOut()
    console.error('[voice-agent/session] quota check', error)
    return NextResponse.json(
      {
        ok: false,
        code: databaseTimedOut ? 'DATABASE_TIMEOUT' : 'QUOTA_CHECK_FAILED',
        message: databaseTimedOut
          ? 'Could not reach the session database quickly enough. Please try again.'
          : 'Could not verify quota.',
      },
      { status: 503 }
    )
  } finally {
    dbTimeout.clear()
  }

  const realtimeModelConfig = resolveOpenAIRealtimeModel(process.env.OPENAI_VOICE_AGENT_MODEL)
  const realtimeModel = realtimeModelConfig.id
  const baseInstructions = getRequiredInstructionEnv(
    process.env.OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS
  )
  if (!baseInstructions) {
    return NextResponse.json(
      { error: 'OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS is not configured' },
      { status: 500 }
    )
  }

  const transcriptionModel =
    getRequiredEnv(process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL) || 'gpt-4o-transcribe'

  let language = 'en'
  let gradeLevel = ''
  try {
    const body = (await request.json()) as { language?: unknown; gradeLevel?: unknown }
    if (typeof body.language === 'string' && body.language.trim()) {
      language = body.language.trim().slice(0, 16)
    }
    if (typeof body.gradeLevel === 'string' && body.gradeLevel.trim()) {
      gradeLevel = body.gradeLevel.trim().slice(0, 40)
    }
  } catch {
    // Defaults above remain.
  }

  const instructions = buildLabInstructions(baseInstructions, gradeLevel, language)
  const sessionConfig = {
    type: 'realtime',
    model: realtimeModel,
    output_modalities: ['audio'],
    audio: {
      input: {
        transcription: {
          model: transcriptionModel,
          language,
        },
      },
      output: { voice: 'marin' },
    },
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: sessionConfig }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[voice-agent/session] OpenAI client_secrets error:', err)
      return NextResponse.json(
        { error: 'Failed to create voice agent session', details: err },
        { status: 400 }
      )
    }

    const data = (await response.json()) as {
      value?: string
      client_secret?: { value?: string }
    }
    const value = data.value ?? data.client_secret?.value ?? null
    if (!value) {
      return NextResponse.json(
        { error: 'Voice agent token response did not contain a client secret' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      value,
      model: realtimeModel,
      modelProfile: realtimeModelConfig.role,
      instructions,
      voice: 'marin',
      transcriptionModel,
      language,
    })
  } catch (error) {
    console.error('[voice-agent/session]', error)
    return NextResponse.json(
      { error: 'Failed to create voice agent session' },
      { status: 500 }
    )
  }
}
