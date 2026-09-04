/**
 * Classic / Modern interface style — independent from color ThemeId.
 * Run: npm run test:interface-style
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_INTERFACE_STYLE,
  INTERFACE_STYLE_IDS,
  isInterfaceStyle,
  resolveScreenPresentation,
  validateInterfaceStyle,
} from '@/features/interface-style/types'
import { validateInterfaceStyleForPersist } from '@/features/interface-style/interfaceStyleService'
import { resolveActiveShellPresentation } from '@/layouts/shellPresentation'
import { getTheme } from '@/features/theme/themeRegistry'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

{
  assert(INTERFACE_STYLE_IDS.includes('classic'), 'classic id')
  assert(INTERFACE_STYLE_IDS.includes('modern'), 'modern id')
  assertEq(DEFAULT_INTERFACE_STYLE, 'classic', 'safe default')
  assertEq(validateInterfaceStyle(null), 'classic', 'missing → classic')
  assertEq(validateInterfaceStyle(undefined), 'classic', 'undefined → classic')
  assertEq(validateInterfaceStyle(''), 'classic', 'empty → classic')
  assertEq(validateInterfaceStyle('classic'), 'classic', 'explicit classic')
  assertEq(validateInterfaceStyle('modern'), 'modern', 'explicit modern')
  assertEq(validateInterfaceStyle('graphite'), 'classic', 'theme id is not a style')
  assertEq(validateInterfaceStyle('v3'), 'classic', 'unsupported → classic')
  assertEq(validateInterfaceStyle('Classic'), 'classic', 'case-sensitive invalid → classic')
  assert(!isInterfaceStyle('classicGraphite'), 'no merged theme+style ids')
  assert(validateInterfaceStyleForPersist('modern') === 'modern', 'persist modern')
  assert(validateInterfaceStyleForPersist('classic') === 'classic', 'persist classic')
  assert(validateInterfaceStyleForPersist('v3') === null, 'invalid persist rejected')
  console.log('PASS  1. parser / default / invalid fallback')
}

{
  assertEq(
    resolveScreenPresentation('dashboard', 'classic'),
    'classic',
    'classic dashboard',
  )
  assertEq(
    resolveScreenPresentation('dashboard', 'modern'),
    'modern',
    'modern dashboard',
  )
  assertEq(
    resolveScreenPresentation('weddings', 'modern'),
    'modern',
    'weddings screen is modern-capable',
  )
  assertEq(
    resolveScreenPresentation('sessions', 'modern'),
    'modern',
    'sessions screen is modern-capable',
  )
  assertEq(
    resolveScreenPresentation('calendar', 'modern'),
    'modern',
    'calendar screen is modern-capable',
  )
  assertEq(
    resolveScreenPresentation('wedding', 'modern'),
    'modern',
    'wedding detail screen is modern-capable',
  )
  assertEq(
    resolveScreenPresentation('wedding', 'classic'),
    'classic',
    'classic wedding detail stays classic',
  )
  assertEq(
    resolveScreenPresentation('session', 'modern'),
    'modern',
    'session detail screen is modern-capable',
  )
  assertEq(
    resolveScreenPresentation('session', 'classic'),
    'classic',
    'classic session detail stays classic',
  )
  assertEq(
    resolveScreenPresentation('finance', 'modern'),
    'classic',
    'finance stays classic',
  )
  assertEq(
    resolveScreenPresentation('tasks', 'modern'),
    'classic',
    'tasks stay classic',
  )
  assertEq(
    resolveScreenPresentation('settings', 'modern'),
    'classic',
    'settings stay classic',
  )
  assertEq(
    resolveScreenPresentation('appearance', 'modern'),
    'classic',
    'appearance stays classic',
  )
  console.log('PASS  2. screen-by-screen modern registry')
}

{
  assertEq(
    resolveActiveShellPresentation('classic'),
    'default',
    'classic interface uses classic shell',
  )
  assertEq(
    resolveActiveShellPresentation('modern'),
    'v3',
    'modern interface uses modern shell',
  )
  assertEq(
    resolveScreenPresentation('weddings', 'modern'),
    'modern',
    'weddings page content is modern when registered',
  )
  assertEq(
    resolveScreenPresentation('sessions', 'modern'),
    'modern',
    'sessions page content is modern when registered',
  )
  assertEq(
    resolveScreenPresentation('calendar', 'modern'),
    'modern',
    'calendar page content is modern when registered',
  )
  assertEq(
    resolveActiveShellPresentation('modern'),
    'v3',
    'modern shell is independent of screen registry',
  )
  assertEq(
    resolveScreenPresentation('dashboard', 'modern'),
    'modern',
    'dashboard page content is modern',
  )
  assertEq(
    resolveScreenPresentation('dashboard', 'classic'),
    'classic',
    'classic dashboard page stays classic',
  )
  assertEq(
    resolveActiveShellPresentation('classic'),
    'default',
    'classic + unmigrated screen still uses classic shell',
  )
  assertEq(
    resolveActiveShellPresentation('modern'),
    'v3',
    'modern + unmigrated screen still uses modern shell',
  )
  console.log('PASS  2b. shell is independent from screen presentation')
}

{
  const service = read('src/features/interface-style/interfaceStyleService.ts')
  const themeService = read('src/features/theme/themeService.ts')
  const provider = read('src/features/interface-style/InterfaceStyleProvider.tsx')
  const themeProvider = read('src/features/theme/ThemeProvider.tsx')
  assert(service.includes("select('interface_style')"), 'reads interface_style')
  assert(service.includes('interface_style: validated'), 'writes interface_style')
  assert(!service.includes('theme_id'), 'style service does not touch theme_id')
  assert(!themeService.includes('interface_style'), 'theme service does not touch interface_style')
  assert(provider.includes('updateUserInterfaceStyle'), 'provider persists style')
  assert(!provider.includes('updateUserTheme'), 'style provider does not persist theme')
  assert(!provider.includes('setTheme('), 'style provider does not call setTheme')
  assert(!themeProvider.includes('interface_style'), 'theme provider does not persist style')
  assert(!themeProvider.includes('setInterfaceStyle'), 'theme provider does not call setInterfaceStyle')
  assert(provider.includes('readCachedInterfaceStyle'), 'hydrates from cache')
  assert(provider.includes('getUserInterfaceStyle'), 'reconciles from DB')
  assert(provider.includes("DEFAULT_INTERFACE_STYLE"), 'logged-out fallback classic')
  console.log('PASS  3. persistence independence + hydration path')
}

{
  const cache = read('src/features/interface-style/interfaceStyleCache.ts')
  const themeCache = read('src/features/theme/themeCache.ts')
  assert(cache.includes('ourwed:interface-style'), 'canonical style cache key')
  assert(cache.includes('ourwed:interface-style:u:'), 'per-user style cache')
  assert(themeCache.includes('ourwed:theme-id'), 'theme cache remains separate')
  assert(!cache.includes('ourwed:theme-id'), 'style cache does not reuse theme keys')
  console.log('PASS  4. cache keys are independent')
}

{
  const appearance = read('src/pages/AppearanceSettingsPage.tsx')
  const settingsNav = read('src/features/settings/settingsNav.ts')
  assert(appearance.includes('Styl interfejsu'), 'style heading')
  assert(appearance.includes('Motyw aplikacji'), 'theme heading kept')
  assert(appearance.includes('useInterfaceStyle'), 'style hook')
  assert(appearance.includes('useTheme'), 'theme hook')
  assert(appearance.includes('setInterfaceStyle'), 'style writer')
  assert(appearance.includes('setTheme'), 'theme writer')
  assert(appearance.includes('aria-label="Styl interfejsu"'), 'style radiogroup')
  assert(appearance.includes('aria-label="Motyw aplikacji"'), 'theme radiogroup')
  assert(settingsNav.includes('Styl interfejsu i motyw kolorystyczny'), 'settings hub copy')
  assert(appearance.includes('handleSelectStyle'), 'style switch lives on appearance')
  assert(appearance.includes('handleSelectTheme'), 'theme switch remains separate')
  const styleHandler = appearance.slice(
    appearance.indexOf('async function handleSelectStyle'),
    appearance.indexOf('const combinedStatus'),
  )
  assert(styleHandler.includes('setInterfaceStyle'), 'Modern↔Classic writes style')
  assert(!styleHandler.includes('setTheme'), 'style switch does not write themeId')
  const themeHandler = appearance.slice(
    appearance.indexOf('async function handleSelectTheme'),
    appearance.indexOf('async function handleSelectStyle'),
  )
  assert(themeHandler.includes('setTheme'), 'theme switch writes themeId')
  assert(!themeHandler.includes('setInterfaceStyle'), 'theme switch does not write style')
  console.log('PASS  5. settings UI keeps independent controls')
}

{
  const router = read('src/routes/router.tsx')
  const routePage = read('src/pages/DashboardRoutePage.tsx')
  const classic = read('src/pages/DashboardPage.tsx')
  const modern = read('src/pages/DashboardV3Page.tsx')
  const weddings = read('src/pages/WeddingsPage.tsx')
  const weddingsRoute = read('src/pages/WeddingsRoutePage.tsx')
  const sessions = read('src/pages/SessionsPage.tsx')
  const sessionsRoute = read('src/pages/SessionsRoutePage.tsx')
  const calendar = read('src/pages/CalendarPage.tsx')
  const calendarRoute = read('src/pages/CalendarRoutePage.tsx')
  const finance = read('src/pages/FinancePage.tsx')
  const tasks = read('src/pages/TasksPage.tsx')
  assert(router.includes('DashboardRoutePage'), '/dashboard uses resolver')
  assert(routePage.includes('<DashboardPage />'), 'classic dashboard reachable')
  assert(routePage.includes('<DashboardV3Page />'), 'modern dashboard reachable')
  assert(!classic.includes('DashboardV3Page'), 'classic page is not the modern tree')
  assert(!classic.includes('interfaceStyle'), 'classic page has no style branching')
  assert(modern.includes('useDashboardAssignments'), 'modern uses shared assignments')
  assert(classic.includes('useDashboardAssignments'), 'classic uses shared assignments')
  assert(router.includes('WeddingsRoutePage'), '/sluby uses resolver')
  assert(weddingsRoute.includes('<WeddingsPage />'), 'classic weddings reachable')
  assert(weddingsRoute.includes('<WeddingsModernPage />'), 'modern weddings reachable')
  assert(!weddings.includes('useInterfaceStyle'), 'classic weddings have no style branching')
  assert(router.includes('SessionsRoutePage'), '/sesje uses resolver')
  assert(sessionsRoute.includes('<SessionsPage />'), 'classic sessions reachable')
  assert(sessionsRoute.includes('<SessionsModernPage />'), 'modern sessions reachable')
  assert(!sessions.includes('useInterfaceStyle'), 'classic sessions have no style branching')
  assert(router.includes('CalendarRoutePage'), '/kalendarz uses resolver')
  assert(calendarRoute.includes('<CalendarPage />'), 'classic calendar reachable')
  assert(calendarRoute.includes('<CalendarModernPage />'), 'modern calendar reachable')
  assert(!calendar.includes('useInterfaceStyle'), 'classic calendar have no style branching')
  assert(router.includes('WeddingDetailRoutePage'), '/sluby/:id uses resolver')
  assert(read('src/pages/WeddingDetailRoutePage.tsx').includes('<WeddingDetailPage />'), 'classic wedding detail reachable')
  assert(read('src/pages/WeddingDetailRoutePage.tsx').includes('<WeddingDetailModernPage />'), 'modern wedding detail reachable')
  assert(!read('src/pages/WeddingDetailPage.tsx').includes('useInterfaceStyle'), 'classic wedding detail has no style branching')
  assert(router.includes('SessionDetailRoutePage'), '/sesje/:sessionId uses resolver')
  assert(read('src/pages/SessionDetailRoutePage.tsx').includes('<SessionDetailPage />'), 'classic session detail reachable')
  assert(read('src/pages/SessionDetailRoutePage.tsx').includes('<SessionDetailModernPage />'), 'modern session detail reachable')
  assert(!read('src/pages/SessionDetailPage.tsx').includes('useInterfaceStyle'), 'classic session detail has no style branching')
  assert(!finance.includes('DashboardV3Page'), 'finance is not auto-modernized')
  assert(!tasks.includes('DashboardV3Page'), 'tasks are not auto-modernized')
  assert(!weddings.includes('v3MaterialHero'), 'classic weddings do not opt into modern materials')
  console.log('PASS  6. dashboard resolution + unmigrated routes')
}

{
  const layout = read('src/layouts/AppLayout.tsx')
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  assert(layout.includes('resolveActiveShellPresentation'), 'shell follows interfaceStyle')
  assert(layout.includes('resolveActiveShellPresentation(interfaceStyle)'), 'shell is preference-wide, not per-screen')
  assert(!layout.includes('resolveScreenPresentation'), 'page presentation does not drive the shell')
  assert(!layout.includes("pathname === '/dashboard'"), 'shell is not dashboard-path gated')
  assert(materials.includes("[data-shell='v3']"), 'modern materials stay shell-gated')
  assert(!materials.includes('data-interface-style'), 'no global interface-style CSS axis')
  const classicCss = read('src/pages/DashboardPage.module.css')
  assert(!classicCss.includes('[data-interface-style'), 'classic dashboard CSS has no style axis')
  assert(!classicCss.includes("[data-shell='v3']"), 'classic dashboard CSS is not v3-gated')
  console.log('PASS  7. CSS isolation')
}

{
  const graphite = getTheme('graphite').tokens
  assertEq(graphite['--app-background'], '#F2E9DE', 'graphite paper frozen')
  assertEq(graphite['--surface-secondary'], '#F6F1EA', 'graphite supporting frozen')
  assertEq(graphite['--surface-primary'], '#FFFBF7', 'graphite primary frozen')
  assertEq(graphite['--sidebar-background'], '#22333B', 'graphite sidebar frozen')
  assertEq(graphite['--brand-primary'], '#22333B', 'graphite brand frozen')
  const tokensFile = read('src/features/theme/tokens/graphite.ts')
  assert(tokensFile.includes("'--app-background': '#F2E9DE'"), 'source graphite paper')
  console.log('PASS  8. Graphite baseline tokens unchanged')
}

{
  const modernFiles = [
    'src/features/dashboard-v3/DashboardV3Hero.tsx',
    'src/features/dashboard-v3/DashboardV3Hero.module.css',
    'src/pages/DashboardV3Page.module.css',
    'src/features/dashboard-v3/v3Materials.css',
  ].map(read).join('\n')
  assert(!modernFiles.includes('backdrop-filter: blur'), 'no positive blur')
  assert(!modernFiles.includes('-webkit-backdrop-filter: blur'), 'no webkit blur')
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  assert(materials.includes('backdrop-filter: none'), 'nav blur remains off')
  console.log('PASS  9. no Liquid Glass regression')
}

{
  const mig = resolve(
    process.cwd(),
    'supabase/migrations/20260818180000_profiles_interface_style.sql',
  )
  assert(existsSync(mig), 'migration file')
  const sql = readFileSync(mig, 'utf8')
  assert(sql.includes('interface_style'), 'column')
  assert(sql.includes("default 'classic'"), 'default classic')
  assert(sql.includes('profiles_interface_style_check'), 'check')
  assert(sql.includes("'modern'"), 'allows modern')
  assert(!sql.includes('profiles_theme_id_check'), 'does not rewrite theme constraint')
  assert(!sql.includes('set theme_id'), 'does not rewrite theme values')
  const schema = read('supabase/schema.sql')
  assert(
    schema.includes("interface_style text not null default 'classic'"),
    'schema column',
  )
  assert(schema.includes('profiles_interface_style_check'), 'schema check')
  console.log('PASS  10. DB migration is additive and classic-by-default')
}

{
  const app = read('src/App.tsx')
  assert(app.includes('ThemeProvider'), 'theme provider')
  assert(app.includes('InterfaceStyleProvider'), 'style provider')
  const themeIdx = app.indexOf('ThemeProvider')
  const styleIdx = app.indexOf('InterfaceStyleProvider')
  assert(styleIdx > themeIdx, 'style provider sits beside theme, not inside theme module')
  console.log('PASS  11. providers remain independent')
}

{
  const layout = read('src/layouts/AppLayout.tsx')
  const login = read('src/pages/LoginPage.tsx')
  const pubForm = read('src/pages/PublicFormTokenPage.tsx')
  const pubPre = read('src/pages/PublicPreWeddingQuestionnairePage.tsx')
  const weddings = read('src/pages/WeddingsPage.tsx')
  const tasks = read('src/pages/TasksPage.tsx')
  const finance = read('src/pages/FinancePage.tsx')
  const appearance = read('src/pages/AppearanceSettingsPage.tsx')
  const routePage = read('src/pages/DashboardRoutePage.tsx')
  const calendar = read('src/pages/CalendarPage.tsx')
  const weddingDetailRoute = read('src/pages/WeddingDetailRoutePage.tsx')
  const weddingDetail = read('src/pages/WeddingDetailPage.tsx')
  const weddingDetailModern = read('src/pages/WeddingDetailModernPage.tsx')
  const register = read('src/pages/RegisterPage.tsx')
  const callback = read('src/pages/AuthCallbackPage.tsx')
  const landing = read('src/pages/LandingPage.tsx')
  const helper = read('src/layouts/shellPresentation.ts')
  assert(layout.includes('<Sidebar'), 'authenticated shell owns the sidebar')
  assert(!login.includes('AppLayout'), 'login is outside AppLayout')
  assert(!login.includes('Sidebar'), 'login has no app sidebar')
  assert(!register.includes('AppLayout'), 'register is outside AppLayout')
  assert(!callback.includes('AppLayout'), 'auth callback is outside AppLayout')
  assert(!landing.includes('AppLayout'), 'landing is outside AppLayout')
  assert(!pubForm.includes('AppLayout'), 'public form is outside AppLayout')
  assert(!pubPre.includes('AppLayout'), 'public questionnaire is outside AppLayout')
  assert(weddings.includes('AppLayout'), 'classic weddings use the standard shell')
  assert(read('src/pages/WeddingsModernPage.tsx').includes('AppLayout'), 'modern weddings use the standard shell')
  assert(read('src/pages/SessionsPage.tsx').includes('AppLayout'), 'classic sessions use the standard shell')
  assert(read('src/pages/SessionsModernPage.tsx').includes('AppLayout'), 'modern sessions use the standard shell')
  assert(weddingDetail.includes('AppLayout'), 'classic wedding detail uses the standard shell')
  assert(weddingDetailModern.includes('AppLayout'), 'modern wedding detail uses the standard shell')
  assert(weddingDetailRoute.includes("resolveScreenPresentation('wedding'"), 'wedding detail uses screen registry')
  assert(read('src/pages/SessionDetailPage.tsx').includes('AppLayout'), 'classic session detail uses the standard shell')
  assert(read('src/pages/SessionDetailModernPage.tsx').includes('AppLayout'), 'modern session detail uses the standard shell')
  assert(read('src/pages/SessionDetailRoutePage.tsx').includes("resolveScreenPresentation('session'"), 'session detail uses screen registry')
  assert(tasks.includes('AppLayout'), 'tasks use the standard shell')
  assert(finance.includes('AppLayout'), 'finance uses the standard shell')
  assert(calendar.includes('AppLayout'), 'classic calendar uses the standard shell')
  assert(read('src/pages/CalendarModernPage.tsx').includes('AppLayout'), 'modern calendar uses the standard shell')
  assert(appearance.includes('SettingsLayout'), 'appearance uses the settings shell')
  assert(routePage.includes("resolveScreenPresentation('dashboard'"), 'dashboard page still uses screen registry')
  assert(!helper.includes('pathname'), 'shell helper is not a per-route allowlist')
  assert(!weddings.includes('v3Material'), 'classic weddings content is not modernized')
  assert(!read('src/pages/SessionsPage.tsx').includes('v3Material'), 'classic sessions content is not modernized')
  assert(!calendar.includes('v3Material'), 'classic calendar content is not modernized')
  assert(!tasks.includes('v3Material'), 'tasks content is not modernized')
  assert(!finance.includes('v3Material'), 'finance content is not modernized')
  assert(!appearance.includes('v3Material'), 'settings content is not modernized')
  console.log('PASS  12. global modern shell scope + public exclusion')
}

console.log('\nPASS  interface style classic/modern foundation')
