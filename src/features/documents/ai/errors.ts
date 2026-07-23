import type { DocumentAiErrorCode, DocumentAiErrorPayload } from './types'

/**
 * Typed analysis errors with Polish-friendly UI messages.
 */

const FRIENDLY: Record<DocumentAiErrorCode, string> = {
  unauthorized: 'Musisz być zalogowany, aby uruchomić analizę dokumentu.',
  bad_request: 'Nieprawidłowe dane do analizy. Sprawdź plik i spróbuj ponownie.',
  provider_timeout: 'Analiza trwa zbyt długo. Spróbuj ponownie za chwilę.',
  provider_rate_limit:
    'Zbyt wiele żądań analizy. Poczekaj chwilę i spróbuj ponownie.',
  provider_unavailable:
    'Usługa analizy dokumentów jest chwilowo niedostępna. Spróbuj później.',
  invalid_json:
    'Nie udało się zinterpretować odpowiedzi AI. Spróbuj ponownie.',
  validation_failed:
    'Odpowiedź AI nie spełnia wymaganego formatu. Spróbuj ponownie.',
  empty_response: 'Analizator nie zwrócił wyniku. Spróbuj ponownie.',
  unknown: 'Nie udało się przeanalizować dokumentu. Spróbuj ponownie.',
}

/** Map legacy / alternate codes from older Edge deployments. */
const CODE_ALIASES: Record<string, DocumentAiErrorCode> = {
  timeout: 'provider_timeout',
  rate_limit: 'provider_rate_limit',
  gemini_unavailable: 'provider_unavailable',
}

export class DocumentAiAnalysisError extends Error {
  readonly code: DocumentAiErrorCode

  constructor(code: DocumentAiErrorCode, message?: string) {
    super(message ?? FRIENDLY[code])
    this.name = 'DocumentAiAnalysisError'
    this.code = code
  }
}

export function getDocumentAiErrorMessage(err: unknown): string {
  if (err instanceof DocumentAiAnalysisError) return err.message
  if (err instanceof Error && err.message.trim()) return err.message
  return FRIENDLY.unknown
}

export function documentAiErrorFromPayload(
  payload: DocumentAiErrorPayload | null | undefined,
): DocumentAiAnalysisError {
  if (!payload?.code) {
    return new DocumentAiAnalysisError('unknown')
  }
  const raw = payload.code
  const normalized =
    CODE_ALIASES[raw] ??
    (Object.prototype.hasOwnProperty.call(FRIENDLY, raw)
      ? (raw as DocumentAiErrorCode)
      : 'unknown')
  return new DocumentAiAnalysisError(normalized, FRIENDLY[normalized])
}

export function mapHttpStatusToErrorCode(status: number): DocumentAiErrorCode {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 400) return 'bad_request'
  if (status === 408 || status === 504) return 'provider_timeout'
  if (status === 429) return 'provider_rate_limit'
  if (status >= 500) return 'provider_unavailable'
  return 'unknown'
}
