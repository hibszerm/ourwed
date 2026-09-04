import {
  DEFAULT_INTERFACE_STYLE,
  validateInterfaceStyle,
  type InterfaceStyle,
} from '@/features/interface-style/types'

const GLOBAL_CACHE_KEY = 'ourwed:interface-style'
const USER_CACHE_PREFIX = 'ourwed:interface-style:u:'

function userCacheKey(userId: string): string {
  return `${USER_CACHE_PREFIX}${userId}`
}

export function readCachedInterfaceStyle(
  userId?: string | null,
): InterfaceStyle {
  try {
    if (userId) {
      const userValue = localStorage.getItem(userCacheKey(userId))
      if (userValue) return validateInterfaceStyle(userValue)
    }
    const global = localStorage.getItem(GLOBAL_CACHE_KEY)
    return validateInterfaceStyle(global)
  } catch {
    return DEFAULT_INTERFACE_STYLE
  }
}

export function writeCachedInterfaceStyle(
  interfaceStyle: InterfaceStyle,
  userId?: string | null,
): void {
  try {
    localStorage.setItem(GLOBAL_CACHE_KEY, interfaceStyle)
    if (userId) {
      localStorage.setItem(userCacheKey(userId), interfaceStyle)
    }
  } catch {
    // Quota / private mode — ignore; DB remains source of truth.
  }
}
