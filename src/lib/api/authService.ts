/**
 * Studio auth service — mock only.
 * Sole owner of the authenticated studio session.
 * Future: replace with supabase.auth.signInWithPassword / signOut / getSession.
 */

const STORAGE_KEY = 'ourwed_auth'

/** The only mock studio user. Do not duplicate these elsewhere. */
export const MOCK_STUDIO_USER = {
  email: 'admin@ourwed.pl',
  password: 'test123456',
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

type AuthListener = () => void

/** Live session — single source of truth. localStorage is persistence only. */
let currentSession: AuthSession | null = null
const listeners = new Set<AuthListener>()

function emitAuthChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

function deriveDisplayName(email: string): string {
  return email.split('@')[0]
}

function deriveInitials(displayName: string): string {
  const letter = displayName.trim().charAt(0)
  return letter ? letter.toUpperCase() : '—'
}

function toAuthUser(): AuthUser {
  const email = MOCK_STUDIO_USER.email
  const name = deriveDisplayName(email)
  const role = 'Studio'
  return {
    email,
    name,
    role,
    initials: deriveInitials(name),
  }
}

function parseStoredSession(raw: string): AuthSession | null {
  try {
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
        name:
          typeof parsed.user.name === 'string' && parsed.user.name.trim()
            ? parsed.user.name
            : deriveDisplayName(parsed.user.email),
        role:
          typeof parsed.user.role === 'string' && parsed.user.role.trim()
            ? parsed.user.role
            : 'Studio',
        initials:
          typeof parsed.user.initials === 'string' &&
          parsed.user.initials.trim()
            ? parsed.user.initials
            : deriveInitials(
                typeof parsed.user.name === 'string' &&
                  parsed.user.name.trim()
                  ? parsed.user.name
                  : deriveDisplayName(parsed.user.email),
              ),
      },
    }
  } catch {
    return null
  }
}

function readPersistedSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseStoredSession(raw)
  } catch {
    return null
  }
}

function writeSession(user: AuthUser): AuthSession {
  const session: AuthSession = { authenticated: true, user }
  currentSession = session
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Persistence failed — live session still held in memory.
  }
  emitAuthChange()
  return session
}

function clearSession(): void {
  currentSession = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  emitAuthChange()
}

export const authService = {
  /**
   * Subscribe to session changes (login / logout / hydrate).
   * Used by AuthProvider to re-render — does not store a second user copy.
   */
  subscribe(listener: AuthListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Live session (memory), hydrating from localStorage when memory is empty.
   */
  getSession(): AuthSession | null {
    if (currentSession) return currentSession
    currentSession = readPersistedSession()
    return currentSession
  },

  /** Current studio user, or null when logged out. */
  getCurrentUser(): AuthUser | null {
    return authService.getSession()?.user ?? null
  },

  isAuthenticated(): boolean {
    return authService.getSession() !== null
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

    const session = writeSession(toAuthUser())
    return { success: true, user: session.user }
  },

  logout(): void {
    clearSession()
    // Lazy import avoids circular dependency with studioUser → authService.
    void import('@/lib/api/studioUser').then((m) => m.clearStudioUserCache())
  },
}
