/**
 * Application appearance — independent from ThemeId and InterfaceStyle.
 * Persisted on profiles.appearance.
 * Exactly two explicit modes: light | dark (no system/auto).
 */

export const APPEARANCE_IDS = ['light', 'dark'] as const

export type Appearance = (typeof APPEARANCE_IDS)[number]

export const DEFAULT_APPEARANCE: Appearance = 'light'

export const APPEARANCE_OPTIONS: readonly {
  id: Appearance
  name: string
  description: string
}[] = [
  {
    id: 'light',
    name: 'Jasny',
    description: 'Obecny, jasny wygląd panelu OurWed.',
  },
  {
    id: 'dark',
    name: 'Ciemny',
    description: 'Ciepły, elegancki wygląd panelu po zmroku.',
  },
]

export function isAppearance(value: unknown): value is Appearance {
  return (
    typeof value === 'string' &&
    (APPEARANCE_IDS as readonly string[]).includes(value)
  )
}

export function validateAppearance(value: unknown): Appearance {
  return isAppearance(value) ? value : DEFAULT_APPEARANCE
}

export type AppearancePersistStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
