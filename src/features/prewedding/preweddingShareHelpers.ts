/** Pure helpers for pre-wedding share / public URL (no Supabase import). */

const SHARE_TOKEN_PREFIX = 'ourwed:prewedding-share-token:'

/** Session-only plaintext recovery (hash in DB is not reversible). */
export function readShareToken(questionnaireId: string): string | null {
  try {
    return sessionStorage.getItem(`${SHARE_TOKEN_PREFIX}${questionnaireId}`)
  } catch {
    return null
  }
}

export function persistShareToken(questionnaireId: string, token: string): void {
  try {
    sessionStorage.setItem(`${SHARE_TOKEN_PREFIX}${questionnaireId}`, token)
  } catch {
    // Private mode / disabled storage — caller still has the in-memory token.
  }
}

export function clearShareToken(questionnaireId: string): void {
  try {
    sessionStorage.removeItem(`${SHARE_TOKEN_PREFIX}${questionnaireId}`)
  } catch {
    // ignore
  }
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
