/**
 * MathBlockShape Component
 *
 * Custom tldraw shape for rendering mathematical expressions using LaTeX.
 * This shape stores LaTeX source code and renders it using KaTeX.
 *
 * Features:
 * - Stores LaTeX source (not rendered HTML) for editing and export
 * - Supports both inline and display math modes
 * - Double-click to edit
 * - Draggable and resizable
 */

// @ts-nocheck - tldraw types are incomplete, but exports work at runtime
'use client'

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type ShapeProps,
  T,
  type RecordProps,
} from 'tldraw'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { stripLatexDelimiters } from '@/lib/mathParser'

const MATH_BLOCK_TYPE = 'math-block' as const

// Type definition for our math block shape
type MathBlockShape = {
  type: typeof MATH_BLOCK_TYPE
  props: {
    latex: string
    displayMode: boolean
    w: number
    h: number
  }
}

/**
 * MathBlockShapeUtil - Custom tldraw shape utility for math blocks
 */
export class MathBlockShapeUtil extends BaseBoxShapeUtil<MathBlockShape> {
  static override type = MATH_BLOCK_TYPE

  static override props: RecordProps<MathBlockShape> = {
    w: T.number,
    h: T.number,
    latex: T.string,
    displayMode: T.boolean,
  }

  /**
   * Default properties for a new math block
   */
  getDefaultProps(): MathBlockShape['props'] {
    return {
      w: 200,
      h: 50,
      latex: '',
      displayMode: false,
    }
  }

  /**
   * Render the math block using KaTeX
   */
  component(shape: MathBlockShape) {
    if (!shape?.props) {
      return null
    }
    const { latex, displayMode, w = 200, h = 50 } = shape.props

    // If no LaTeX, show placeholder
    if (!latex.trim()) {
      return (
        <HTMLContainer
          style={{
            width: w,
            height: h,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: 14,
          }}
        >
          Double-click to edit math
        </HTMLContainer>
      )
    }

    // Render LaTeX using KaTeX (strip $ delimiters - KaTeX expects raw LaTeX)
    let renderedHTML = ''
    try {
      const rawLatex = stripLatexDelimiters(latex)
      renderedHTML = katex.renderToString(rawLatex, {
        throwOnError: false,
        displayMode,
        output: 'html',
      })
    } catch (err) {
      // If rendering fails, show error message
      renderedHTML = `<span style="color: red;">Error rendering math</span>`
    }

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: displayMode ? 'center' : 'flex-start',
          padding: '8px',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: renderedHTML }}
      />
    )
  }

  /**
   * Selection indicator (blue outline when selected)
   */
  indicator(shape: MathBlockShape) {
    const w = shape?.props?.w ?? 200
    const h = shape?.props?.h ?? 50
    return (
      <rect
        width={w}
        height={h}
        rx={4}
        strokeWidth={2}
      />
    )
  }

  /**
   * Allow editing (double-click to edit)
   */
  override canEdit() {
    return true
  }

  /**
   * Handle double-click: emit custom event for our modal editor.
   * Return a no-op change to prevent tldraw's default editing (we use our own modal).
   */
  override onDoubleClick(shape: MathBlockShape) {
    this.editor.emit('lemma:math-block-edit', shape)
    // Return no-op to prevent tldraw's built-in editing
    return { id: shape.id, type: 'math-block' as const }
  }

  /**
   * Allow resizing
   */
  override canResize() {
    return true
  }

  /**
   * Don't lock aspect ratio (allow free resizing)
   */
  override isAspectRatioLocked() {
    return false
  }
}
