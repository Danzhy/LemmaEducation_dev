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
