import type { DocumentAiErrorCode, DocumentAiErrorPayload } from './types'

/**
 * Typed analysis errors with Polish-friendly UI messages.
 */

const FRIENDLY: Record<DocumentAiErrorCode, string> = {
  unauthorized: 'Musisz być zalogowany, aby uruchomić analizę dokumentu.',
  bad_request: 'Nieprawidłowe dane do analizy. Sprawdź plik i spróbuj ponownie.',
  timeout: 'Analiza trwa zbyt długo. Spróbuj ponownie za chwilę.',
  invalid_json:
    'Nie udało się zinterpretować odpowiedzi AI. Spróbuj ponownie.',
  validation_failed:
    'Odpowiedź AI nie spełnia wymaganego formatu. Spróbuj ponownie.',
  gemini_unavailable:
    'Usługa analizy dokumentów jest chwilowo niedostępna. Spróbuj później.',
  rate_limit: 'Zbyt wiele żądań analizy. Poczekaj chwilę i spróbuj ponownie.',
  empty_response: 'Analizator nie zwrócił wyniku. Spróbuj ponownie.',
  unknown: 'Nie udało się przeanalizować dokumentu. Spróbuj ponownie.',
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
  const code = (
    Object.prototype.hasOwnProperty.call(FRIENDLY, payload.code)
      ? payload.code
      : 'unknown'
  ) as DocumentAiErrorCode
  return new DocumentAiAnalysisError(code, FRIENDLY[code])
}

export function mapHttpStatusToErrorCode(status: number): DocumentAiErrorCode {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 400) return 'bad_request'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'gemini_unavailable'
  return 'unknown'
}
