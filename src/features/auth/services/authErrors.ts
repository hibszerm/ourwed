/**
 * Map Supabase / Auth API errors to friendly Polish messages.
 * Keep this pure (no React) for reuse in web + future React Native.
 */

export function mapAuthError(error: unknown, fallback: string): string {
  if (error == null) return fallback

  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : ''

  const normalized = message.toLowerCase()

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials')
  ) {
    return 'Nie udało się zalogować. Sprawdź e-mail i hasło.'
  }

  if (
    normalized.includes('user already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('already registered')
  ) {
    return 'To konto już istnieje.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Potwierdź adres e-mail, aby się zalogować.'
  }

  if (
    normalized.includes('password should be at least') ||
    normalized.includes('password is known to be weak')
  ) {
    return 'Hasło jest za krótkie lub zbyt słabe.'
  }

  if (normalized.includes('unable to validate email') || normalized.includes('invalid email')) {
    return 'Niepoprawny adres e-mail.'
  }

  if (normalized.includes('signup is disabled')) {
    return 'Rejestracja jest chwilowo niedostępna.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('email rate limit')
  ) {
    return 'Zbyt wiele prób. Spróbuj ponownie za chwilę.'
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Brak połączenia. Sprawdź sieć i spróbuj ponownie.'
  }

  if (normalized.includes('same password')) {
    return 'Nowe hasło musi różnić się od poprzedniego.'
  }

  if (normalized.includes('session') && normalized.includes('expired')) {
    return 'Sesja wygasła. Zaloguj się ponownie.'
  }

  return message.trim() || fallback
}
