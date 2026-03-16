/**
 * EmbeddedBoard Component
 *
 * Self-contained drawing board for embedding in the tutor page.
 * Wraps Canvas, CanvasToolbar, and MathEditor with the same logic as the board page.
 * Renders as a portion of the screen with fixed/min height for scrollable layouts.
 */

'use client'

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
// @ts-expect-error - createShapeId exists at runtime
import { createShapeId } from 'tldraw'
// @ts-expect-error - Editor is exported at runtime but TypeScript definitions may be incomplete
import type { Editor } from 'tldraw'
import Canvas, { type CanvasRef } from '@/components/Canvas'
import CanvasToolbar from '@/components/CanvasToolbar'
import { MathBlockShapeUtil } from '@/components/MathBlockShape'
import MathEditor from '@/components/MathEditor'

export interface EmbeddedBoardRef {
  /** Capture visible viewport as base64 PNG for Realtime API */
  captureViewport: () => Promise<string | null>
}

export interface EmbeddedBoardProps {
  /** Optional className for layout flexibility */
  className?: string
  /** Called when the tldraw editor is ready (for change detection, etc.) */
  onEditorReady?: (editor: Editor | null) => void
}

const EmbeddedBoard = forwardRef<EmbeddedBoardRef, EmbeddedBoardProps>(
  function EmbeddedBoard({ className = '', onEditorReady }, ref) {
  const canvasRef = useRef<CanvasRef>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  useImperativeHandle(ref, () => ({
    captureViewport: () => canvasRef.current?.captureViewport() ?? Promise.resolve(null),
  }))
  const [editingShape, setEditingShape] = useState<{
    id: string
    latex: string
    displayMode: boolean
  } | null>(null)

  /**
   * Get editor instance from canvas ref and set up event listeners
   */
  useEffect(() => {
    const updateEditor = () => {
      const editorInstance = canvasRef.current?.getEditor() || null
      if (editorInstance && !editor) {
        setEditor(editorInstance)
        onEditorReady?.(editorInstance)

        const handleMathBlockEdit = (shape: {
          id: string
          type?: string
          props?: { latex?: string; displayMode?: boolean }
        }) => {
          if (!shape || (shape.type && shape.type !== 'math-block')) return
          const props = shape.props ?? {}
          setEditingShape({
            id: shape.id,
            latex: props.latex ?? '',
            displayMode: props.displayMode ?? false,
          })
        }

        editorInstance.on('lemma:math-block-edit', handleMathBlockEdit)
        return () => {
          editorInstance.off('lemma:math-block-edit', handleMathBlockEdit)
        }
      }
    }
    const interval = setInterval(updateEditor, 100)
    updateEditor()
    return () => clearInterval(interval)
  }, [editor])

  const handleMathBlockClick = () => {
    if (!editor) return
    const viewportCenter = editor.getViewportScreenCenter()
    const pagePoint = editor.screenToPage(viewportCenter)

    const id = createShapeId()
    editor.createShape({
      id,
      type: 'math-block',
      x: pagePoint.x - 100,
      y: pagePoint.y - 25,
      props: {
        latex: '',
        displayMode: false,
        w: 200,
        h: 50,
      },
    })

    editor.setSelectedShapes([id])
    const shape = editor.getShape(id)
    if (shape && shape.type === 'math-block') {
      const props = shape.props as { latex: string; displayMode: boolean }
      setEditingShape({
        id: shape.id,
        latex: props.latex || '',
        displayMode: props.displayMode || false,
      })
    }
  }

  return (
    <div
      className={`flex flex-col min-h-0 bg-white rounded-lg border border-[#E6ECE9] overflow-hidden ${className}`}
    >
      <CanvasToolbar
        editor={editor}
        exportEnabled={false}
        onMathBlockClick={handleMathBlockClick}
      />
      <div className="flex-1 relative min-h-0">
        <Canvas ref={canvasRef} shapeUtils={[MathBlockShapeUtil]} />
      </div>

      {editingShape && (
        <MathEditor
          initialLatex={editingShape.latex}
          initialDisplayMode={editingShape.displayMode}
          onSave={(latex, displayMode) => {
            if (editor) {
              editor.updateShape({
                id: editingShape.id,
                type: 'math-block',
                props: { latex, displayMode },
              })
            }
            setEditingShape(null)
          }}
          onCancel={() => setEditingShape(null)}
        />
      )}
    </div>
  )
})

EmbeddedBoard.displayName = 'EmbeddedBoard'

export default EmbeddedBoard
