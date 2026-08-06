import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'

export interface CurrentStudioUser {
  id: string
  email: string
  displayName: string
  firstName?: string
  lastName?: string
  initials?: string
}

let cachedUser: CurrentStudioUser | null = null
let cachedUserId: string | null = null

function getUserMetadataName(user: User | null): string | null {
  const md = (user?.user_metadata ?? {}) as Record<string, unknown>
  const first =
    typeof md.first_name === 'string' ? md.first_name.trim() : ''
  const last = typeof md.last_name === 'string' ? md.last_name.trim() : ''
  const fromParts = `${first} ${last}`.trim()
  if (fromParts) return fromParts
  if (typeof md.name === 'string') {
    const trimmed = md.name.trim()
    return trimmed ? trimmed : null
  }
  return null
}

function toEmailPrefix(email: string): string {
  return email.split('@')[0] || 'Studio'
}

function initialsFromName(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
  }
  return displayName.charAt(0).toUpperCase() || '—'
}

/**
 * Resolve the logged-in studio owner from Auth + public.profiles (+ users fallback).
 * Display name priority: profiles → auth metadata → public.users.name → email prefix.
 */
export async function getCurrentStudioUser(): Promise<CurrentStudioUser> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  throwOnError(authError)

  const supabaseUser = authData.user
  const email = supabaseUser?.email?.trim().toLowerCase()
  if (!supabaseUser?.id || !email) {
    throw new Error('Brak sesji. Zaloguj się, aby zarządzać ślubami.')
  }

  if (cachedUser && cachedUserId === supabaseUser.id) return cachedUser

  const profileRes = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', supabaseUser.id)
    .maybeSingle()
  throwOnError(profileRes.error)

  const profileFirst =
    typeof profileRes.data?.first_name === 'string'
      ? profileRes.data.first_name.trim()
      : ''
  const profileLast =
    typeof profileRes.data?.last_name === 'string'
      ? profileRes.data.last_name.trim()
      : ''
  const profileName = `${profileFirst} ${profileLast}`.trim()

  const byId = await supabase
    .from('users')
    .select('id,name')
    .eq('id', supabaseUser.id)
    .maybeSingle()
  throwOnError(byId.error)

  if (!byId.data?.id) {
    throw new Error(
      'Brak konta studia powiązanego z zalogowanym użytkownikiem. Wyloguj się i zarejestruj ponownie.',
    )
  }

  const metadataName = getUserMetadataName(supabaseUser)
  const emailPrefix = toEmailPrefix(email)
  const publicName =
    typeof byId.data.name === 'string' ? byId.data.name.trim() : null

  const displayName = profileName || metadataName || publicName || emailPrefix
  const initials = initialsFromName(displayName)

  cachedUser = {
    id: byId.data.id,
    email,
    displayName,
    firstName: profileFirst || undefined,
    lastName: profileLast || undefined,
    initials,
  }
  cachedUserId = supabaseUser.id

  return cachedUser
}

/** Resolve the studio owner UUID (public.users.id) for service writes. */
export async function resolveStudioUserId(): Promise<string> {
  return (await getCurrentStudioUser()).id
}

/** Clear cache on logout / profile update so the next resolve is fresh. */
export function clearStudioUserCache(): void {
  cachedUser = null
  cachedUserId = null
}
