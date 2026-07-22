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
import type { Session } from '@supabase/supabase-js'
import { authService } from '@/features/auth/services/authService'
import type {
  AuthResult,
  AuthUser,
  LoginResult,
  RegisterInput,
  RegisterResultData,
} from '@/features/auth/types'
import { markLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'
import { resetTenantClientState } from '@/lib/auth/resetTenantClientState'

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

function sessionAuthUserId(session: Session | null): string | null {
  if (!authService.isSessionAuthenticated(session) || !session?.user) return null
  return session.user.id
}

/**
 * Apply auth identity transitions.
 * Clears tenant caches only when auth.uid() actually changes.
 * TOKEN_REFRESHED with the same uid keeps the React Query cache intact.
 */
function applyAuthIdentityChange(
  previousUserId: string | null,
  nextUserId: string | null,
): string | null {
  if (previousUserId === nextUserId) return previousUserId
  resetTenantClientState()
  return nextUserId
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const lastAuthUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true

    const unsubscribe = authService.onAuthStateChange((event, session) => {
      if (!mounted) return

      const nextUserId = sessionAuthUserId(session)

      switch (event) {
        case 'INITIAL_SESSION': {
          lastAuthUserIdRef.current = applyAuthIdentityChange(
            lastAuthUserIdRef.current,
            nextUserId,
          )
          if (nextUserId && session?.user) {
            setUser(authService.toAuthUser(session.user))
            setIsPasswordRecovery(false)
          } else {
            setUser(null)
          }
          setIsLoading(false)
          break
        }

        case 'SIGNED_IN': {
          lastAuthUserIdRef.current = applyAuthIdentityChange(
            lastAuthUserIdRef.current,
            nextUserId,
          )
          if (nextUserId && session?.user) {
            setUser(authService.toAuthUser(session.user))
            setIsPasswordRecovery(false)
          } else {
            setUser(null)
          }
          setIsLoading(false)
          break
        }

        case 'SIGNED_OUT': {
          lastAuthUserIdRef.current = applyAuthIdentityChange(
            lastAuthUserIdRef.current,
            null,
          )
          setUser(null)
          setIsPasswordRecovery(false)
          setIsLoading(false)
          break
        }

        case 'TOKEN_REFRESHED': {
          // Same uid → keep tenant cache. Identity change (rare) → reset.
          lastAuthUserIdRef.current = applyAuthIdentityChange(
            lastAuthUserIdRef.current,
            nextUserId,
          )
          if (nextUserId && session?.user) {
            setUser(authService.toAuthUser(session.user))
          } else {
            setUser(null)
          }
          break
        }

        case 'USER_UPDATED': {
          lastAuthUserIdRef.current = applyAuthIdentityChange(
            lastAuthUserIdRef.current,
            nextUserId,
          )
          if (nextUserId && session?.user) {
            setUser(authService.toAuthUser(session.user))
          } else {
            setUser(null)
          }
          break
        }

        case 'PASSWORD_RECOVERY': {
          setIsPasswordRecovery(true)
          // Recovery session is not full studio auth — do not expose CRM user.
          lastAuthUserIdRef.current = applyAuthIdentityChange(
            lastAuthUserIdRef.current,
            null,
          )
          setUser(null)
          setIsLoading(false)
          break
        }

        default: {
          // Future Supabase events: still enforce identity isolation.
          lastAuthUserIdRef.current = applyAuthIdentityChange(
            lastAuthUserIdRef.current,
            nextUserId,
          )
          if (nextUserId && session?.user) {
            setUser(authService.toAuthUser(session.user))
          } else if (!session) {
            setUser(null)
          }
          break
        }
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
        // onAuthStateChange(SIGNED_IN) also runs; identity compare is idempotent.
        lastAuthUserIdRef.current = applyAuthIdentityChange(
          lastAuthUserIdRef.current,
          result.user.id,
        )
        setUser(result.user)
        setIsPasswordRecovery(false)
        setIsLoading(false)
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
    // Ensure ProtectedRoute sends users to `/` instead of racing to `/login`.
    markLogoutRedirectToLanding()
    await authService.logout()
    // SIGNED_OUT handler also clears; keep explicit for immediate UI reset.
    lastAuthUserIdRef.current = applyAuthIdentityChange(
      lastAuthUserIdRef.current,
      null,
    )
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
