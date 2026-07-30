import {
  DEFAULT_THEME_ID,
  validateThemeId,
  type ThemeId,
} from '@/features/theme/types'

const GLOBAL_CACHE_KEY = 'ourwed:theme-id'
const USER_CACHE_PREFIX = 'ourwed:theme-id:u:'

function userCacheKey(userId: string): string {
  // Opaque uid only — no email/PII in the key.
  return `${USER_CACHE_PREFIX}${userId}`
}

export function readCachedThemeId(userId?: string | null): ThemeId {
  try {
    if (userId) {
      const userValue = localStorage.getItem(userCacheKey(userId))
      if (userValue) return validateThemeId(userValue)
    }
    const global = localStorage.getItem(GLOBAL_CACHE_KEY)
    return validateThemeId(global)
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function writeCachedThemeId(
  themeId: ThemeId,
  userId?: string | null,
): void {
  try {
    localStorage.setItem(GLOBAL_CACHE_KEY, themeId)
    if (userId) {
      localStorage.setItem(userCacheKey(userId), themeId)
    }
  } catch {
    // Quota / private mode — ignore; DB remains source of truth.
  }
}

export function clearCachedThemeId(userId?: string | null): void {
  try {
    localStorage.removeItem(GLOBAL_CACHE_KEY)
    if (userId) localStorage.removeItem(userCacheKey(userId))
  } catch {
    // ignore
  }
}
