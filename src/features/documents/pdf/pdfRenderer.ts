/**
 * Narrow HTML→PDF renderer abstraction.
 * Production product paths use PDFShift via Edge `pdf-render` only.
 * localDocker remains for explicit DEV/POC comparison tooling.
 */

export type PdfRendererProviderId = 'localDocker' | 'pdfShift'

export type RenderHtmlToPdfInput = {
  html: string
  filename?: string
  footerHtml?: string
  headerHtml?: string
  documentType?: 'brief' | 'contract' | 'other'
  /**
   * PDFShift sandbox (watermarked, no credits).
   * Production must pass false. Edge also refuses sandbox unless
   * PDF_RENDER_ALLOW_SANDBOX=true.
   */
  sandbox?: boolean
}

export type RenderHtmlToPdfResult = {
  pdfBytes: Uint8Array
  provider: PdfRendererProviderId | 'gotenberg_chromium' | 'pdfshift'
  sandbox?: boolean
}

export type PdfHtmlRenderer = {
  id: PdfRendererProviderId
  renderHtmlToPdf(input: RenderHtmlToPdfInput): Promise<RenderHtmlToPdfResult>
}

/**
 * Resolve provider for scripts/tooling.
 * Defaults to pdfShift. Local Docker only when explicitly requested.
 * Production product code must not call this to select localhost.
 */
export function resolvePdfRendererProvider(
  raw: string | undefined | null,
): PdfRendererProviderId {
  const v = (raw ?? '').trim().toLowerCase()
  if (
    v === 'local' ||
    v === 'localdocker' ||
    v === 'gotenberg' ||
    v === 'docker'
  ) {
    return 'localDocker'
  }
  return 'pdfShift'
}
