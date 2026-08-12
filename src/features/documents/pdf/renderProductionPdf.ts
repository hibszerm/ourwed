/**
 * Production HTML→PDF boundary (PDFShift via Edge `pdf-render`).
 * Never calls localhost / Gotenberg from production builds.
 */

import { createPdfShiftEdgeRenderer } from '@/features/documents/pdf/pdfShiftEdgeRenderer'
import { mapPdfRenderErrorForUser } from '@/features/documents/pdf/pdfRenderErrors'
import type { RenderHtmlToPdfInput } from '@/features/documents/pdf/pdfRenderer'

export {
  mapPdfRenderErrorForUser,
  PDF_RENDER_GENERIC_MESSAGE,
  PDF_RENDER_LIMIT_REACHED_MESSAGE,
  PDF_RENDER_PRO_REQUIRED_MESSAGE,
} from '@/features/documents/pdf/pdfRenderErrors'

/**
 * Canonical production HTML→PDF. Always Edge `pdf-render` + PDFShift.
 * sandbox is always false (no watermark in product).
 */
export async function renderProductionHtmlToPdf(
  input: Omit<RenderHtmlToPdfInput, 'sandbox'> & {
    documentType: 'brief' | 'contract' | 'other'
  },
): Promise<ArrayBuffer> {
  const renderer = createPdfShiftEdgeRenderer()
  try {
    const result = await renderer.renderHtmlToPdf({
      ...input,
      sandbox: false,
    })
    return result.pdfBytes.buffer.slice(
      result.pdfBytes.byteOffset,
      result.pdfBytes.byteOffset + result.pdfBytes.byteLength,
    ) as ArrayBuffer
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    throw new Error(mapPdfRenderErrorForUser(raw), { cause: e })
  }
}
