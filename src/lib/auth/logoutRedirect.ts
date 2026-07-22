const AFTER_LOGOUT_KEY = 'ourwed:afterLogout'

/** In-memory flag survives React Strict Mode double-render (sessionStorage consume would not). */
let logoutToLanding = false

/** Mark that the next unauthenticated protected-route hit should go to landing. */
export function markLogoutRedirectToLanding(): void {
  logoutToLanding = true
  try {
    sessionStorage.setItem(AFTER_LOGOUT_KEY, '1')
  } catch {
    // ignore quota / private mode
  }
}

/** True while a logout-to-landing redirect is pending (safe to call repeatedly). */
export function shouldRedirectLogoutToLanding(): boolean {
  if (logoutToLanding) return true
  try {
    return sessionStorage.getItem(AFTER_LOGOUT_KEY) === '1'
  } catch {
    return false
  }
}

/** Clear after landing page has mounted. */
export function clearLogoutRedirectToLanding(): void {
  logoutToLanding = false
  try {
    sessionStorage.removeItem(AFTER_LOGOUT_KEY)
  } catch {
    // ignore
  }
}
