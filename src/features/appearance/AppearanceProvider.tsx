import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { applyAppearanceToDocument } from '@/features/appearance/applyAppearance'
import {
  readCachedAppearance,
  writeCachedAppearance,
} from '@/features/appearance/appearanceCache'
import {
  AppearanceContext,
  type AppearanceContextValue,
} from '@/features/appearance/appearanceContext'
import {
  getUserAppearance,
  appearanceQueryKeys,
  updateUserAppearance,
} from '@/features/appearance/appearanceService'
import {
  DEFAULT_APPEARANCE,
  validateAppearance,
  type Appearance,
  type AppearancePersistStatus,
} from '@/features/appearance/types'
import { applyThemeToDocument } from '@/features/theme/applyTheme'
import { useTheme } from '@/features/theme/ThemeProvider'
import { isPublicThemeSurfaceActive } from '@/features/theme/usePublicThemeIsolation'

function applyPrivateAppearance(appearance: Appearance, themeId: string) {
  if (isPublicThemeSurfaceActive()) return
  applyAppearanceToDocument(appearance)
  applyThemeToDocument(themeId, appearance)
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const { themeId } = useTheme()
  const queryClient = useQueryClient()
  const userId = user?.id ?? null

  const [appearance, setAppearanceState] = useState<Appearance>(() =>
    readCachedAppearance(null),
  )
  const [persistStatus, setPersistStatus] =
    useState<AppearancePersistStatus>('idle')
  const [persistError, setPersistError] = useState<string | null>(null)
  const appliedForUserRef = useRef<string | null>(null)

  const profileQuery = useQuery({
    queryKey: appearanceQueryKeys.byUser(userId ?? 'anon'),
    queryFn: () => getUserAppearance(userId!),
    enabled: Boolean(userId && isAuthenticated),
    staleTime: 60_000,
  })

  useEffect(() => {
    applyPrivateAppearance(appearance, themeId)
  }, [appearance, themeId])

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !userId) {
      appliedForUserRef.current = null
      const fallback = DEFAULT_APPEARANCE
      // Same account-preference reconcile as ThemeProvider.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from auth/DB
      setAppearanceState(fallback)
      applyPrivateAppearance(fallback, themeId)
      return
    }

    if (appliedForUserRef.current !== userId) {
      const cached = readCachedAppearance(userId)
      setAppearanceState(cached)
      applyPrivateAppearance(cached, themeId)
      writeCachedAppearance(cached, userId)
      appliedForUserRef.current = userId
    }

    if (profileQuery.data) {
      const fromDb = validateAppearance(profileQuery.data)
      setAppearanceState(fromDb)
      applyPrivateAppearance(fromDb, themeId)
      writeCachedAppearance(fromDb, userId)
    }
  }, [authLoading, isAuthenticated, userId, profileQuery.data, themeId])

  const setAppearance = useCallback(
    async (nextRaw: Appearance) => {
      const next = validateAppearance(nextRaw)
      const previous = appearance
      setAppearanceState(next)
      applyPrivateAppearance(next, themeId)
      writeCachedAppearance(next, userId)
      setPersistError(null)

      if (!userId || !isAuthenticated) {
        setPersistStatus('saved')
        return
      }

      setPersistStatus('saving')
      const result = await updateUserAppearance(userId, next)
      if (!result.ok) {
        setPersistStatus('error')
        setPersistError(result.error)
        setAppearanceState(previous)
        applyPrivateAppearance(previous, themeId)
        writeCachedAppearance(previous, userId)
        return
      }

      setPersistStatus('saved')
      void queryClient.setQueryData(appearanceQueryKeys.byUser(userId), next)
      window.setTimeout(() => {
        setPersistStatus((s) => (s === 'saved' ? 'idle' : s))
      }, 1600)
    },
    [appearance, themeId, userId, isAuthenticated, queryClient],
  )

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      persistStatus,
      persistError,
      setAppearance,
      isReconciling: Boolean(userId && profileQuery.isLoading),
    }),
    [
      appearance,
      persistStatus,
      persistError,
      setAppearance,
      userId,
      profileQuery.isLoading,
    ],
  )

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  )
}
