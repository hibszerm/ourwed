/**
 * Customer-safe PDF render error copy (no provider brand leak).
 */

export const PDF_RENDER_LIMIT_REACHED_MESSAGE =
  'Limit generowania PDF jest chwilowo niedostępny. Spróbuj ponownie później.'

export const PDF_RENDER_GENERIC_MESSAGE =
  'Nie udało się przygotować PDF. Spróbuj ponownie później.'

export const PDF_RENDER_PRO_REQUIRED_MESSAGE =
  'Generowanie PDF wymaga aktywnego PRO.'

/**
 * Map provider/domain errors to customer-safe Polish copy.
 * Never exposes PDFShift account details.
 */
export function mapPdfRenderErrorForUser(raw: string | undefined | null): string {
  const text = (raw ?? '').trim()
  if (!text) return PDF_RENDER_GENERIC_MESSAGE
  if (/PDF_RENDER_LIMIT_REACHED|limit kredyt|quota|429/i.test(text)) {
    return PDF_RENDER_LIMIT_REACHED_MESSAGE
  }
  if (/PDF_RENDER_PRO_REQUIRED|PRO_REQUIRED|wymaga aktywnego PRO/i.test(text)) {
    return PDF_RENDER_PRO_REQUIRED_MESSAGE
  }
  if (/PDF_RENDER_TIMEOUT|timeout|504/i.test(text)) {
    return 'Generowanie PDF trwa zbyt długo. Spróbuj ponownie.'
  }
  if (
    /PDF_RENDER_PROVIDER_UNAVAILABLE|503|misconfigured|nie jest skonfigurowany/i.test(
      text,
    )
  ) {
    return PDF_RENDER_GENERIC_MESSAGE
  }
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    return PDF_RENDER_GENERIC_MESSAGE
  }
  const stripped = text.replace(/^PDF_RENDER_[A-Z_]+:\s*/i, '').trim()
  if (!stripped || /^PDF_RENDER_/i.test(stripped)) {
    return PDF_RENDER_GENERIC_MESSAGE
  }
  if (/pdfshift|gotenberg|libreoffice/i.test(stripped)) {
    return PDF_RENDER_GENERIC_MESSAGE
  }
  return stripped
}
