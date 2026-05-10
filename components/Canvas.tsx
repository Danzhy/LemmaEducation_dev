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
 * - Custom shapes such as math blocks
 * - Image/PDF import through the surrounding board shell
 */

'use client'

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { jsPDF } from 'jspdf'
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
  /** Capture visible viewport as base64 for Realtime API (JPEG, viewport-only, optimized for cost) */
  captureViewport: () => Promise<{ base64: string; mimeType: string } | null>
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function getImageSize(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.width, height: image.height })
    image.onerror = () => reject(new Error('Unable to load exported canvas image.'))
    image.src = dataUrl
  })
}

/**
 * Canvas component - infinite whiteboard using tldraw
 * Uses forwardRef to expose export functions to parent components
 */
const Canvas = forwardRef<CanvasRef, CanvasProps>(
  ({ shapeUtils = [] }, ref) => {
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
        const editor = editorRef.current
        if (!editor) return null
        try {
          const shapeIds = editor.getCurrentPageShapeIds()
          if (shapeIds.size === 0) return null
          const result = await editor.toImage([...shapeIds], {
            format: 'png',
            scale: 2,
          })
          const imageBlob = result?.blob
          if (!imageBlob) return null

          const dataUrl = await blobToDataUrl(imageBlob)
          const { width, height } = await getImageSize(dataUrl)
          const pdf = new jsPDF({
            orientation: width >= height ? 'landscape' : 'portrait',
            unit: 'pt',
            format: 'a4',
          })
          const pageWidth = pdf.internal.pageSize.getWidth()
          const pageHeight = pdf.internal.pageSize.getHeight()
          const margin = 32
          const maxWidth = pageWidth - margin * 2
          const maxHeight = pageHeight - margin * 2
          const scale = Math.min(maxWidth / width, maxHeight / height)
          const drawWidth = width * scale
          const drawHeight = height * scale
          const x = (pageWidth - drawWidth) / 2
          const y = (pageHeight - drawHeight) / 2

          pdf.addImage(dataUrl, 'PNG', x, y, drawWidth, drawHeight)
          return pdf.output('blob')
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
          const viewportBounds = editor.getViewportPageBounds()
          const renderingShapes = editor.getCurrentPageRenderingShapesSorted()
          const shapeIds = renderingShapes.map((s: { id: string }) => s.id)
          if (shapeIds.length === 0) return null
          const result = await editor.toImage(shapeIds, {
            bounds: viewportBounds,
            format: 'jpeg',
            quality: 0.75,
            scale: 0.75,
          })
          const blob = result?.blob
          if (!blob) return null
          return new Promise<{ base64: string; mimeType: string } | null>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const dataUrl = reader.result as string
              const base64 = dataUrl?.split(',')[1] ?? null
              if (base64) {
                resolve({ base64, mimeType: 'image/jpeg' })
              } else {
                resolve(null)
              }
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
