/**
 * Board Page
 *
 * Dedicated page for the infinite canvas workspace at /board.
 * Provides a full-screen whiteboard where users can:
 * - Draw freehand
 * - Type math expressions (Subphase 2.2)
 * - Import images and PDFs (Subphase 2.3)
 * - Export their work
 *
 * Important: Work is NOT saved automatically. Refreshing the page resets the canvas.
 */

'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
// @ts-expect-error - createShapeId exists at runtime
import { createShapeId } from 'tldraw'
import Canvas, { type CanvasRef } from '@/components/Canvas'
import CanvasToolbar from '@/components/CanvasToolbar'
import { MathBlockShapeUtil } from '@/components/MathBlockShape'
import MathEditor from '@/components/MathEditor'

export default function BoardPage() {
  const canvasRef = useRef<CanvasRef>(null)
  const [editor, setEditor] = useState<ReturnType<CanvasRef['getEditor']> | null>(null)
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

        // Listen for math-block edit (fired from MathBlockShapeUtil.onDoubleClick)
        const handleMathBlockEdit = (shape: { id: string; type?: string; props?: { latex?: string; displayMode?: boolean } }) => {
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
    // Check periodically until editor is available
    const interval = setInterval(updateEditor, 100)
    updateEditor()
    return () => clearInterval(interval)
  }, [editor])

  /**
   * Handle export request
   */
  const handleExport = async (format: 'png' | 'pdf' | 'board') => {
    if (!canvasRef.current) return

    try {
      let blob: Blob | null = null
      let filename = ''
      let mimeType = ''

      if (format === 'png') {
        blob = await canvasRef.current.exportPNG()
        filename = `board-${Date.now()}.png`
        mimeType = 'image/png'
      } else if (format === 'pdf') {
        blob = await canvasRef.current.exportPDF()
        filename = `board-${Date.now()}.pdf`
        mimeType = 'application/pdf'
      } else if (format === 'board') {
        const json = canvasRef.current.exportBoard()
        if (!json) return
        blob = new Blob([json], { type: 'application/json' })
        filename = `board-${Date.now()}.tldr`
        mimeType = 'application/json'
      }

      if (!blob) {
        alert('Export failed. Please try again.')
        return
      }

      // Trigger download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#F2F5F4]">
      {/* Header with warning banner */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Your work is not saved automatically. Export
            your board before refreshing or closing the page.
          </p>
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <CanvasToolbar
        editor={editor}
        exportEnabled={false}
        onMathBlockClick={() => {
          if (editor) {
            // Get viewport center to place math block
            const viewportCenter = editor.getViewportScreenCenter()
            const pagePoint = editor.screenToPage(viewportCenter)

            // Create a new math block
            const id = createShapeId()
            editor.createShape({
              id,
              type: 'math-block',
              x: pagePoint.x - 100, // Center the block
              y: pagePoint.y - 25,
              props: {
                latex: '',
                displayMode: false,
                w: 200,
                h: 50,
              },
            })

            // Select and edit the new shape
            editor.setSelectedShapes([id])
            const shape = editor.getShape(id)
            if (shape && shape.type === 'math-block') {
              const props = shape.props as {
                latex: string
                displayMode: boolean
              }
              setEditingShape({
                id: shape.id,
                latex: props.latex || '',
                displayMode: props.displayMode || false,
              })
            }
          }
        }}
      />

      {/* Canvas - fills remaining space */}
      <div className="flex-1 relative">
        <Canvas
          ref={canvasRef}
          shapeUtils={[MathBlockShapeUtil]}
        />
      </div>

      {/* Math Editor Modal */}
      {editingShape && (
        <MathEditor
          initialLatex={editingShape.latex}
          initialDisplayMode={editingShape.displayMode}
          onSave={(latex, displayMode) => {
            if (editor) {
              editor.updateShape({
                id: editingShape.id,
                type: 'math-block',
                props: {
                  latex,
                  displayMode,
                },
              })
            }
            setEditingShape(null)
          }}
          onCancel={() => setEditingShape(null)}
        />
      )}
    </div>
  )
}
