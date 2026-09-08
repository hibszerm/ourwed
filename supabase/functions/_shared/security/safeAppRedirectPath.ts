/**
 * Strict relative app-path validation for OAuth post-login redirects.
 * Destination must resolve under the configured OurWed application origin.
 */

const DEFAULT_FALLBACK = '/ustawienia/integracje'

function stripNullBytes(input: string): string {
  return input.replace(/\0/g, '')
}

function fullyDecodeUriComponent(input: string, maxRounds = 3): string {
  let current = input
  for (let i = 0; i < maxRounds; i++) {
    try {
      const next = decodeURIComponent(current.replace(/\+/g, ' '))
      if (next === current) break
      current = next
    } catch {
      break
    }
  }
  return current
}

/**
 * Returns a safe relative path (leading slash, no query/hash) or null if rejected.
 */
export function sanitizeAppRelativePath(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null
  let value = stripNullBytes(String(raw)).trim()
  if (!value) return null

  // Reject absolute / scheme / protocol-relative before decoding tricks.
  const lower = value.toLowerCase()
  if (
    lower.startsWith('http:') ||
    lower.startsWith('https:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    value.startsWith('//') ||
    value.startsWith('\\\\') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return null
  }

  value = fullyDecodeUriComponent(value)
  value = stripNullBytes(value).trim()
  if (!value) return null

  // Backslash and encoded-slash tricks after decode.
  if (value.includes('\\') || value.includes('\n') || value.includes('\r')) {
    return null
  }
  if (
    value.toLowerCase().startsWith('javascript:') ||
    value.toLowerCase().startsWith('data:') ||
    value.startsWith('//')
  ) {
    return null
  }

  // Path only — drop query/hash (callback appends its own query).
  const pathOnly = value.split('#')[0]?.split('?')[0] ?? ''
  if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) return null

  // Disallow path traversal segments.
  const segments = pathOnly.split('/')
  if (segments.some((s) => s === '..')) return null

  // Normalize // inside path (keep single leading slash).
  const normalized = '/' + pathOnly.replace(/^\/+/, '').replace(/\/+/g, '/')
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return null

  return normalized
}

/**
 * Resolve redirect against app origin; reject if it escapes the origin.
 */
export function resolveSafeAppRedirectPath(
  raw: string | null | undefined,
  appOrigin: string,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const safeFallback =
    sanitizeAppRelativePath(fallback) ?? DEFAULT_FALLBACK
  const candidate = sanitizeAppRelativePath(raw)
  if (!candidate) return safeFallback

  let origin: URL
  try {
    origin = new URL(appOrigin)
  } catch {
    return safeFallback
  }
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    return safeFallback
  }

  let resolved: URL
  try {
    resolved = new URL(candidate, origin)
  } catch {
    return safeFallback
  }

  if (resolved.origin !== origin.origin) return safeFallback
  if (resolved.username || resolved.password) return safeFallback

  return `${resolved.pathname}`
}
