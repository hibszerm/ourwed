import { authService } from '@/lib/api/authService'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'

let cachedUserId: string | null = null
let cachedEmail: string | null = null

/**
 * Resolve the studio owner UUID.
 *
 * Today: looks up `public.users` by session email (mock auth).
 * Future Supabase Auth: prefer `session.user.id` when it matches `public.users.id`,
 * and keep email lookup only as a migration bridge.
 *
 * Cached per session email to avoid repeated lookups.
 */
export async function resolveStudioUserId(): Promise<string> {
  const session = authService.getSession()
  const email = session?.user.email
  if (!email) {
    throw new Error('Brak sesji. Zaloguj się, aby zarządzać ślubami.')
  }

  if (cachedUserId && cachedEmail === email) {
    return cachedUserId
  }

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  throwOnError(error)

  if (!data?.id) {
    throw new Error(
      `Brak konta w public.users dla ${email}. Dodaj użytkownika studio w Supabase.`,
    )
  }

  cachedUserId = data.id as string
  cachedEmail = email
  return cachedUserId
}

/** Clear cache on logout so the next login re-resolves. */
export function clearStudioUserCache(): void {
  cachedUserId = null
  cachedEmail = null
}
