import { supabase } from '@/lib/supabase'
import { isThemeId, validateThemeId, type ThemeId } from '@/features/theme/types'
import { devWarnArgs } from '@/lib/debug/devConsole'

export const themeQueryKeys = {
  all: ['user-theme'] as const,
  byUser: (userId: string) => ['user-theme', userId] as const,
}

export function validateThemeIdForPersist(value: unknown): ThemeId | null {
  if (!isThemeId(value)) return null
  return value
}

export async function getUserTheme(userId: string): Promise<ThemeId> {
  const { data, error } = await supabase
    .from('profiles')
    .select('theme_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    devWarnArgs('[theme] getUserTheme failed:', error.message)
    return validateThemeId(null)
  }

  return validateThemeId(data?.theme_id)
}

export async function updateUserTheme(
  userId: string,
  themeId: ThemeId,
): Promise<{ ok: true; themeId: ThemeId } | { ok: false; error: string }> {
  const validated = validateThemeIdForPersist(themeId)
  if (!validated) {
    return { ok: false, error: 'Nieprawidłowy identyfikator motywu.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ theme_id: validated })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message || 'Nie udało się zapisać motywu.' }
  }

  if (!data) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: userId,
      theme_id: validated,
    })
    if (insertError) {
      return {
        ok: false,
        error: insertError.message || 'Nie udało się zapisać motywu.',
      }
    }
  }

  return { ok: true, themeId: validated }
}
