import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authService } from '@/features/auth/services/authService'
import type {
  AuthResult,
  AuthUser,
  LoginResult,
  RegisterInput,
  RegisterResultData,
} from '@/features/auth/types'
import { clearStudioUserCache } from '@/lib/api/studioUser'

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  /** True while restoring session from Supabase on cold start. */
  isLoading: boolean
  /** Password-recovery session from email link (reset form). */
  isPasswordRecovery: boolean
  login: (
    email: string,
    password: string,
    options?: { rememberMe?: boolean },
  ) => Promise<LoginResult>
  register: (input: RegisterInput) => Promise<AuthResult<RegisterResultData>>
  requestPasswordReset: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  clearPasswordRecovery: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    let mounted = true

    void authService.getSession().then((session) => {
      if (!mounted) return
      if (authService.isSessionAuthenticated(session) && session?.user) {
        setUser(authService.toAuthUser(session.user))
      } else {
        setUser(null)
      }
      setIsLoading(false)
    })

    const unsubscribe = authService.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }

      if (event === 'SIGNED_OUT') {
        clearStudioUserCache()
        setUser(null)
        setIsPasswordRecovery(false)
        return
      }

      if (authService.isSessionAuthenticated(session) && session?.user) {
        setUser(authService.toAuthUser(session.user))
        clearStudioUserCache()
      } else if (event === 'PASSWORD_RECOVERY' && session?.user) {
        // Recovery session is temporary — not full app auth.
        setUser(null)
      } else if (!session) {
        setUser(null)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const login = useCallback(
    async (
      email: string,
      password: string,
      options?: { rememberMe?: boolean },
    ) => {
      const result = await authService.login(email, password, options)
      if (result.success) {
        setUser(result.user)
        setIsPasswordRecovery(false)
      }
      return result
    },
    [],
  )

  const register = useCallback(async (input: RegisterInput) => {
    return authService.register(input)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    return authService.requestPasswordReset(email)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const result = await authService.updatePassword(password)
    if (result.success) {
      setIsPasswordRecovery(false)
    }
    return result
  }, [])

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false)
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
    setIsPasswordRecovery(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user != null,
      isLoading,
      isPasswordRecovery,
      login,
      register,
      requestPasswordReset,
      updatePassword,
      clearPasswordRecovery,
      logout,
    }),
    [
      user,
      isLoading,
      isPasswordRecovery,
      login,
      register,
      requestPasswordReset,
      updatePassword,
      clearPasswordRecovery,
      logout,
    ],
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
