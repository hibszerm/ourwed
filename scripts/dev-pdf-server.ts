/**
 * Development-only DOCX → PDF server (Gotenberg).
 * Reuses supabase/functions/docx-to-pdf/gotenbergConvert.ts — same conversion rules.
 * Never included in the Vite production build.
 *
 *   npm run dev:pdf
 *
 * Listens on http://127.0.0.1:54322/docx-to-pdf (override with LOCAL_PDF_LISTEN_PORT).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  convertDocxViaGotenberg,
  convertHtmlViaGotenberg,
  readGotenbergConfig,
  type GotenbergConfig,
} from '../supabase/functions/docx-to-pdf/gotenbergConvert.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.LOCAL_PDF_LISTEN_PORT ?? '54322')
const PATH = '/docx-to-pdf'
const HTML_PATH = '/html-to-pdf'
const MAX_DOCX_BYTES = 25 * 1024 * 1024
const MAX_HTML_CHARS = 4 * 1024 * 1024
const MAX_PDF_BYTES = 40 * 1024 * 1024
const MAX_BODY_BYTES = Math.ceil(MAX_DOCX_BYTES * 1.4) + 64_000
/** Truncate Gotenberg error bodies — never dump full documents. */
const BODY_PREVIEW_LIMIT = 800

const CORS = {
  'Access-Control-Allow-Origin': process.env.LOCAL_PDF_CORS_ORIGIN?.trim() || '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type FailureKind =
  | 'timeout'
  | 'network'
  | 'validation'
  | 'gotenberg_http'
  | 'misconfigured'
  | 'bad_request'
  | 'unknown'

type RequestDiag = {
  gotenbergUrlResolved: boolean
  targetGotenbergUrl: string | null
  gotenbergHttpStatus: number | null
  gotenbergBodyPreview: string | null
  failureKind: FailureKind | null
}

function processEnvGetter() {
  return {
    get(key: string): string | undefined {
      return process.env[key]
    },
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function base64FromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function bytesFromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > limit) {
        reject(new Error('payload_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function previewBytes(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) return '[empty]'
  const magic = new TextDecoder().decode(bytes.subarray(0, 5))
  if (magic === '%PDF-') {
    return `[binary PDF-like body, ${bytes.byteLength} bytes — content omitted]`
  }
  // DOCX / ZIP
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return `[binary ZIP/DOCX-like body, ${bytes.byteLength} bytes — content omitted]`
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(
    bytes.subarray(0, BODY_PREVIEW_LIMIT),
  )
  const truncated =
    bytes.byteLength > BODY_PREVIEW_LIMIT
      ? `${text}…[+${bytes.byteLength - BODY_PREVIEW_LIMIT} bytes]`
      : text
  return truncated.replace(/\u0000/g, '')
}

function classifyError(e: unknown): FailureKind {
  if (!(e instanceof Error)) return 'unknown'
  const msg = e.message
  if (msg === 'timeout' || e.name === 'AbortError') return 'timeout'
  if (msg.startsWith('gotenberg_http_')) return 'gotenberg_http'
  if (
    msg === 'empty_pdf' ||
    msg === 'pdf_too_large' ||
    msg === 'invalid_pdf' ||
    msg === 'invalid_content_type' ||
    msg === 'payload_too_large'
  ) {
    return 'validation'
  }
  if (
    e.name === 'TypeError' ||
    /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|network/i.test(msg)
  ) {
    return 'network'
  }
  return 'unknown'
}

function logFailure(input: {
  label: string
  error: unknown
  diag: RequestDiag
  httpStatus: number
}): void {
  const err = input.error
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack ?? '(no stack)' : '(no stack)'
  console.error(`[dev-pdf] FAILURE ${input.label}`)
  console.error(`[dev-pdf]   message: ${message}`)
  console.error(`[dev-pdf]   kind: ${input.diag.failureKind ?? classifyError(err)}`)
  console.error(
    `[dev-pdf]   GOTENBERG_URL resolved: ${input.diag.gotenbergUrlResolved}`,
  )
  console.error(
    `[dev-pdf]   target Gotenberg URL: ${input.diag.targetGotenbergUrl ?? '(none)'}`,
  )
  console.error(
    `[dev-pdf]   Gotenberg HTTP status: ${input.diag.gotenbergHttpStatus ?? '(n/a)'}`,
  )
  console.error(
    `[dev-pdf]   Gotenberg body preview: ${input.diag.gotenbergBodyPreview ?? '(n/a)'}`,
  )
  console.error(`[dev-pdf]   response HTTP status: ${input.httpStatus}`)
  console.error(`[dev-pdf]   stack:\n${stack}`)
}

function failJson(
  res: ServerResponse,
  status: number,
  message: string,
  details: string,
  code: string,
): void {
  // Development response: surface diagnostics; keep ok/code for existing clients.
  sendJson(res, status, {
    ok: false,
    error: message,
    details,
    // Compat with createGotenbergPdfAdapter (error.message)
    message,
    code,
  })
}

function detailsFromDiag(
  message: string,
  diag: RequestDiag,
  stack?: string,
): string {
  return [
    message,
    `kind=${diag.failureKind ?? 'unknown'}`,
    `GOTENBERG_URL_resolved=${diag.gotenbergUrlResolved}`,
    `target=${diag.targetGotenbergUrl ?? '(none)'}`,
    `gotenberg_http=${diag.gotenbergHttpStatus ?? '(n/a)'}`,
    `gotenberg_body=${diag.gotenbergBodyPreview ?? '(n/a)'}`,
    stack ? `stack=${stack}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function createDiagnosticFetch(diag: RequestDiag): typeof fetch {
  return async (input, init) => {
    try {
      const res = await fetch(input, init)
      diag.gotenbergHttpStatus = res.status
      const buf = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      diag.gotenbergBodyPreview = previewBytes(bytes)
      return new Response(buf, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    } catch (e) {
      diag.failureKind = classifyError(e)
      if (diag.failureKind === 'timeout') {
        diag.gotenbergBodyPreview = '(aborted — timeout)'
      } else if (diag.failureKind === 'network') {
        diag.gotenbergBodyPreview = `(network: ${
          e instanceof Error ? e.message : String(e)
        })`
      }
      throw e
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  const contentLength = req.headers['content-length'] ?? '(none)'

  console.info(
    `[dev-pdf] → ${req.method ?? '?'} ${url.pathname} content-length=${contentLength}`,
  )

  const diag: RequestDiag = {
    gotenbergUrlResolved: false,
    targetGotenbergUrl: null,
    gotenbergHttpStatus: null,
    gotenbergBodyPreview: null,
    failureKind: null,
  }

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      console.info('[dev-pdf] ← 204 OPTIONS')
      return
    }

    if (url.pathname !== PATH && url.pathname !== HTML_PATH) {
      const message = 'Not found'
      diag.failureKind = 'bad_request'
      logFailure({
        label: 'not_found',
        error: new Error(message),
        diag,
        httpStatus: 404,
      })
      failJson(res, 404, message, detailsFromDiag(message, diag), 'not_found')
      return
    }

    if (req.method !== 'POST') {
      const message = 'POST required'
      diag.failureKind = 'bad_request'
      logFailure({
        label: 'method',
        error: new Error(message),
        diag,
        httpStatus: 405,
      })
      failJson(res, 405, message, detailsFromDiag(message, diag), 'bad_request')
      return
    }

    const config: GotenbergConfig = readGotenbergConfig(processEnvGetter())
    const rawGotenberg = process.env.GOTENBERG_URL?.trim() || null
    diag.gotenbergUrlResolved = Boolean(rawGotenberg)
    diag.targetGotenbergUrl = config.ok
      ? url.pathname === HTML_PATH
        ? `${config.url}/forms/chromium/convert/html`
        : `${config.url}/forms/libreoffice/convert`
      : rawGotenberg

    if (!config.ok) {
      diag.failureKind = 'misconfigured'
      const message = config.message
      logFailure({
        label: 'misconfigured',
        error: new Error(message),
        diag,
        httpStatus: 503,
      })
      failJson(
        res,
        503,
        message,
        detailsFromDiag(message, diag),
        'misconfigured',
      )
      return
    }

    if (url.pathname === HTML_PATH) {
      let raw: Buffer
      try {
        raw = await readBody(req, MAX_BODY_BYTES)
      } catch (e) {
        diag.failureKind = 'bad_request'
        const message = 'Nie udało się odczytać body żądania.'
        logFailure({ label: 'read_body_html', error: e, diag, httpStatus: 400 })
        failJson(res, 400, message, detailsFromDiag(message, diag), 'bad_request')
        return
      }

      let body: {
        html?: string
        filename?: string
        footerHtml?: string
        headerHtml?: string
      }
      try {
        body = JSON.parse(raw.toString('utf8')) as typeof body
      } catch (e) {
        diag.failureKind = 'bad_request'
        failJson(res, 400, 'Nieprawidłowy JSON.', detailsFromDiag('json', diag), 'bad_request')
        return
      }

      if (!body.html || typeof body.html !== 'string') {
        failJson(res, 400, 'html wymagane.', detailsFromDiag('missing_html', diag), 'bad_request')
        return
      }
      if (body.html.length > MAX_HTML_CHARS) {
        failJson(res, 413, 'HTML ma niedozwolony rozmiar.', detailsFromDiag('html_too_large', diag), 'payload_too_large')
        return
      }

      try {
        const result = await convertHtmlViaGotenberg({
          html: body.html,
          filename: body.filename,
          footerHtml: body.footerHtml,
          headerHtml: body.headerHtml,
          config,
          maxPdfBytes: MAX_PDF_BYTES,
          fetchImpl: createDiagnosticFetch(diag),
        })
        console.info(
          `[dev-pdf] ← 200 html-to-pdf pdfBytes=${result.pdfBytes.byteLength}`,
        )
        sendJson(res, 200, {
          ok: true,
          pdfBase64: base64FromBytes(result.pdfBytes),
          provider: result.provider,
        })
      } catch (e) {
        diag.failureKind = classifyError(e)
        const status = diag.failureKind === 'timeout' ? 504 : 502
        const errMessage = e instanceof Error ? e.message : String(e)
        logFailure({ label: 'html_convert', error: e, diag, httpStatus: status })
        failJson(
          res,
          status,
          `Nie udało się przygotować briefu PDF. (${errMessage})`,
          detailsFromDiag(errMessage, diag, e instanceof Error ? e.stack : undefined),
          diag.failureKind,
        )
      }
      return
    }

    let raw: Buffer
    try {
      raw = await readBody(req, MAX_BODY_BYTES)
    } catch (e) {
      diag.failureKind =
        e instanceof Error && e.message === 'payload_too_large'
          ? 'validation'
          : 'bad_request'
      const message =
        diag.failureKind === 'validation'
          ? 'Plik DOCX ma niedozwolony rozmiar.'
          : 'Nie udało się odczytać body żądania.'
      const status = diag.failureKind === 'validation' ? 413 : 400
      logFailure({ label: 'read_body', error: e, diag, httpStatus: status })
      failJson(
        res,
        status,
        message,
        detailsFromDiag(
          message,
          diag,
          e instanceof Error ? e.stack : undefined,
        ),
        diag.failureKind === 'validation' ? 'payload_too_large' : 'bad_request',
      )
      return
    }

    let body: { docxBase64?: string; filename?: string; runId?: string }
    try {
      body = JSON.parse(raw.toString('utf8')) as typeof body
    } catch (e) {
      diag.failureKind = 'bad_request'
      const message = 'Nieprawidłowy JSON.'
      logFailure({ label: 'json_parse', error: e, diag, httpStatus: 400 })
      failJson(
        res,
        400,
        message,
        detailsFromDiag(
          message,
          diag,
          e instanceof Error ? e.stack : undefined,
        ),
        'bad_request',
      )
      return
    }

    if (!body.docxBase64 || typeof body.docxBase64 !== 'string') {
      diag.failureKind = 'bad_request'
      const message = 'docxBase64 wymagane.'
      logFailure({
        label: 'missing_docxBase64',
        error: new Error(message),
        diag,
        httpStatus: 400,
      })
      failJson(res, 400, message, detailsFromDiag(message, diag), 'bad_request')
      return
    }

    // Length only — never log the base64 payload.
    console.info(
      `[dev-pdf]   docxBase64 length=${body.docxBase64.length} filename=${body.filename ?? '(default)'} runId=${body.runId ?? '(none)'}`,
    )

    let docxBytes: Uint8Array
    try {
      docxBytes = bytesFromBase64(body.docxBase64)
    } catch (e) {
      diag.failureKind = 'bad_request'
      const message = 'Nieprawidłowy plik DOCX.'
      logFailure({ label: 'base64_decode', error: e, diag, httpStatus: 400 })
      failJson(
        res,
        400,
        message,
        detailsFromDiag(
          message,
          diag,
          e instanceof Error ? e.stack : undefined,
        ),
        'bad_request',
      )
      return
    }

    if (docxBytes.byteLength === 0 || docxBytes.byteLength > MAX_DOCX_BYTES) {
      diag.failureKind = 'validation'
      const message = 'Plik DOCX ma niedozwolony rozmiar.'
      logFailure({
        label: 'docx_size',
        error: new Error(
          `docx_bytes=${docxBytes.byteLength} max=${MAX_DOCX_BYTES}`,
        ),
        diag,
        httpStatus: 400,
      })
      failJson(res, 400, message, detailsFromDiag(message, diag), 'bad_request')
      return
    }

    console.info(
      `[dev-pdf]   decoded DOCX byteLength=${docxBytes.byteLength} → ${diag.targetGotenbergUrl}`,
    )

    try {
      const result = await convertDocxViaGotenberg({
        docxBytes,
        filename: body.filename ?? 'contract.docx',
        config,
        maxPdfBytes: MAX_PDF_BYTES,
        fetchImpl: createDiagnosticFetch(diag),
      })
      console.info(
        `[dev-pdf] ← 200 ok pdfBytes=${result.pdfBytes.byteLength} gotenberg_http=${diag.gotenbergHttpStatus ?? '?'}`,
      )
      sendJson(res, 200, {
        ok: true,
        pdfBase64: base64FromBytes(result.pdfBytes),
        provider: result.provider,
      })
    } catch (e) {
      diag.failureKind = classifyError(e)
      const userMessage =
        'Nie udało się utworzyć testowego PDF. Dokument DOCX jest nadal gotowy i możesz go pobrać.'
      const status =
        diag.failureKind === 'timeout'
          ? 504
          : diag.failureKind === 'misconfigured'
            ? 503
            : 502
      const errMessage = e instanceof Error ? e.message : String(e)
      logFailure({
        label: 'convert',
        error: e,
        diag,
        httpStatus: status,
      })
      failJson(
        res,
        status,
        `${userMessage} (${errMessage})`,
        detailsFromDiag(
          errMessage,
          diag,
          e instanceof Error ? e.stack : undefined,
        ),
        diag.failureKind,
      )
    }
  } catch (e) {
    diag.failureKind = classifyError(e)
    const message = e instanceof Error ? e.message : String(e)
    logFailure({
      label: 'unhandled',
      error: e,
      diag,
      httpStatus: 500,
    })
    if (!res.headersSent) {
      failJson(
        res,
        500,
        message,
        detailsFromDiag(
          message,
          diag,
          e instanceof Error ? e.stack : undefined,
        ),
        'unknown',
      )
    }
  }
})

server.listen(PORT, HOST, () => {
  console.info(
    `[dev-pdf] listening on http://${HOST}:${PORT}${PATH} → Gotenberg ${process.env.GOTENBERG_URL ?? '(unset)'}`,
  )
  console.info(
    `[dev-pdf] ENABLE_EXPERIMENTAL_PDF_EXPORT=${process.env.ENABLE_EXPERIMENTAL_PDF_EXPORT ?? '(unset)'}`,
  )
  if (process.env.ENABLE_EXPERIMENTAL_PDF_EXPORT !== 'true') {
    console.warn(
      '[dev-pdf] ENABLE_EXPERIMENTAL_PDF_EXPORT is not true — conversions will return 503',
    )
  }
  if (!process.env.GOTENBERG_URL?.trim()) {
    console.warn('[dev-pdf] GOTENBERG_URL is unset — conversions will return 503')
  }
})
