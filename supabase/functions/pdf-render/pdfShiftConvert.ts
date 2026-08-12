/**
 * PDFShift HTML→PDF convert helpers (pure — injectable fetch/env).
 * Used by Edge Function `pdf-render` and offline unit tests.
 * Never log or serialize the API key.
 */

export type PdfRenderDomainError =
  | 'PDF_RENDER_PROVIDER_UNAVAILABLE'
  | 'PDF_RENDER_LIMIT_REACHED'
  | 'PDF_RENDER_FAILED'
  | 'PDF_RENDER_TIMEOUT'
  | 'PDF_RENDER_UNAUTHORIZED'
  | 'PDF_RENDER_BAD_REQUEST'
  | 'PDF_RENDER_PRO_REQUIRED'

export type PdfRenderHtmlOptions = {
  /** A4 portrait by default (matches Gotenberg Chromium brief path). */
  format?: 'A4'
  landscape?: boolean
  /** Print backgrounds (Gotenberg printBackground=true). */
  printBackground?: boolean
  /** Margins in inches (same units as Gotenberg Chromium form fields). */
  marginTopIn?: number
  marginRightIn?: number
  marginBottomIn?: number
  marginLeftIn?: number
  headerHtml?: string
  footerHtml?: string
  /** PDFShift sandbox — watermarked, no credit cost. Default true for POC. */
  sandbox?: boolean
  timeoutMs?: number
}

export type PdfShiftConvertResult = {
  pdfBytes: Uint8Array
  provider: 'pdfshift'
  sandbox: boolean
}

export class PdfRenderError extends Error {
  readonly code: PdfRenderDomainError
  readonly httpStatus?: number

  constructor(code: PdfRenderDomainError, message: string, httpStatus?: number) {
    super(message)
    this.name = 'PdfRenderError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

/** Gotenberg Chromium defaults used by convertHtmlViaGotenberg. */
export const GOTENBERG_HTML_DEFAULTS = {
  paperWidthIn: 8.27,
  paperHeightIn: 11.7,
  marginTopIn: 0.4,
  marginTopWithHeaderIn: 0.55,
  marginBottomIn: 0.45,
  marginBottomWithFooterIn: 0.6,
  marginLeftIn: 0.45,
  marginRightIn: 0.45,
  printBackground: true,
  landscape: false,
  format: 'A4' as const,
  timeoutMs: 60_000,
}

export function inchesToMm(inches: number): number {
  return Math.round(inches * 25.4 * 100) / 100
}

/**
 * Map Gotenberg Chromium `.pageNumber` / `.totalPages` placeholders
 * to PDFShift `{{page}}` / `{{total}}`.
 */
export function adaptFooterHeaderHtmlForPdfShift(html: string): string {
  return html
    .replace(/<span class="pageNumber"><\/span>/g, '{{page}}')
    .replace(/<span class="totalPages"><\/span>/g, '{{total}}')
    .replace(/class="pageNumber"/g, 'data-pdfshift="page"')
    .replace(/class="totalPages"/g, 'data-pdfshift="total"')
}

export function buildPdfShiftRequestBody(input: {
  html: string
  options?: PdfRenderHtmlOptions
}): Record<string, unknown> {
  const o = input.options ?? {}
  const hasHeader = Boolean(o.headerHtml)
  const hasFooter = Boolean(o.footerHtml)

  const marginTop =
    o.marginTopIn ??
    (hasHeader
      ? GOTENBERG_HTML_DEFAULTS.marginTopWithHeaderIn
      : GOTENBERG_HTML_DEFAULTS.marginTopIn)
  const marginBottom =
    o.marginBottomIn ??
    (hasFooter
      ? GOTENBERG_HTML_DEFAULTS.marginBottomWithFooterIn
      : GOTENBERG_HTML_DEFAULTS.marginBottomIn)
  const marginLeft = o.marginLeftIn ?? GOTENBERG_HTML_DEFAULTS.marginLeftIn
  const marginRight = o.marginRightIn ?? GOTENBERG_HTML_DEFAULTS.marginRightIn

  const body: Record<string, unknown> = {
    source: input.html,
    format: o.format ?? GOTENBERG_HTML_DEFAULTS.format,
    landscape: o.landscape ?? GOTENBERG_HTML_DEFAULTS.landscape,
    disable_backgrounds: !(o.printBackground ?? GOTENBERG_HTML_DEFAULTS.printBackground),
    sandbox: o.sandbox !== false,
    margin: {
      top: `${inchesToMm(marginTop)}mm`,
      right: `${inchesToMm(marginRight)}mm`,
      bottom: `${inchesToMm(marginBottom)}mm`,
      left: `${inchesToMm(marginLeft)}mm`,
    },
  }

  if (o.headerHtml) {
    body.header = {
      source: adaptFooterHeaderHtmlForPdfShift(o.headerHtml),
      height: '40',
      start_at: 1,
    }
  }
  if (o.footerHtml) {
    body.footer = {
      source: adaptFooterHeaderHtmlForPdfShift(o.footerHtml),
      height: '40',
      start_at: 1,
    }
  }

  return body
}

/** Build auth headers without exposing the key in returned objects for logging. */
export function buildPdfShiftAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  }
}

export function mapPdfShiftHttpError(input: {
  status: number
  bodyText?: string
}): PdfRenderError {
  const { status, bodyText = '' } = input
  const lower = bodyText.toLowerCase()

  if (status === 401 || status === 403) {
    if (
      lower.includes('credit') ||
      lower.includes('quota') ||
      lower.includes('limit') ||
      lower.includes('remaining')
    ) {
      return new PdfRenderError(
        'PDF_RENDER_LIMIT_REACHED',
        'Limit kredytów PDFShift został wyczerpany.',
        status,
      )
    }
    return new PdfRenderError(
      'PDF_RENDER_UNAUTHORIZED',
      'Autoryzacja PDFShift nie powiodła się.',
      status,
    )
  }

  if (status === 429) {
    return new PdfRenderError(
      'PDF_RENDER_LIMIT_REACHED',
      'Limit zapytań lub kredytów PDFShift.',
      status,
    )
  }

  if (status === 402 || lower.includes('credit') || lower.includes('quota')) {
    return new PdfRenderError(
      'PDF_RENDER_LIMIT_REACHED',
      'Limit kredytów PDFShift został wyczerpany.',
      status,
    )
  }

  if (status === 408 || status === 504) {
    return new PdfRenderError(
      'PDF_RENDER_TIMEOUT',
      'Przekroczono czas generowania PDF.',
      status,
    )
  }

  if (status >= 500) {
    return new PdfRenderError(
      'PDF_RENDER_PROVIDER_UNAVAILABLE',
      'Usługa PDFShift jest chwilowo niedostępna.',
      status,
    )
  }

  return new PdfRenderError(
    'PDF_RENDER_FAILED',
    'Nie udało się wygenerować PDF.',
    status,
  )
}

export async function convertHtmlViaPdfShift(input: {
  html: string
  apiKey: string
  options?: PdfRenderHtmlOptions
  fetchImpl?: typeof fetch
  endpoint?: string
}): Promise<PdfShiftConvertResult> {
  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    throw new PdfRenderError(
      'PDF_RENDER_PROVIDER_UNAVAILABLE',
      'PDFSHIFT_API_KEY nie jest skonfigurowany.',
    )
  }

  const timeoutMs =
    input.options?.timeoutMs ?? GOTENBERG_HTML_DEFAULTS.timeoutMs
  const endpoint =
    input.endpoint ?? 'https://api.pdfshift.io/v3/convert/pdf'
  const body = buildPdfShiftRequestBody({
    html: input.html,
    options: input.options,
  })
  const sandbox = body.sandbox === true

  const headers = buildPdfShiftAuthHeaders(apiKey)
  const fetchFn = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new PdfRenderError(
        'PDF_RENDER_TIMEOUT',
        'Przekroczono czas generowania PDF.',
      )
    }
    throw new PdfRenderError(
      'PDF_RENDER_PROVIDER_UNAVAILABLE',
      'Nie udało się połączyć z PDFShift.',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw mapPdfShiftHttpError({ status: res.status, bodyText })
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new PdfRenderError('PDF_RENDER_FAILED', 'Pusta odpowiedź PDF.')
  }
  const prefix = new TextDecoder().decode(bytes.subarray(0, 5))
  if (prefix !== '%PDF-') {
    throw new PdfRenderError('PDF_RENDER_FAILED', 'Nieprawidłowa odpowiedź PDF.')
  }

  return { pdfBytes: bytes, provider: 'pdfshift', sandbox }
}
