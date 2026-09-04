/**
 * Settings Phase 0.1 — shell / information architecture acceptance.
 * Horizontal desktop navigation. No mutation or query-key changes.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getSettingsNavGroup,
  getSettingsPrimaryHref,
  getSettingsPrimaryLabel,
  isDocumentTemplateSettingsPath,
  isSettingsNavRoute,
  shouldShowSettingsSecondaryNav,
  SETTINGS_DEFAULT_DESKTOP_PATH,
  SETTINGS_DESKTOP_MIN_WIDTH_PX,
  SETTINGS_INDEX_PATH,
  SETTINGS_NAV_GROUPS,
} from './settingsNav'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  settings-shell — ${msg}`)
}

const REQUIRED_LABELS = [
  'Profil studia',
  'Rozliczanie dojazdu',
  'Profil',
  'Wygląd',
  'Preferencje powiadomień',
  'Kalendarze',
  'Subskrypcja',
] as const

const FORBIDDEN_NAV_COPY = [
  'Pakiety',
  'Usługi dodatkowe',
  'Ankiety',
  'Zespół',
] as const

const SETTINGS_CHILD_PAGES = [
  'src/pages/CompanyDetailsPage.tsx',
  'src/pages/TravelSettingsPage.tsx',
  'src/pages/AccountSettingsPage.tsx',
  'src/pages/AppearanceSettingsPage.tsx',
  'src/pages/NotificationSettingsPage.tsx',
  'src/pages/CalendarIntegrationsPage.tsx',
  'src/pages/SubscriptionSettingsPage.tsx',
] as const

const SHELL_FILES = [
  'src/features/settings/settingsNav.ts',
  'src/features/settings/SettingsLayout.tsx',
  'src/features/settings/SettingsNavigation.tsx',
  'src/features/settings/useDesktopSettingsShell.ts',
  'src/pages/SettingsPage.tsx',
] as const

const DOMAIN_SERVICE_FILES = [
  'src/lib/api/companyDetailsService.ts',
  'src/lib/api/studioTravelSettingsService.ts',
  'src/features/calendar-integrations/calendarIntegrationsService.ts',
  'src/features/calendar-integrations/queryKeys.ts',
  'src/lib/api/packageService.ts',
  'src/lib/api/extraServiceService.ts',
] as const

const navLabels = SETTINGS_NAV_GROUPS.flatMap((group) =>
  group.destinations.map((destination) => destination.label),
)
const navSource = JSON.stringify(SETTINGS_NAV_GROUPS)
const primaryLabels = SETTINGS_NAV_GROUPS.map(getSettingsPrimaryLabel)

{
  for (const label of REQUIRED_LABELS) {
    assert(navLabels.includes(label), `nav contains ${label}`)
  }
  assert(primaryLabels.includes('Studio'), 'Studio primary')
  assert(primaryLabels.includes('Konto'), 'Konto primary')
  assert(primaryLabels.includes('Integracje'), 'Integracje primary')
  assert(primaryLabels.includes('Subskrypcja'), 'Subskrypcja primary')
  for (const copy of FORBIDDEN_NAV_COPY) {
    assert(!navSource.includes(copy), `nav does not contain ${copy}`)
  }
  assert(!navSource.includes('Wkrótce'), 'no team placeholder')
  console.log('PASS  taxonomy + K packages/extras/ankiety absent')
}

{
  const studio = getSettingsNavGroup('/ustawienia/firma')
  const travel = getSettingsNavGroup('/ustawienia/podroz')
  const profile = getSettingsNavGroup('/ustawienia/konto')
  const appearance = getSettingsNavGroup('/ustawienia/wyglad')
  const prefs = getSettingsNavGroup('/ustawienia/powiadomienia')
  const calendars = getSettingsNavGroup('/ustawienia/integracje')
  const plan = getSettingsNavGroup('/ustawienia/subskrypcja')
  assert(studio?.id === 'studio' && travel?.id === 'studio', 'C Studio grouping')
  assert(
    profile?.id === 'account' &&
      appearance?.id === 'account' &&
      prefs?.id === 'account',
    'D Konto grouping',
  )
  assert(calendars?.id === 'integrations', 'E Integracje grouping')
  assert(plan?.id === 'plan', 'F Subskrypcja grouping')
  assert(getSettingsPrimaryHref(studio!) === '/ustawienia/firma', 'Studio href')
  assert(getSettingsPrimaryHref(profile!) === '/ustawienia/konto', 'Konto href')
  assert(
    getSettingsPrimaryHref(calendars!) === '/ustawienia/integracje',
    'Integracje href',
  )
  assert(
    getSettingsPrimaryHref(plan!) === '/ustawienia/subskrypcja',
    'Subskrypcja href',
  )
  assert(shouldShowSettingsSecondaryNav(studio), 'Studio has secondary')
  assert(
    studio!.destinations.map((d) => d.label).join('|') ===
      'Profil studia|Rozliczanie dojazdu',
    'G Studio secondary labels',
  )
  assert(shouldShowSettingsSecondaryNav(profile), 'Konto has secondary')
  assert(
    profile!.destinations.map((d) => d.label).join('|') ===
      'Profil|Wygląd|Preferencje powiadomień',
    'H Konto secondary labels',
  )
  assert(!shouldShowSettingsSecondaryNav(calendars), 'Integracje no secondary')
  assert(!shouldShowSettingsSecondaryNav(plan), 'Subskrypcja no secondary')
  console.log('PASS  C–H primary/secondary grouping')
}

{
  const nested = [
    SETTINGS_INDEX_PATH,
    '/ustawienia/firma',
    '/ustawienia/podroz',
    '/ustawienia/konto',
    '/ustawienia/wyglad',
    '/ustawienia/powiadomienia',
    '/ustawienia/integracje',
    '/ustawienia/subskrypcja',
  ]
  for (const path of nested) {
    assert(isSettingsNavRoute(path), `sidebar active for ${path}`)
  }
  const inactive = [
    '/studio/pakiety',
    '/studio/uslugi',
    '/ankiety',
    '/powiadomienia',
    '/dashboard',
    '/ustawienia/nieistnieje',
  ]
  for (const path of inactive) {
    assert(!isSettingsNavRoute(path), `sidebar inactive for ${path}`)
  }
  console.log('PASS  L global sidebar matcher')
}

{
  const templateUrls = [
    '/ustawienia/dokumenty/szablony/abc',
    '/ustawienia/dokumenty/szablony/abc/analiza',
    '/ustawienia/dokumenty/szablony/abc/konfiguracja',
    '/ustawienia/dokumenty/szablony/abc/konfiguracja-pol',
    '/ustawienia/dokumenty/szablony',
    '/ustawienia/dokumenty',
  ]
  for (const path of templateUrls) {
    assert(isDocumentTemplateSettingsPath(path), `template IA for ${path}`)
    assert(!isSettingsNavRoute(path), `Settings inactive for template ${path}`)
    assert(!getSettingsNavGroup(path), `no Settings group for template ${path}`)
  }
  const sidebar = read('src/layouts/Sidebar.tsx')
  assert(sidebar.includes('isSettingsNavRoute'), 'sidebar uses explicit matcher')
  assert(!sidebar.includes("pathname.startsWith('/ustawienia')"), 'no prefix matcher')
  console.log('PASS  M document-template URLs')
}

{
  const nav = read('src/features/settings/SettingsNavigation.tsx')
  const layout = read('src/features/settings/SettingsLayout.tsx')
  const layoutCss = read('src/features/settings/SettingsLayout.module.css')
  assert(nav.includes('settings-primary-nav'), 'B primary nav test id')
  assert(nav.includes('settings-secondary-nav'), 'secondary nav test id')
  assert(nav.includes("aria-label=\"Kategorie ustawień\""), 'primary aria label')
  assert(layout.includes('SettingsPrimaryNavigation'), 'layout uses primary nav')
  assert(layout.includes('SettingsSecondaryNavigation'), 'layout uses secondary')
  assert(!nav.includes('settings-rail'), 'A no rail test id')
  assert(!layoutCss.includes('.rail'), 'A no rail CSS')
  assert(!layoutCss.includes('13.75rem'), 'A no reserved rail column')
  assert(
    !layoutCss.includes('grid-template-columns: 13.75rem'),
    'A no two-column rail grid',
  )
  assert(layoutCss.includes('flex-wrap: wrap'), 'nav wraps instead of clipping')
  assert(layoutCss.includes('flex-wrap: nowrap'), 'mobile tabs stay on one row')
  assert(layoutCss.includes('overflow-x: auto'), 'narrow tabs may scroll')
  assert(layoutCss.includes('max-width: 72rem'), 'contained Settings panel width')
  assert(layoutCss.includes('margin-inline: auto'), 'centered in AppLayout content')
  assert(!layoutCss.includes('max-width: 56rem'), 'panel is not article-narrow')
  assert(layoutCss.includes('--surface-primary'), 'panel uses semantic surface')
  assert(!layout.includes('useDesktopSettingsShell'), 'settings chrome is not viewport-gated')
  assert(layout.includes('SettingsPrimaryNavigation'), 'primary tabs on every viewport')
  assert(layout.includes('SettingsSecondaryNavigation'), 'secondary destinations stay inside the shell')
  assert(layout.includes('data-mobile-title'), 'mobile chapter title is presentation-only')
  assert(layout.includes('pageTitleGroup'), 'Konto/Studio chapter replaces duplicate destination titles on mobile')
  assert(!layout.includes("'hidden'"), 'category H1 is not hidden when it matches the active tab')
  assert(!layoutCss.includes("data-mobile-title='hidden'"), 'Integracje/Subskrypcja keep a visible category heading')
  assert(layoutCss.includes('padding: 0 8px'), 'narrow tabs use compact horizontal padding')
  assert(layoutCss.includes('padding: 0 14px'), 'desktop tab padding is preserved')
  assert(layoutCss.includes('font-size: 0.8125rem'), 'narrow tabs use compact type')
  assert(layoutCss.includes('min-height: var(--touch-target)'), 'narrow tabs keep 44px targets')
  assert(layoutCss.includes('min-height: 34px'), 'desktop tab height is preserved')
  console.log('PASS  A/B no vertical rail, horizontal primary nav')
}

{
  const indexPage = read('src/pages/SettingsPage.tsx')
  const layout = read('src/features/settings/SettingsLayout.tsx')
  const layoutCss = read('src/features/settings/SettingsLayout.module.css')
  assert(!indexPage.includes('SettingsMobileIndex'), 'I no mobile Settings directory')
  assert(indexPage.includes('Navigate'), 'I /ustawienia opens the workspace')
  assert(indexPage.includes('SETTINGS_DEFAULT_DESKTOP_PATH'), 'I default Studio destination')
  assert(!layout.includes('← Ustawienia'), 'J no back-to-directory link')
  assert(!layout.includes('settings-back'), 'J no mobile-only back control')
  assert(!layoutCss.includes('.backLink'), 'J no back-link chrome')
  assert(layout.includes('<AppLayout>'), 'J settings pages do not use a second AppLayout title')
  for (const page of SETTINGS_CHILD_PAGES) {
    const src = read(page)
    assert(src.includes('SettingsLayout'), `${page} uses SettingsLayout`)
    assert(!src.includes('← Ustawienia'), `${page} does not duplicate back link`)
  }
  console.log('PASS  I/J unified shell, no mobile directory')
}

{
  const page = read('src/pages/SettingsPage.tsx')
  assert(page.includes('Navigate'), 'desktop redirect')
  assert(SETTINGS_DEFAULT_DESKTOP_PATH === '/ustawienia/firma', 'default path')
  assert(SETTINGS_DESKTOP_MIN_WIDTH_PX === 768, '768 breakpoint')
  console.log('PASS  /ustawienia redirects to Studio')
}

{
  const router = read('src/routes/router.tsx')
  assert(router.includes("path: '/studio/pakiety'"), 'packages route stays')
  assert(router.includes('/studio/uslugi'), 'extras route stays')
  assert(router.includes('/ankiety'), 'questionnaires stay')
  assert(router.includes("path: '/ustawienia/dokumenty/szablony/:id'"), 'template routes stay')
  console.log('PASS  catalog routes unmoved')
}

{
  const forbiddenInShell = [
    'queryKey',
    'queryClient',
    'companyDetailsService',
    'studioTravelSettingsService',
    'calendarIntegrationsService',
    'packageService',
    'extraServiceService',
    'questionnaireTemplateService',
    'documentTemplateService',
  ]
  for (const file of SHELL_FILES) {
    const src = read(file)
    for (const token of forbiddenInShell) {
      assert(!src.includes(token), `${file} has no ${token}`)
    }
  }
  for (const file of DOMAIN_SERVICE_FILES) {
    assert(existsSync(join(ROOT, file)), `${file} still present`)
  }
  const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  assert(
    !migrations.some((name) => /settings.?shell|settings.?nav|settings.?ia/i.test(name)),
    'no Settings shell migration',
  )
  console.log('PASS  N query keys and services untouched by shell')
}

console.log('PASS  settings-shell acceptance')
