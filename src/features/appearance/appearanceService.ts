import { supabase } from '@/lib/supabase'
import {
  isAppearance,
  validateAppearance,
  type Appearance,
} from '@/features/appearance/types'
import { devWarnArgs } from '@/lib/debug/devConsole'

export const appearanceQueryKeys = {
  all: ['user-appearance'] as const,
  byUser: (userId: string) => ['user-appearance', userId] as const,
}

export function validateAppearanceForPersist(
  value: unknown,
): Appearance | null {
  if (!isAppearance(value)) return null
  return value
}

export async function getUserAppearance(userId: string): Promise<Appearance> {
  const { data, error } = await supabase
    .from('profiles')
    .select('appearance')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    devWarnArgs('[appearance] getUserAppearance failed:', error.message)
    return validateAppearance(null)
  }

  return validateAppearance(
    (data as { appearance?: unknown } | null)?.appearance,
  )
}

export async function updateUserAppearance(
  userId: string,
  appearance: Appearance,
): Promise<
  { ok: true; appearance: Appearance } | { ok: false; error: string }
> {
  const validated = validateAppearanceForPersist(appearance)
  if (!validated) {
    return { ok: false, error: 'Nieprawidłowy wygląd aplikacji.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ appearance: validated })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      error: error.message || 'Nie udało się zapisać wyglądu.',
    }
  }

  if (!data) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: userId,
      appearance: validated,
    })
    if (insertError) {
      return {
        ok: false,
        error: insertError.message || 'Nie udało się zapisać wyglądu.',
      }
    }
  }

  return { ok: true, appearance: validated }
}
