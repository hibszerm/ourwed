/**
 * PDFShift renderer via Supabase Edge Function `pdf-render`.
 * Browser / authenticated client only — never calls PDFShift with the API key.
 */

import { supabase } from '@/lib/supabase'
import type {
  PdfHtmlRenderer,
  RenderHtmlToPdfInput,
  RenderHtmlToPdfResult,
} from './pdfRenderer'

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function createPdfShiftEdgeRenderer(): PdfHtmlRenderer {
  return {
    id: 'pdfShift',
    async renderHtmlToPdf(
      input: RenderHtmlToPdfInput,
    ): Promise<RenderHtmlToPdfResult> {
      const { data, error } = await supabase.functions.invoke('pdf-render', {
        body: {
          html: input.html,
          filename: input.filename,
          footerHtml: input.footerHtml,
          headerHtml: input.headerHtml,
          documentType: input.documentType,
          // Production callers pass false; default false here too.
          sandbox: input.sandbox === true,
        },
      })
      if (error) {
        throw new Error(error.message || 'Nie udało się przygotować PDF.')
      }
      const json = data as {
        ok?: boolean
        pdfBase64?: string
        provider?: string
        sandbox?: boolean
        error?: { code?: string; message?: string }
      }
      if (!json?.ok || !json.pdfBase64) {
        const code = json?.error?.code
        const msg = json?.error?.message || 'Nie udało się przygotować PDF.'
        throw new Error(code ? `${code}: ${msg}` : msg)
      }
      return {
        pdfBytes: base64ToBytes(json.pdfBase64),
        provider: 'pdfshift',
        sandbox: json.sandbox,
      }
    },
  }
}
