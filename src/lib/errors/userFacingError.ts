/**
 * Production user-facing error presentation.
 *
 * Policy:
 * - Known domain / auth / PRO codes → mapped Polish copy
 * - Intentional short Polish app messages → may pass through
 * - Unknown / provider / database / network text → caller fallback only
 *
 * Never show raw PostgREST / OAuth / English provider messages to end users.
 */

import {
  isProAccessRequiredError,
  toProAccessUserMessage,
} from '@/features/billing/proAccessError'

const DEFAULT_FALLBACK = 'Nie udało się wykonać operacji. Spróbuj ponownie.'

/** Controlled application / RPC codes → Polish user copy. */
const DOMAIN_CODE_MESSAGES: Record<string, string> = {
  CHARGED_REQUIRES_POSITIVE_AMOUNT:
    'Kwota dojazdu musi być większa niż 0 zł.',
  CONFIRMATION_REQUIRED: 'Potwierdź zapis kosztu dojazdu.',
  PRO_ACCESS_REQUIRED: toProAccessUserMessage(),
}

const TECHNICAL_PATTERNS: RegExp[] = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /jwt expired/i,
  /invalid jwt/i,
  /row-level security/i,
  /permission denied/i,
  /violates unique constraint/i,
  /duplicate key value/i,
  /foreign key constraint/i,
  /not-null constraint/i,
  /pgrst\d+/i,
  /postgrest/i,
  /supabase/i,
  /crypto\.randomuuid/i,
  /is not a function/i,
  /unexpected token/i,
  /internal server error/i,
  /request_denied/i,
  /over_query_limit/i,
  /zero_results/i,
  /invalid_request/i,
  /oauth/i,
  /access_denied/i,
  /status code\s*\d+/i,
  /http\s*\d{3}/i,
  /edge function/i,
  /functions?httperror/i,
  /typeerror:/i,
  /referenceerror:/i,
  /syntaxerror:/i,
]

/** Polish-looking intentional app copy (conservative). */
const POLISH_USER_COPY =
  /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|^(Nie |Ta |Brak |Hasło |Sesja |Zbyt |Potwierdź |Rejestracja |To konto |Wpisz |Podaj |Wybierz |Usuń |Zapisz |Wyślij )/u

function extractRawMessage(error: unknown): string {
  if (error == null) return ''
  if (typeof error === 'string') return error.trim()
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.message === 'string') return record.message.trim()
    if (typeof record.error_description === 'string') {
      return record.error_description.trim()
    }
  }
  return ''
}

function extractCode(error: unknown): string {
  if (error == null || typeof error !== 'object') return ''
  const record = error as Record<string, unknown>
  if (typeof record.code === 'string') return record.code.trim()
  if (typeof record.error === 'string' && /^[A-Z][A-Z0-9_]+$/.test(record.error)) {
    return record.error.trim()
  }
  return ''
}

function isTechnicalMessage(message: string): boolean {
  if (!message) return true
  if (TECHNICAL_PATTERNS.some((re) => re.test(message))) return true
  // SCREAMING_SNAKE domain codes that we did not map
  if (/^[A-Z][A-Z0-9_]{3,}$/.test(message)) return true
  // Mostly English provider prose without Polish markers
  if (
    !POLISH_USER_COPY.test(message) &&
    /\b(error|failed|invalid|denied|constraint|undefined|null|exception)\b/i.test(
      message,
    )
  ) {
    return true
  }
  return false
}

function looksLikeSafePolishUserCopy(message: string): boolean {
  if (!message || message.length > 220) return false
  if (isTechnicalMessage(message)) return false
  return POLISH_USER_COPY.test(message)
}

function logUnknownInDev(error: unknown, fallback: string, raw: string) {
  try {
    if (
      typeof import.meta !== 'undefined' &&
      Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
    ) {
      console.error('[user-facing-error]', {
        fallback,
        raw: raw.slice(0, 300),
        name: error instanceof Error ? error.name : typeof error,
        code: extractCode(error) || undefined,
      })
    }
  } catch {
    // ignore logging failures
  }
}

/**
 * Resolve a safe Polish message for UI (toast / form / page error).
 * Always prefer the caller `fallback` for unknown technical failures.
 */
export function getUserFacingErrorMessage(
  error: unknown,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const safeFallback = fallback.trim() || DEFAULT_FALLBACK

  if (isProAccessRequiredError(error)) {
    return toProAccessUserMessage()
  }

  const code = extractCode(error)
  if (code && DOMAIN_CODE_MESSAGES[code]) {
    return DOMAIN_CODE_MESSAGES[code]!
  }

  const raw = extractRawMessage(error)
  if (raw && DOMAIN_CODE_MESSAGES[raw]) {
    return DOMAIN_CODE_MESSAGES[raw]!
  }

  // Auth-shaped English that slipped past mapAuthError call sites
  const lower = raw.toLowerCase()
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid credentials')
  ) {
    return 'Nie udało się zalogować. Sprawdź e-mail i hasło.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Potwierdź adres e-mail, aby się zalogować.'
  }
  if (
    lower.includes('user already registered') ||
    lower.includes('already been registered')
  ) {
    return 'To konto już istnieje.'
  }
  if (
    lower.includes('jwt') ||
    (lower.includes('session') && lower.includes('expired'))
  ) {
    return 'Sesja wygasła. Zaloguj się ponownie.'
  }

  if (looksLikeSafePolishUserCopy(raw)) {
    return raw
  }

  logUnknownInDev(error, safeFallback, raw)
  return safeFallback
}

/** @internal exported for acceptance tests */
export function __testOnly_isTechnicalMessage(message: string): boolean {
  return isTechnicalMessage(message)
}
