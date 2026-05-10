/**
 * EmbeddedBoard Component
 *
 * Self-contained drawing board for embedding in the tutor page.
 * Wraps Canvas, CanvasToolbar, and MathEditor with the same logic as the board page.
 * Renders as a portion of the screen with fixed/min height for scrollable layouts.
 */

'use client'

import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useId, type ChangeEvent } from 'react'
// @ts-expect-error - createShapeId exists at runtime
import { createShapeId } from 'tldraw'
// @ts-expect-error - Editor is exported at runtime but TypeScript definitions may be incomplete
import type { Editor } from 'tldraw'
import Canvas, { type CanvasRef } from '@/components/Canvas'
import CanvasToolbar from '@/components/CanvasToolbar'
import { MathBlockShapeUtil } from '@/components/MathBlockShape'
import MathEditor from '@/components/MathEditor'

export interface EmbeddedBoardRef {
  /** Capture visible viewport as base64 for Realtime API (JPEG, viewport-only) */
  captureViewport: () => Promise<{ base64: string; mimeType: string } | null>
}

export interface EmbeddedBoardProps {
  /** Optional className for layout flexibility */
  className?: string
  /** Called when the tldraw editor is ready (for change detection, etc.) */
  onEditorReady?: (editor: Editor | null) => void
  /** Enables lab-only board PDF import/export controls */
  pdfToolsEnabled?: boolean
}

const EmbeddedBoard = forwardRef<EmbeddedBoardRef, EmbeddedBoardProps>(
  function EmbeddedBoard({ className = '', onEditorReady, pdfToolsEnabled = false }, ref) {
  const canvasRef = useRef<CanvasRef>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const pdfInputId = useId()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [pdfToolStatus, setPdfToolStatus] = useState<string | null>(null)
  const [isPdfToolBusy, setIsPdfToolBusy] = useState(false)

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
    const shapeWidth = 200
    const shapeHeight = 50
    const viewportBounds = editor.getViewportPageBounds()
    const selectedMathShape = editor
      .getSelectedShapes()
      .find((shape: { type?: string }) => shape.type === 'math-block')
    const selectedBounds = selectedMathShape
      ? editor.getShapePageBounds(selectedMathShape.id)
      : null

    const centerX = viewportBounds.x + viewportBounds.w / 2
    const centerY = viewportBounds.y + viewportBounds.h / 2

    const preferredX = selectedBounds
      ? selectedBounds.x + 24
      : centerX - shapeWidth / 2
    const preferredY = selectedBounds
      ? selectedBounds.y + selectedBounds.h + 20
      : centerY - shapeHeight / 2

    const minX = viewportBounds.x
    const minY = viewportBounds.y
    const maxX = Math.max(minX, viewportBounds.x + viewportBounds.w - shapeWidth)
    const maxY = Math.max(minY, viewportBounds.y + viewportBounds.h - shapeHeight)

    const x = Math.min(Math.max(preferredX, minX), maxX)
    const y = Math.min(Math.max(preferredY, minY), maxY)

    const id = createShapeId()
    editor.createShape({
      id,
      type: 'math-block',
      x,
      y,
      props: {
        latex: '',
        displayMode: false,
        w: shapeWidth,
        h: shapeHeight,
      },
    })

    editor.setSelectedShapes([id])
    const createdBounds = editor.getShapePageBounds(id)
    if (createdBounds) {
      const isWithinViewport =
        createdBounds.x >= viewportBounds.x &&
        createdBounds.y >= viewportBounds.y &&
        createdBounds.x + createdBounds.w <= viewportBounds.x + viewportBounds.w &&
        createdBounds.y + createdBounds.h <= viewportBounds.y + viewportBounds.h

      if (!isWithinViewport) {
        editor.zoomToBounds(createdBounds, { animation: { duration: 180 } })
      }
    }

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

  const handlePdfImportClick = () => {
    if (!editor || isPdfToolBusy) return
    pdfInputRef.current?.click()
  }

  const handlePdfImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editor || isPdfToolBusy) return

    setIsPdfToolBusy(true)
    setPdfToolStatus('Placing PDF pages on the board...')
    try {
      const {
        extractPdfTextContextForCanvas,
        placeRenderedPdfPagesOnCanvas,
        renderPdfPagesForCanvas,
        MAX_CANVAS_PDF_PAGES,
      } =
        await import('@/lib/tutor/canvas-pdf')
      const [pages, textContext] = await Promise.all([
        renderPdfPagesForCanvas(file),
        extractPdfTextContextForCanvas(file).catch(() => null),
      ])
      const result = placeRenderedPdfPagesOnCanvas(editor, pages, file.name, textContext)
      const truncatedMessage =
        pages.length === MAX_CANVAS_PDF_PAGES
          ? ` Added the first ${MAX_CANVAS_PDF_PAGES} pages.`
          : ''
      const textMessage = textContext ? ' Text excerpt attached for tutor context.' : ''
      setPdfToolStatus(
        `Added ${result.pageCount} PDF page${result.pageCount === 1 ? '' : 's'} to the board.${truncatedMessage}${textMessage}`
      )
    } catch (err) {
      setPdfToolStatus(err instanceof Error ? err.message : 'Could not add this PDF to the board.')
    } finally {
      setIsPdfToolBusy(false)
    }
  }

  const handlePdfExport = async () => {
    if (!editor || isPdfToolBusy) return

    setIsPdfToolBusy(true)
    setPdfToolStatus('Preparing board PDF...')
    try {
      const { downloadCanvasAsPdf } = await import('@/lib/tutor/canvas-pdf')
      await downloadCanvasAsPdf(editor)
      setPdfToolStatus('Board PDF downloaded.')
    } catch (err) {
      setPdfToolStatus(err instanceof Error ? err.message : 'Could not export the board as a PDF.')
    } finally {
      setIsPdfToolBusy(false)
    }
  }

  return (
    <div
      className={`flex flex-col min-h-0 bg-white rounded-lg border border-[#E6ECE9] overflow-hidden ${className}`}
    >
      <input
        id={pdfInputId}
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handlePdfImportChange}
        disabled={isPdfToolBusy}
        className="sr-only"
        tabIndex={-1}
      />
      <CanvasToolbar
        editor={editor}
        exportEnabled={false}
        pdfToolsEnabled={pdfToolsEnabled}
        pdfToolsBusy={isPdfToolBusy}
        pdfImportInputId={pdfInputId}
        onImportPdf={handlePdfImportClick}
        onExportPdf={handlePdfExport}
        onMathBlockClick={handleMathBlockClick}
      />
      <div className="flex-1 relative min-h-0">
        <Canvas ref={canvasRef} shapeUtils={[MathBlockShapeUtil]} />
        {pdfToolsEnabled && pdfToolStatus ? (
          <div
            role="status"
            className="pointer-events-none absolute bottom-3 left-3 max-w-[min(32rem,calc(100%-1.5rem))] rounded-full border border-[#D5E1DD] bg-white/92 px-3.5 py-2 text-xs text-[#3F524C] shadow-[0_14px_34px_-26px_rgba(15,41,34,0.5)]"
          >
            {pdfToolStatus}
          </div>
        ) : null}
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
