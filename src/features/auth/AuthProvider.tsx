import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  authService,
  type AuthUser,
  type LoginResult,
} from '@/lib/api/authService'

interface AuthContextValue {
  /** Always read from authService — never an independent copy. */
  user: AuthUser | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Thin React adapter over authService (the only session owner).
 * Uses a revision counter solely to re-render — no duplicated user/session state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    // Hydrate memory from localStorage on mount (F5 / cold start).
    authService.getSession()
    return authService.subscribe(() => {
      setRevision((n) => n + 1)
    })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    return authService.login(email, password)
  }, [])

  const logout = useCallback(() => {
    authService.logout()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: authService.getCurrentUser(),
      isAuthenticated: authService.isAuthenticated(),
      login,
      logout,
    }),
    [login, logout, revision],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
