import {
  DEFAULT_APPEARANCE,
  validateAppearance,
  type Appearance,
} from '@/features/appearance/types'

const GLOBAL_CACHE_KEY = 'ourwed:appearance'
const USER_CACHE_PREFIX = 'ourwed:appearance:u:'

function userCacheKey(userId: string): string {
  return `${USER_CACHE_PREFIX}${userId}`
}

export function readCachedAppearance(userId?: string | null): Appearance {
  try {
    if (userId) {
      const userValue = localStorage.getItem(userCacheKey(userId))
      if (userValue) return validateAppearance(userValue)
    }
    const global = localStorage.getItem(GLOBAL_CACHE_KEY)
    return validateAppearance(global)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function writeCachedAppearance(
  appearance: Appearance,
  userId?: string | null,
): void {
  try {
    localStorage.setItem(GLOBAL_CACHE_KEY, appearance)
    if (userId) {
      localStorage.setItem(userCacheKey(userId), appearance)
    }
  } catch {
    // Quota / private mode — ignore; DB remains source of truth.
  }
}

export function clearCachedAppearance(userId?: string | null): void {
  try {
    localStorage.removeItem(GLOBAL_CACHE_KEY)
    if (userId) localStorage.removeItem(userCacheKey(userId))
  } catch {
    // ignore
  }
}
