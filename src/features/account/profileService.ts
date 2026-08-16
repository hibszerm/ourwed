import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { clearStudioUserCache } from '@/lib/api/studioUser'
import { devWarnArgs } from '@/lib/debug/devConsole'

export type AccountProfile = {
  id: string
  firstName: string
  lastName: string
  email: string
}

export const accountProfileQueryKey = (userId: string) =>
  ['account-profile', userId] as const

async function requireAuthUser(): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.auth.getUser()
  throwOnError(error)
  const user = data.user
  const email = user?.email?.trim() ?? ''
  if (!user?.id) {
    throw new Error('Brak sesji. Zaloguj się ponownie.')
  }
  return { id: user.id, email }
}

/**
 * Load the authenticated user's profile names from public.profiles.
 * Email comes from the Auth session (read-only on Account settings).
 */
export async function getOwnAccountProfile(): Promise<AccountProfile> {
  const auth = await requireAuthUser()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', auth.id)
    .maybeSingle()

  throwOnError(error)

  if (!data?.id) {
    throw new Error(
      'Nie znaleziono profilu konta. Wyloguj się i zaloguj ponownie, albo skontaktuj się z pomocą.',
    )
  }

  return {
    id: data.id,
    firstName: typeof data.first_name === 'string' ? data.first_name : '',
    lastName: typeof data.last_name === 'string' ? data.last_name : '',
    email: auth.email,
  }
}

/**
 * Update only first_name / last_name for the authenticated user.
 * Also refreshes public.users.name for legacy display consumers.
 */
export async function updateOwnAccountNames(input: {
  firstName: string
  lastName: string
}): Promise<AccountProfile> {
  const auth = await requireAuthUser()
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const displayName = `${firstName} ${lastName}`.trim()

  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
    })
    .eq('id', auth.id)
    .select('id, first_name, last_name')
    .maybeSingle()

  throwOnError(error)

  if (!data?.id) {
    throw new Error('Nie udało się zapisać danych. Spróbuj ponownie.')
  }

  // Keep public.users.name aligned for legacy readers (same ownership id).
  const usersUpdate = await supabase
    .from('users')
    .update({ name: displayName })
    .eq('id', auth.id)
  if (usersUpdate.error) {
    devWarnArgs('[account] public.users.name sync failed:', usersUpdate.error.message)
  }

  clearStudioUserCache()

  return {
    id: data.id,
    firstName: typeof data.first_name === 'string' ? data.first_name : firstName,
    lastName: typeof data.last_name === 'string' ? data.last_name : lastName,
    email: auth.email,
  }
}
