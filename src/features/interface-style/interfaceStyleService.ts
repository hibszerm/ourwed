import { supabase } from '@/lib/supabase'
import {
  isInterfaceStyle,
  validateInterfaceStyle,
  type InterfaceStyle,
} from '@/features/interface-style/types'
import { devWarnArgs } from '@/lib/debug/devConsole'

export const interfaceStyleQueryKeys = {
  all: ['user-interface-style'] as const,
  byUser: (userId: string) => ['user-interface-style', userId] as const,
}

export function validateInterfaceStyleForPersist(
  value: unknown,
): InterfaceStyle | null {
  if (!isInterfaceStyle(value)) return null
  return value
}

export async function getUserInterfaceStyle(
  userId: string,
): Promise<InterfaceStyle> {
  const { data, error } = await supabase
    .from('profiles')
    .select('interface_style')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    devWarnArgs('[interface-style] getUserInterfaceStyle failed:', error.message)
    return validateInterfaceStyle(null)
  }

  return validateInterfaceStyle(
    (data as { interface_style?: unknown } | null)?.interface_style,
  )
}

export async function updateUserInterfaceStyle(
  userId: string,
  interfaceStyle: InterfaceStyle,
): Promise<
  { ok: true; interfaceStyle: InterfaceStyle } | { ok: false; error: string }
> {
  const validated = validateInterfaceStyleForPersist(interfaceStyle)
  if (!validated) {
    return { ok: false, error: 'Nieprawidłowy styl interfejsu.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ interface_style: validated })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      error: error.message || 'Nie udało się zapisać stylu interfejsu.',
    }
  }

  if (!data) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: userId,
      interface_style: validated,
    })
    if (insertError) {
      return {
        ok: false,
        error:
          insertError.message || 'Nie udało się zapisać stylu interfejsu.',
      }
    }
  }

  return { ok: true, interfaceStyle: validated }
}
