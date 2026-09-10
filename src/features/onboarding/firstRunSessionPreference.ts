import { FIRST_RUN_SESSION_SKIP_KEY } from '@/features/onboarding/firstRunRoutes'

/** Session-only; never persists across browser sessions as “setup done”. */
export function readFirstRunPreferOperationalDashboard(): boolean {
  try {
    return sessionStorage.getItem(FIRST_RUN_SESSION_SKIP_KEY) === '1'
  } catch {
    return false
  }
}

export function writeFirstRunPreferOperationalDashboard(value: boolean): void {
  try {
    if (value) {
      sessionStorage.setItem(FIRST_RUN_SESSION_SKIP_KEY, '1')
    } else {
      sessionStorage.removeItem(FIRST_RUN_SESSION_SKIP_KEY)
    }
  } catch {
    // Ignore private-mode / unavailable storage.
  }
}
