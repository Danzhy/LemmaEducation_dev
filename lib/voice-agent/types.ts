import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'

export type MathStepCheckResult = {
  verdict: 'valid' | 'invalid' | 'unclear'
  reason: string
  hintTarget: string
}

export type MathAnswerCheckResult = {
  verdict: 'correct' | 'incorrect' | 'unclear'
  expectedValue?: number
  studentValue?: number
  expectedExact?: string
  reason: string
  hintTarget: string
  suggestedQuestion: string
}

export type LinearSolveResult = {
  variable: string
  solution: number
  steps: string[]
}

export type LinearCanvasResult = {
  title: string
  spokenSummary: string
  suggestedQuestion: string
  mathExpressions: string[]
  textLines: string[]
  canvasActions: TutorCanvasAction[]
}

export type CanvasWriteResult = {
  title: string
  textLines: string[]
  mathExpressions: string[]
  canvasActions: TutorCanvasAction[]
}

export type CanvasActionResult = {
  summary: string
  canvasActions: TutorCanvasAction[]
}

export type GraphFeaturePoint = {
  x: number
  y: number
  canvasX: number
  canvasY: number
  label: string
}

export type GraphFeatureCoordinates = {
  xIntercepts: GraphFeaturePoint[]
  yIntercept: GraphFeaturePoint | null
  vertex: GraphFeaturePoint | null
  axisOfSymmetryX: number | null
}

export type GraphFunctionResult = {
  expression: string
  domain: [number, number]
  yDomain: [number, number]
  points: Array<{ x: number; y: number }>
  features: string[]
  noteLines: string[]
  featureCoordinates: GraphFeatureCoordinates
  canvasActions: TutorCanvasAction[]
}

export type GraphAnnotationResult = {
  expression: string
  domain: [number, number]
  yDomain: [number, number]
  requestedFeatures: Array<'x-intercepts' | 'y-intercept' | 'vertex' | 'axis-of-symmetry'>
  featureCoordinates: GraphFeatureCoordinates
  canvasActions: TutorCanvasAction[]
  summary: string
}

export type GeometryFigureResult = {
  figureType: 'triangle' | 'rectangle' | 'axes'
  summary: string
  canvasActions: TutorCanvasAction[]
}

export type ValueTableResult = {
  expression: string
  rows: Array<{ x: number; y: number }>
  summary: string
  canvasActions: TutorCanvasAction[]
}

export type PlotPointsResult = {
  summary: string
  points: Array<{ x: number; y: number }>
  domain: {
    x: [number, number]
    y: [number, number]
  }
  noteLines: string[]
  canvasActions: TutorCanvasAction[]
}

export type HintGeneratorResult = {
  hintTarget: string
  why: string
  suggestedQuestion: string
}

export type MistakePatternClassifierResult = {
  topic: string
  label: string
  primaryPattern:
    | 'denominator_operation'
    | 'decimal_place_value'
    | 'percent_whole'
    | 'sign_direction'
    | 'equality_balance'
    | 'unit_rate_scaling'
    | 'area_perimeter_mixup'
    | 'coordinate_order'
    | 'probability_denominator'
    | 'answer_without_reasoning'
    | 'setup_unknown'
    | 'arithmetic_slip'
    | 'unclear'
  severity: 'watch' | 'reteach' | 'blocker'
  evidence: string[]
  likelyCause: string
  firstTutorMove: string
  diagnosticQuestion: string
  recommendedTools: string[]
  boardMove: string
  avoid: string[]
}

export type HintLadderResult = {
  topic: string
  label: string
  misconception: string
  levels: Array<{
    level: 'gentle' | 'stronger' | 'near_answer'
    say: string
    studentAction: string
    revealAnswer: boolean
  }>
  stopRule: string
  recommendedTool: string
}

export type WordProblemPlanResult = {
  topic: string
  label: string
  quantities: string[]
  question: string
  likelyOperation: string
  visualModel: string
  recommendedTools: string[]
  firstTutorMove: string
  studentPrompt: string
  guardrail: string
}

export type ProblemUnderstandingMapResult = {
  topic: string
  label: string
  gradeLevel: string
  knownQuantities: string[]
  likelyUnknown: string
  unitsOrLabels: string[]
  missingInformation: string[]
  representationCandidates: string[]
  firstTutorQuestion: string
  studentRestatementFrame: string
  avoid: string[]
}

export type RepresentationBridgeResult = {
  topic: string
  label: string
  fromRepresentation: 'words' | 'visual' | 'table' | 'equation' | 'graph' | 'numeric'
  toRepresentation: 'words' | 'visual' | 'table' | 'equation' | 'graph' | 'numeric'
  bridgeGoal: string
  recommendedTool: string
  translationSteps: string[]
  bridgeQuestion: string
  misconceptionWatch: string[]
  boardNote: string
}

export type WorkedExampleFaderResult = {
  topic: string
  label: string
  gradeLevel: string
  recommendedTool: string
  phases: Array<{
    phase: 'i_do' | 'we_do' | 'you_do'
    tutorMove: string
    studentTask: string
    revealLevel: 'full_model' | 'partial' | 'student_owned'
  }>
  fadedBoardLines: string[]
  checkForUnderstanding: string
  stopRule: string
  avoid: string[]
}

export type SocraticMoveResult = {
  topic: string
  label: string
  moveType: 'probe' | 'visualize' | 'nudge' | 'check' | 'practice'
  recommendedTool: string
  teacherNote: string
  sayThis: string
  askThis: string
  waitFor: string
}

export type TutorTeachingSequenceResult = {
  topic: string
  label: string
  gradeLevel: string
  phase: 'diagnose' | 'model' | 'guided_practice' | 'check' | 'extend'
  recommendedTool: string
  spokenBeats: string[]
  boardPlan: Array<{
    stage: 'orient' | 'model' | 'highlight' | 'student_turn'
    action: string
    purpose: string
  }>
  checksForUnderstanding: string[]
  guardrails: string[]
}

export type NextStepCoachResult = {
  topic: string
  label: string
  gradeLevel: string
  situation: 'new_problem' | 'student_stuck' | 'checking_work' | 'after_tool'
  recommendedTool: string
  sayThis: string
  writeThis?: string
  askNext: string
  waitFor: string
  avoid: string[]
}

export type TutorResponsePlannerResult = {
  topic: string
  label: string
  gradeLevel: string
  situation:
    | 'new_problem'
    | 'missing_work'
    | 'student_stuck'
    | 'checking_work'
    | 'needs_visual'
    | 'needs_practice'
    | 'asks_for_answer'
    | 'after_tool'
  recommendedMove:
    | 'clarify'
    | 'hint'
    | 'check_question'
    | 'board_action'
    | 'worked_example'
    | 'targeted_practice'
    | 'answer_gate'
  recommendedTool: string
  toolSequence: string[]
  sayFirst: string
  askNext: string
  plannedSpokenTurn: string
  voicePolicy: TutorVoicePolicyCheck
  waitFor: string
  boardMove: string
  answerPolicy: 'hint_first' | 'next_step_only' | 'solution_after_attempt'
  auditChecklist: string[]
  avoid: string[]
}

export type TutorVoicePolicyCheck = {
  wordCount: number
  sentenceCount: number
  questionCount: number
  hasStudentQuestion: boolean
  multiPartQuestion: boolean
  oneQuestionOnly: boolean
  shortEnoughForVoice: boolean
  waitsAfterQuestion: boolean
}

export type StudentCheckQuestionResult = {
  topic: string
  label: string
  gradeLevel: string
  checkType: 'concept' | 'next_step' | 'error_spotting' | 'transfer'
  question: string
  expectedEvidence: string[]
  ifStudentStruggles: string
  ifStudentSucceeds: string
  recommendedTool: string
  boardMove: string
  avoid: string[]
}

export type ExitTicketResult = {
  topic: string
  label: string
  gradeLevel: string
  difficulty: 'support' | 'core' | 'stretch'
  title: string
  studentInstructions: string
  items: Array<{
    prompt: string
    expectedEvidence: string[]
    hint: string
    suggestedTool: string
    answerKey: string
  }>
  teacherLookFor: string[]
  nextSessionRecommendation: string
  privacyNote: string
  avoid: string[]
}

export type AdaptiveReviewPlanResult = {
  topic: string
  label: string
  gradeLevel: string
  reviewMode: 'diagnose' | 'rebuild' | 'guided_practice' | 'extend'
  warmStartLine: string
  diagnosticQuestion: string
  firstBoardTool: string
  suggestedToolSequence: string[]
  microPractice: Array<{
    prompt: string
    hint: string
    suggestedTool: string
  }>
  tutorMoves: string[]
  masteryCheck: string
  avoid: string[]
}

export type SessionMasterySnapshotResult = {
  topic: string
  label: string
  gradeLevel: string
  confidence: 'low' | 'medium' | 'high'
  evidence: string[]
  needsReview: string[]
  nextPractice: Array<{
    prompt: string
    hint: string
    suggestedTool: string
  }>
  suggestedNextTutorMove: string
  teacherReviewNote: string
  privacyNote: string
}

export type TutorTurnAuditResult = {
  approved: boolean
  riskLevel: 'low' | 'medium' | 'high'
  voicePolicy: TutorVoicePolicyCheck
  issues: Array<
    | 'answer_dumping'
    | 'too_many_steps'
    | 'missing_student_question'
    | 'multiple_student_questions'
    | 'too_long'
    | 'off_topic'
    | 'privacy_risk'
    | 'unsupported_certainty'
  >
  revisedTutorMove: string
  mustAskStudent: string
  allowedNextAction: 'say_as_written' | 'revise_then_say' | 'ask_clarifying_question' | 'stop_and_redirect'
}

export type AnswerDisclosureGateResult = {
  decision: 'hint_only' | 'next_step_only' | 'solution_allowed'
  reason: string
  sayThis: string
  allowedDetail: string
  requiredPause: boolean
}

export type BoardAnimationPlanResult = {
  title: string
  renderer: 'tldraw_step_reveal' | 'manim_offline_candidate'
  reason: string
  stages: Array<{
    stage: 'setup' | 'reveal' | 'annotate' | 'pause'
    say: string
    boardAction: string
    timingMs: number
  }>
  canvasActions: TutorCanvasAction[]
  implementationNotes: string[]
}

export type FractionSimplifyResult = {
  original: string
  simplified: string
  decimal: number
  mixedNumber: string | null
  explanation: string
  suggestedQuestion: string
}

export type PercentOfNumberResult = {
  percent: number
  whole: number
  part: number
  equation: string
  fractionForm: string
  suggestedTool: 'percent_bar'
  suggestedQuestion: string
}

export type UnitRateResult = {
  quantity: number
  value: number
  ratePerOne: number
  rateLabel: string
  equation: string
  suggestedTool: 'double_number_line' | 'ratio_table'
  suggestedQuestion: string
}

export type DecimalCompareResult = {
  left: number
  right: number
  comparison: 'left_greater' | 'right_greater' | 'equal'
  explanation: string
  suggestedTool: 'place_value_chart' | 'decimal_grid'
  suggestedQuestion: string
}

export type RoundNumberResult = {
  value: number
  place: string
  rounded: number
  checkedDigit: number
  direction: 'up' | 'down'
  explanation: string
  suggestedTool: 'number_line' | 'place_value_chart'
}

export type CommonDenominatorResult = {
  left: string
  right: string
  commonDenominator: number
  leftEquivalent: string
  rightEquivalent: string
  explanation: string
  suggestedTool: 'fraction_operation' | 'fraction_compare'
  suggestedQuestion: string
}

export type IntegerOperationResult = {
  expression: string
  left: number
  right: number
  operation: 'add' | 'subtract'
  signedChange: number
  result: number
  steps: string[]
  chipModel: {
    positiveChipsBeforeCancel: number
    negativeChipsBeforeCancel: number
    zeroPairs: number
  }
  suggestedQuestion: string
  canvasActions: TutorCanvasAction[]
}
