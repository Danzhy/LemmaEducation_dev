/**
 * MathEditor Component
 *
 * Modal/popover editor for editing math blocks.
 * Provides:
 * - Text input with live preview
 * - Automatic conversion of user-friendly notation (x^2) to LaTeX ($x^{2}$)
 * - KaTeX rendering preview
 * - Display mode toggle (inline vs display math)
 * - Save/Cancel buttons
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { convertToLaTeX, stripLatexDelimiters } from '@/lib/mathParser'

export interface MathEditorProps {
  /** Initial LaTeX content */
  initialLatex?: string
  /** Initial display mode */
  initialDisplayMode?: boolean
  /** Callback when user saves */
  onSave: (latex: string, displayMode: boolean) => void
  /** Callback when user cancels */
  onCancel: () => void
}

export default function MathEditor({
  initialLatex = '',
  initialDisplayMode = false,
  onSave,
  onCancel,
}: MathEditorProps) {
  const [input, setInput] = useState(initialLatex.replace(/^\$|\$$/g, ''))
  const [displayMode, setDisplayMode] = useState(initialDisplayMode)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Focus input on mount
   */
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  /**
   * Convert input to LaTeX format
   */
  const latex = convertToLaTeX(input)

  /**
   * Render preview using KaTeX - strip $ delimiters, KaTeX expects raw LaTeX
   * Use local vars only (no setState during render)
   */
  let previewHTML = ''
  let previewError: string | null = null
  try {
    const rawLatex = stripLatexDelimiters(latex)
    previewHTML = rawLatex
      ? katex.renderToString(rawLatex, {
          throwOnError: false,
          displayMode,
          output: 'html',
        })
      : ''
  } catch (err) {
    previewHTML = '<span style="color: red;">Invalid LaTeX</span>'
    previewError = err instanceof Error ? err.message : 'Invalid LaTeX'
  }

  /**
   * Handle save
   */
  const handleSave = () => {
    if (!input.trim()) {
      setSubmitError('Math expression cannot be empty')
      return
    }
    setSubmitError(null)
    onSave(latex, displayMode)
  }

  /**
   * Handle key press (Enter to save, Escape to cancel)
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4 text-[#0F2922]">
          Edit Math Expression
        </h2>

        {/* Input field */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#3F524C] mb-2">
            Math Expression
          </label>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., x^2 + y^2 or \frac{a}{b}"
            className="w-full px-3 py-2 border border-[#A3B8B2] rounded focus:outline-none focus:ring-2 focus:ring-[#16423C] focus:border-transparent"
          />
          <p className="mt-1 text-xs text-[#3F524C]">
            Use ^ for superscripts, _ for subscripts. Press Cmd/Ctrl+Enter to
            save, Esc to cancel.
          </p>
        </div>

        {/* Display mode toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={displayMode}
              onChange={(e) => setDisplayMode(e.target.checked)}
              className="w-4 h-4 text-[#16423C] border-[#A3B8B2] rounded focus:ring-[#16423C]"
            />
            <span className="text-sm text-[#3F524C]">Display mode (centered)</span>
          </label>
        </div>

        {/* Preview */}
        <div className="mb-4 p-4 bg-[#F2F5F4] rounded border border-[#D1DBD7]">
          <p className="text-xs text-[#3F524C] mb-2">Preview:</p>
          <div
            className="min-h-[60px] flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: previewHTML }}
          />
        </div>

        {/* Error message */}
        {(previewError || submitError) && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {previewError || submitError}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#3F524C] bg-transparent border border-[#A3B8B2] rounded hover:bg-[#E6ECE9] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-[#16423C] rounded hover:bg-[#0A2621] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
