/**
 * Gotenberg (LibreOffice) DOCX → PDF conversion.
 * Shared by Supabase Edge Function and the local `npm run dev:pdf` server.
 * Pure helpers — inject env; no Deno/Node globals required at import time.
 */

export type EnvGetter = { get(key: string): string | undefined }

export type GotenbergConfig =
  | {
      ok: true
      url: string
      apiKey: string | null
      timeoutMs: number
    }
  | {
      ok: false
      message: string
    }

export function readGotenbergConfig(env: EnvGetter): GotenbergConfig {
  const enabled =
    env.get('ENABLE_EXPERIMENTAL_PDF_EXPORT')?.trim().toLowerCase() === 'true'
  if (!enabled) {
    return {
      ok: false,
      message:
        'Eksperymentalny eksport PDF jest wyłączony (ENABLE_EXPERIMENTAL_PDF_EXPORT).',
    }
  }
  const url = env.get('GOTENBERG_URL')?.trim().replace(/\/$/, '')
  if (!url) {
    return {
      ok: false,
      message:
        'Eksperymentalny eksport PDF wymaga konfiguracji GOTENBERG_URL.',
    }
  }
  const apiKey = env.get('GOTENBERG_API_KEY')?.trim() || null
  const timeoutRaw = Number(env.get('GOTENBERG_TIMEOUT_MS') ?? '60000')
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 5000 ? timeoutRaw : 60_000
  return { ok: true, url, apiKey, timeoutMs }
}

function safeFileName(name: string): string {
  const base = name.replace(/[^\w.-]+/g, '_').slice(0, 100) || 'contract'
  return base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`
}

export function assertPdfResponse(input: {
  status: number
  contentType: string | null
  bytes: Uint8Array
  maxPdfBytes: number
}): void {
  if (input.status < 200 || input.status >= 300) {
    throw new Error(`gotenberg_http_${input.status}`)
  }
  if (input.bytes.byteLength === 0) {
    throw new Error('empty_pdf')
  }
  if (input.bytes.byteLength > input.maxPdfBytes) {
    throw new Error('pdf_too_large')
  }
  const prefix = new TextDecoder().decode(input.bytes.subarray(0, 5))
  if (prefix !== '%PDF-') {
    throw new Error('invalid_pdf')
  }
  const ct = (input.contentType || '').toLowerCase()
  if (
    ct &&
    !ct.includes('application/pdf') &&
    !ct.includes('application/octet-stream')
  ) {
    throw new Error('invalid_content_type')
  }
}

export async function convertDocxViaGotenberg(input: {
  docxBytes: Uint8Array
  filename: string
  config: Extract<GotenbergConfig, { ok: true }>
  maxPdfBytes: number
  fetchImpl?: typeof fetch
}): Promise<{ pdfBytes: Uint8Array; provider: 'gotenberg_libreoffice' }> {
  const fetchFn = input.fetchImpl ?? fetch
  const form = new FormData()
  const filename = safeFileName(input.filename)
  form.append(
    'files',
    new File([input.docxBytes], filename, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  )

  const headers: Record<string, string> = {}
  if (input.config.apiKey) {
    headers.Authorization = `Bearer ${input.config.apiKey}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.config.timeoutMs)
  let res: Response
  try {
    res = await fetchFn(`${input.config.url}/forms/libreoffice/convert`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('timeout', { cause: e })
    }
    throw e
  } finally {
    clearTimeout(timer)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  assertPdfResponse({
    status: res.status,
    contentType: res.headers.get('content-type'),
    bytes,
    maxPdfBytes: input.maxPdfBytes,
  })

  return { pdfBytes: bytes, provider: 'gotenberg_libreoffice' }
}
