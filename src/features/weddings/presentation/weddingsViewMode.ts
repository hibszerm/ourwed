/**
 * Weddings page grid/list view preference (UI-only, localStorage).
 */

export type WeddingsViewMode = 'grid' | 'list'

export const WEDDINGS_VIEW_MODE_KEY = 'ourwed:weddings-view-mode'

export function parseWeddingsViewMode(raw: string | null | undefined): WeddingsViewMode {
  if (raw === 'list' || raw === 'grid') return raw
  return 'grid'
}

export function readWeddingsViewMode(): WeddingsViewMode {
  if (typeof localStorage === 'undefined') return 'grid'
  try {
    return parseWeddingsViewMode(localStorage.getItem(WEDDINGS_VIEW_MODE_KEY))
  } catch {
    return 'grid'
  }
}

export function writeWeddingsViewMode(mode: WeddingsViewMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WEDDINGS_VIEW_MODE_KEY, mode)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
