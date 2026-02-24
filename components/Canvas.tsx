/**
 * Canvas Component
 *
 * Reusable tldraw canvas component that provides an infinite whiteboard.
 * Supports drawing, erasing, selecting, and custom shapes (math blocks, images).
 * No persistence - all state is in-memory and lost on refresh.
 *
 * This component wraps tldraw's Tldraw component and configures it for our use case:
 * - Infinite pan and zoom
 * - Drawing tools (pen, eraser)
 * - Selection and manipulation
 * - Custom shapes (math blocks added in Subphase 2.2)
 * - Image/PDF import (added in Subphase 2.3)
 */

'use client'

import { useRef, forwardRef, useImperativeHandle } from 'react'
// @ts-expect-error - Tldraw and Editor are exported at runtime but TypeScript definitions may be incomplete
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'

export interface CanvasProps {
  /** Optional callback when export is requested */
  onExport?: (format: 'png' | 'pdf' | 'board') => void
  /** Whether canvas is read-only */
  readOnly?: boolean
  /** Custom shape utilities (e.g. MathBlockShape) */
  shapeUtils?: any[]
}

export interface CanvasRef {
  /** Export canvas as PNG */
  exportPNG: () => Promise<Blob | null>
  /** Export canvas as PDF */
  exportPDF: () => Promise<Blob | null>
  /** Export canvas as board file (JSON) */
  exportBoard: () => string | null
  /** Get editor instance */
  getEditor: () => Editor | null
  /** Capture visible viewport as base64 PNG for Realtime API (scale 1 for cost) */
  captureViewport: () => Promise<string | null>
}

/**
 * Canvas component - infinite whiteboard using tldraw
 * Uses forwardRef to expose export functions to parent components
 */
const Canvas = forwardRef<CanvasRef, CanvasProps>(
  ({ onExport, readOnly = false, shapeUtils = [] }, ref) => {
    const editorRef = useRef<Editor | null>(null)

    /**
     * Handle editor mount - store reference for export functions
     */
    const handleMount = (editor: Editor) => {
      editorRef.current = editor
    }

    /**
     * Expose export functions and editor via ref
     */
    useImperativeHandle(ref, () => ({
      async exportPNG() {
        const editor = editorRef.current
        if (!editor) return null
        try {
          const shapeIds = editor.getCurrentPageShapeIds()
          if (shapeIds.size === 0) return null
          const result = await editor.toImage([...shapeIds], {
            format: 'png',
            scale: 2,
          })
          return result?.blob || null
        } catch (err) {
          console.error('PNG export error:', err)
          return null
        }
      },
      async exportPDF() {
        // PDF export: tldraw doesn't support PDF directly, so we'll convert PNG to PDF
        // For now, return PNG blob - will implement PDF conversion in Subphase 2.3
        const editor = editorRef.current
        if (!editor) return null
        try {
          const shapeIds = editor.getCurrentPageShapeIds()
          if (shapeIds.size === 0) return null
          const result = await editor.toImage([...shapeIds], {
            format: 'png',
            scale: 2,
          })
          return result?.blob || null
        } catch (err) {
          console.error('PDF export error:', err)
          return null
        }
      },
      exportBoard() {
        const editor = editorRef.current
        if (!editor) return null
        try {
          const records = editor.store.allRecords()
          return JSON.stringify(records, null, 2)
        } catch (err) {
          console.error('Board export error:', err)
          return null
        }
      },
      getEditor() {
        return editorRef.current
      },
      async captureViewport() {
        const editor = editorRef.current
        if (!editor) return null
        try {
          const shapeIds = editor.getCurrentPageShapeIds()
          if (shapeIds.size === 0) return null
          const result = await editor.toImage([...shapeIds], {
            format: 'png',
            scale: 1,
          })
          const blob = result?.blob
          if (!blob) return null
          return new Promise<string | null>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const dataUrl = reader.result as string
              const base64 = dataUrl?.split(',')[1] ?? null
              resolve(base64)
            }
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
        } catch (err) {
          console.error('Viewport capture error:', err)
          return null
        }
      },
    }))

    return (
      <div className="w-full h-full">
        <Tldraw
          onMount={handleMount}
          shapeUtils={shapeUtils}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
          // Disable persistence - no autosave (Phase 2 requirement)
          // Omit persistenceKey to disable autosave
        />
      </div>
    )
  }
)

Canvas.displayName = 'Canvas'

export default Canvas
