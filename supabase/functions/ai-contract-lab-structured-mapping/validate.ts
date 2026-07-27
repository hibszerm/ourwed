import { ALLOWED_FIELD_KEYS } from './registry.ts'

const BLOCK_ID_RE =
  /^para-\d+$|^table-\d+-row-\d+-cell-\d+-p-\d+$/i

export type AiMappingApiErrorCode =
  | 'not_configured'
  | 'authentication_failed'
  | 'model_unavailable'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_structured_output'
  | 'missing_structured_output'
  | 'incomplete_response'
  | 'refused'
  | 'document_too_large'
  | 'request_failed'

export function isValidBlockId(id: string): boolean {
  return BLOCK_ID_RE.test(id.trim())
}

export function validateIncomingBlocks(
  blocks: unknown[],
): { ok: true; blocks: Array<{ id: string; text: string }> } | { ok: false; message: string } {
  if (!blocks.length) {
    return { ok: false, message: 'Dokument jest pusty lub nie zawiera bloków tekstu.' }
  }
  const slim: Array<{ id: string; text: string }> = []
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const text = typeof row.text === 'string' ? row.text : ''
    if (!id || !isValidBlockId(id)) {
      return { ok: false, message: 'Nieprawidłowy identyfikator bloku dokumentu.' }
    }
    slim.push({ id, text })
  }
  if (!slim.length) {
    return { ok: false, message: 'Dokument jest pusty lub nie zawiera bloków tekstu.' }
  }
  return { ok: true, blocks: slim }
}

export function assertFieldKeysInResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const fields = (parsed as Record<string, unknown>).fields
  if (!Array.isArray(fields)) return false
  const allowed = new Set<string>(ALLOWED_FIELD_KEYS)
  for (const f of fields) {
    if (!f || typeof f !== 'object') return false
    const key = (f as Record<string, unknown>).fieldKey
    if (typeof key !== 'string' || !allowed.has(key)) return false
  }
  return true
}

export function mapProviderError(
  status: number,
  body: unknown,
): { code: AiMappingApiErrorCode; message: string; retryable: boolean } {
  if (status === 401 || status === 403) {
    return {
      code: 'authentication_failed',
      message: 'Autoryzacja OpenAI nie powiodła się.',
      retryable: false,
    }
  }
  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'Limit zapytań OpenAI został wyczerpany. Spróbuj ponownie za chwilę.',
      retryable: true,
    }
  }
  if (status === 408 || status === 504) {
    return {
      code: 'timeout',
      message: 'Analiza trwała zbyt długo. Spróbuj ponownie.',
      retryable: true,
    }
  }
  const errBody = body && typeof body === 'object'
    ? (body as Record<string, unknown>).error
    : undefined
  const errMsg =
    errBody && typeof errBody === 'object'
      ? String((errBody as Record<string, unknown>).message ?? '')
      : ''
  if (/model/i.test(errMsg) && /not found|does not exist|unavailable/i.test(errMsg)) {
    return {
      code: 'model_unavailable',
      message: 'Wybrany model OpenAI jest niedostępny.',
      retryable: false,
    }
  }
  return {
    code: 'request_failed',
    message: 'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
    retryable: status >= 500,
  }
}
