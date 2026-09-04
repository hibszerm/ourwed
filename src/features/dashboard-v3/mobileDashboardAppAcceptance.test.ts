/**
 * Mobile Dashboard + navigation V1 — app-like presentation acceptance.
 * Run: npm run test:mobile-dashboard-app
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  compactAssignmentMonogram,
  resolveCompactAssignmentVisibility,
} from './dashboardV3AssignmentPresentation'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function includes(source: string, needle: string, message: string) {
  assert(source.includes(needle), `${message}: missing ${JSON.stringify(needle)}`)
}

function excludes(source: string, needle: string, message: string) {
  assert(!source.includes(needle), `${message}: must not include ${JSON.stringify(needle)}`)
}

const route = read('src/pages/DashboardRoutePage.tsx')
const page = read('src/pages/DashboardV3Page.tsx')
const pageCss = read('src/pages/DashboardV3Page.module.css')
const hero = read('src/features/dashboard-v3/DashboardV3Hero.tsx')
const heroCss = read('src/features/dashboard-v3/DashboardV3Hero.module.css')
const sticky = read(
  'src/features/dashboard-v3/MobileNextAssignmentBar.tsx',
)
const stickyCss = read(
  'src/features/dashboard-v3/MobileNextAssignmentBar.module.css',
)
const assignmentPresentation = read(
  'src/features/dashboard-v3/dashboardV3AssignmentPresentation.ts',
)
const upcoming = read(
  'src/features/dashboard-v3/DashboardV3UpcomingAssignments.tsx',
)
const upcomingCss = read(
  'src/features/dashboard-v3/DashboardV3UpcomingAssignments.module.css',
)
const deadlineCss = read(
  'src/features/dashboard-v3/DashboardV3DeadlinePanel.module.css',
)
const notificationsCss = read(
  'src/features/dashboard-v3/DashboardV3NotificationsPanel.module.css',
)
const reveals = read(
  'src/features/dashboard-v3/useDashboardMobileReveals.ts',
)
const layout = read('src/layouts/AppLayout.tsx')
const layoutCss = read('src/layouts/AppLayout.module.css')
const sidebar = read('src/layouts/Sidebar.tsx')
const sidebarCss = read('src/layouts/Sidebar.module.css')
const icons = read('src/components/icons/index.tsx')
const assignmentHook = read(
  'src/features/dashboard/hooks/useDashboardAssignments.ts',
)

{
  includes(route, "resolveScreenPresentation('dashboard'", 'preference route')
  includes(route, '<DashboardV3Page />', 'Modern Dashboard remains V3')
  includes(route, '<DashboardPage />', 'Classic Dashboard remains reachable')
  includes(page, 'useDashboardAssignments', 'shared assignments hook')
  includes(page, 'getNearestUpcomingAssignment', 'canonical nearest selector')
  includes(page, 'getNextAssignmentsAfterNearest', 'canonical next-three selector')
  includes(
    assignmentHook,
    "queryKey: ['dashboard', 'assignments', userId]",
    'assignment query key frozen',
  )
  excludes(page, 'useWeddings', 'no mobile wedding query')
  excludes(page, 'useSessions', 'no mobile session query')
  console.log('PASS  shared route / data architecture')
}

{
  includes(page, '<DashboardV3Header compact />', 'mobile app header identity')
  includes(page, '<MobileNextAssignmentBar', 'compact assignment lives in app header')
  includes(layout, 'mobileHeader?: ReactNode', 'isolated mobile header primitive')
  includes(layout, 'data-mobile-shell-header', 'sticky shell header marker')
  includes(pageCss, '.desktopHeader', 'desktop header wrapper retained')
  const mobile = pageCss.slice(pageCss.indexOf('@media (max-width: 767px)'))
  includes(mobile, '.desktopHeader {\n    display: none;', 'old page header hidden only on mobile')
  console.log('PASS  compact mobile app header')
}

{
  const desktop = heroCss.slice(0, heroCss.indexOf('@media (max-width: 1100px)'))
  includes(
    desktop,
    'grid-template-columns: var(--v3-hero-rail) minmax(0, 1fr) var(--v3-hero-rail)',
    'desktop hero grammar frozen',
  )
  includes(desktop, 'min-height: 280px', 'desktop hero height frozen')
  includes(desktop, '.cta {\n  display: inline-flex;', 'desktop CTA frozen')
  const mobile = heroCss.slice(heroCss.indexOf('@media (max-width: 767px)'))
  includes(mobile, 'min-height: 164px', 'mobile expanded hero geometry')
  excludes(mobile, 'linear-gradient(', 'mobile hero has no decorative gradient')
  excludes(mobile, 'background-image:', 'mobile hero has no image layer')
  includes(mobile, 'background: var(--dash-hero-base)', 'semantic hero surface')
  includes(mobile, '-webkit-line-clamp: 2', 'long hero names bounded')
  includes(mobile, 'text-overflow: ellipsis', 'location controlled')
  includes(hero, 'dashboardAssignmentRelativeLabel', 'Dziś/Jutro/Za N dni copy')
  includes(hero, 'id="dashboard-v3-nearest-assignment"', 'observer target')
  console.log('PASS  expanded hero mobile-only / desktop frozen')
}

{
  includes(page, 'MobileNextAssignmentBar', 'compact bar wired')
  includes(page, 'MOBILE_NEXT_ASSIGNMENT_SENTINEL_ID', 'stable sentinel wired')
  includes(page, 'styles.assignmentSentinel', 'sentinel has isolated geometry')
  includes(sticky, 'IntersectionObserver', 'binary observer')
  includes(sticky, 'rootMargin:', 'header-aware threshold')
  includes(sticky, 'observer?.disconnect()', 'observer cleanup')
  includes(sticky, 'observer.observe(sentinel)', 'observer watches sentinel, not hero/bar')
  includes(sticky, 'threshold: [0, 0.99]', 'hysteresis thresholds')
  includes(
    assignmentPresentation,
    'sentinelBottom <= thresholdTop',
    'down-scroll activation boundary',
  )
  includes(
    assignmentPresentation,
    'intersectionRatio >= 0.98',
    'up-scroll hysteresis boundary',
  )
  includes(sticky, 'activeRef', 'stable binary state reference')
  excludes(sticky, 'expandedHero.dataset.mobileCompact', 'hero is not driven into a compact animation state')
  excludes(sticky, 'ResizeObserver', 'no header resize feedback loop')
  excludes(sticky, "addEventListener('scroll'", 'no scroll listener')
  includes(sticky, 'useState(false)', 'binary state is localized to compact bar')
  excludes(page, 'setCompact', 'whole Dashboard does not own sticky state')
  includes(stickyCss, 'position: absolute', 'bar overlays stable sticky shell')
  includes(stickyCss, 'top: 100%', 'outer viewport is flush with the header bottom')
  includes(stickyCss, 'overflow: hidden', 'stable outer viewport clips the inner reveal')
  includes(stickyCss, 'margin-top: 6px', 'settled visual gap is inner, not wrapper top')
  excludes(stickyCss, 'top: calc(100% + 6px)', 'wrapper top is not the visual gap')
  excludes(stickyCss, 'translateX(-50%)', 'outer wrapper has no centering transform')
  excludes(stickyCss, 'height: 0', 'no degenerate zero-height sticky box')
  excludes(stickyCss, 'margin-bottom:', 'bar cannot shift Dashboard geometry')
  includes(layoutCss, 'position: sticky', 'app header owns stable sticky positioning')
  includes(
    stickyCss,
    'translate3d(0, -10px, 0) scale(0.99)',
    'inner bar reveals from beneath the header',
  )
  excludes(heroCss, 'data-mobile-compact', 'hero has no compact morph state')
  excludes(hero, 'data-dashboard-assignment-morph-anchor', 'no shared-element geometry anchor')
  excludes(sticky, 'ghost.animate', 'V1.3 ghost morph removed')
  excludes(sticky, 'cloneNode', 'no temporary visual clone')
  excludes(sticky, 'source.getBoundingClientRect', 'no FLIP source geometry reads')
  excludes(sticky, 'runMorph', 'no shared-element handoff function')
  excludes(stickyCss, "[data-morphing='true']", 'no ghost/real-bar handoff state')
  includes(stickyCss, '--compact-glass-base', 'token-derived glass base retained')
  includes(stickyCss, '.bar::before', 'static material edge light retained')
  includes(stickyCss, '.bar::after', 'static corner refraction retained')
  includes(stickyCss, 'inset 0 1px 0', 'internal glass edge highlight retained')
  includes(stickyCss, 'radial-gradient(', 'restrained specular highlight retained')
  includes(stickyCss, 'backdrop-filter: blur(10px) saturate(1.06)', 'small real glass blur retained')
  includes(stickyCss, '@supports (', 'feature-gated true glass retained')
  includes(
    stickyCss,
    '@media (prefers-reduced-transparency: reduce)',
    'opaque fallback preference',
  )
  includes(stickyCss, 'backdrop-filter: none', 'fake-glass fallback remains')

  assert(
    resolveCompactAssignmentVisibility({
      active: false,
      isIntersecting: false,
      intersectionRatio: 0,
      sentinelTop: 62,
      sentinelBottom: 72,
      thresholdTop: 60,
    }) === false,
    'sentinel below threshold keeps compact bar hidden',
  )
  assert(
    resolveCompactAssignmentVisibility({
      active: false,
      isIntersecting: false,
      intersectionRatio: 0,
      sentinelTop: 49,
      sentinelBottom: 59,
      thresholdTop: 60,
    }) === true,
    'sentinel fully above threshold activates compact bar',
  )
  assert(
    resolveCompactAssignmentVisibility({
      active: true,
      isIntersecting: true,
      intersectionRatio: 0.5,
      sentinelTop: 55,
      sentinelBottom: 65,
      thresholdTop: 60,
    }) === true,
    'partial return does not release compact bar',
  )
  assert(
    resolveCompactAssignmentVisibility({
      active: true,
      isIntersecting: true,
      intersectionRatio: 0.99,
      sentinelTop: 60,
      sentinelBottom: 70,
      thresholdTop: 60,
    }) === false,
    'full return releases compact bar once',
  )

  includes(
    sticky,
    'compactAssignmentMonogram(assignment.title)',
    'cue is derived from the same compact-bar display name',
  )
  excludes(sticky, "entityType === 'wedding' ? 'Ś'", 'cue no longer encodes assignment type')
  excludes(sticky, 'data-kind={assignment.entityType}', 'cue is not a type badge')
  assert(
    compactAssignmentMonogram('Julia Kanicka i Maksymilian Ruth') === 'J',
    'wedding display name uses first letter',
  )
  assert(
    compactAssignmentMonogram('Sesja narzeczeńska Ani i Pawła') === 'S',
    'session display name uses first letter',
  )
  assert(
    compactAssignmentMonogram('  karolina Nowakowska') === 'K',
    'leading whitespace is trimmed and Polish locale uppercases',
  )
  assert(
    compactAssignmentMonogram('światło i cień') === 'Ś',
    'Polish diacritic uppercases with locale',
  )
  assert(compactAssignmentMonogram('') === 'OW', 'empty name falls back to OW')
  assert(compactAssignmentMonogram('   ') === 'OW', 'whitespace-only name falls back to OW')
  assert(compactAssignmentMonogram(null) === 'OW', 'missing name falls back to OW')
  console.log('PASS  stable sentinel + hysteresis compact assignment')
}

{
  includes(reveals, 'IntersectionObserver', 'one-shot reveal observer')
  includes(reveals, 'observer?.unobserve(target)', 'reveals once')
  includes(reveals, 'observer?.disconnect()', 'reveal cleanup')
  excludes(reveals, 'useState', 'reveals do not render React')
  excludes(reveals, "addEventListener('scroll'", 'no reveal scroll listener')
  includes(page, 'styles.upcomingBand', 'upcoming module remains grouped')
  includes(
    page.slice(page.indexOf('styles.upcomingBand'), page.indexOf('styles.feed')),
    'data-mobile-reveal="pending"',
    'upcoming reveals as one module',
  )
  excludes(upcoming, 'data-mobile-reveal', 'individual rows do not perform landing-page reveals')
  includes(upcomingCss, 'min-height: 72px', 'dense upcoming rows')
  includes(upcomingCss, 'box-shadow: none', 'desktop cards flattened on mobile')
  includes(pageCss, 'translate3d(0, 10px, 0)', 'subtle reveal distance')
  includes(pageCss, 'prefers-reduced-motion: reduce', 'reduced motion path')
  console.log('PASS  one-shot mobile reveals + dense assignment feed')
}

{
  const deadlineMobile = deadlineCss.slice(
    deadlineCss.indexOf('@media (max-width: 767px)'),
  )
  const notificationsMobile = notificationsCss.slice(
    notificationsCss.indexOf('@media (max-width: 767px)'),
  )
  for (const [name, source] of [
    ['deadlines', deadlineMobile],
    ['notifications', notificationsMobile],
  ] as const) {
    includes(source, 'border-radius: 18px', `${name} coherent module radius`)
    includes(
      source,
      'background: var(--v3-surface-supporting',
      `${name} semantic module surface`,
    )
    includes(
      source,
      'box-shadow: var(--v3-shadow-contact',
      `${name} controlled contact depth`,
    )
    excludes(source, 'backdrop-filter', `${name} has no blur`)
  }
  includes(deadlineCss, '.list li + li .row', 'deadline rows use separators')
  includes(notificationsCss, '.list li + li .item', 'notification rows use separators')
  console.log('PASS  deadline + notification module surfaces restored')
}

{
  includes(layout, 'aria-label="Otwórz nawigację"', 'hamburger remains the open trigger')
  includes(sidebar, 'aria-label="Zamknij nawigację"', 'close remains the drawer dismiss control')
  const logoRow = sidebar.slice(
    sidebar.indexOf('styles.logoRow'),
    sidebar.indexOf('className={styles.nav}'),
  )
  assert(
    logoRow.indexOf('styles.brandBlock') < logoRow.indexOf('styles.closeButton'),
    'brand sits leading; close sits trailing in drawer chrome',
  )
  includes(layout, 'aria-controls={navId}', 'trigger controls sheet')
  includes(sidebar, 'id={id}', 'aria-controls target is the sheet')
  includes(layout, 'inert={navOpen ? true : undefined}', 'background inert')
  includes(sidebar, "role={isMobile ? 'dialog' : undefined}", 'mobile dialog semantics')
  includes(sidebar, 'OVERLAY_FOCUSABLE', 'local focus trap')
  includes(sidebar, 'closeButtonRef.current?.focus()', 'focus enters sheet')
  includes(sidebar, 'returnTarget.focus()', 'focus returns to trigger')
  includes(layout, 'aria-hidden="true"', 'pointer backdrop not duplicated to screen readers')
  includes(layout, "event.key === 'Escape'", 'Escape close preserved')
  includes(layout, "location.pathname !== navPath", 'route close preserved')
  includes(
    layout,
    "matchMedia('(max-width: 767px)')",
    'shell watches the mobile boundary',
  )
  includes(
    layout,
    'if (!event.matches) setNavOpen(false)',
    'crossing to desktop releases the open sheet',
  )
  includes(
    sidebarCss,
    '.closeButton:focus-visible',
    'auto-focused close control has a visible focus ring',
  )
  console.log('PASS  mobile navigation accessibility')
}

{
  const mobile = sidebarCss.slice(
    sidebarCss.indexOf('@media (max-width: 767px)'),
    sidebarCss.indexOf('@media (min-width: 768px)'),
  )
  includes(mobile, 'left: 0', 'drawer is left-anchored')
  includes(mobile, 'width: min(74vw, 292px)', 'V1.7 drawer is narrower than V1.6')
  assert(
    !/width:\s*min\([^)]*32[0-9]px/.test(mobile),
    'V1.6 324px max-width must not remain',
  )
  assert(
    /width:\s*min\([^)]*29[2-6]px/.test(mobile) ||
      /width:\s*min\([^)]*28[8-9]px/.test(mobile),
    'mobile drawer max-width stays in 288–296px',
  )
  includes(mobile, 'border-radius: 0 26px 26px 0', 'right edge radius refined after narrowing')
  includes(
    mobile,
    'translate3d(calc(-100% - 12px), 0, 0)',
    'drawer travels from left to right',
  )
  includes(mobile, 'transition: transform 280ms', 'open/close is transform-only')
  excludes(mobile, 'transition: left', 'left is not animated')
  excludes(mobile, 'transition: width', 'width is not animated')
  excludes(mobile, 'translate3d(0, 22px, 0)', 'V1.4 Control Center vertical resolve removed')
  excludes(mobile, 'right: 12px', 'centered/inset sheet geometry removed')
  excludes(mobile, 'left: 12px', 'equal inset Control Center geometry removed')
  excludes(mobile, '--color-sidebar-bg: var(--surface-primary', 'warm Control Center surface override removed')
  includes(mobile, 'background: color-mix(', 'drawer fill is a theme-tinted translucent mix')
  includes(mobile, 'var(--sidebar-background, var(--color-sidebar-bg)) 92%', 'base material is 92% sidebar pigment')
  includes(mobile, 'var(--sidebar-background, var(--color-sidebar-bg)) 90%', 'supported blur uses 90% sidebar pigment')
  includes(mobile, 'backdrop-filter: none', 'base material is valid without blur')
  includes(mobile, 'backdrop-filter: blur(12px) saturate(1.06)', 'real frosted blur is drawer-only')
  includes(mobile, '-webkit-backdrop-filter: blur(12px) saturate(1.06)', 'webkit frosted blur is drawer-only')
  includes(mobile, '@media (prefers-reduced-transparency: reduce)', 'reduced transparency restores an opaque sidebar')
  excludes(mobile, 'transition: backdrop-filter', 'blur is never animated')
  excludes(mobile, 'transition: filter', 'filter is never animated')
  assert(!/^\s+filter: blur/m.test(mobile), 'drawer does not filter its own contents')
  includes(mobile, 'var(--sidebar-text)', 'inactive labels derive from theme sidebar text')
  excludes(mobile, '.mobilePrimaryGrid', 'four-card primary grid stays removed')
  excludes(mobile, 'min-height: 88px', 'giant Pulpit tile stays removed')
  excludes(mobile, 'min-height: 76px', 'giant primary tiles stay removed')
  excludes(mobile, 'min-height: 56px', 'V1.5 giant primary row height stays removed')
  excludes(mobile, 'min-height: 48px', 'V1.6 taller primary rows stay removed')
  excludes(mobile, 'font-size: 1.0625rem', 'V1.6 larger primary type stays removed')
  includes(mobile, '.mobilePrimaryItem', 'primary drawer rows')
  includes(mobile, '.mobileNavItem', 'shared mobile destination row')
  includes(mobile, 'font-size: 0.9375rem', 'one 15px type scale for every destination')
  includes(mobile, 'font-weight: 500', 'one medium weight for every destination')
  includes(mobile, 'min-height: 44px', 'one 44px row geometry')
  includes(mobile, 'height: 44px', 'row height is locked so active state cannot grow')
  includes(mobile, 'gap: 2px', 'adjacent destinations share one vertical gap')
  includes(mobile, 'gap: 12px', 'icon-to-label gap is shared')
  includes(mobile, 'width: 18px', 'all navigation icons share one visual size')
  excludes(mobile, 'width: 20px', 'primary icons are not larger than secondary')
  excludes(mobile, 'var(--navigation-active-indicator)', 'gold/colored active stripe removed from mobile')
  excludes(mobile, 'inset 2px 0 0', 'inset accent edge removed from mobile')
  includes(
    mobile,
    'var(--sidebar-item-active-background) 48%',
    'active route is a quiet material fill only',
  )
  excludes(
    mobile,
    '.mobilePrimaryItem.mobileActive {\n    background: var(--color-sidebar-active);',
    'giant full-row active card fill stays removed',
  )
  includes(mobile, '.drawerPlan', 'PRO status is a quiet identity line')
  includes(sidebar, 'styles.userAvatar', 'account avatar is integrated in the drawer footer')
  includes(mobile, 'width: 34px', 'account avatar stays compact in the footer')
  excludes(mobile, '.controlIdentity', 'Control Center header identity block removed')
  excludes(mobile, '.launcherAccount', 'standalone PRO card composition stays removed')
  excludes(layoutCss, ".layout[data-nav-open='true'] .content", 'page does not recede under nav')
  excludes(layoutCss, 'transform: scale(0.985)', 'no background scale recession')
  excludes(layoutCss, 'transform: scale(0.99', 'application is not scaled for drawer depth')
  includes(layoutCss, 'background: var(--color-overlay)', 'backdrop stays a cheap overlay token')
  includes(layoutCss, 'inset: 0', 'mobile backdrop covers the full viewport')
  excludes(
    layoutCss,
    'left: min(74vw, 292px)',
    'drawer-width backdrop offset removed for V1.8.1 compositing',
  )
  excludes(
    layoutCss,
    'calc(100% -',
    'backdrop does not subtract drawer width',
  )
  includes(layoutCss, 'backdrop-filter: blur(3px)', 'background backdrop uses subtle static blur')
  includes(
    layoutCss,
    '-webkit-backdrop-filter: blur(3px)',
    'webkit background backdrop blur is declared',
  )
  includes(
    layoutCss,
    'transition: opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)',
    'backdrop opacity tracks drawer travel timing',
  )
  excludes(layoutCss, 'transition: backdrop-filter', 'background blur radius is never animated')
  excludes(layoutCss, 'transition-duration: 260ms', 'backdrop no longer uses a delayed open duration')
  assert(
    !/^\s*filter:\s*blur/m.test(layoutCss),
    'application content is not filtered',
  )
  includes(mobile, '.mobileSecondaryItem', 'secondary commands')
  excludes(mobile, '.mobileGroupLabel', 'visible BIEŻĄCE/STUDIO headings stay off mobile')
  includes(sidebar, 'aria-label="Bieżące"', 'current-work grouping remains accessible')
  includes(sidebar, 'aria-label="Studio"', 'studio grouping remains accessible')
  includes(mobile, 'border-bottom: 1px solid var(--color-sidebar-border)', 'primary/secondary hierarchy uses a quiet divider')
  includes(mobile, 'width: var(--touch-target)', 'close hit area stays 44px')
  includes(mobile, 'min-height: var(--touch-target)', 'logout hit area stays 44px')
  includes(sidebar, 'IconCog', 'Settings uses the cog icon')
  includes(icons, 'export function IconCog', 'cog lives in the shared icon set')
  includes(
    sidebar,
    '<IconCog className={styles.navIcon} />',
    'desktop Settings uses the cog',
  )
  includes(
    sidebar,
    '<IconCog className={styles.mobileNavIcon} />',
    'mobile Settings uses the cog',
  )
  includes(
    sidebar,
    "{ to: '/studio/pakiety', label: 'Pakiety', icon: IconSettings }",
    'Pakiety keeps the existing sun placeholder icon',
  )
  includes(sidebar, 'to="/ustawienia"', 'Settings route unchanged')
  includes(mobile, 'flex-direction: column', 'secondary list stays readable at 320')
  includes(mobile, 'white-space: nowrap', 'long Polish labels do not wrap into a grid')
  excludes(mobile, 'grid-template-columns: repeat(2', 'two-column wrapping grid not forced')
  includes(mobile, 'box-shadow: 12px 2px 32px', 'contact shadow projects toward the Dashboard')
  includes(
    mobile,
    'var(--sidebar-item-active-text) 12%',
    'right edge uses a quiet semantic rim',
  )
  excludes(sidebar, 'Na co dzień', 'rejected daily heading stays removed')
  excludes(sidebar, '>Praca<', 'forced PRACA heading not used')
  excludes(sidebar, 'mobilePrimaryGrid', 'card grid helper stays removed')
  excludes(sidebar, 'IconChevronRight', 'primary rows are not contents-page chevrons')
  const primaryPaths = sidebar.slice(
    sidebar.indexOf('const mobilePrimaryPaths'),
    sidebar.indexOf('const mobilePrimaryItems'),
  )
  for (const path of ['/dashboard', '/sluby', '/kalendarz', '/zadania']) {
    includes(primaryPaths, path, `primary destination ${path}`)
  }
  assert(
    (primaryPaths.match(/'\/[^']+'/g) ?? []).length === 4,
    'exactly four destinations receive primary row geometry',
  )
  for (const path of [
    '/dashboard',
    '/powiadomienia',
    '/finanse',
    '/sluby',
    '/sesje',
    '/kalendarz',
    '/zadania',
    '/oczekujace',
    '/ankiety',
    '/studio/pakiety',
    '/studio/uslugi',
    '/ustawienia',
  ]) {
    includes(sidebar, path, `destination ${path} preserved`)
  }
  includes(sidebar, 'nieprzeczytane powiadomienia', 'unread badge preserved')

  const desktop = sidebarCss.slice(
    sidebarCss.indexOf('/* V3 floating rail — desktop only.'),
  )
  includes(desktop, '@media (min-width: 768px)', 'desktop split remains 768')
  includes(desktop, 'width: var(--sidebar-width)', 'desktop rail width frozen')
  includes(desktop, 'border-radius: 24px', 'desktop rail geometry frozen')
  includes(layoutCss, '@media (max-width: 767px)', 'mobile shell max boundary')
  includes(layoutCss, '@media (min-width: 768px)', 'desktop shell min boundary')
  console.log('PASS  mobile sheet redesign / 767–768 desktop freeze')
}

{
  const motionSources = [page, sticky, reveals, layout, sidebar].join('\n')
  excludes(motionSources, "from 'framer-motion'", 'no motion dependency')
  excludes(motionSources, 'requestAnimationFrame(() => set', 'no rAF React loop')
  excludes(sticky, 'Element.animate', 'no WAAPI shared-element animation')
  excludes(stickyCss, 'transition: height', 'sticky never animates height')
  excludes(stickyCss, 'transition: top', 'outer wrapper top never animates')
  excludes(stickyCss, 'transition: box-shadow', 'sticky shadow never animates')
  excludes(stickyCss, 'transition: filter', 'glass filter never animates')
  excludes(stickyCss, 'transition: backdrop-filter', 'backdrop never animates')
  excludes(sticky, "addEventListener('resize'", 'no scroll-time viewport resize loop')
  excludes(pageCss, 'animation-timeline', 'no scroll-driven compatibility gamble')
  includes(stickyCss, '@media (prefers-reduced-motion: reduce)', 'sticky reduced motion')
  includes(sidebarCss, '@media (prefers-reduced-motion: reduce)', 'sheet reduced motion')
  includes(sidebarCss, 'transform: none', 'reduced motion disables horizontal drawer travel')
  console.log('PASS  60 FPS and reduced-motion architecture')
}

console.log('\nPASS  mobile Dashboard + navigation V1 acceptance')
