import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'

export interface CurrentStudioUser {
  id: string
  email: string
  displayName: string
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

/**
 * Resolve the logged-in studio owner from Supabase Auth + public.users.
 *
 * Prefer public.users.id = auth.uid() (created by signup trigger).
 * Falls back to email lookup for legacy rows.
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

  let publicUser: { id: string; name: string | null } | null = null

  const byId = await supabase
    .from('users')
    .select('id,name')
    .eq('id', supabaseUser.id)
    .maybeSingle()
  throwOnError(byId.error)

  if (byId.data?.id) {
    publicUser = byId.data
  }

  if (!publicUser?.id) {
    throw new Error(
      'Brak konta studia powiązanego z zalogowanym użytkownikiem. Wyloguj się i zarejestruj ponownie.',
    )
  }

  const metadataName = getUserMetadataName(supabaseUser)
  const emailPrefix = toEmailPrefix(email)
  const publicName =
    typeof publicUser.name === 'string' ? publicUser.name.trim() : null

  const displayName = metadataName ?? publicName ?? emailPrefix
  const initials = displayName.charAt(0).toUpperCase()

  cachedUser = {
    id: publicUser.id,
    email,
    displayName,
    initials,
  }
  cachedUserId = supabaseUser.id

  return cachedUser
}

/** Resolve the studio owner UUID (public.users.id) for service writes. */
export async function resolveStudioUserId(): Promise<string> {
  return (await getCurrentStudioUser()).id
}

/** Clear cache on logout so the next login re-resolves. */
export function clearStudioUserCache(): void {
  cachedUser = null
  cachedUserId = null
}
