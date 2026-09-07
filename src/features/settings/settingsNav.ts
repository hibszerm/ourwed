/**
 * Settings information architecture — navigation only.
 *
 * Destinations are the actual Settings screens. Category labels are grouping,
 * not routes. Document-template URLs under /ustawienia/dokumenty belong to
 * Packages IA and must not be treated as Settings.
 */

export const SETTINGS_INDEX_PATH = '/ustawienia'
export const SETTINGS_DEFAULT_DESKTOP_PATH = '/ustawienia/firma'
export const SETTINGS_DESKTOP_MIN_WIDTH_PX = 768
export const SETTINGS_DESKTOP_MEDIA_QUERY = `(min-width: ${SETTINGS_DESKTOP_MIN_WIDTH_PX}px)`

export type SettingsNavGroupId = 'studio' | 'account' | 'integrations' | 'plan'

export interface SettingsNavDestination {
  path: string
  label: string
  hint: string
}

export interface SettingsNavGroup {
  id: SettingsNavGroupId
  /** Group label — also used as secondary-nav aria-label. */
  label: string
  /** Desktop primary-nav label. Defaults to `label` when omitted. */
  primaryLabel?: string
  destinations: readonly SettingsNavDestination[]
}

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    id: 'studio',
    label: 'Studio',
    destinations: [
      {
        path: '/ustawienia/firma',
        label: 'Profil studia',
        hint: 'Nazwa i e-mail kontaktowy dla klientów',
      },
      {
        path: '/ustawienia/podroz',
        label: 'Rozliczanie dojazdu',
        hint: 'Punkt startowy i zasady dojazdu',
      },
    ],
  },
  {
    id: 'account',
    label: 'Konto',
    destinations: [
      {
        path: '/ustawienia/konto',
        label: 'Profil',
        hint: 'Imię, nazwisko i e-mail',
      },
      {
        path: '/ustawienia/wyglad',
        label: 'Wygląd',
        hint: 'Styl interfejsu i motyw kolorystyczny panelu OurWed',
      },
      {
        path: '/ustawienia/powiadomienia',
        label: 'Preferencje powiadomień',
        hint: 'Alerty e-mail o ankietach',
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integracje',
    destinations: [
      {
        path: '/ustawienia/integracje',
        label: 'Kalendarze',
        hint: 'Google Calendar i Apple Calendar',
      },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    primaryLabel: 'Subskrypcja',
    destinations: [
      {
        path: '/ustawienia/subskrypcja',
        label: 'Subskrypcja',
        hint: 'Plan PRO i dostęp do OurWed',
      },
    ],
  },
] as const

export const SETTINGS_NAV_PATHS: readonly string[] = [
  SETTINGS_INDEX_PATH,
  ...SETTINGS_NAV_GROUPS.flatMap((group) =>
    group.destinations.map((destination) => destination.path),
  ),
]

export function normalizeSettingsPath(pathname: string): string {
  const noSearch = pathname.split('?')[0]?.split('#')[0] ?? '/'
  if (noSearch.length > 1 && noSearch.endsWith('/')) {
    return noSearch.slice(0, -1)
  }
  return noSearch || '/'
}

/**
 * Document-template machinery is routed under /ustawienia/dokumenty
 * but product IA treats it as a Packages child — not Settings.
 */
export function isDocumentTemplateSettingsPath(pathname: string): boolean {
  const path = normalizeSettingsPath(pathname)
  return (
    path === '/ustawienia/dokumenty' ||
    path.startsWith('/ustawienia/dokumenty/')
  )
}

/**
 * Explicit Settings-route matcher. Exact destinations only — never a
 * `/ustawienia` prefix match, so template URLs and operational catalogs
 * cannot light up the global Ustawienia item.
 */
export function isSettingsNavRoute(pathname: string): boolean {
  const path = normalizeSettingsPath(pathname)
  if (isDocumentTemplateSettingsPath(path)) return false
  return SETTINGS_NAV_PATHS.includes(path)
}

export function getSettingsNavGroup(
  pathname: string,
): SettingsNavGroup | undefined {
  const path = normalizeSettingsPath(pathname)
  return SETTINGS_NAV_GROUPS.find((group) =>
    group.destinations.some((destination) => destination.path === path),
  )
}

export function getSettingsPrimaryHref(group: SettingsNavGroup): string {
  return group.destinations[0]?.path ?? SETTINGS_INDEX_PATH
}

export function getSettingsPrimaryLabel(group: SettingsNavGroup): string {
  return group.primaryLabel ?? group.label
}

export function isSettingsPrimaryExactPage(group: SettingsNavGroup): boolean {
  return group.destinations.length === 1
}

export function shouldShowSettingsSecondaryNav(
  group: SettingsNavGroup | undefined,
): group is SettingsNavGroup {
  return Boolean(group && group.destinations.length > 1)
}
