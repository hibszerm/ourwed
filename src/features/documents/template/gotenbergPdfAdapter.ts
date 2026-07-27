/**
 * Browser client for experimental DOCX→PDF.
 * Never calls Gotenberg directly; never exposes GOTENBERG_* secrets.
 *
 * Dev: when VITE_LOCAL_PDF_FUNCTION_URL is set (and import.meta.env.DEV),
 * POST with plain fetch to that URL (never supabase.functions.invoke).
 * Otherwise: Supabase Edge Function `docx-to-pdf`.
 */

import type { PdfConversionAdapter } from './ContractExportService'
import { isExperimentalPdfExportEnabled } from './experimentalPdfFlags'

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out.buffer
}

const PDF_FAIL_MESSAGE =
  'Nie udało się utworzyć testowego PDF. Dokument DOCX jest nadal gotowy i możesz go pobrać.'

export type PdfExportTransport =
  | { transport: 'local'; url: string }
  | { transport: 'supabase'; functionName: 'docx-to-pdf' }

/**
 * Pure routing decision — unit-testable without Vite.
 * Local fetch only when DEV and local URL are both set.
 */
export function resolvePdfExportTransport(input: {
  isDev: boolean
  localUrl: string | null | undefined
}): PdfExportTransport {
  const url = typeof input.localUrl === 'string' ? input.localUrl.trim() : ''
  if (input.isDev && url.length > 0) {
    return { transport: 'local', url }
  }
  return { transport: 'supabase', functionName: 'docx-to-pdf' }
}

/** Reads Vite env; local URL is only honored in DEV builds. */
export function getLocalPdfFunctionUrl(): string | null {
  const url = import.meta.env.VITE_LOCAL_PDF_FUNCTION_URL?.trim()
  return url || null
}

export function getPdfExportTransport(): PdfExportTransport {
  return resolvePdfExportTransport({
    isDev: Boolean(import.meta.env.DEV),
    localUrl: getLocalPdfFunctionUrl(),
  })
}

async function invokeLocalPdf(input: {
  docxBase64: string
  filename: string
  runId: string
  endpoint: string
}): Promise<ArrayBuffer> {
  console.info(`[pdf-export] transport=local url=${input.endpoint}`)
  const res = await fetch(input.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docxBase64: input.docxBase64,
      filename: input.filename,
      runId: input.runId,
    }),
  })
  type PdfJson = {
    ok?: boolean
    pdfBase64?: string
    error?: string | { message?: string; code?: string }
    details?: string
    message?: string
  }
  let body: PdfJson | null = null
  try {
    body = (await res.json()) as PdfJson
  } catch {
    throw new Error(PDF_FAIL_MESSAGE)
  }
  if (!body?.ok || !body.pdfBase64) {
    const fromError =
      typeof body?.error === 'string'
        ? body.error
        : body?.error && typeof body.error === 'object'
          ? body.error.message
          : undefined
    throw new Error(
      fromError || body?.details || body?.message || PDF_FAIL_MESSAGE,
    )
  }
  return base64ToBytes(body.pdfBase64)
}

async function invokeEdgePdf(input: {
  docxBase64: string
  filename: string
  runId: string
}): Promise<ArrayBuffer> {
  console.info('[pdf-export] transport=supabase function=docx-to-pdf')
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.functions.invoke('docx-to-pdf', {
    body: {
      docxBase64: input.docxBase64,
      filename: input.filename,
      runId: input.runId,
    },
  })
  if (error) throw new Error(PDF_FAIL_MESSAGE)
  const body = data as {
    ok?: boolean
    pdfBase64?: string
    error?: { message?: string }
  } | null
  if (!body?.ok || !body.pdfBase64) {
    throw new Error(body?.error?.message || PDF_FAIL_MESSAGE)
  }
  return base64ToBytes(body.pdfBase64)
}

let didLogInit = false

function logAdapterInitOnce(): void {
  if (didLogInit) return
  if (!import.meta.env.DEV) return
  didLogInit = true
  const localUrl = getLocalPdfFunctionUrl()
  console.info(
    `[pdf-export] DEV=true localUrlConfigured=${Boolean(localUrl)}`,
  )
}

export function createGotenbergPdfAdapter(input?: {
  runId?: string
}): PdfConversionAdapter {
  logAdapterInitOnce()
  return {
    async convertDocx({ docxBytes, fileName }) {
      if (!isExperimentalPdfExportEnabled()) {
        throw new Error('Eksperymentalny eksport PDF jest wyłączony.')
      }
      const payload = {
        docxBase64: bytesToBase64(docxBytes),
        filename: fileName,
        runId: input?.runId ?? `run-${Date.now().toString(36)}`,
      }
      const route = getPdfExportTransport()
      if (route.transport === 'local') {
        // Plain fetch only — never supabase.functions.invoke on this branch.
        return invokeLocalPdf({ ...payload, endpoint: route.url })
      }
      return invokeEdgePdf(payload)
    },
  }
}
