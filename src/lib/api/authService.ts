/**
 * Studio auth service — mock only.
 * Single source of truth for temporary login credentials.
 * Future: replace with supabase.auth.signInWithPassword / signOut / getSession.
 */

const STORAGE_KEY = 'ourwed_auth'

/** The only mock studio user. Do not duplicate these elsewhere. */
export const MOCK_STUDIO_USER = {
  email: 'admin@ourwed.pl',
  password: 'admin',
  name: 'Marcin',
  role: 'Administrator',
  initials: 'M',
} as const

export interface AuthUser {
  email: string
  name: string
  role: string
  initials: string
}

export interface AuthSession {
  authenticated: true
  user: AuthUser
}

export type LoginResult =
  | { success: true; user: AuthUser }
  | { success: false; error: string }

function toAuthUser(): AuthUser {
  return {
    email: MOCK_STUDIO_USER.email,
    name: MOCK_STUDIO_USER.name,
    role: MOCK_STUDIO_USER.role,
    initials: MOCK_STUDIO_USER.initials,
  }
}

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      authenticated?: boolean
      user?: Partial<AuthUser>
    }

    if (parsed?.authenticated !== true || !parsed.user?.email) {
      return null
    }

    return {
      authenticated: true,
      user: {
        email: parsed.user.email,
        name: parsed.user.name ?? MOCK_STUDIO_USER.name,
        role: parsed.user.role ?? MOCK_STUDIO_USER.role,
        initials:
          parsed.user.initials ??
          (parsed.user.name ?? MOCK_STUDIO_USER.name).charAt(0).toUpperCase(),
      },
    }
  } catch {
    return null
  }
}

function writeSession(user: AuthUser): void {
  const session: AuthSession = { authenticated: true, user }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export const authService = {
  getSession(): AuthSession | null {
    return readSession()
  },

  isAuthenticated(): boolean {
    return readSession() !== null
  },

  /**
   * Plain-text compare against MOCK_STUDIO_USER.
   * No hashing. No usernames. No backend.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const enteredEmail = String(email ?? '').trim().toLowerCase()
    const enteredPassword = String(password ?? '').trim()

    const emailMatches = enteredEmail === MOCK_STUDIO_USER.email
    const passwordMatches = enteredPassword === MOCK_STUDIO_USER.password

    if (!emailMatches || !passwordMatches) {
      return {
        success: false,
        error: 'Nieprawidłowy adres e-mail lub hasło.',
      }
    }

    const user = toAuthUser()
    writeSession(user)
    return { success: true, user }
  },

  logout(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
