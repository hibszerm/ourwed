/**
 * Contract DOCX→PDF domain errors (Edge + shared with Node via re-export).
 * Customer-safe — never embed raw provider payloads in UI messages.
 */

export type ContractPdfErrorCode =
  | 'CONTRACT_PDF_PROVIDER_UNAVAILABLE'
  | 'CONTRACT_PDF_LIMIT_REACHED'
  | 'CONTRACT_PDF_FILE_TOO_LARGE'
  | 'CONTRACT_PDF_CONVERSION_FAILED'
  | 'CONTRACT_PDF_TIMEOUT'
  | 'CONTRACT_PDF_PRO_REQUIRED'
  | 'CONTRACT_PDF_UNAUTHORIZED'
  | 'CONTRACT_PDF_BAD_REQUEST'

export class ContractPdfError extends Error {
  readonly code: ContractPdfErrorCode
  readonly status?: number

  constructor(code: ContractPdfErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'ContractPdfError'
    this.code = code
    this.status = status
  }
}

/** Polish UX copy — no Cloudmersive / Gotenberg / HTTP brand leak. */
export function contractPdfErrorUserMessage(code: ContractPdfErrorCode): string {
  switch (code) {
    case 'CONTRACT_PDF_LIMIT_REACHED':
      return 'Limit generowania PDF jest chwilowo niedostępny. Spróbuj ponownie później.'
    case 'CONTRACT_PDF_FILE_TOO_LARGE':
      return 'Plik umowy jest zbyt duży, aby wygenerować PDF w tej chwili.'
    case 'CONTRACT_PDF_TIMEOUT':
      return 'Generowanie PDF przekroczyło limit czasu. Spróbuj ponownie.'
    case 'CONTRACT_PDF_PROVIDER_UNAVAILABLE':
      return 'Usługa generowania PDF jest chwilowo niedostępna.'
    case 'CONTRACT_PDF_PRO_REQUIRED':
      return 'Generowanie PDF wymaga aktywnego PRO.'
    case 'CONTRACT_PDF_UNAUTHORIZED':
      return 'Brak autoryzacji.'
    case 'CONTRACT_PDF_BAD_REQUEST':
      return 'Nie udało się przygotować PDF. Sprawdź dokument i spróbuj ponownie.'
    case 'CONTRACT_PDF_CONVERSION_FAILED':
    default:
      return 'Nie udało się wygenerować PDF z umowy. Dokument DOCX jest nadal dostępny.'
  }
}

export function statusForContractPdfCode(code: ContractPdfErrorCode): number {
  switch (code) {
    case 'CONTRACT_PDF_PRO_REQUIRED':
      return 403
    case 'CONTRACT_PDF_UNAUTHORIZED':
      return 401
    case 'CONTRACT_PDF_BAD_REQUEST':
      return 400
    case 'CONTRACT_PDF_FILE_TOO_LARGE':
      return 413
    case 'CONTRACT_PDF_LIMIT_REACHED':
      return 429
    case 'CONTRACT_PDF_TIMEOUT':
      return 504
    case 'CONTRACT_PDF_PROVIDER_UNAVAILABLE':
      return 503
    default:
      return 502
  }
}

/** Map code or `CODE: message` strings to customer-safe Polish. */
export function mapContractPdfErrorForUser(
  raw: string | undefined | null,
): string {
  const text = (raw ?? '').trim()
  if (!text) return contractPdfErrorUserMessage('CONTRACT_PDF_CONVERSION_FAILED')
  const known: ContractPdfErrorCode[] = [
    'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
    'CONTRACT_PDF_LIMIT_REACHED',
    'CONTRACT_PDF_FILE_TOO_LARGE',
    'CONTRACT_PDF_CONVERSION_FAILED',
    'CONTRACT_PDF_TIMEOUT',
    'CONTRACT_PDF_PRO_REQUIRED',
    'CONTRACT_PDF_UNAUTHORIZED',
    'CONTRACT_PDF_BAD_REQUEST',
  ]
  for (const code of known) {
    if (text.includes(code)) return contractPdfErrorUserMessage(code)
  }
  if (/PRO_REQUIRED|wymaga aktywnego PRO/i.test(text)) {
    return contractPdfErrorUserMessage('CONTRACT_PDF_PRO_REQUIRED')
  }
  if (/limit|quota|429/i.test(text)) {
    return contractPdfErrorUserMessage('CONTRACT_PDF_LIMIT_REACHED')
  }
  if (/too large|zbyt duży|413/i.test(text)) {
    return contractPdfErrorUserMessage('CONTRACT_PDF_FILE_TOO_LARGE')
  }
  if (/timeout|504/i.test(text)) {
    return contractPdfErrorUserMessage('CONTRACT_PDF_TIMEOUT')
  }
  if (/cloudmersive|gotenberg|libreoffice|api key|http \d+/i.test(text)) {
    return contractPdfErrorUserMessage('CONTRACT_PDF_CONVERSION_FAILED')
  }
  return contractPdfErrorUserMessage('CONTRACT_PDF_CONVERSION_FAILED')
}
