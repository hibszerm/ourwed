/**
 * Resolve a safe internal post-login destination from router location state.
 * Rejects external URLs and auth surfaces that would loop.
 */

export const DEFAULT_POST_LOGIN_PATH = '/dashboard'

const BLOCKED_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/check-email',
  '/auth/',
] as const

function isBlockedInternalPath(pathname: string): boolean {
  const path = pathname.split('?')[0] ?? pathname
  if (path === '/' || path === '') return true
  return BLOCKED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}

/**
 * Accepts ProtectedRoute-style `state.from` as a string path (+ optional search)
 * or a `{ pathname, search }` object.
 */
export function resolvePostLoginPath(from: unknown): string {
  let pathname = ''
  let search = ''

  if (typeof from === 'string') {
    const trimmed = from.trim()
    if (!trimmed) return DEFAULT_POST_LOGIN_PATH
    const q = trimmed.indexOf('?')
    if (q >= 0) {
      pathname = trimmed.slice(0, q)
      search = trimmed.slice(q)
    } else {
      pathname = trimmed
    }
  } else if (from && typeof from === 'object') {
    const record = from as { pathname?: unknown; search?: unknown }
    if (typeof record.pathname === 'string') pathname = record.pathname.trim()
    if (typeof record.search === 'string') {
      const s = record.search.trim()
      search = s && !s.startsWith('?') ? `?${s}` : s
    }
  } else {
    return DEFAULT_POST_LOGIN_PATH
  }

  if (!pathname.startsWith('/')) return DEFAULT_POST_LOGIN_PATH
  // Protocol-relative / open redirect: //evil.com
  if (pathname.startsWith('//')) return DEFAULT_POST_LOGIN_PATH
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(pathname)) return DEFAULT_POST_LOGIN_PATH
  if (isBlockedInternalPath(pathname)) return DEFAULT_POST_LOGIN_PATH

  return `${pathname}${search}`
}

/** Build `state.from` for Navigate → /login from a protected location. */
export function captureProtectedFrom(pathname: string, search = ''): string {
  const s = search && !search.startsWith('?') ? `?${search}` : search
  return `${pathname}${s}`
}
