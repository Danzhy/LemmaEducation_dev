/**
 * Math Parser
 *
 * Converts user-friendly math notation to LaTeX format.
 * Automatically recognizes common patterns like:
 * - x^2 → $x^{2}$
 * - x_2 → $x_{2}$
 * - x^2 + y^2 → $x^{2} + y^{2}$
 * - \frac{a}{b} → already LaTeX, pass through
 *
 * This enables users to type math naturally without needing to know LaTeX syntax.
 */

/**
 * Converts user-friendly math notation to LaTeX format.
 *
 * @param input - User input (e.g., "x^2 + y^2")
 * @returns LaTeX-formatted string wrapped in $...$ (e.g., "$x^{2} + y^{2}$")
 *
 * @example
 * convertToLaTeX("x^2") // Returns "$x^{2}$"
 * convertToLaTeX("x_2") // Returns "$x_{2}$"
 * convertToLaTeX("x^2 + y^2") // Returns "$x^{2} + y^{2}$"
 * convertToLaTeX("\\frac{a}{b}") // Returns "$\\frac{a}{b}$" (already LaTeX)
 */
export function convertToLaTeX(input: string): string {
  if (!input.trim()) return ''

  // Check if input is already wrapped in LaTeX delimiters
  const trimmed = input.trim()
  const hasLaTeXDelimiters =
    trimmed.startsWith('$') ||
    trimmed.startsWith('\\(') ||
    trimmed.startsWith('\\[')

  // Remove existing delimiters for processing
  let processed = trimmed
  if (hasLaTeXDelimiters) {
    processed = trimmed
      .replace(/^\$|\$$/g, '')
      .replace(/^\\\(|\\\)$/g, '')
      .replace(/^\\\[|\\\]$/g, '')
  }

  // Convert superscripts: x^2 → x^{2}, x^23 → x^{23}
  // Pattern: word or number followed by ^ followed by digits or word
  processed = processed.replace(
    /(\w+)\^(\d+|\w+)/g,
    (match, base, exponent) => {
      // If exponent is multi-character, wrap in braces
      if (exponent.length > 1 || /\d/.test(exponent)) {
        return `${base}^{${exponent}}`
      }
      return `${base}^{${exponent}}`
    }
  )

  // Convert subscripts: x_2 → x_{2}, x_i → x_{i}
  // Pattern: word or number followed by _ followed by digits or word
  processed = processed.replace(
    /(\w+)_(\d+|\w+)/g,
    (match, base, subscript) => {
      // If subscript is multi-character, wrap in braces
      if (subscript.length > 1 || /\d/.test(subscript)) {
        return `${base}_{${subscript}}`
      }
      return `${base}_{${subscript}}`
    }
  )

  // Wrap in $ delimiters if not already wrapped
  if (!hasLaTeXDelimiters) {
    return `$${processed}$`
  }

  return `$${processed}$`
}

/**
 * Strips LaTeX delimiters ($, \(, \), \[, \]) for KaTeX rendering.
 * KaTeX renderToString expects raw LaTeX content without delimiters.
 *
 * @param latex - LaTeX string possibly wrapped in $...$ or \(...\) or \[...\]
 * @returns Raw LaTeX content for KaTeX
 */
export function stripLatexDelimiters(latex: string): string {
  const trimmed = latex.trim()
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    return trimmed.slice(1, -1).trim()
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return trimmed.slice(2, -2).trim()
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return trimmed.slice(2, -2).trim()
  }
  return trimmed
}

/**
 * Checks if a string contains math notation that should be converted.
 *
 * @param input - User input to check
 * @returns true if input contains ^ or _ patterns
 */
export function containsMathNotation(input: string): boolean {
  return /[\^_]/.test(input)
}
