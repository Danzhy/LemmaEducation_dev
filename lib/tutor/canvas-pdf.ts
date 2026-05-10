'use client'

import { jsPDF } from 'jspdf'
import { Box, Vec, type Editor } from '@tldraw/editor'
import { AssetRecordType, createShapeId, type TLAsset, type TLShapeId } from '@tldraw/tlschema'

export const MAX_CANVAS_PDF_BYTES = 10_000_000
export const MAX_CANVAS_PDF_PAGES = 8

export type RenderedCanvasPdfPage = {
  pageNumber: number
  dataUrl: string
  width: number
  height: number
}

export type CanvasPdfTextContext = {
  fileName: string
  text: string
  pagesRead: number
  totalPages: number
}

export type CanvasPdfPlacementResult = {
  pageCount: number
  shapeIds: string[]
}

const MAX_CANVAS_PDF_TEXT_BYTES = 2_500_000
const MAX_CANVAS_PDF_META_EXCERPT_CHARS = 900
const CANVAS_PDF_EXPORT_PADDING = 48
const CANVAS_PDF_EXPORT_MAX_PAGES = 12
const A4_PORTRAIT_WIDTH_PT = 595.28
const A4_PORTRAIT_HEIGHT_PT = 841.89

function dataUrlByteLength(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
  return Math.ceil((base64.length * 3) / 4)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read canvas image.'))
    reader.readAsDataURL(blob)
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export async function extractPdfTextContextForCanvas(
  file: File
): Promise<CanvasPdfTextContext | null> {
  if (file.size > MAX_CANVAS_PDF_TEXT_BYTES) return null

  const dataBase64 = arrayBufferToBase64(await file.arrayBuffer())
  const response = await fetch('/api/curriculum/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: 'application/pdf',
      dataBase64,
    }),
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok || !body?.ok || typeof body.text !== 'string' || !body.text.trim()) {
    return null
  }

  return {
    fileName: typeof body.fileName === 'string' ? body.fileName : file.name,
    text: body.text,
    pagesRead: typeof body.pagesRead === 'number' ? body.pagesRead : 0,
    totalPages: typeof body.totalPages === 'number' ? body.totalPages : 0,
  }
}

export async function renderPdfPagesForCanvas(file: File): Promise<RenderedCanvasPdfPage[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    throw new Error('Choose a PDF file to place on the board.')
  }

  if (file.size > MAX_CANVAS_PDF_BYTES) {
    throw new Error('Use a PDF under 10 MB for board import.')
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
  } as Parameters<typeof pdfjs.getDocument>[0] & { disableWorker: boolean })
  const pdf = await loadingTask.promise

  try {
    const pagesToRender = Math.min(pdf.numPages, MAX_CANVAS_PDF_PAGES)
    const pages: RenderedCanvasPdfPage[] = []

    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.65 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const canvasContext = canvas.getContext('2d')

      if (!canvasContext) {
        throw new Error('Could not prepare a canvas for this PDF.')
      }

      await page.render({ canvas, canvasContext, viewport }).promise
      pages.push({
        pageNumber,
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      })
    }

    return pages
  } finally {
    await pdf.destroy()
  }
}

export function placeRenderedPdfPagesOnCanvas(
  editor: Editor,
  pages: RenderedCanvasPdfPage[],
  fileName: string,
  textContext?: CanvasPdfTextContext | null
): CanvasPdfPlacementResult {
  if (pages.length === 0) {
    throw new Error('This PDF did not contain any pages to place.')
  }

  const viewportBounds = editor.getViewportPageBounds()
  const maxPageWidth = Math.min(760, Math.max(360, viewportBounds.w * 0.72))
  const startPoint = new Vec(
    viewportBounds.x + Math.max(48, viewportBounds.w * 0.08),
    viewportBounds.y + Math.max(48, viewportBounds.h * 0.08)
  )
  const assets: TLAsset[] = []
  const shapes: Array<{
    id: TLShapeId
    type: 'image'
    x: number
    y: number
    opacity: number
    props: {
      assetId: TLAsset['id']
      w: number
      h: number
      altText: string
    }
    meta: {
      lemmaPdfPage: boolean
      sourceFileName: string
      pageNumber: number
    }
  }> = []

  let currentY = startPoint.y
  const textExcerpt = textContext?.text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CANVAS_PDF_META_EXCERPT_CHARS)

  pages.forEach((page) => {
    const scale = Math.min(1, maxPageWidth / page.width)
    const width = Math.round(page.width * scale)
    const height = Math.round(page.height * scale)
    const asset = AssetRecordType.create({
      id: AssetRecordType.createId(`lemma-pdf-${Date.now()}-${page.pageNumber}`),
      type: 'image',
      props: {
        name: `${fileName} page ${page.pageNumber}`,
        src: page.dataUrl,
        w: width,
        h: height,
        fileSize: dataUrlByteLength(page.dataUrl),
        mimeType: 'image/png',
        isAnimated: false,
      },
      meta: {
        source: 'lemma-pdf-import',
        sourceFileName: fileName,
        pageNumber: page.pageNumber,
        ...(textExcerpt && page.pageNumber === 1
          ? {
              sourceDocumentTextExcerpt: textExcerpt,
              sourceDocumentPagesRead: textContext?.pagesRead ?? 0,
              sourceDocumentTotalPages: textContext?.totalPages ?? pages.length,
            }
          : {}),
      },
    })
    const id = createShapeId()

    assets.push(asset)
    shapes.push({
      id,
      type: 'image',
      x: startPoint.x,
      y: currentY,
      opacity: 1,
      props: {
        assetId: asset.id,
        w: width,
        h: height,
        altText: `${fileName}, page ${page.pageNumber}`,
      },
      meta: {
        lemmaPdfPage: true,
        sourceFileName: fileName,
        pageNumber: page.pageNumber,
        ...(textExcerpt && page.pageNumber === 1
          ? {
              sourceDocumentTextExcerpt: textExcerpt,
              sourceDocumentPagesRead: textContext?.pagesRead ?? 0,
              sourceDocumentTotalPages: textContext?.totalPages ?? pages.length,
            }
          : {}),
      },
    })
    currentY += height + 40
  })

  editor.run(() => {
    editor.createAssets(assets)
    editor.createShapes(shapes)
    editor.setSelectedShapes(shapes.map((shape) => shape.id))
    const selectionBounds = editor.getSelectionPageBounds()
    if (selectionBounds) {
      editor.zoomToBounds(selectionBounds, {
        animation: { duration: 260 },
      })
    }
  })

  return {
    pageCount: pages.length,
    shapeIds: shapes.map((shape) => shape.id),
  }
}

function getBoardContentBounds(editor: Editor, shapeIds: TLShapeId[]) {
  const boxes = shapeIds
    .map((shapeId) => editor.getShapePageBounds(shapeId))
    .filter((box): box is Box => Boolean(box))

  if (boxes.length === 0) return null

  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.w))
  const maxY = Math.max(...boxes.map((box) => box.y + box.h))

  return new Box(
    minX - CANVAS_PDF_EXPORT_PADDING,
    minY - CANVAS_PDF_EXPORT_PADDING,
    Math.max(1, maxX - minX + CANVAS_PDF_EXPORT_PADDING * 2),
    Math.max(1, maxY - minY + CANVAS_PDF_EXPORT_PADDING * 2)
  )
}

export function createCanvasPdfExportSlices(bounds: Box) {
  const pageRatio = A4_PORTRAIT_HEIGHT_PT / A4_PORTRAIT_WIDTH_PT
  const targetSliceHeight = Math.max(360, bounds.w * pageRatio)

  if (bounds.h <= targetSliceHeight * 1.12) {
    return [Box.From(bounds)]
  }

  const slices: Box[] = []
  let currentY = bounds.y
  const maxY = bounds.y + bounds.h

  while (currentY < maxY && slices.length < CANVAS_PDF_EXPORT_MAX_PAGES) {
    const remainingHeight = maxY - currentY
    const sliceHeight = Math.min(targetSliceHeight, remainingHeight)
    slices.push(new Box(bounds.x, currentY, bounds.w, sliceHeight))
    currentY += sliceHeight
  }

  if (currentY < maxY && slices.length > 0) {
    const last = slices[slices.length - 1]
    slices[slices.length - 1] = new Box(last.x, last.y, last.w, maxY - last.y)
  }

  if (slices.length > 1) {
    const last = slices[slices.length - 1]
    const previous = slices[slices.length - 2]
    if (last.h < targetSliceHeight * 0.24) {
      slices[slices.length - 2] = new Box(previous.x, previous.y, previous.w, previous.h + last.h)
      slices.pop()
    }
  }

  return slices
}

export async function downloadCanvasAsPdf(editor: Editor, fileName = `lemma-board-${Date.now()}.pdf`) {
  const shapeIds = [...editor.getCurrentPageShapeIds()]
  if (shapeIds.length === 0) {
    throw new Error('Add something to the board before exporting.')
  }

  const exportBounds = getBoardContentBounds(editor, shapeIds)
  if (!exportBounds) {
    throw new Error('Could not find board content to export.')
  }

  const slices = createCanvasPdfExportSlices(exportBounds)
  if (slices.length === 0) {
    throw new Error('Could not prepare the board for export.')
  }

  const firstOrientation = slices[0].w > slices[0].h ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation: firstOrientation, unit: 'pt', format: 'a4' })

  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index]
    const orientation = slice.w > slice.h ? 'landscape' : 'portrait'

    if (index > 0) {
      pdf.addPage('a4', orientation)
    }

    const imageResult = await editor.toImage(shapeIds, {
      bounds: slice,
      background: true,
      format: 'png',
      padding: 0,
      scale: 1,
      pixelRatio: 2,
    })

    if (!imageResult?.blob) {
      throw new Error('Could not render the board for export.')
    }

    const dataUrl = await blobToDataUrl(imageResult.blob)
    const width = imageResult.width || slice.w
    const height = imageResult.height || slice.h
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 28
    const fitScale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height)
    const renderedWidth = width * fitScale
    const renderedHeight = height * fitScale
    const x = (pageWidth - renderedWidth) / 2
    const y = (pageHeight - renderedHeight) / 2

    pdf.addImage(dataUrl, 'PNG', x, y, renderedWidth, renderedHeight)
  }

  pdf.save(fileName)
}
