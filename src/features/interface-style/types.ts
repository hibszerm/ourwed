/**
 * Application interface style — independent from color ThemeId.
 * Persisted on profiles.interface_style.
 */

export const INTERFACE_STYLE_IDS = ['classic', 'modern'] as const

export type InterfaceStyle = (typeof INTERFACE_STYLE_IDS)[number]

export const DEFAULT_INTERFACE_STYLE: InterfaceStyle = 'classic'

export const INTERFACE_STYLE_OPTIONS: readonly {
  id: InterfaceStyle
  name: string
  description: string
}[] = [
  {
    id: 'classic',
    name: 'Interfejs Classic',
    description: 'Dotychczasowy układ ekranów OurWed.',
  },
  {
    id: 'modern',
    name: 'Interfejs Modern',
    description: 'Nowy, redakcyjny układ pulpitu i list.',
  },
]

/**
 * Screens that currently have a Modern *page* implementation.
 * Does not control the application shell — that follows interfaceStyle globally.
 * All other routes keep Classic page content until explicitly migrated.
 */
export const SCREENS_WITH_MODERN_PRESENTATION = [
  'dashboard',
  'weddings',
  'wedding',
  'sessions',
  'session',
  'calendar',
] as const

export type ModernizableScreen = (typeof SCREENS_WITH_MODERN_PRESENTATION)[number]

export function isInterfaceStyle(value: unknown): value is InterfaceStyle {
  return (
    typeof value === 'string' &&
    (INTERFACE_STYLE_IDS as readonly string[]).includes(value)
  )
}

export function validateInterfaceStyle(value: unknown): InterfaceStyle {
  return isInterfaceStyle(value) ? value : DEFAULT_INTERFACE_STYLE
}

export type InterfaceStylePersistStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'

export function hasModernPresentation(screen: string): boolean {
  return (SCREENS_WITH_MODERN_PRESENTATION as readonly string[]).includes(
    screen,
  )
}

export function resolveScreenPresentation(
  screen: string,
  interfaceStyle: InterfaceStyle,
): InterfaceStyle {
  if (interfaceStyle !== 'modern') return 'classic'
  return hasModernPresentation(screen) ? 'modern' : 'classic'
}
