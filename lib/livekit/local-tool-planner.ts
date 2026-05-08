export type LocalToolPlan = {
  toolName: string
  input: Record<string, unknown>
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
    /\b(graph|plot|parabola|function|fraction|percent|decimal|round|linear|equation|solve|ratio|rate|area|perimeter|rectangle|word problem|plan)\b/.test(lower)
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

  if (firstTool === 'tutor_teaching_sequence') {
    return 'I planned this like a tutor turn: one short explanation, one board move, and one question for you to answer.'
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
