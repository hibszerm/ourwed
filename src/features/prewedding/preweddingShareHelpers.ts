/** Pure helpers for pre-wedding share / public URL (no Supabase import). */

const SHARE_TOKEN_PREFIX = 'ourwed:prewedding-share-token:'

function shareTokenStorageKey(questionnaireId: string): string {
  return `${SHARE_TOKEN_PREFIX}${questionnaireId}`
}

/** Session-only plaintext recovery (hash in DB is not reversible). */
export function readShareToken(questionnaireId: string): string | null {
  try {
    return sessionStorage.getItem(shareTokenStorageKey(questionnaireId))
  } catch {
    return null
  }
}

export function persistShareToken(questionnaireId: string, token: string): void {
  try {
    sessionStorage.setItem(shareTokenStorageKey(questionnaireId), token)
  } catch {
    // Private mode / disabled storage — caller still has the in-memory token.
  }
}

export function clearShareToken(questionnaireId: string): void {
  try {
    sessionStorage.removeItem(shareTokenStorageKey(questionnaireId))
  } catch {
    // ignore
  }
}

/**
 * SHA-256 hex of UTF-8 bytes — must match Postgres
 * encode(extensions.digest(token, 'sha256'), 'hex').
 */
export async function hashPreweddingShareToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function normalizePublicTokenHash(
  hash: string | null | undefined,
): string | null {
  if (typeof hash !== 'string') return null
  const trimmed = hash.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/** True when two SHA-256 hex hashes refer to the same stored public token. */
export function shareTokenHashesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizePublicTokenHash(left)
  const b = normalizePublicTokenHash(right)
  return Boolean(a && b && a === b)
}

/**
 * Returns session plaintext only when it hashes to the CURRENT stored hash.
 * Mismatch or missing hash → clear stale cache and return null.
 */
export async function readValidShareToken(
  questionnaireId: string,
  currentHash: string | null | undefined,
): Promise<string | null> {
  const cached = readShareToken(questionnaireId)
  if (!cached) return null
  const expected = normalizePublicTokenHash(currentHash)
  if (!expected) {
    clearShareToken(questionnaireId)
    return null
  }
  const digest = await hashPreweddingShareToken(cached)
  if (digest !== expected) {
    clearShareToken(questionnaireId)
    return null
  }
  return cached
}

export function buildPreweddingPublicUrl(token: string, origin = window.location.origin): string {
  return `${origin}/ankieta/${token}`
}

export function preweddingShareMessage(title: string, url: string): string {
  return `Cześć!\n\nPodajemy link do ankiety przedślubnej (${title}):\n${url}\n\nPozdrawiamy!`
}

export function mapPreweddingShareError(err: unknown): string {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : err instanceof Error
        ? err.message
        : ''
  if (/not_owner/i.test(message)) {
    return 'Nie masz uprawnień do udostępnienia tej ankiety.'
  }
  if (/questionnaire_not_found/i.test(message)) {
    return 'Nie znaleziono ankiety.'
  }
  if (/gen_random_bytes|digest|42883/i.test(message)) {
    return 'Nie udało się wygenerować linku. Spróbuj ponownie.'
  }
  return 'Nie udało się wygenerować linku. Spróbuj ponownie.'
}
