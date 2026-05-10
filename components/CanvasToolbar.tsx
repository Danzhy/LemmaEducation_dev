/**
 * CanvasToolbar Component
 *
 * Toolbar for the canvas page providing:
 * - Tool selection (pointer, pen, hand, eraser, math)
 * - Undo/redo controls
 * - Zoom controls (zoom in, zoom out, fit to screen)
 * - Export controls when enabled by the parent page
 *
 * This toolbar communicates with the Canvas component via the editor instance.
 */

'use client'

import { useState } from 'react'
// @ts-expect-error - Editor is exported at runtime but TypeScript definitions may be incomplete
import type { Editor } from 'tldraw'

export interface CanvasToolbarProps {
  /** tldraw editor instance */
  editor: Editor | null
  /** Callback when export is requested */
  onExport?: (format: 'png' | 'pdf' | 'board') => void
  /** Callback for adding a PDF as board pages */
  onImportPdf?: () => void
  /** File input id used by the Add PDF label */
  pdfImportInputId?: string
  /** Callback for direct board PDF export */
  onExportPdf?: () => void
  /** Whether generic export is enabled */
  exportEnabled?: boolean
  /** Whether lab PDF controls should be shown */
  pdfToolsEnabled?: boolean
  /** Whether lab PDF controls are busy */
  pdfToolsBusy?: boolean
  /** Callback when math block tool is clicked */
  onMathBlockClick?: () => void
}

type Tool = 'select' | 'draw' | 'hand' | 'eraser' | 'math'

export default function CanvasToolbar({
  editor,
  onExport,
  onImportPdf,
  pdfImportInputId,
  onExportPdf,
  exportEnabled = false,
  pdfToolsEnabled = false,
  pdfToolsBusy = false,
  onMathBlockClick,
}: CanvasToolbarProps) {
  const [currentTool, setCurrentTool] = useState<Tool>('select')

  /**
   * Switch to a different tool
   */
  const setTool = (tool: Tool) => {
    if (!editor) return
    setCurrentTool(tool)
    editor.setCurrentTool(tool)
  }

  /**
   * Undo last action
   */
  const handleUndo = () => {
    if (!editor) return
    editor.undo()
  }

  /**
   * Redo last undone action
   */
  const handleRedo = () => {
    if (!editor) return
    editor.redo()
  }

  /**
   * Zoom in
   */
  const handleZoomIn = () => {
    if (!editor) return
    editor.zoomIn()
  }

  /**
   * Zoom out
   */
  const handleZoomOut = () => {
    if (!editor) return
    editor.zoomOut()
  }

  /**
   * Fit canvas to screen
   */
  const handleZoomToFit = () => {
    if (!editor) return
    const bounds = editor.getCurrentPageBounds()
    if (bounds) {
      editor.zoomToBounds(bounds, { animation: { duration: 200 } })
    }
  }

  /**
   * Reset zoom to 100%
   */
  const handleZoomTo100 = () => {
    if (!editor) return
    editor.resetZoom()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white border-b border-[#D1DBD7]">
      {/* Tool selection */}
      <div
        className="flex items-center gap-1 border-r border-[#E6ECE9] pr-3"
        data-tutorial-id="board-tool-group"
      >
        <button
          type="button"
          onClick={() => setTool('select')}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            currentTool === 'select'
              ? 'bg-[#16423C] text-white'
              : 'bg-transparent text-[#3F524C] hover:bg-[#E6ECE9]'
          }`}
          title="Pointer tool"
          data-tutorial-id="board-tool-pointer"
        >
          Pointer
        </button>
        <button
          type="button"
          onClick={() => setTool('draw')}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            currentTool === 'draw'
              ? 'bg-[#16423C] text-white'
              : 'bg-transparent text-[#3F524C] hover:bg-[#E6ECE9]'
          }`}
          title="Pen tool"
          data-tutorial-id="board-tool-pen"
        >
          Pen
        </button>
        <button
          type="button"
          onClick={() => setTool('hand')}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            currentTool === 'hand'
              ? 'bg-[#16423C] text-white'
              : 'bg-transparent text-[#3F524C] hover:bg-[#E6ECE9]'
          }`}
          title="Hand tool"
          data-tutorial-id="board-tool-hand"
        >
          Hand
        </button>
        <button
          type="button"
          onClick={() => setTool('eraser')}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            currentTool === 'eraser'
              ? 'bg-[#16423C] text-white'
              : 'bg-transparent text-[#3F524C] hover:bg-[#E6ECE9]'
          }`}
          title="Eraser tool"
        >
          Eraser
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrentTool('math')
            onMathBlockClick?.()
          }}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            currentTool === 'math'
              ? 'bg-[#16423C] text-white'
              : 'bg-transparent text-[#3F524C] hover:bg-[#E6ECE9]'
          }`}
          title="Math block tool"
          data-tutorial-id="board-tool-math"
        >
          Math
        </button>
      </div>

      {/* Undo/Redo */}
      <div className="flex items-center gap-1 border-r border-[#E6ECE9] pr-3">
        <button
          type="button"
          onClick={handleUndo}
          disabled={!editor || !editor.canUndo()}
          className="px-3 py-1.5 rounded text-sm text-[#3F524C] hover:bg-[#E6ECE9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Undo (Cmd/Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={!editor || !editor.canRedo()}
          className="px-3 py-1.5 rounded text-sm text-[#3F524C] hover:bg-[#E6ECE9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Redo (Cmd/Ctrl+Shift+Z)"
        >
          Redo
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-1 border-r border-[#E6ECE9] pr-3">
        <button
          type="button"
          onClick={handleZoomOut}
          className="px-3 py-1.5 rounded text-sm text-[#3F524C] hover:bg-[#E6ECE9] transition-colors"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleZoomTo100}
          className="px-3 py-1.5 rounded text-sm text-[#3F524C] hover:bg-[#E6ECE9] transition-colors"
          title="Reset zoom"
        >
          100%
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          className="px-3 py-1.5 rounded text-sm text-[#3F524C] hover:bg-[#E6ECE9] transition-colors"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={handleZoomToFit}
          className="px-3 py-1.5 rounded text-sm text-[#3F524C] hover:bg-[#E6ECE9] transition-colors"
          title="Fit to screen"
        >
          Fit
        </button>
      </div>

      {/* Lab PDF controls */}
      {pdfToolsEnabled && (
        <div className="ml-0 flex items-center gap-2 sm:ml-auto">
          {pdfImportInputId ? (
            <label
              htmlFor={pdfImportInputId}
              aria-disabled={pdfToolsBusy}
              className={`rounded-full border border-[#C9D6D1] bg-white px-3 py-1.5 text-xs font-medium text-[#3F524C] transition-colors hover:border-[#16423C] hover:text-[#16423C] ${
                pdfToolsBusy ? 'pointer-events-none cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
            >
              Add PDF
            </label>
          ) : (
            <button
              type="button"
              onClick={onImportPdf}
              disabled={pdfToolsBusy}
              className="rounded-full border border-[#C9D6D1] bg-white px-3 py-1.5 text-xs font-medium text-[#3F524C] transition-colors hover:border-[#16423C] hover:text-[#16423C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add PDF
            </button>
          )}
          <button
            type="button"
            onClick={onExportPdf}
            disabled={!editor || pdfToolsBusy}
            className="rounded-full bg-[#16423C] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0A2621] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export PDF
          </button>
        </div>
      )}

      {/* Generic export button */}
      {exportEnabled && (
        <div className={pdfToolsEnabled ? '' : 'ml-auto'}>
          <button
            type="button"
            onClick={() => onExport?.('png')}
            className="px-4 py-1.5 bg-[#16423C] text-white rounded text-sm font-medium hover:bg-[#0A2621] transition-colors"
          >
            Export
          </button>
        </div>
      )}
    </div>
  )
}
