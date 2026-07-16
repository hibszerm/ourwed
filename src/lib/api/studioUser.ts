import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { authService } from '@/lib/api/authService'

export interface CurrentStudioUser {
  id: string
  email: string
  displayName: string
  initials?: string
}

let cachedUser: CurrentStudioUser | null = null
let cachedEmail: string | null = null

function getUserMetadataName(user: User | null): string | null {
  const md = (user?.user_metadata ?? {}) as Record<string, unknown>
  if (typeof md.name !== 'string') return null
  const trimmed = md.name.trim()
  return trimmed ? trimmed : null
}

function toEmailPrefix(email: string): string {
  return email.split('@')[0]
}

/**
 * Resolve the logged-in studio owner from authService + public.users.
 *
 * Name resolution order:
 * 1) user.user_metadata.name
 * 2) public.users.name
 * 3) email prefix (part before "@")
 *
 * Cached per email to avoid repeated lookups.
 * public.users columns: id, email, name, avatar_url, created_at only.
 */
export async function getCurrentStudioUser(): Promise<CurrentStudioUser> {
  const email = authService.getCurrentUser()?.email
  if (!email) {
    throw new Error('Brak sesji. Zaloguj się, aby zarządzać ślubami.')
  }

  const normalizedEmail = email.toLowerCase()
  if (cachedUser && cachedEmail === normalizedEmail) return cachedUser

  let supabaseUser: User | null = null
  try {
    const { data } = await supabase.auth.getUser()
    supabaseUser = data.user
  } catch {
    supabaseUser = null
  }

  const { data: publicUser, error } = await supabase
    .from('users')
    .select('id,name')
    .eq('email', normalizedEmail)
    .maybeSingle()
  throwOnError(error)

  if (!publicUser?.id) {
    throw new Error(
      `Brak konta w public.users dla ${normalizedEmail}. Dodaj użytkownika studio w Supabase.`,
    )
  }

  const metadataName = getUserMetadataName(supabaseUser)
  const emailPrefix = toEmailPrefix(normalizedEmail)
  const publicName =
    typeof publicUser.name === 'string' ? publicUser.name.trim() : null

  const displayName = metadataName ?? publicName ?? emailPrefix
  const id = publicUser.id as string
  const initials = displayName.charAt(0).toUpperCase()

  cachedUser = { id, email: normalizedEmail, displayName, initials }
  cachedEmail = normalizedEmail

  return cachedUser
}

/** Resolve the studio owner UUID (public.users.id) for service writes. */
export async function resolveStudioUserId(): Promise<string> {
  return (await getCurrentStudioUser()).id
}

/** Clear cache on logout so the next login re-resolves. */
export function clearStudioUserCache(): void {
  cachedUser = null
  cachedEmail = null
}
