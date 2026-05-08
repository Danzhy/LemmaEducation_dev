export type LocalToolPlan = {
  toolName: string
  input: Record<string, unknown>
}

type LearnerContextOutput = {
  likelyTopics?: unknown
  struggleSignals?: unknown
  recentExcerpts?: unknown
}

function formatToolNameForStudent(toolName: string) {
  return toolName.replace(/_/g, ' ')
}

function extractNumbers(text: string) {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
}

function extractFractions(text: string) {
  return [...text.matchAll(/(-?\d+)\s*\/\s*(-?\d+)/g)].map((match) => ({
    numerator: Number(match[1]),
    denominator: Number(match[2]),
  }))
}

function extractGraphExpression(text: string) {
  const normalized = text.replace(/[“”]/g, '"').replace(/[’]/g, "'")
  const equationMatch = normalized.match(/(?:graph|plot|draw)\s+(?:the\s+)?(?:function\s+)?(?:y\s*=\s*)?([^.,;\n]+?)(?:\s+from|\s+for|\s+and|\s+with|$)/i)
  const yEqualsMatch = normalized.match(/y\s*=\s*([^.,;\n]+)/i)
  const rawExpression = (yEqualsMatch?.[1] ?? equationMatch?.[1] ?? '')
    .split(/\s+(?:from|for|and|with|where|between|over)\b/i)[0]
    .trim()
  return rawExpression.replace(/^y\s*=\s*/i, '').replace(/\s+/g, ' ').trim()
}

function extractGraphDomain(text: string) {
  const domainMatch = text.match(/x\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:to|through|until|\.{2}|-)\s*(-?\d+(?:\.\d+)?)/i)
  if (!domainMatch) return null
  const start = Number(domainMatch[1])
  const end = Number(domainMatch[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

function pickPlaceValue(lower: string) {
  if (lower.includes('hundredth')) return 'hundredths'
  if (lower.includes('tenth')) return 'tenths'
  if (lower.includes('thousand')) return 'thousands'
  if (lower.includes('hundred')) return 'hundreds'
  return 'tens'
}

function extractIntegerOperation(text: string) {
  const match = text.match(/(-?\d+)\s*([+-])\s*(-?\d+)/)
  if (!match) return null
  const left = Number(match[1])
  const right = Number(match[3])
  if (!Number.isInteger(left) || !Number.isInteger(right)) return null
  return {
    left,
    right,
    operation: match[2] === '-' ? 'subtract' : 'add',
  } as const
}

function inferLocalTopic(text: string) {
  const lower = text.toLowerCase()
  if (extractFractions(text).length > 0 || /\bfraction|denominator|numerator\b/.test(lower)) return 'fractions'
  if (/\bdecimal|percent|%|hundredths|tenths\b/.test(lower)) return 'decimals and percents'
  if (/\bratio|rate|per one|unit rate|scale\b/.test(lower)) return 'ratios'
  if (/\bequation|variable|solve for x|\bx\b/.test(lower)) return 'equations'
  if (/\bnegative|positive|integer|signed|minus\b|-\d/.test(lower)) return 'integers'
  if (/\barea|perimeter|angle|geometry|rectangle|triangle\b/.test(lower)) return 'geometry'
  if (/\bgraph|coordinate|slope|point|axis\b/.test(lower)) return 'graphing'
  if (/\bmean|median|mode|probability|chance|data\b/.test(lower)) return 'data'
  return text.slice(0, 120)
}

export function planLocalToolTurn(prompt: string, gradeLevel: string): LocalToolPlan[] {
  const lower = prompt.toLowerCase()
  const fractions = extractFractions(prompt)
  const numbers = extractNumbers(prompt)
  const plans: LocalToolPlan[] = []
  const asksForFullSolution =
    /\b(just tell me|give me the answer|tell me the answer|full solution|show me the solution|solve it for me)\b/.test(lower)
  const hasStudentAttempt = /\b(i tried|i got|my answer|i think|check this|=)\b/.test(lower)
  const asksForCurriculumContext =
    /\b(homework|worksheet|teacher|class notes|uploaded|lesson|curriculum|rubric|directions|from class|my class)\b/.test(lower)
  const asksForLearnerContext =
    /\b(last time|previous session|continue|remember|review what|what did i struggle|my progress|again like before|same as yesterday)\b/.test(lower)
  const hasSpecificMathAction =
    /\b(graph|plot|parabola|function|fraction|percent|decimal|round|linear|equation|solve|ratio|rate|area|perimeter|rectangle|word problem|plan|integer|negative|positive|signed)\b/.test(lower)
  const asksForMistakeHelp =
    /\b(why.*wrong|what.*wrong|where.*mistake|mistake|incorrect|not right|check my work|why is this wrong)\b/.test(lower)
  const needsSafetyBoundary =
    /\b(cheat|test answers|exam answers|do my test|phone number|address|password|where do you live|meet me|private photo|secret|kill myself|hurt myself|self harm|suicide|abuse|violence)\b/.test(lower) ||
    (!hasSpecificMathAction &&
      !asksForCurriculumContext &&
      /\b(game|dating|romance|joke|story|politics|medical|diagnose|buy|sell|crypto|stock)\b/.test(lower))

  if (needsSafetyBoundary) {
    plans.push({
      toolName: 'safety_boundary_check',
      input: {
        studentRequest: prompt.slice(0, 500),
        gradeLevel,
        context: 'livekit typed preview',
      },
    })
    return plans
  }

  if (asksForFullSolution) {
    plans.push({
      toolName: 'answer_disclosure_gate',
      input: {
        studentRequest: prompt.slice(0, 240),
        hasStudentAttempt,
        attemptCount: hasStudentAttempt ? 1 : 0,
        isCheckingAnswer: /\b(check|correct|right|wrong)\b/.test(lower),
        askedForFullSolution: true,
      },
    })

    if (!hasStudentAttempt) {
      return plans
    }
  }

  if (asksForLearnerContext) {
    plans.push({
      toolName: 'learner_context',
      input: {
        sessionId: '',
        reason: prompt.slice(0, 240),
      },
    })
    plans.push({
      toolName: 'adaptive_review_plan',
      input: {
        gradeLevel,
        targetTopic: '',
        sessionGoal: prompt.slice(0, 240),
        topics: [],
        struggleSignals: [],
        recentExcerpts: [],
      },
    })

    if (!hasSpecificMathAction && !asksForCurriculumContext) {
      plans.push({
        toolName: 'socratic_move_planner',
        input: {
          topic: 'review from recent learner history',
          gradeLevel,
          studentWork: '',
          tutorGoal: 'diagnose',
        },
      })
      return plans
    }
  }

  if (asksForCurriculumContext) {
    plans.push({
      toolName: 'curriculum_context',
      input: {
        reason: prompt.slice(0, 240),
      },
    })
    plans.push({
      toolName: 'curriculum_search',
      input: {
        query: prompt.slice(0, 300),
        classroomId: '',
        limit: 4,
      },
    })

    if (!hasSpecificMathAction) {
      return plans
    }
  }

  if (/\b(another way|different way|represent|representation|turn.*into|as a table|as an equation|as a graph|with a visual|show visually)\b/.test(lower)) {
    plans.push({
      toolName: 'representation_bridge',
      input: {
        topic: inferLocalTopic(prompt),
        problemContext: prompt.slice(0, 500),
        fromRepresentation: /word|story/.test(lower) ? 'words' : /table/.test(lower) ? 'table' : /graph/.test(lower) ? 'graph' : 'numeric',
        toRepresentation: /table/.test(lower) ? 'table' : /equation|formula/.test(lower) ? 'equation' : /graph/.test(lower) ? 'graph' : /visual|model|diagram/.test(lower) ? 'visual' : 'words',
        studentWork: prompt.slice(0, 500),
      },
    })
    return plans
  }

  if (/\b(worked example|example like this|show an example|i do we do you do|walk me through one|similar example)\b/.test(lower)) {
    plans.push({
      toolName: 'worked_example_fader',
      input: {
        topic: inferLocalTopic(prompt),
        gradeLevel,
        exampleProblem: prompt.slice(0, 500),
        studentWork: '',
      },
    })
    return plans
  }

  if (/\b(quiz me|test me|check if i understand|do i understand|ask me a question|am i ready|before moving on|can i try)\b/.test(lower)) {
    plans.push({
      toolName: 'student_check_question',
      input: {
        topic: inferLocalTopic(prompt),
        gradeLevel,
        studentWork: hasStudentAttempt ? prompt.slice(0, 500) : '',
        recentToolName: '',
        recentToolResult: '',
        checkType: /another|different|similar|new numbers|transfer/.test(lower)
          ? 'transfer'
          : /wrong|mistake|incorrect|check my work/.test(lower)
            ? 'error_spotting'
            : /next|then|after/.test(lower)
              ? 'next_step'
              : 'concept',
      },
    })
    return plans
  }

  if (asksForMistakeHelp && hasStudentAttempt) {
    plans.push({
      toolName: 'mistake_pattern_classifier',
      input: {
        topic: inferLocalTopic(prompt),
        studentWork: prompt.slice(0, 700),
        studentExplanation: prompt.slice(0, 700),
        expectedAnswer: '',
      },
    })
    return plans
  }

  if (/\b(animate|animation|step by step|write while|explain while|reveal)\b/i.test(prompt)) {
    plans.push({
      toolName: 'board_animation_plan',
      input: {
        concept: prompt.slice(0, 220),
        visualType: /graph|plot|coordinate|parabola|function/.test(lower)
          ? 'coordinate graph reveal'
          : /fraction|percent|ratio/.test(lower)
            ? 'part-whole visual reveal'
            : 'structured board reveal',
        gradeLevel,
        wantsOfflineVideo: /manim|video|polished/.test(lower),
      },
    })
    if (!/\b(graph|plot|parabola|function)\b/i.test(prompt)) {
      plans.push({
        toolName: 'tutor_teaching_sequence',
        input: {
          topic: prompt.slice(0, 160),
          gradeLevel,
          studentGoal: prompt.slice(0, 220),
          studentWork: '',
        },
      })
      return plans
    }
  }

  if (/\b(graph|plot|parabola|function)\b/i.test(prompt)) {
    const expression = extractGraphExpression(prompt) || 'x'
    const domain = extractGraphDomain(prompt)
    plans.push({
      toolName: 'graph_function',
      input: {
        expression,
        domainStart: domain?.start ?? -5,
        domainEnd: domain?.end ?? 5,
        graphType: 'cartesian',
        title: `Graph of y = ${expression}`,
        showXIntercepts: /intercept|root|zero/.test(lower),
        showYIntercept: /intercept|y-axis|where it starts/.test(lower),
        showVertex: /vertex|parabola|\^2|squared/.test(lower),
      },
    })
    return plans
  }

  const integerOperation = extractIntegerOperation(prompt)
  if (
    integerOperation &&
    /\b(integer|negative|positive|signed|number line|chips|add|subtract|plus|minus)\b|-\d/.test(lower)
  ) {
    plans.push({
      toolName: 'integer_operation_scene',
      input: {
        left: integerOperation.left,
        right: integerOperation.right,
        operation: integerOperation.operation,
        title: 'Integer operation',
      },
    })
    return plans
  }

  if (/common denominator|denominator/.test(lower) && fractions.length >= 2) {
    plans.push({
      toolName: 'common_denominator',
      input: {
        leftNumerator: fractions[0].numerator,
        leftDenominator: fractions[0].denominator,
        rightNumerator: fractions[1].numerator,
        rightDenominator: fractions[1].denominator,
        purpose: /add|subtract|\+|-/.test(lower) ? 'add_subtract' : 'compare',
      },
    })
    return plans
  }

  if (/compare/.test(lower) && fractions.length >= 2) {
    plans.push({
      toolName: 'fraction_compare',
      input: {
        leftNumerator: fractions[0].numerator,
        leftDenominator: fractions[0].denominator,
        rightNumerator: fractions[1].numerator,
        rightDenominator: fractions[1].denominator,
        title: 'Compare the fractions',
      },
    })
    return plans
  }

  if (/simplify|reduce|equivalent fraction/.test(lower) && fractions.length >= 1) {
    plans.push({
      toolName: 'fraction_simplify',
      input: {
        numerator: fractions[0].numerator,
        denominator: fractions[0].denominator,
      },
    })
    return plans
  }

  if (/percent bar|out of/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'percent_bar',
      input: {
        part: numbers[0],
        total: numbers[1],
        title: 'Percent bar',
        label: `${numbers[0]} out of ${numbers[1]}`,
      },
    })
    return plans
  }

  if (/%\s*of|percent of/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'percent_of_number',
      input: {
        percent: numbers[0],
        whole: numbers[1],
      },
    })
    plans.push({
      toolName: 'percent_bar',
      input: {
        part: numbers[0],
        total: 100,
        title: `${numbers[0]}% of ${numbers[1]}`,
        label: `${numbers[0]}%`,
      },
    })
    return plans
  }

  if (/decimal|compare/.test(lower) && numbers.length >= 2 && numbers.some((number) => !Number.isInteger(number))) {
    plans.push({
      toolName: 'decimal_compare',
      input: {
        left: numbers[0],
        right: numbers[1],
      },
    })
    return plans
  }

  if (/round/.test(lower) && numbers.length >= 1) {
    plans.push({
      toolName: 'round_number',
      input: {
        value: numbers[0],
        place: pickPlaceValue(lower),
      },
    })
    return plans
  }

  if (/linear|equation|solve|x\s*=|[+-]?\d*x\s*[+-]\s*\d+\s*=/.test(lower) && /x/.test(lower) && /=/.test(prompt)) {
    const equation = prompt.match(/([+-]?\d*\s*x\s*(?:[+-]\s*\d+)?\s*=\s*-?\d+(?:\.\d+)?)/i)?.[1] ?? prompt
    plans.push({
      toolName: 'solve_linear_on_canvas',
      input: {
        problem: equation.trim(),
        maxSteps: 2,
      },
    })
    return plans
  }

  if (/\b(double number line|unit rate|cost|ratio|notebook|recipe|muffin)s?\b/.test(lower) && numbers.length >= 2) {
    const quantity = numbers[0]
    const value = numbers[1]
    const target = numbers[2]
    if (/unit rate|cost/.test(lower)) {
      plans.push({
        toolName: 'unit_rate',
        input: {
          quantity,
          value,
          quantityLabel: /notebook/.test(lower) ? 'notebooks' : 'units',
          valueLabel: /\$|cost/.test(lower) ? 'dollars' : 'value',
        },
      })
    }
    plans.push({
      toolName: 'double_number_line',
      input: {
        topLabel: /notebook/.test(lower) ? 'notebooks' : 'quantity',
        bottomLabel: /\$|cost/.test(lower) ? 'cost' : 'value',
        pairs: [
          { top: 0, bottom: 0, label: 'start' },
          { top: quantity, bottom: value, label: 'given' },
          ...(typeof target === 'number'
            ? [{ top: target, bottom: (value / quantity) * target, label: 'target' }]
            : []),
        ],
        title: 'Double number line',
      },
    })
    return plans
  }

  if (/area|perimeter|rectangle/.test(lower) && numbers.length >= 2) {
    plans.push({
      toolName: 'area_perimeter_model',
      input: {
        widthUnits: numbers[0],
        heightUnits: numbers[1],
        unitLabel: 'units',
        title: 'Area and perimeter model',
        showUnitSquares: true,
      },
    })
    return plans
  }

  if (/word problem|plan|recipe|muffin/.test(lower)) {
    plans.push({
      toolName: 'problem_understanding_map',
      input: {
        problemText: prompt,
        gradeLevel,
        studentWork: '',
      },
    })
    plans.push({
      toolName: 'word_problem_plan',
      input: {
        problemText: prompt,
        gradeLevel,
      },
    })
    return plans
  }

  plans.push({
    toolName: 'socratic_move_planner',
    input: {
      topic: prompt.slice(0, 180),
      gradeLevel,
      studentWork: prompt,
      tutorGoal: 'unstick',
    },
  })
  plans.push({
    toolName: 'write_on_canvas',
    input: {
      title: 'Let us set this up',
      textLines: ['Tell me what you tried first.', 'Then we can check the step where it got confusing.'],
      clearExisting: true,
    },
  })
  return plans
}

function findLearnerContextOutput(outputs: unknown[]): LearnerContextOutput | null {
  return (
    outputs.find(
      (output): output is LearnerContextOutput =>
        Boolean(output && typeof output === 'object' && 'likelyTopics' in output)
    ) ?? null
  )
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, limit)
    : []
}

function excerptArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object' && 'content' in item) {
        const content = (item as { content?: unknown }).content
        return typeof content === 'string' ? content.trim() : ''
      }
      return ''
    })
    .filter(Boolean)
    .slice(0, limit)
}

export function hydrateLocalToolPlanInput(
  plan: LocalToolPlan,
  previousOutputs: unknown[],
  prompt: string,
  gradeLevel: string
) {
  if (plan.toolName !== 'adaptive_review_plan') return plan.input

  const learnerContext = findLearnerContextOutput(previousOutputs)
  if (!learnerContext) return plan.input

  const topics = stringArray(learnerContext.likelyTopics, 5)
  const struggleSignals = stringArray(learnerContext.struggleSignals, 5)
  const recentExcerpts = excerptArray(learnerContext.recentExcerpts, 6)

  return {
    ...plan.input,
    gradeLevel,
    targetTopic: topics[0] ?? '',
    sessionGoal: prompt.slice(0, 240),
    topics,
    struggleSignals,
    recentExcerpts,
  }
}

export function buildLocalAssistantReply(_prompt: string, plans: LocalToolPlan[], outputs: unknown[]) {
  const firstTool = plans[0]?.toolName
  if (!firstTool) {
    return 'I am ready. Type a math problem and I will help you reason through it.'
  }

  if (firstTool === 'graph_function') {
    return 'I put the graph on the board. Start by reading the key points, then tell me which part you want to reason through first.'
  }

  if (firstTool === 'answer_disclosure_gate') {
    const gate = outputs.find(
      (output): output is { sayThis?: string; decision?: string } =>
        Boolean(output && typeof output === 'object' && 'decision' in output)
    )
    if (gate?.sayThis) return gate.sayThis
    return 'I will start with the next useful hint so you still get to do the thinking.'
  }

  if (firstTool === 'board_animation_plan') {
    return 'I set up a staged board reveal. I will show one useful mark at a time, then pause so you can make the next move.'
  }

  if (firstTool === 'learner_context') {
    return 'I checked your recent tutoring history and made a quick review plan. I will start with one diagnostic question, then use the board only where it helps.'
  }

  if (firstTool === 'curriculum_context' || firstTool === 'curriculum_search') {
    return 'I checked the class context first. I will use it for vocabulary, examples, and pacing without reading long notes back at you.'
  }

  if (firstTool === 'safety_boundary_check') {
    const boundary = outputs.find(
      (output): output is { sayThis?: string } =>
        Boolean(output && typeof output === 'object' && 'sayThis' in output)
    )
    return boundary?.sayThis || 'I can help with math here. Send me a problem or a step you want to check.'
  }

  if (firstTool === 'mistake_pattern_classifier') {
    const classified = outputs.find(
      (output): output is { diagnosticQuestion?: string; primaryPattern?: string } =>
        Boolean(output && typeof output === 'object' && 'diagnosticQuestion' in output)
    )
    return classified?.diagnosticQuestion
      ? `I found the likely reasoning pattern. ${classified.diagnosticQuestion}`
      : 'I checked the mistake pattern. Let us focus on one step and explain why it changes.'
  }

  if (firstTool === 'problem_understanding_map') {
    return 'I mapped the knowns, the unknown, and the useful representation first. Tell me which quantity the problem is asking us to find.'
  }

  if (firstTool === 'representation_bridge') {
    return 'I planned how to connect those representations. Keep the meaning the same, then tell me which part matches across both forms.'
  }

  if (firstTool === 'worked_example_fader') {
    return 'I planned this as I do, we do, you do. I will model only the setup first, then leave the next step for you.'
  }

  if (firstTool === 'tutor_teaching_sequence') {
    return 'I planned this like a tutor turn: one short explanation, one board move, and one question for you to answer.'
  }

  if (firstTool === 'student_check_question') {
    const check = outputs.find(
      (output): output is { question?: string } =>
        Boolean(output && typeof output === 'object' && 'question' in output)
    )
    return check?.question
      ? `Let me check one thing before we move on: ${check.question}`
      : 'Let me ask one quick check question before we move on.'
  }

  if (firstTool === 'solve_linear_on_canvas') {
    return 'I wrote the next algebra steps on the board. Before going further, check which operation undoes the last change.'
  }

  if (firstTool === 'percent_bar') {
    return 'I drew a percent bar so the part and whole are visible. Use the shaded part to explain the percent before jumping to the answer.'
  }

  if (firstTool === 'double_number_line' || firstTool === 'unit_rate') {
    return 'I set up the rate visually. Look for the value per 1 unit first, then scale from there.'
  }

  if (firstTool === 'integer_operation_scene') {
    return 'I put the signed integer move on the number line. Say which direction the change moves before we decide the answer.'
  }

  if (firstTool.includes('fraction') || firstTool === 'common_denominator') {
    return 'I added a fraction visual or checked fraction step on the board. Focus on the size of the parts before calculating.'
  }

  const summary = outputs
    .map((output) => {
      if (!output || typeof output !== 'object') return null
      const record = output as Record<string, unknown>
      if (typeof record.summary === 'string') return record.summary
      if (typeof record.suggestedQuestion === 'string') return record.suggestedQuestion
      if (typeof record.reason === 'string') return record.reason
      return null
    })
    .find(Boolean)

  return summary ?? `I used the ${formatToolNameForStudent(firstTool)} tool and put the useful structure on the board. What should we check next?`
}
