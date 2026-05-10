'use client'

import { jsPDF } from 'jspdf'
import { Vec, type Editor } from '@tldraw/editor'
import { AssetRecordType, createShapeId, type TLAsset, type TLShapeId } from '@tldraw/tlschema'

export const MAX_CANVAS_PDF_BYTES = 10_000_000
export const MAX_CANVAS_PDF_PAGES = 8

export type RenderedCanvasPdfPage = {
  pageNumber: number
  dataUrl: string
  width: number
  height: number
}

export type CanvasPdfPlacementResult = {
  pageCount: number
  shapeIds: string[]
}

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

export async function renderPdfPagesForCanvas(file: File): Promise<RenderedCanvasPdfPage[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    throw new Error('Choose a PDF file to place on the board.')
  }

  if (file.size > MAX_CANVAS_PDF_BYTES) {
    throw new Error('Use a PDF under 10 MB for board import.')
  }

  const pdfjs = await import('pdfjs-dist')
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
  fileName: string
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

export async function downloadCanvasAsPdf(editor: Editor, fileName = `lemma-board-${Date.now()}.pdf`) {
  const shapeIds = [...editor.getCurrentPageShapeIds()]
  if (shapeIds.length === 0) {
    throw new Error('Add something to the board before exporting.')
  }

  const imageResult = await editor.toImage(shapeIds, {
    background: true,
    format: 'png',
    padding: 48,
    scale: 2,
  })

  if (!imageResult?.blob) {
    throw new Error('Could not render the board for export.')
  }

  const dataUrl = await blobToDataUrl(imageResult.blob)
  const width = imageResult.width || 1200
  const height = imageResult.height || 900
  const orientation = width > height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
  })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 32
  const fitScale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height)
  const renderedWidth = width * fitScale
  const renderedHeight = height * fitScale
  const x = (pageWidth - renderedWidth) / 2
  const y = (pageHeight - renderedHeight) / 2

  pdf.addImage(dataUrl, 'PNG', x, y, renderedWidth, renderedHeight)
  pdf.save(fileName)
}
