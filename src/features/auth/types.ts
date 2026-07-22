/**
 * Auth domain types — platform-agnostic (web + future React Native).
 */

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  initials: string
  emailConfirmed: boolean
  profession: string | null
  firstName: string | null
  lastName: string | null
}

export type AuthResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export type LoginResult =
  | { success: true; user: AuthUser }
  | { success: false; error: string }

export interface RegisterInput {
  firstName: string
  lastName: string
  email: string
  password: string
  profession: string
}

export interface RegisterResultData {
  email: string
  /** True when Supabase requires email confirmation before login. */
  needsEmailConfirmation: boolean
}
