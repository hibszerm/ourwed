/**
 * Lightweight PDF metrics for DOCX→PDF POC comparison (Node).
 * Uses pdfjs-dist; no OCR.
 */

import { createRequire } from 'node:module'

export type PdfPageMetrics = {
  pageCount: number
  /** First page media box width/height in PDF points (when available). */
  firstPageWidthPt: number | null
  firstPageHeightPt: number | null
  plainText: string
}

function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export async function extractPdfMetrics(pdfBytes: Uint8Array): Promise<PdfPageMetrics> {
  const require = createRequire(import.meta.url)
  // Legacy build works in Node without Vite worker URL.
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as {
    getDocument: (params: { data: Uint8Array; disableWorker?: boolean }) => {
      promise: Promise<{
        numPages: number
        getPage: (n: number) => Promise<{
          getViewport: (o: { scale: number }) => { width: number; height: number }
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>
        }>
      }>
    }
    GlobalWorkerOptions?: { workerSrc: string }
  }

  if (pdfjs.GlobalWorkerOptions) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
        'pdfjs-dist/legacy/build/pdf.worker.js',
      )
    } catch {
      // disableWorker path below
    }
  }

  const data = new Uint8Array(pdfBytes)
  const loadingTask = pdfjs.getDocument({ data, disableWorker: true })
  const pdf = await loadingTask.promise

  let firstPageWidthPt: number | null = null
  let firstPageHeightPt: number | null = null
  const textParts: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    if (pageNum === 1) {
      const vp = page.getViewport({ scale: 1 })
      firstPageWidthPt = vp.width
      firstPageHeightPt = vp.height
    }
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (item && typeof item.str === 'string' && item.str.trim()) {
        textParts.push(item.str)
      }
    }
    textParts.push('\n')
  }

  return {
    pageCount: pdf.numPages,
    firstPageWidthPt,
    firstPageHeightPt,
    plainText: textParts.join(' '),
  }
}

export function semanticMarkerPresence(
  plainText: string,
  markers: string[],
): { marker: string; present: boolean }[] {
  const hay = normalizeText(plainText)
  return markers
    .map((m) => m.trim())
    .filter(Boolean)
    .map((marker) => ({
      marker,
      present: hay.includes(normalizeText(marker)),
    }))
}

/** A4 in PDF points ≈ 595.28 × 841.89 */
export function approxA4(
  widthPt: number | null,
  heightPt: number | null,
): boolean {
  if (widthPt == null || heightPt == null) return false
  const w = Math.min(widthPt, heightPt)
  const h = Math.max(widthPt, heightPt)
  return Math.abs(w - 595.28) < 20 && Math.abs(h - 841.89) < 20
}
