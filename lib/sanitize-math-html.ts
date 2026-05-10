'use client'

import createDOMPurify, { type Config } from 'dompurify'

const MATH_HTML_SANITIZE_OPTIONS: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'],
  FORBID_ATTR: ['src', 'srcdoc', 'href', 'xlink:href', 'formaction'],
} as const

let purifier: ReturnType<typeof createDOMPurify> | null = null

function getPurifier() {
  if (typeof window === 'undefined') return null
  purifier ??= createDOMPurify(window)
  return purifier
}

export function sanitizeMathHtml(html: string) {
  if (!html) return ''
  return getPurifier()?.sanitize(html, MATH_HTML_SANITIZE_OPTIONS) ?? ''
}
