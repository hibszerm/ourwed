import {
  createContext,
  useCallback,
  useContext,
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
  user: AuthUser | null
  isAuthenticated: boolean
  /** Delegates entirely to authService.login — no local credential checks. */
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(
    () => authService.getSession()?.user ?? null,
  )

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password)
    if (result.success) {
      setUser(result.user)
    }
    return result
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user, login, logout],
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
