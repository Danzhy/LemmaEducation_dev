/**
 * FileUpload Component
 *
 * Allows users to upload problems as images (PNG, JPEG, WebP) or PDFs.
 * Images are sent directly as base64. PDFs are converted to PNG (first page only)
 * using pdfjs-dist before being sent to the Realtime API.
 *
 * The Realtime API accepts input_image with data:image/{format};base64,{data}.
 * PDFs are not natively supported, so we render the first page to a canvas
 * and export as PNG.
 */

'use client'

import { useCallback, useRef, useState } from 'react'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const ACCEPTED_PDF_TYPE = 'application/pdf'
const ACCEPT_STRING = 'image/png,image/jpeg,image/webp,application/pdf'
const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf']
const SUPPORTED_FILES_MESSAGE = 'Please upload a PNG, JPG, WEBP image, or a PDF.'

const hasAcceptedExtension = (fileName: string) => {
  const lower = fileName.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

const isAcceptedFile = (file: File) => {
  return (
    ACCEPTED_IMAGE_TYPES.includes(file.type) ||
    file.type === ACCEPTED_PDF_TYPE ||
    (!file.type && hasAcceptedExtension(file.name))
  )
}

/**
 * Converts the first page of a PDF to a PNG image using pdfjs-dist.
 * Uses dynamic import of the main build and CDN worker for Next.js compatibility.
 *
 * @param file - The PDF file from the file input
 * @returns { base64, mimeType } - PNG data ready for onUpload
 */
async function convertPdfFirstPageToImage(
  file: File
): Promise<{ base64: string; mimeType: string }> {
  const pdfjs = await import('pdfjs-dist')
  // Configure worker for browser (webpack.mjs path fails to resolve in Next.js)
  if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise

  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Could not get base64')
  return { base64, mimeType: 'image/png' }
}

interface FileUploadProps {
  onUpload: (base64: string, mimeType: string) => void
  onError?: (message: string) => void
  disabled?: boolean
  className?: string
  variant?: 'default' | 'icon'
}

export default function FileUpload({
  onUpload,
  onError,
  disabled = false,
  className = '',
  variant = 'default',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isConverting, setIsConverting] = useState(false)

  /**
   * Handles the selected file. Images go through FileReader; PDFs through
   * convertPdfFirstPageToImage. Only the first page of PDFs is used
   * (covers most single-page math problems).
   */
  const handleFile = useCallback(
    async (file: File) => {
      if (!isAcceptedFile(file)) {
        onError?.(SUPPORTED_FILES_MESSAGE)
        return
      }

      const isPdf = file.type === ACCEPTED_PDF_TYPE || file.name.toLowerCase().endsWith('.pdf')
      const isImage =
        ACCEPTED_IMAGE_TYPES.includes(file.type) ||
        (!file.type &&
          ['.png', '.jpg', '.jpeg', '.webp'].some((extension) =>
            file.name.toLowerCase().endsWith(extension)
          ))

      if (isImage) {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          if (base64) {
            onUpload(base64, file.type)
          }
        }
        reader.readAsDataURL(file)
        return
      }

      if (isPdf) {
        setIsConverting(true)
        try {
          const { base64, mimeType } = await convertPdfFirstPageToImage(file)
          onUpload(base64, mimeType)
        } catch (err) {
          console.error('PDF conversion error:', err)
          onError?.(
            err instanceof Error ? err.message : 'Failed to convert PDF'
          )
        } finally {
          setIsConverting(false)
        }
      }
    },
    [onUpload, onError]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (file) {
        handleFile(file)
      }
    },
    [handleFile]
  )

  const handleClick = () => {
    if (!disabled && !isConverting) inputRef.current?.click()
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_STRING}
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isConverting}
        aria-label={isConverting ? 'Converting attachment' : 'Attach image or PDF'}
        title={isConverting ? 'Converting attachment' : 'Attach image or PDF'}
        className={
          variant === 'icon'
            ? 'inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#C9D6D1] bg-[#F6FAF8] text-[#3F524C] transition-all hover:-translate-y-0.5 hover:border-[#16423C] hover:text-[#16423C] disabled:cursor-not-allowed disabled:opacity-50'
            : 'inline-flex items-center gap-2 rounded-full border border-[#C9D6D1] bg-white/82 px-4 py-2.5 text-sm text-[#3F524C] shadow-[0_16px_38px_-30px_rgba(15,41,34,0.32)] transition-all hover:-translate-y-0.5 hover:border-[#16423C] hover:text-[#16423C] disabled:cursor-not-allowed disabled:opacity-50'
        }
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16.5 6.5l-6.8 6.8a2.5 2.5 0 103.54 3.54l7.15-7.15a4 4 0 10-5.66-5.66l-7.07 7.07"
          />
        </svg>
        {variant === 'icon' ? null : isConverting ? 'Converting PDF...' : 'Attach image or PDF'}
      </button>
    </div>
  )
}
