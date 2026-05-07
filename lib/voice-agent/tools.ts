import { tool, type Tool } from '@openai/agents'
import {
  annotateGraphFeatures,
  canvasAction,
  fractionStripScene,
  geometryFigure,
  graphFunction,
  hintGenerator,
  mathCalculate,
  mathCheckStep,
  mathSolveLinear,
  numberLineScene,
  plotPointsOnPlane,
  solveLinearOnCanvas,
  tableOfValues,
  writeOnCanvas,
} from '@/lib/voice-agent/math-engine'

function stringifyResult(result: unknown) {
  return JSON.stringify(result)
}

const STRUCTURED_CANVAS_ACTIONS = new Set([
  'clear_tool_layer',
  'place_text_label',
  'place_point',
  'draw_line_segment',
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
