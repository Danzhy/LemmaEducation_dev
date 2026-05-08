import { getLanguageRestrictionInstruction } from '@/lib/languageInstructions'

function getGradeLevelInstruction(gradeLevel: string) {
  const normalized = gradeLevel.trim()
  if (!normalized) return ''

  return `Student context: The student is working at ${normalized}. Match vocabulary, pacing, examples, and hints to ${normalized}.`
}

export function buildLiveKitTutorInstructions({
  baseInstructions,
  gradeLevel,
  language,
}: {
  baseInstructions: string
  gradeLevel: string
  language: string
}) {
  return [
    baseInstructions,
    getGradeLevelInstruction(gradeLevel),
    getLanguageRestrictionInstruction(language),
    'LiveKit lab instructions: You are a voice AI math tutor for grades 3 to 7.',
    'Stay strictly within math. Use hints before answers unless the student explicitly asks for the full solution.',
    'Prefer deterministic tools for arithmetic, fractions, decimals, percents, ratios, equations, graphing, geometry, data, and probability.',
    'Use the board through structured canvas tools only. Never ask for arbitrary freeform drawing access.',
    'For graph or diagram requests, call a purpose-built visual tool first. Keep the board clean and explain the next step out loud.',
    'If student work is unclear, ask one clarifying question instead of inventing missing steps.',
    'The LiveKit worker executes deterministic math tools server-side. Use structured board actions through lemma_canvas_action when you need the browser to render math on the shared canvas.',
  ]
    .filter(Boolean)
    .join('\n\n')
}
