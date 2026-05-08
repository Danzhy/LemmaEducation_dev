import { tool, type Tool } from '@openai/agents'
import {
  annotateGraphFeatures,
  angleDiagramScene,
  areaPerimeterModelScene,
  arrayModelScene,
  barModelScene,
  canvasAction,
  compositeAreaModelScene,
  commonDenominator,
  coordinateDistanceScene,
  curriculumCoach,
  dataDisplayScene,
  decimalGridScene,
  decimalCompare,
  doubleNumberLineScene,
  equationBalanceScene,
  factorTreeScene,
  fractionCompareScene,
  fractionOperationScene,
  fractionSimplify,
  fractionStripScene,
  geometryFigure,
  graphFunction,
  hintGenerator,
  integerChipsScene,
  longDivisionScene,
  mathCalculate,
  mathCheckAnswer,
  mathCheckStep,
  mathSolveLinear,
  misconceptionDiagnosis,
  numberLineScene,
  orderOfOperationsScene,
  placeValueChartScene,
  plotPointsOnPlane,
  practiceSetGenerator,
  percentBarScene,
  percentOfNumber,
  probabilityModelScene,
  ratioTableScene,
  roundNumber,
  socraticMovePlanner,
  slopeTriangleScene,
  solveLinearOnCanvas,
  statisticsSummaryScene,
  tableOfValues,
  unitRate,
  unitConversionScene,
  wordProblemPlan,
  writeOnCanvas,
  boardAnimationPlan,
  tutorTeachingSequence,
} from '@/lib/voice-agent/math-engine'

function stringifyResult(result: unknown) {
  return JSON.stringify(result)
}

const STRUCTURED_CANVAS_ACTIONS = new Set([
  'clear_tool_layer',
  'place_text_label',
  'place_math_block',
  'place_point',
  'draw_line_segment',
  'draw_axes',
  'draw_rectangle',
  'highlight_region',
  'plot_polyline',
  'coordinate_plane',
])

function assertSafeCanvasActionInput(input: Parameters<typeof canvasAction>[0]) {
  if (!STRUCTURED_CANVAS_ACTIONS.has(input.actionType)) {
    throw new Error(
      'This tutor lab only allows a small set of structured canvas follow-up actions. Use the higher-level graph, number-line, fraction, geometry, or board-writing tools instead of arbitrary drawing.'
    )
  }

  if (input.actionType === 'place_text_label' && input.text && input.text.trim().length > 120) {
    throw new Error('Canvas labels must stay short. Use write_on_canvas for longer teaching notes.')
  }

  if (input.actionType === 'plot_polyline' && (input.points?.length ?? 0) > 24) {
    throw new Error('Use graph_function or plot_points_on_plane for larger plotted shapes.')
  }

  if (
    (input.actionType === 'draw_rectangle' || input.actionType === 'highlight_region') &&
    (typeof input.width !== 'number' ||
      typeof input.height !== 'number' ||
      input.width <= 0 ||
      input.height <= 0 ||
      input.width > 900 ||
      input.height > 650)
  ) {
    throw new Error('Canvas rectangles and highlights need reasonable positive width and height.')
  }

  if (input.actionType === 'place_math_block' && input.latex && input.latex.trim().length > 160) {
    throw new Error('Canvas math blocks must stay short. Use solve_linear_on_canvas or write_on_canvas for worked steps.')
  }

  if (
    input.coordinateSpace === 'graph' &&
    typeof input.xDomainStart !== 'number' &&
    typeof input.xDomainEnd !== 'number'
  ) {
    throw new Error('Graph-coordinate annotations need graph domains so the board mapping stays accurate.')
  }
}

export function createVoiceAgentTools() {
  return [
    tool({
      name: 'curriculum_coach',
      description:
        'Choose a strong grade 3 to 7 tutoring move for a topic. Use this when a student seems stuck, the topic is broad, or you need to decide which visual or deterministic tool to use next.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          gradeLevel: { type: 'string' },
          topic: {
            type: 'string',
            description:
              'Topic such as fractions, decimals, percents, ratios, equations, geometry, coordinate graphing, data, or probability.',
          },
          studentGoal: { type: 'string' },
          studentWork: { type: 'string' },
        },
        required: ['topic'],
      },
      async execute(input) {
        const params = input as {
          gradeLevel?: string
          topic: string
          studentGoal?: string
          studentWork?: string
        }
        return stringifyResult(
          curriculumCoach({
            gradeLevel: params.gradeLevel,
            topic: params.topic,
            studentGoal: params.studentGoal,
            studentWork: params.studentWork,
          })
        )
      },
    }),
    tool({
      name: 'misconception_diagnosis',
      description:
        'Diagnose likely grade 3 to 7 math misconceptions from student work before correcting them. Use this when a student explanation or answer sounds wrong but the next hint should be targeted.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          studentWork: { type: 'string' },
          expectedAnswer: { type: 'string' },
        },
        required: ['topic', 'studentWork'],
      },
      async execute(input) {
        const params = input as {
          topic: string
          studentWork: string
          expectedAnswer?: string
        }
        return stringifyResult(
          misconceptionDiagnosis({
            topic: params.topic,
            studentWork: params.studentWork,
            expectedAnswer: params.expectedAnswer,
          })
        )
      },
    }),
    tool({
      name: 'practice_set_generator',
      description:
        'Generate a tiny targeted practice set for a grade 3 to 7 topic. Use only when the student asks for practice, review questions, or another example.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          difficulty: { type: 'string', enum: ['support', 'core', 'stretch'] },
          count: { type: 'number' },
        },
        required: ['topic'],
      },
      async execute(input) {
        const params = input as {
          topic: string
          difficulty?: 'support' | 'core' | 'stretch'
          count?: number
        }
        return stringifyResult(
          practiceSetGenerator({
            topic: params.topic,
            difficulty: params.difficulty,
            count: params.count,
          })
        )
      },
    }),
    tool({
      name: 'word_problem_plan',
      description:
        'Plan how to tutor a grade 3 to 7 word problem before solving it. Use this to identify knowns, unknowns, operation clues, and the best visual model.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          problemText: { type: 'string' },
          gradeLevel: { type: 'string' },
          topic: {
            type: 'string',
            description:
              'Optional broad topic if already known, such as fractions, percents, ratios, equations, geometry, graphing, data, or probability.',
          },
        },
        required: ['problemText'],
      },
      async execute(input) {
        const params = input as {
          problemText: string
          gradeLevel?: string
          topic?: string
        }
        return stringifyResult(
          wordProblemPlan({
            problemText: params.problemText,
            gradeLevel: params.gradeLevel,
            topic: params.topic,
          })
        )
      },
    }),
    tool({
      name: 'socratic_move_planner',
      description:
        'Choose the next Socratic tutoring move for grades 3 to 7. Use this before giving help when you need a concise probe, nudge, check, visual, or practice move.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          gradeLevel: { type: 'string' },
          studentWork: { type: 'string' },
          tutorGoal: {
            type: 'string',
            enum: ['start', 'unstick', 'check', 'extend', 'practice'],
          },
        },
        required: ['topic'],
      },
      async execute(input) {
        const params = input as {
          topic: string
          gradeLevel?: string
          studentWork?: string
          tutorGoal?: 'start' | 'unstick' | 'check' | 'extend' | 'practice'
        }
        return stringifyResult(
          socraticMovePlanner({
            topic: params.topic,
            gradeLevel: params.gradeLevel,
            studentWork: params.studentWork,
            tutorGoal: params.tutorGoal,
          })
        )
      },
    }),
    tool({
      name: 'tutor_teaching_sequence',
      description:
        'Plan a short human-like tutoring sequence for grades 3 to 7. Use this before a complex explanation so the tutor speaks one beat, draws one useful thing, asks one question, and waits.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          gradeLevel: { type: 'string' },
          studentGoal: { type: 'string' },
          studentWork: { type: 'string' },
        },
        required: ['topic', 'gradeLevel', 'studentGoal', 'studentWork'],
      },
      async execute(input) {
        const params = input as {
          topic: string
          gradeLevel: string
          studentGoal: string
          studentWork: string
        }
        return stringifyResult(
          tutorTeachingSequence({
            topic: params.topic,
            gradeLevel: params.gradeLevel,
            studentGoal: params.studentGoal,
            studentWork: params.studentWork,
          })
        )
      },
    }),
    tool({
      name: 'board_animation_plan',
      description:
        'Create a safe staged board-reveal plan for live tutoring, or mark a concept as an offline Manim candidate. Use this for requests like write while explaining, animate the idea, or reveal the graph step by step.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          concept: { type: 'string' },
          visualType: { type: 'string' },
          gradeLevel: { type: 'string' },
          wantsOfflineVideo: { type: 'boolean' },
        },
        required: ['concept', 'visualType', 'gradeLevel', 'wantsOfflineVideo'],
      },
      async execute(input) {
        const params = input as {
          concept: string
          visualType: string
          gradeLevel: string
          wantsOfflineVideo: boolean
        }
        return stringifyResult(
          boardAnimationPlan({
            concept: params.concept,
            visualType: params.visualType,
            gradeLevel: params.gradeLevel,
            wantsOfflineVideo: params.wantsOfflineVideo,
          })
        )
      },
    }),
    tool({
      name: 'math_calculate',
      description:
        'Use for arithmetic or symbolic calculation when you need a reliable math result before tutoring.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          expression: {
            type: 'string',
            description: 'A normalized arithmetic expression like (3/4)+2 or 5*(7-2).',
          },
        },
        required: ['expression'],
      },
      async execute(input) {
        const params = input as { expression: string }
        return stringifyResult(mathCalculate(params.expression))
      },
    }),
    tool({
      name: 'math_check_step',
      description:
        'Check whether one algebra step follows validly from the previous one. Use before correcting a student.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          previousStep: { type: 'string' },
          nextStep: { type: 'string' },
        },
        required: ['previousStep', 'nextStep'],
      },
      async execute(input) {
        const params = input as { previousStep: string; nextStep: string }
        return stringifyResult(mathCheckStep(params.previousStep, params.nextStep))
      },
    }),
    tool({
      name: 'math_check_answer',
      description:
        'Deterministically check a student answer for an arithmetic expression or simple linear equation before giving feedback. Use this for answer checks, grading a typed response, or deciding whether to give a next hint.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          problemExpression: {
            type: 'string',
            description: 'The expression or equation being answered, such as 3/4+2/3 or 2x+3=11.',
          },
          studentAnswer: {
            type: 'string',
            description: 'The student answer, such as 17/12, 1.4167, or x=4.',
          },
          tolerance: {
            type: 'number',
            description: 'Optional numeric tolerance for decimal answers. Use only when appropriate.',
          },
        },
        required: ['problemExpression', 'studentAnswer'],
      },
      async execute(input) {
        const params = input as {
          problemExpression: string
          studentAnswer: string
          tolerance?: number
        }
        return stringifyResult(
          mathCheckAnswer({
            problemExpression: params.problemExpression,
            studentAnswer: params.studentAnswer,
            tolerance: params.tolerance,
          })
        )
      },
    }),
    tool({
      name: 'math_solve_linear',
      description:
        'Solve a simple linear equation in x. Use for narrow middle-school algebra reliability checks, then tutor from the steps instead of blurting out the answer.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          problem: { type: 'string' },
        },
        required: ['problem'],
      },
      async execute(input) {
        const params = input as { problem: string }
        return stringifyResult(mathSolveLinear(params.problem))
      },
    }),
    tool({
      name: 'fraction_simplify',
      description:
        'Simplify a fraction exactly and return its decimal and mixed-number form when useful. Use for fraction reduction or equivalent fraction checks.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          numerator: { type: 'number' },
          denominator: { type: 'number' },
        },
        required: ['numerator', 'denominator'],
      },
      async execute(input) {
        const params = input as { numerator: number; denominator: number }
        return stringifyResult(fractionSimplify(params))
      },
    }),
    tool({
      name: 'percent_of_number',
      description:
        'Compute a percent of a whole with a simple schema. Use this instead of mental arithmetic for percent-of-number, discount, tax, or tip reasoning.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          percent: { type: 'number' },
          whole: { type: 'number' },
        },
        required: ['percent', 'whole'],
      },
      async execute(input) {
        const params = input as { percent: number; whole: number }
        return stringifyResult(percentOfNumber(params))
      },
    }),
    tool({
      name: 'unit_rate',
      description:
        'Compute the value per 1 unit for ratio and rate problems. Use before explaining costs per item, speed, price, or constant rate.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quantity: { type: 'number' },
          value: { type: 'number' },
          quantityLabel: { type: 'string' },
          valueLabel: { type: 'string' },
        },
        required: ['quantity', 'value'],
      },
      async execute(input) {
        const params = input as {
          quantity: number
          value: number
          quantityLabel?: string
          valueLabel?: string
        }
        return stringifyResult(unitRate(params))
      },
    }),
    tool({
      name: 'decimal_compare',
      description:
        'Compare two decimal numbers by value and return a place-value explanation. Use when a student compares decimals by digit length.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          left: { type: 'number' },
          right: { type: 'number' },
        },
        required: ['left', 'right'],
      },
      async execute(input) {
        const params = input as { left: number; right: number }
        return stringifyResult(decimalCompare(params))
      },
    }),
    tool({
      name: 'round_number',
      description:
        'Round a number to a named place value such as tens, hundreds, tenths, or hundredths with the checked digit explained.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          value: { type: 'number' },
          place: { type: 'string' },
        },
        required: ['value', 'place'],
      },
      async execute(input) {
        const params = input as { value: number; place: string }
        return stringifyResult(roundNumber(params))
      },
    }),
    tool({
      name: 'common_denominator',
      description:
        'Find a common denominator and equivalent fractions for comparing, adding, or subtracting two fractions.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          leftNumerator: { type: 'number' },
          leftDenominator: { type: 'number' },
          rightNumerator: { type: 'number' },
          rightDenominator: { type: 'number' },
          purpose: { type: 'string', enum: ['compare', 'add_subtract'] },
        },
        required: ['leftNumerator', 'leftDenominator', 'rightNumerator', 'rightDenominator'],
      },
      async execute(input) {
        const params = input as {
          leftNumerator: number
          leftDenominator: number
          rightNumerator: number
          rightDenominator: number
          purpose?: 'compare' | 'add_subtract'
        }
        return stringifyResult(commonDenominator(params))
      },
    }),
    tool({
      name: 'solve_linear_on_canvas',
      description:
        'Use when a student wants the next one to three algebra steps shown neatly on the board for a simple linear equation in x. This writes the steps directly on the canvas and returns a short follow-up question.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          problem: { type: 'string' },
          maxSteps: {
            type: 'number',
            description:
              'How many worked transformation steps to show after the original equation. Usually 1 or 2.',
          },
          stopBeforeFinal: {
            type: 'boolean',
            description:
              'Set to true when the student asked not to finish the whole solution yet.',
          },
        },
        required: ['problem'],
      },
      async execute(input) {
        const params = input as {
          problem: string
          maxSteps?: number
          stopBeforeFinal?: boolean
        }
        return stringifyResult(
          solveLinearOnCanvas({
            problem: params.problem,
            maxSteps: params.maxSteps,
            stopBeforeFinal: params.stopBeforeFinal,
          })
        )
      },
    }),
    tool({
      name: 'hint_generator',
      description:
        'Turn a tool result into a Socratic tutoring move with a hint target, reason, and short next question.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          toolName: { type: 'string' },
          verdict: { type: 'string' },
          reason: { type: 'string' },
          solution: { type: 'number' },
          expression: { type: 'string' },
        },
        required: ['toolName'],
      },
      async execute(input) {
        const params = input as {
          toolName: string
          verdict?: string
          reason?: string
          solution?: number
          expression?: string
        }
        return stringifyResult(
          hintGenerator({
            toolName: params.toolName,
            verdict: params.verdict,
            reason: params.reason,
            solution: params.solution,
            expression: params.expression,
          })
        )
      },
    }),
    tool({
      name: 'graph_function',
      description:
        'Create a polished graph scene for a function in x with axes, ticks, and clearly marked key points. Keep the board visually clean. Only pass noteLines if the student explicitly asks for written notes or a summary box on the canvas. If the student explicitly asks to label x-intercepts, the y-intercept, or the vertex, set the matching boolean fields so those features are clearly marked on the board.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          expression: { type: 'string' },
          domainStart: { type: 'number' },
          domainEnd: { type: 'number' },
          graphType: { type: 'string', enum: ['cartesian'] },
          title: { type: 'string' },
          noteLines: {
            type: 'array',
            items: { type: 'string' },
          },
          showXIntercepts: { type: 'boolean' },
          showYIntercept: { type: 'boolean' },
          showVertex: { type: 'boolean' },
        },
        required: ['expression'],
      },
      async execute(input) {
        const params = input as {
          expression: string
          domainStart?: number
          domainEnd?: number
          graphType?: 'cartesian'
          title?: string
          noteLines?: string[]
          showXIntercepts?: boolean
          showYIntercept?: boolean
          showVertex?: boolean
        }
        return stringifyResult(
          graphFunction({
            expression: params.expression,
            domain:
              typeof params.domainStart === 'number' && typeof params.domainEnd === 'number'
                ? [params.domainStart, params.domainEnd]
                : undefined,
            graphType: params.graphType === 'cartesian' ? 'cartesian' : undefined,
            title: params.title,
            noteLines: params.noteLines,
            showXIntercepts: params.showXIntercepts,
            showYIntercept: params.showYIntercept,
            showVertex: params.showVertex,
          })
        )
      },
    }),
    tool({
      name: 'annotate_graph_features',
      description:
        'Add precise labels or teaching annotations to a graph that is already on the board. Use this after graph_function when the student asks for a specific feature like the y-intercept, vertex, or axis of symmetry to be pointed out more clearly.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          expression: { type: 'string' },
          domainStart: { type: 'number' },
          domainEnd: { type: 'number' },
          clearExisting: { type: 'boolean' },
          features: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['x-intercepts', 'y-intercept', 'vertex', 'axis-of-symmetry'],
            },
          },
        },
        required: ['expression', 'features'],
      },
      async execute(input) {
        const params = input as {
          expression: string
          domainStart?: number
          domainEnd?: number
          clearExisting?: boolean
          features: Array<'x-intercepts' | 'y-intercept' | 'vertex' | 'axis-of-symmetry'>
        }
        return stringifyResult(
          annotateGraphFeatures({
            expression: params.expression,
            domain:
              typeof params.domainStart === 'number' && typeof params.domainEnd === 'number'
                ? [params.domainStart, params.domainEnd]
                : undefined,
            clearExisting: params.clearExisting,
            features: params.features,
          })
        )
      },
    }),
    tool({
      name: 'table_of_values',
      description:
        'Build a neat x-y value table on the canvas for an expression in x. Use this when a student would benefit from seeing a coordinate table before graphing or spotting a pattern.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          expression: { type: 'string' },
          xValues: {
            type: 'array',
            items: { type: 'number' },
          },
        },
        required: ['expression'],
      },
      async execute(input) {
        const params = input as {
          expression: string
          xValues?: number[]
        }
        return stringifyResult(
          tableOfValues({
            expression: params.expression,
            xValues: params.xValues,
          })
        )
      },
    }),
    tool({
      name: 'plot_points_on_plane',
      description:
        'Plot ordered pairs on a clean coordinate plane, optionally connect them, and optionally label the related equation. Use this for requests like "plot these points", "connect the points", or "draw this line from points" instead of manually placing raw canvas coordinates.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          points: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
              },
              required: ['x', 'y'],
            },
          },
          connectPoints: { type: 'boolean' },
          labelPoints: { type: 'boolean' },
          equationLabel: { type: 'string' },
          title: { type: 'string' },
          noteLines: {
            type: 'array',
            items: { type: 'string' },
          },
          xDomainStart: { type: 'number' },
          xDomainEnd: { type: 'number' },
          yDomainStart: { type: 'number' },
          yDomainEnd: { type: 'number' },
        },
        required: ['points'],
      },
      async execute(input) {
        const params = input as {
          points: Array<{ x: number; y: number }>
          connectPoints?: boolean
          labelPoints?: boolean
          equationLabel?: string
          title?: string
          noteLines?: string[]
          xDomainStart?: number
          xDomainEnd?: number
          yDomainStart?: number
          yDomainEnd?: number
        }
        return stringifyResult(
          plotPointsOnPlane({
            points: params.points,
            connectPoints: params.connectPoints,
            labelPoints: params.labelPoints,
            equationLabel: params.equationLabel,
            title: params.title,
            noteLines: params.noteLines,
            xDomain:
              typeof params.xDomainStart === 'number' && typeof params.xDomainEnd === 'number'
                ? [params.xDomainStart, params.xDomainEnd]
                : undefined,
            yDomain:
              typeof params.yDomainStart === 'number' && typeof params.yDomainEnd === 'number'
                ? [params.yDomainStart, params.yDomainEnd]
                : undefined,
          })
        )
      },
    }),
    tool({
      name: 'geometry_figure',
      description:
        'Create a clean geometry diagram scene that the tutor can refer to while explaining.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          figureType: { type: 'string', enum: ['triangle', 'rectangle', 'axes'] },
          width: { type: 'number' },
          height: { type: 'number' },
          labels: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['figureType'],
      },
      async execute(input) {
        const params = input as {
          figureType: 'triangle' | 'rectangle' | 'axes'
          width?: number
          height?: number
          labels?: string[]
        }
        return stringifyResult(
          geometryFigure({
            figureType: params.figureType,
            width: params.width,
            height: params.height,
            labels: params.labels,
          })
        )
      },
    }),
    tool({
      name: 'number_line',
      description:
        'Create a neat number line with ticks, highlighted values, and optional hop arcs. Use this for integers, adding and subtracting on a number line, comparing values, or making coordinate-style counting visible. Let this tool own the board unless the student explicitly asks for extra written notes.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          start: { type: 'number' },
          end: { type: 'number' },
          step: { type: 'number' },
          title: { type: 'string' },
          highlightValues: {
            type: 'array',
            items: { type: 'number' },
          },
          hopPairs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                from: { type: 'number' },
                to: { type: 'number' },
                label: { type: 'string' },
              },
              required: ['from', 'to'],
            },
          },
        },
        required: ['start', 'end'],
      },
      async execute(input) {
        const params = input as {
          start: number
          end: number
          step?: number
          title?: string
          highlightValues?: number[]
          hopPairs?: Array<{ from: number; to: number; label?: string }>
        }
        return stringifyResult(
          numberLineScene({
            start: params.start,
            end: params.end,
            step: params.step,
            title: params.title,
            highlightValues: params.highlightValues,
            hopPairs: params.hopPairs,
          })
        )
      },
    }),
    tool({
      name: 'fraction_strip',
      description:
        'Create a structured fraction bar model with equal parts and shaded sections. Use this for fractions, improper fractions, equivalent-fraction explanations, or part-whole reasoning. Let this tool own the board unless the student explicitly asks for extra board notes or labels.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          numerator: { type: 'number' },
          denominator: { type: 'number' },
          title: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['numerator', 'denominator'],
      },
      async execute(input) {
        const params = input as {
          numerator: number
          denominator: number
          title?: string
          label?: string
        }
        return stringifyResult(
          fractionStripScene({
            numerator: params.numerator,
            denominator: params.denominator,
            title: params.title,
            label: params.label,
          })
        )
      },
    }),
    tool({
      name: 'array_model',
      description:
        'Create a rectangular array model for multiplication, repeated addition, area, or counting groups. Use this for prompts like "show 4 times 6", "draw 3 rows of 5", or "model area as rows and columns". Let this tool own the board unless extra notes are requested.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rows: { type: 'number' },
          columns: { type: 'number' },
          title: { type: 'string' },
          rowLabel: { type: 'string' },
          columnLabel: { type: 'string' },
          highlightCount: { type: 'number' },
        },
        required: ['rows', 'columns'],
      },
      async execute(input) {
        const params = input as {
          rows: number
          columns: number
          title?: string
          rowLabel?: string
          columnLabel?: string
          highlightCount?: number
        }
        return stringifyResult(
          arrayModelScene({
            rows: params.rows,
            columns: params.columns,
            title: params.title,
            rowLabel: params.rowLabel,
            columnLabel: params.columnLabel,
            highlightCount: params.highlightCount,
          })
        )
      },
    }),
    tool({
      name: 'ratio_table',
      description:
        'Create a clean two-column ratio table. Use this for equivalent ratios, rates, proportional reasoning, recipes, scale factors, or unit-rate setup.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          leftLabel: { type: 'string' },
          rightLabel: { type: 'string' },
          title: { type: 'string' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                left: { type: ['string', 'number'] },
                right: { type: ['string', 'number'] },
              },
              required: ['left', 'right'],
            },
          },
        },
        required: ['leftLabel', 'rightLabel', 'rows'],
      },
      async execute(input) {
        const params = input as {
          leftLabel: string
          rightLabel: string
          title?: string
          rows: Array<{ left: string | number; right: string | number }>
        }
        return stringifyResult(
          ratioTableScene({
            leftLabel: params.leftLabel,
            rightLabel: params.rightLabel,
            title: params.title,
            rows: params.rows,
          })
        )
      },
    }),
    tool({
      name: 'angle_diagram',
      description:
        'Create a clean angle diagram with two rays, an arc, and a degree label. Use this for acute, obtuse, right-angle, complementary-angle, or angle-estimation explanations.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          degrees: { type: 'number' },
          label: { type: 'string' },
          title: { type: 'string' },
          showRightAngleMarker: { type: 'boolean' },
        },
        required: ['degrees'],
      },
      async execute(input) {
        const params = input as {
          degrees: number
          label?: string
          title?: string
          showRightAngleMarker?: boolean
        }
        return stringifyResult(
          angleDiagramScene({
            degrees: params.degrees,
            label: params.label,
            title: params.title,
            showRightAngleMarker: params.showRightAngleMarker,
          })
        )
      },
    }),
    tool({
      name: 'equation_balance',
      description:
        'Create a balance-scale model for an equation or equality. Use this when explaining why the same operation must happen to both sides, or when checking whether a step preserved equality.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          leftExpression: { type: 'string' },
          rightExpression: { type: 'string' },
          title: { type: 'string' },
          balanced: { type: 'boolean' },
        },
        required: ['leftExpression', 'rightExpression'],
      },
      async execute(input) {
        const params = input as {
          leftExpression: string
          rightExpression: string
          title?: string
          balanced?: boolean
        }
        return stringifyResult(
          equationBalanceScene({
            leftExpression: params.leftExpression,
            rightExpression: params.rightExpression,
            title: params.title,
            balanced: params.balanced,
          })
        )
      },
    }),
    tool({
      name: 'bar_model',
      description:
        'Create a tape or bar model for word problems, part-whole reasoning, comparison problems, fractions, percentages, or ratio thinking. Use this instead of freehand drawing when the student asks for a model or visual setup.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          bars: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                segments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      label: { type: 'string' },
                      value: { type: ['string', 'number'] },
                      shaded: { type: 'boolean' },
                    },
                    required: ['label', 'value', 'shaded'],
                  },
                },
              },
              required: ['label', 'segments'],
            },
          },
        },
        required: ['bars'],
      },
      async execute(input) {
        const params = input as {
          title?: string
          bars: Array<{
            label?: string
            segments: Array<{ label?: string; value?: string | number; shaded?: boolean }>
          }>
        }
        return stringifyResult(
          barModelScene({
            title: params.title,
            bars: params.bars,
          })
        )
      },
    }),
    tool({
      name: 'place_value_chart',
      description:
        'Create a place-value chart for whole numbers or decimals. Use this for regrouping, comparing decimals, expanded form, rounding, and understanding digit value.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          columns: {
            type: 'array',
            items: { type: 'string' },
          },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                values: {
                  type: 'array',
                  items: { type: ['string', 'number'] },
                },
              },
              required: ['label', 'values'],
            },
          },
        },
        required: ['columns', 'rows'],
      },
      async execute(input) {
        const params = input as {
          title?: string
          columns: string[]
          rows: Array<{ label?: string; values: Array<string | number> }>
        }
        return stringifyResult(
          placeValueChartScene({
            title: params.title,
            columns: params.columns,
            rows: params.rows,
          })
        )
      },
    }),
    tool({
      name: 'factor_tree',
      description:
        'Create a prime-factor tree for a whole number. Use this for factors, multiples, divisibility, prime factorization, GCF, or LCM setup.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          value: { type: 'number' },
          title: { type: 'string' },
        },
        required: ['value'],
      },
      async execute(input) {
        const params = input as { value: number; title?: string }
        return stringifyResult(
          factorTreeScene({
            value: params.value,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'long_division',
      description:
        'Create a long-division setup and compact step list on the canvas. Use for whole-number division, quotient and remainder reasoning, or helping grades 3 to 7 students see each division step.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dividend: { type: 'number' },
          divisor: { type: 'number' },
          title: { type: 'string' },
        },
        required: ['dividend', 'divisor'],
      },
      async execute(input) {
        const params = input as { dividend: number; divisor: number; title?: string }
        return stringifyResult(
          longDivisionScene({
            dividend: params.dividend,
            divisor: params.divisor,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'decimal_grid',
      description:
        'Create a tenths or hundredths grid with shaded parts. Use for decimals, percentages, equivalent fractions, and visualizing values such as 0.37 or 45%.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          shadedParts: {
            type: 'number',
            description: 'How many equal parts should be shaded.',
          },
          totalParts: {
            type: 'number',
            enum: [10, 100],
            description: 'Use 10 for tenths or 100 for hundredths.',
          },
          title: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['shadedParts'],
      },
      async execute(input) {
        const params = input as {
          shadedParts: number
          totalParts?: 10 | 100
          title?: string
          label?: string
        }
        return stringifyResult(
          decimalGridScene({
            shadedParts: params.shadedParts,
            totalParts: params.totalParts,
            title: params.title,
            label: params.label,
          })
        )
      },
    }),
    tool({
      name: 'data_display',
      description:
        'Create a simple bar chart or line plot on the canvas. Use for grade 3 to 7 data, statistics, reading graphs, comparing categories, and describing trends.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          displayType: { type: 'string', enum: ['bar_chart', 'line_plot'] },
          title: { type: 'string' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                value: { type: 'number' },
              },
              required: ['label', 'value'],
            },
          },
        },
        required: ['displayType', 'data'],
      },
      async execute(input) {
        const params = input as {
          displayType: 'bar_chart' | 'line_plot'
          title?: string
          data: Array<{ label: string; value: number }>
        }
        return stringifyResult(
          dataDisplayScene({
            displayType: params.displayType,
            title: params.title,
            data: params.data,
          })
        )
      },
    }),
    tool({
      name: 'integer_chips',
      description:
        'Create positive and negative integer chips on the canvas. Use for adding, subtracting, and comparing integers, especially zero-pair explanations.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          positiveCount: { type: 'number' },
          negativeCount: { type: 'number' },
          title: { type: 'string' },
          expression: { type: 'string' },
        },
        required: ['positiveCount', 'negativeCount'],
      },
      async execute(input) {
        const params = input as {
          positiveCount: number
          negativeCount: number
          title?: string
          expression?: string
        }
        return stringifyResult(
          integerChipsScene({
            positiveCount: params.positiveCount,
            negativeCount: params.negativeCount,
            title: params.title,
            expression: params.expression,
          })
        )
      },
    }),
    tool({
      name: 'fraction_compare',
      description:
        'Create side-by-side fraction bars and a common-denominator comparison. Use when students compare fractions or need to see which fraction is larger.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          leftNumerator: { type: 'number' },
          leftDenominator: { type: 'number' },
          rightNumerator: { type: 'number' },
          rightDenominator: { type: 'number' },
          title: { type: 'string' },
        },
        required: ['leftNumerator', 'leftDenominator', 'rightNumerator', 'rightDenominator'],
      },
      async execute(input) {
        const params = input as {
          leftNumerator: number
          leftDenominator: number
          rightNumerator: number
          rightDenominator: number
          title?: string
        }
        return stringifyResult(
          fractionCompareScene({
            leftNumerator: params.leftNumerator,
            leftDenominator: params.leftDenominator,
            rightNumerator: params.rightNumerator,
            rightDenominator: params.rightDenominator,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'fraction_operation',
      description:
        'Create structured fraction operation work for addition, subtraction, multiplication, or division. Use for common denominators, simplifying results, and explaining fraction computation without mental arithmetic.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
          leftNumerator: { type: 'number' },
          leftDenominator: { type: 'number' },
          rightNumerator: { type: 'number' },
          rightDenominator: { type: 'number' },
          title: { type: 'string' },
        },
        required: ['operation', 'leftNumerator', 'leftDenominator', 'rightNumerator', 'rightDenominator'],
      },
      async execute(input) {
        const params = input as {
          operation: 'add' | 'subtract' | 'multiply' | 'divide'
          leftNumerator: number
          leftDenominator: number
          rightNumerator: number
          rightDenominator: number
          title?: string
        }
        return stringifyResult(
          fractionOperationScene({
            operation: params.operation,
            leftNumerator: params.leftNumerator,
            leftDenominator: params.leftDenominator,
            rightNumerator: params.rightNumerator,
            rightDenominator: params.rightDenominator,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'area_perimeter_model',
      description:
        'Create a rectangle model with unit squares plus area and perimeter facts. Use for area, perimeter, tiling, rectangles, and measurement word problems.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          widthUnits: { type: 'number' },
          heightUnits: { type: 'number' },
          unitLabel: { type: 'string' },
          title: { type: 'string' },
          showUnitSquares: { type: 'boolean' },
        },
        required: ['widthUnits', 'heightUnits'],
      },
      async execute(input) {
        const params = input as {
          widthUnits: number
          heightUnits: number
          unitLabel?: string
          title?: string
          showUnitSquares?: boolean
        }
        return stringifyResult(
          areaPerimeterModelScene({
            widthUnits: params.widthUnits,
            heightUnits: params.heightUnits,
            unitLabel: params.unitLabel,
            title: params.title,
            showUnitSquares: params.showUnitSquares,
          })
        )
      },
    }),
    tool({
      name: 'statistics_summary',
      description:
        'Create a dot-plot style data summary with mean, median, mode, and range. Use for grades 5 to 7 statistics, data sets, and interpreting distributions.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          values: {
            type: 'array',
            items: { type: 'number' },
          },
          title: { type: 'string' },
        },
        required: ['values'],
      },
      async execute(input) {
        const params = input as { values: number[]; title?: string }
        return stringifyResult(
          statisticsSummaryScene({
            values: params.values,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'unit_conversion',
      description:
        'Create a clear unit conversion setup. Use for metric length, mass, capacity, and time conversions in grades 3 to 7.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          value: { type: 'number' },
          fromUnit: {
            type: 'string',
            enum: ['mm', 'cm', 'm', 'km', 'g', 'kg', 'mL', 'L', 'seconds', 'minutes', 'hours'],
          },
          toUnit: {
            type: 'string',
            enum: ['mm', 'cm', 'm', 'km', 'g', 'kg', 'mL', 'L', 'seconds', 'minutes', 'hours'],
          },
          measurementType: {
            type: 'string',
            enum: ['length', 'mass', 'capacity', 'time'],
          },
          title: { type: 'string' },
        },
        required: ['value', 'fromUnit', 'toUnit', 'measurementType'],
      },
      async execute(input) {
        const params = input as {
          value: number
          fromUnit: string
          toUnit: string
          measurementType: 'length' | 'mass' | 'capacity' | 'time'
          title?: string
        }
        return stringifyResult(
          unitConversionScene({
            value: params.value,
            fromUnit: params.fromUnit,
            toUnit: params.toUnit,
            measurementType: params.measurementType,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'probability_model',
      description:
        'Create a probability bar model from favorable and total outcomes. Use for simple probability, fractions, decimals, and percentages.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          favorableOutcomes: { type: 'number' },
          totalOutcomes: { type: 'number' },
          title: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['favorableOutcomes', 'totalOutcomes'],
      },
      async execute(input) {
        const params = input as {
          favorableOutcomes: number
          totalOutcomes: number
          title?: string
          label?: string
        }
        return stringifyResult(
          probabilityModelScene({
            favorableOutcomes: params.favorableOutcomes,
            totalOutcomes: params.totalOutcomes,
            title: params.title,
            label: params.label,
          })
        )
      },
    }),
    tool({
      name: 'percent_bar',
      description:
        'Create a percent bar for part-whole percent reasoning, discounts, tax, tips, percent of a number, or decimal-percent connections. Pass plain numeric part and total values. For a direct percent like 35%, pass part 35 and total 100.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          part: { type: 'number' },
          total: { type: 'number' },
          title: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['part', 'total'],
      },
      async execute(input) {
        const params = input as {
          part: number
          total: number
          title?: string
          label?: string
        }
        return stringifyResult(
          percentBarScene({
            part: params.part,
            total: params.total,
            title: params.title,
            label: params.label,
          })
        )
      },
    }),
    tool({
      name: 'double_number_line',
      description:
        'Create a double number line for ratios, unit rates, proportional reasoning, scale factors, and percent-of-a-number problems.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topLabel: { type: 'string' },
          bottomLabel: { type: 'string' },
          pairs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                top: { type: 'number' },
                bottom: { type: 'number' },
                label: { type: 'string' },
              },
              required: ['top', 'bottom'],
            },
          },
          title: { type: 'string' },
        },
        required: ['topLabel', 'bottomLabel', 'pairs'],
      },
      async execute(input) {
        const params = input as {
          topLabel: string
          bottomLabel: string
          pairs: Array<{ top: number; bottom: number; label?: string }>
          title?: string
        }
        return stringifyResult(
          doubleNumberLineScene({
            topLabel: params.topLabel,
            bottomLabel: params.bottomLabel,
            pairs: params.pairs,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'composite_area_model',
      description:
        'Create a composite area model from rectangles. Use for decomposing L-shapes, multi-rectangle figures, and area word problems.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rectangles: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                xUnits: { type: 'number' },
                yUnits: { type: 'number' },
                widthUnits: { type: 'number' },
                heightUnits: { type: 'number' },
                label: { type: 'string' },
              },
              required: ['xUnits', 'yUnits', 'widthUnits', 'heightUnits'],
            },
          },
          unitLabel: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['rectangles'],
      },
      async execute(input) {
        const params = input as {
          rectangles: Array<{
            xUnits: number
            yUnits: number
            widthUnits: number
            heightUnits: number
            label?: string
          }>
          unitLabel?: string
          title?: string
        }
        return stringifyResult(
          compositeAreaModelScene({
            rectangles: params.rectangles,
            unitLabel: params.unitLabel,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'coordinate_distance',
      description:
        'Draw two coordinate points and a distance model with horizontal and vertical changes. Use for coordinate distance, graph reading, and early Pythagorean reasoning.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pointA: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          pointB: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          title: { type: 'string' },
        },
        required: ['pointA', 'pointB'],
      },
      async execute(input) {
        const params = input as {
          pointA: { x: number; y: number }
          pointB: { x: number; y: number }
          title?: string
        }
        return stringifyResult(
          coordinateDistanceScene({
            pointA: params.pointA,
            pointB: params.pointB,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'order_of_operations',
      description:
        'Create a concise order-of-operations board note for a numeric expression. Use for PEMDAS, arithmetic expressions, and checking operation order.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          expression: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['expression'],
      },
      async execute(input) {
        const params = input as { expression: string; title?: string }
        return stringifyResult(
          orderOfOperationsScene({
            expression: params.expression,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'slope_triangle',
      description:
        'Draw two points on a coordinate plane with a rise-run triangle and slope notes. Use for slope, rate of change, proportional graphs, and coordinate geometry.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pointA: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          pointB: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          title: { type: 'string' },
        },
        required: ['pointA', 'pointB'],
      },
      async execute(input) {
        const params = input as {
          pointA: { x: number; y: number }
          pointB: { x: number; y: number }
          title?: string
        }
        return stringifyResult(
          slopeTriangleScene({
            pointA: params.pointA,
            pointB: params.pointB,
            title: params.title,
          })
        )
      },
    }),
    tool({
      name: 'canvas_action',
      description:
        'Apply one precise structured board action from the restricted follow-up set. Prefer higher-level math tools first. Use this only for short labels, points, line segments, highlights, or graph-coordinate follow-ups after another math tool has already prepared the board.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          actionType: {
            type: 'string',
            enum: [
              'clear_tool_layer',
              'place_text_label',
              'place_math_block',
              'place_point',
              'draw_line_segment',
              'draw_axes',
              'draw_rectangle',
              'highlight_region',
              'plot_polyline',
              'coordinate_plane',
            ],
          },
          clearFirst: { type: 'boolean' },
          focusAfter: { type: 'boolean' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          text: { type: 'string' },
          latex: { type: 'string' },
          label: { type: 'string' },
          color: {
            type: 'string',
            enum: [
              'black',
              'grey',
              'blue',
              'green',
              'red',
              'yellow',
              'orange',
              'violet',
              'light-blue',
              'light-red',
              'light-green',
            ],
          },
          dash: {
            type: 'string',
            enum: ['draw', 'dashed', 'dotted', 'solid'],
          },
          size: {
            type: 'string',
            enum: ['s', 'm', 'l', 'xl'],
          },
          fill: {
            type: 'string',
            enum: ['none', 'semi', 'solid'],
          },
          opacity: { type: 'number' },
          labelPosition: {
            type: 'string',
            enum: ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
          },
          labelWidth: { type: 'number' },
          displayMode: { type: 'boolean' },
          start: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          end: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          origin: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          xLength: { type: 'number' },
          yLength: { type: 'number' },
          xLabel: { type: 'string' },
          yLabel: { type: 'string' },
          points: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
              },
              required: ['x', 'y'],
            },
          },
          noteLines: {
            type: 'array',
            items: { type: 'string' },
          },
          title: { type: 'string' },
          coordinateSpace: {
            type: 'string',
            enum: ['canvas', 'graph'],
          },
          xDomainStart: { type: 'number' },
          xDomainEnd: { type: 'number' },
          yDomainStart: { type: 'number' },
          yDomainEnd: { type: 'number' },
        },
        required: ['actionType'],
      },
      async execute(input) {
        const params = input as Parameters<typeof canvasAction>[0]
        assertSafeCanvasActionInput(params)
        return stringifyResult(canvasAction(params))
      },
    }),
    tool({
      name: 'write_on_canvas',
      description:
        'Write a neat worked note on the canvas using text and math steps. Use this for visual hints, setups, formulas, or short worked step sequences. Do not use it for ordinary graph summaries when a clean graph plus spoken explanation is enough.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          textLines: {
            type: 'array',
            items: { type: 'string' },
          },
          mathExpressions: {
            type: 'array',
            items: { type: 'string' },
          },
          clearExisting: { type: 'boolean' },
        },
        required: ['title'],
      },
      async execute(input) {
        const params = input as {
          title: string
          textLines?: string[]
          mathExpressions?: string[]
          clearExisting?: boolean
        }
        return stringifyResult(
          writeOnCanvas({
            title: params.title,
            textLines: params.textLines,
            mathExpressions: params.mathExpressions,
            clearExisting: params.clearExisting,
          })
        )
      },
    }),
  ] as Tool<any>[]
}
