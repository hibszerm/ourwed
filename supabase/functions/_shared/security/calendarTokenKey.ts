/**
 * Calendar token encryption key resolution.
 * Production must never silently use the local-dev placeholder.
 */

export type EnvGet = (name: string) => string | null

export const LOCAL_DEV_CALENDAR_TOKEN_KEY = 'local-dev-only-calendar-token-key'

export function isProductionCalendarRuntime(
  env: EnvGet,
  options?: { appPublicUrl?: string | null },
): boolean {
  const runtime = (env('OURWED_RUNTIME') || env('OURWED_ENV') || '')
    .trim()
    .toLowerCase()
  if (runtime === 'local' || runtime === 'development' || runtime === 'dev') {
    return false
  }
  const app =
    options?.appPublicUrl ??
    env('APP_PUBLIC_URL') ??
    env('SITE_URL') ??
    ''
  if (/localhost|127\.0\.0\.1/i.test(app)) return false
  // Hosted Edge / production app URL → fail closed.
  return true
}

function googleClientSecret(env: EnvGet): string | null {
  return (
    env('GOOGLE_CALENDAR_CLIENT_SECRET') ||
    env('GOOGLE_CALENDR_CLIENT_SECRET')
  )
}

export type CalendarTokenKeyMaterial = {
  /** Key used for new encrypts. */
  encryptKey: string
  /** Ordered decrypt candidates (encrypt key first). */
  decryptKeys: string[]
  /** True when encrypt still falls back to Google OAuth client secret. */
  usingLegacyGoogleSecretForEncrypt: boolean
}

/**
 * Resolve encryption material.
 * - Prefer CALENDAR_TOKEN_ENCRYPTION_KEY for encrypt.
 * - Keep Google client secret as decrypt-only legacy when dedicated key is set
 *   (existing ciphertext may have been encrypted with that fallback).
 * - Never use LOCAL_DEV_CALENDAR_TOKEN_KEY in production.
 */
export function resolveCalendarTokenKeyMaterial(
  env: EnvGet,
  options?: { appPublicUrl?: string | null },
): CalendarTokenKeyMaterial {
  const dedicated = env('CALENDAR_TOKEN_ENCRYPTION_KEY')
  const google = googleClientSecret(env)
  const production = isProductionCalendarRuntime(env, options)

  if (production) {
    if (!dedicated && !google) {
      throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEY_MISSING')
    }
    const encryptKey = dedicated || google!
    const decryptKeys = [encryptKey]
    if (dedicated && google && google !== dedicated) {
      decryptKeys.push(google)
    }
    return {
      encryptKey,
      decryptKeys,
      usingLegacyGoogleSecretForEncrypt: !dedicated && Boolean(google),
    }
  }

  const encryptKey = dedicated || google || LOCAL_DEV_CALENDAR_TOKEN_KEY
  const decryptKeys = [encryptKey]
  for (const extra of [dedicated, google, LOCAL_DEV_CALENDAR_TOKEN_KEY]) {
    if (extra && !decryptKeys.includes(extra)) decryptKeys.push(extra)
  }
  return {
    encryptKey,
    decryptKeys,
    usingLegacyGoogleSecretForEncrypt: !dedicated && Boolean(google),
  }
}

/** Encrypt-only convenience (throws in prod when unconfigured). */
export function resolveCalendarEncryptKey(
  env: EnvGet,
  options?: { appPublicUrl?: string | null },
): string {
  return resolveCalendarTokenKeyMaterial(env, options).encryptKey
}
