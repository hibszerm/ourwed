import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { applyThemeToDocument } from '@/features/theme/applyTheme'
import { listThemes, type ThemeDefinition } from '@/features/theme/themeRegistry'
import {
  readCachedThemeId,
  writeCachedThemeId,
} from '@/features/theme/themeCache'
import {
  getUserTheme,
  themeQueryKeys,
  updateUserTheme,
} from '@/features/theme/themeService'
import { isPublicThemeSurfaceActive } from '@/features/theme/usePublicThemeIsolation'
import {
  DEFAULT_THEME_ID,
  validateThemeId,
  type ThemeId,
  type ThemePersistStatus,
} from '@/features/theme/types'

function applyPrivateTheme(themeId: ThemeId) {
  if (isPublicThemeSurfaceActive()) return
  applyThemeToDocument(themeId)
}

interface ThemeContextValue {
  themeId: ThemeId
  availableThemes: ThemeDefinition[]
  persistStatus: ThemePersistStatus
  persistError: string | null
  setTheme: (themeId: ThemeId) => Promise<void>
  isReconciling: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id ?? null

  const [themeId, setThemeIdState] = useState<ThemeId>(() =>
    readCachedThemeId(null),
  )
  const [persistStatus, setPersistStatus] =
    useState<ThemePersistStatus>('idle')
  const [persistError, setPersistError] = useState<string | null>(null)
  const appliedForUserRef = useRef<string | null>(null)

  const profileQuery = useQuery({
    queryKey: themeQueryKeys.byUser(userId ?? 'anon'),
    queryFn: () => getUserTheme(userId!),
    enabled: Boolean(userId && isAuthenticated),
    staleTime: 60_000,
  })

  // Apply cached / resolved theme to the document whenever themeId changes.
  useEffect(() => {
    applyPrivateTheme(themeId)
  }, [themeId])

  // Reconcile with DB after auth.
  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !userId) {
      appliedForUserRef.current = null
      const fallback = DEFAULT_THEME_ID
      setThemeIdState(fallback)
      applyPrivateTheme(fallback)
      return
    }

    // Prefer user-specific cache immediately on user switch.
    if (appliedForUserRef.current !== userId) {
      const cached = readCachedThemeId(userId)
      setThemeIdState(cached)
      applyPrivateTheme(cached)
      writeCachedThemeId(cached, userId)
      appliedForUserRef.current = userId
    }

    if (profileQuery.data) {
      const fromDb = validateThemeId(profileQuery.data)
      setThemeIdState(fromDb)
      applyPrivateTheme(fromDb)
      writeCachedThemeId(fromDb, userId)
    }
  }, [
    authLoading,
    isAuthenticated,
    userId,
    profileQuery.data,
  ])

  const setTheme = useCallback(
    async (nextRaw: ThemeId) => {
      const next = validateThemeId(nextRaw)
      const previous = themeId
      setThemeIdState(next)
      applyPrivateTheme(next)
      writeCachedThemeId(next, userId)
      setPersistError(null)

      if (!userId || !isAuthenticated) {
        setPersistStatus('saved')
        return
      }

      setPersistStatus('saving')
      const result = await updateUserTheme(userId, next)
      if (!result.ok) {
        setPersistStatus('error')
        setPersistError(result.error)
        setThemeIdState(previous)
        applyPrivateTheme(previous)
        writeCachedThemeId(previous, userId)
        return
      }

      setPersistStatus('saved')
      void queryClient.setQueryData(themeQueryKeys.byUser(userId), next)
      window.setTimeout(() => {
        setPersistStatus((s) => (s === 'saved' ? 'idle' : s))
      }, 1600)
    },
    [themeId, userId, isAuthenticated, queryClient],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      availableThemes: listThemes(),
      persistStatus,
      persistError,
      setTheme,
      isReconciling: Boolean(userId && profileQuery.isLoading),
    }),
    [
      themeId,
      persistStatus,
      persistError,
      setTheme,
      userId,
      profileQuery.isLoading,
    ],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}

/** Optional hook for surfaces that may render outside ThemeProvider. */
export function useThemeOptional(): ThemeContextValue | null {
  return useContext(ThemeContext)
}
