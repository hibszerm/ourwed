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
import {
  readCachedInterfaceStyle,
  writeCachedInterfaceStyle,
} from '@/features/interface-style/interfaceStyleCache'
import {
  getUserInterfaceStyle,
  interfaceStyleQueryKeys,
  updateUserInterfaceStyle,
} from '@/features/interface-style/interfaceStyleService'
import {
  InterfaceStyleContext,
  type InterfaceStyleContextValue,
} from '@/features/interface-style/interfaceStyleContext'
import {
  DEFAULT_INTERFACE_STYLE,
  validateInterfaceStyle,
  type InterfaceStyle,
  type InterfaceStylePersistStatus,
} from '@/features/interface-style/types'

export function InterfaceStyleProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id ?? null

  const [interfaceStyle, setInterfaceStyleState] = useState<InterfaceStyle>(() =>
    readCachedInterfaceStyle(null),
  )
  const [persistStatus, setPersistStatus] =
    useState<InterfaceStylePersistStatus>('idle')
  const [persistError, setPersistError] = useState<string | null>(null)
  const appliedForUserRef = useRef<string | null>(null)

  const profileQuery = useQuery({
    queryKey: interfaceStyleQueryKeys.byUser(userId ?? 'anon'),
    queryFn: () => getUserInterfaceStyle(userId!),
    enabled: Boolean(userId && isAuthenticated),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !userId) {
      appliedForUserRef.current = null
      const fallback = DEFAULT_INTERFACE_STYLE
      // Same account-preference reconcile as ThemeProvider.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from auth/DB
      setInterfaceStyleState(fallback)
      return
    }

    if (appliedForUserRef.current !== userId) {
      const cached = readCachedInterfaceStyle(userId)
      setInterfaceStyleState(cached)
      writeCachedInterfaceStyle(cached, userId)
      appliedForUserRef.current = userId
    }

    if (profileQuery.data) {
      const fromDb = validateInterfaceStyle(profileQuery.data)
      setInterfaceStyleState(fromDb)
      writeCachedInterfaceStyle(fromDb, userId)
    }
  }, [authLoading, isAuthenticated, userId, profileQuery.data])

  const setInterfaceStyle = useCallback(
    async (nextRaw: InterfaceStyle) => {
      const next = validateInterfaceStyle(nextRaw)
      const previous = interfaceStyle
      setInterfaceStyleState(next)
      writeCachedInterfaceStyle(next, userId)
      setPersistError(null)

      if (!userId || !isAuthenticated) {
        setPersistStatus('saved')
        return
      }

      setPersistStatus('saving')
      const result = await updateUserInterfaceStyle(userId, next)
      if (!result.ok) {
        setPersistStatus('error')
        setPersistError(result.error)
        setInterfaceStyleState(previous)
        writeCachedInterfaceStyle(previous, userId)
        return
      }

      setPersistStatus('saved')
      void queryClient.setQueryData(
        interfaceStyleQueryKeys.byUser(userId),
        next,
      )
      window.setTimeout(() => {
        setPersistStatus((s) => (s === 'saved' ? 'idle' : s))
      }, 1600)
    },
    [interfaceStyle, userId, isAuthenticated, queryClient],
  )

  const value = useMemo<InterfaceStyleContextValue>(
    () => ({
      interfaceStyle,
      persistStatus,
      persistError,
      setInterfaceStyle,
      isReconciling: Boolean(userId && profileQuery.isLoading),
    }),
    [
      interfaceStyle,
      persistStatus,
      persistError,
      setInterfaceStyle,
      userId,
      profileQuery.isLoading,
    ],
  )

  return (
    <InterfaceStyleContext.Provider value={value}>
      {children}
    </InterfaceStyleContext.Provider>
  )
}
