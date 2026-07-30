/**
 * Convert Wedding Brief HTML → PDF via existing local/Edge PDF transport + Gotenberg Chromium.
 */

import {
  getLocalPdfFunctionUrl,
  resolvePdfExportTransport,
} from '@/features/documents/template/gotenbergPdfAdapter'
import { supabase } from '@/lib/supabase'

function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out.buffer
}

function resolveHtmlEndpoint(docxTransportUrl: string): string {
  if (docxTransportUrl.includes('/docx-to-pdf')) {
    return docxTransportUrl.replace(/\/docx-to-pdf\/?$/, '/html-to-pdf')
  }
  return `${docxTransportUrl.replace(/\/$/, '')}/html-to-pdf`
}

export async function convertWeddingBriefHtmlToPdf(input: {
  html: string
  filename: string
  footerHtml?: string
}): Promise<ArrayBuffer> {
  const transport = resolvePdfExportTransport({
    isDev: Boolean(import.meta.env.DEV),
    localUrl: getLocalPdfFunctionUrl(),
  })

  const body = {
    html: input.html,
    filename: input.filename,
    footerHtml: input.footerHtml,
  }

  if (transport.transport === 'local') {
    const endpoint = resolveHtmlEndpoint(transport.url)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      ok?: boolean
      pdfBase64?: string
      error?: string | { message?: string }
      message?: string
    }
    if (!json.ok || !json.pdfBase64) {
      const msg =
        typeof json.error === 'string'
          ? json.error
          : json.error && typeof json.error === 'object'
            ? json.error.message
            : json.message
      throw new Error(msg || 'Nie udało się przygotować briefu PDF.')
    }
    return base64ToBytes(json.pdfBase64)
  }

  const { data, error } = await supabase.functions.invoke('html-to-pdf', {
    body,
  })
  if (error) {
    throw new Error(error.message || 'Nie udało się przygotować briefu PDF.')
  }
  const json = data as { ok?: boolean; pdfBase64?: string; error?: { message?: string } }
  if (!json?.ok || !json.pdfBase64) {
    throw new Error(
      json?.error?.message || 'Nie udało się przygotować briefu PDF.',
    )
  }
  return base64ToBytes(json.pdfBase64)
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
