/**
 * Sessions page grid/list view preference (UI-only, localStorage).
 * Independent from Weddings view preference.
 */

export type SessionsViewMode = 'grid' | 'list'

export const SESSIONS_VIEW_MODE_KEY = 'ourwed:sessions-view-mode'

export function parseSessionsViewMode(
  raw: string | null | undefined,
): SessionsViewMode {
  if (raw === 'list' || raw === 'grid') return raw
  return 'grid'
}

export function readSessionsViewMode(): SessionsViewMode {
  if (typeof localStorage === 'undefined') return 'grid'
  try {
    return parseSessionsViewMode(localStorage.getItem(SESSIONS_VIEW_MODE_KEY))
  } catch {
    return 'grid'
  }
}

export function writeSessionsViewMode(mode: SessionsViewMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SESSIONS_VIEW_MODE_KEY, mode)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
