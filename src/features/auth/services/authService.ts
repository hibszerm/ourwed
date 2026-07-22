/**
 * Supabase Auth service — sole owner of authentication API calls.
 * No React imports. Safe to reuse from a future React Native client.
 */

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { mapAuthError } from '@/features/auth/services/authErrors'
import { clearStudioUserCache } from '@/lib/api/studioUser'
import { resetTenantClientState } from '@/lib/auth/resetTenantClientState'
import type {
  AuthResult,
  AuthUser,
  LoginResult,
  RegisterInput,
  RegisterResultData,
} from '@/features/auth/types'

const REMEMBER_KEY = 'ourwed_auth_remember'

function appOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
}

function metadataString(user: User, key: string): string | null {
  const value = user.user_metadata?.[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export function toAuthUser(user: User): AuthUser {
  const firstName = metadataString(user, 'first_name')
  const lastName = metadataString(user, 'last_name')
  const fullFromParts = [firstName, lastName].filter(Boolean).join(' ').trim()
  const metaName = metadataString(user, 'name')
  const email = user.email?.trim().toLowerCase() || ''
  const name =
    fullFromParts ||
    metaName ||
    (email ? email.split('@')[0]! : 'Studio')

  return {
    id: user.id,
    email,
    name,
    role: 'Studio',
    initials: deriveInitials(name),
    emailConfirmed: Boolean(user.email_confirmed_at),
    profession: metadataString(user, 'profession'),
    firstName,
    lastName,
  }
}

function isSessionAuthenticated(session: Session | null): boolean {
  if (!session?.user) return false
  // Require confirmed email for app access when confirmation is enabled.
  if (!session.user.email_confirmed_at) return false
  return true
}

export function getRememberMePreference(): boolean {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (raw == null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export function setRememberMePreference(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
  } catch {
    // ignore
  }
}

export const authService = {
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession()
    if (error) return null
    return data.session
  },

  async getUser(): Promise<User | null> {
    const { data, error } = await supabase.auth.getUser()
    if (error) return null
    return data.user
  },

  isSessionAuthenticated,

  toAuthUser,

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): () => void {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session)
    })
    return () => data.subscription.unsubscribe()
  },

  async login(
    email: string,
    password: string,
    options?: { rememberMe?: boolean },
  ): Promise<LoginResult> {
    try {
      if (options?.rememberMe != null) {
        setRememberMePreference(options.rememberMe)
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        return {
          success: false,
          error: mapAuthError(error, 'Nie udało się zalogować.'),
        }
      }

      if (!data.user || !data.session) {
        return { success: false, error: 'Nie udało się zalogować.' }
      }

      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut()
        return {
          success: false,
          error: 'Sprawdź swoją skrzynkę e-mail i aktywuj konto.',
        }
      }

      clearStudioUserCache()
      // Full tenant reset happens in AuthProvider when SIGNED_IN sees a new uid.
      return { success: true, user: toAuthUser(data.user) }
    } catch (err) {
      return {
        success: false,
        error: mapAuthError(err, 'Nie udało się zalogować.'),
      }
    }
  },

  async register(
    input: RegisterInput,
  ): Promise<AuthResult<RegisterResultData>> {
    try {
      const email = input.email.trim().toLowerCase()
      const firstName = input.firstName.trim()
      const lastName = input.lastName.trim()
      const fullName = `${firstName} ${lastName}`.trim()

      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          emailRedirectTo: `${appOrigin()}/login`,
          data: {
            first_name: firstName,
            last_name: lastName,
            name: fullName,
            profession: input.profession,
          },
        },
      })

      if (error) {
        return {
          success: false,
          error: mapAuthError(error, 'Nie udało się utworzyć konta.'),
        }
      }

      // Supabase may return an empty identities array when the email already exists.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { success: false, error: 'To konto już istnieje.' }
      }

      const needsEmailConfirmation = !data.session || !data.user?.email_confirmed_at

      // Never keep an unverified session in the app.
      if (data.session && !data.user?.email_confirmed_at) {
        await supabase.auth.signOut()
      }

      return {
        success: true,
        data: {
          email,
          needsEmailConfirmation,
        },
      }
    } catch (err) {
      return {
        success: false,
        error: mapAuthError(err, 'Nie udało się utworzyć konta.'),
      }
    }
  },

  async requestPasswordReset(email: string): Promise<AuthResult> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${appOrigin()}/reset-password` },
      )
      if (error) {
        return {
          success: false,
          error: mapAuthError(error, 'Nie udało się wysłać wiadomości.'),
        }
      }
      return { success: true, data: undefined }
    } catch (err) {
      return {
        success: false,
        error: mapAuthError(err, 'Nie udało się wysłać wiadomości.'),
      }
    }
  },

  async updatePassword(password: string): Promise<AuthResult> {
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        return {
          success: false,
          error: mapAuthError(error, 'Nie udało się zmienić hasła.'),
        }
      }
      return { success: true, data: undefined }
    } catch (err) {
      return {
        success: false,
        error: mapAuthError(err, 'Nie udało się zmienić hasła.'),
      }
    }
  },

  async logout(): Promise<void> {
    // AuthProvider also resets on SIGNED_OUT; clear immediately so no in-flight
    // studio resolution can resolve against the previous uid.
    resetTenantClientState()
    await supabase.auth.signOut()
  },
}
