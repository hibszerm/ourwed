/**
 * Convert Wedding Brief HTML → PDF (production: PDFShift via Edge `pdf-render`).
 * Does not use localhost or Gotenberg in product builds.
 */

import { renderProductionHtmlToPdf } from '@/features/documents/pdf/renderProductionPdf'

export async function convertWeddingBriefHtmlToPdf(input: {
  html: string
  filename: string
  footerHtml?: string
}): Promise<ArrayBuffer> {
  return renderProductionHtmlToPdf({
    html: input.html,
    filename: input.filename,
    footerHtml: input.footerHtml,
    documentType: 'brief',
  })
}

export function downloadPdfBytes(bytes: ArrayBuffer, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
