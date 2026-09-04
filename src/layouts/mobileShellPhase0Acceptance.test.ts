/**
 * Phase 0 Modern mobile shell: drawer flex contract, sticky hamburger,
 * tertiary text-action hit box. Does not migrate 720px feature CSS
 * except files later owned by a dedicated mobile list pass.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL mobile-shell-phase-0 — ${msg}`)
}

const layout = read('src/layouts/AppLayout.tsx')
const layoutCss = read('src/layouts/AppLayout.module.css')
const sidebar = read('src/layouts/Sidebar.tsx')
const sidebarCss = read('src/layouts/Sidebar.module.css')
const textAction = read('src/components/ui/textAction.module.css')
const tabsCss = read(
  'src/features/weddings/modern-detail/ModernWeddingDetailTabs.module.css',
)
const portal = read('src/components/ui/FloatingPortal.tsx')
const cockpitCss = read('src/features/wedding-day-cockpit/WeddingDayCockpit.module.css')

assert(layout.includes('styles.shellAccess'), 'compact shell access strip exists')
assert(layout.includes('Otwórz nawigację'), 'hamburger label unchanged')
assert(!layout.includes('styles.shellHeader'), 'old combined shell header removed')
assert(layout.includes("location.pathname !== navPath"), 'route change still closes the drawer')
assert(layout.includes("event.key === 'Escape'"), 'Escape still closes drawer')
assert(layout.includes('styles.backdrop'), 'backdrop remains')

assert(layoutCss.includes('--mobile-shell-sticky-height'), 'sticky offset token')
assert(layoutCss.includes('@media (max-width: 767px)'), 'new shell rules use 767px')
assert(!layoutCss.includes('@media (max-width: 720px)'), 'shell does not introduce 720px')
{
  const mobile = layoutCss.slice(layoutCss.indexOf('@media (max-width: 767px)'))
  assert(mobile.includes('position: sticky'), 'mobile shell access is sticky over window scroll')
  assert(mobile.includes('z-index: 5'), 'shell sits above tabs (4), below drawer (50)')
  assert(mobile.includes('width: 100%'), 'sticky strip spans the viewport so content does not bleed beside it')
  assert(mobile.includes('overflow: visible'), 'mobile main does not trap sticky in overflow hidden')
  assert(mobile.includes('.content'), 'mobile content overflow is untrapped for window-sticky tabs')
  assert(!mobile.includes('height: 100dvh'), 'does not replace window scroll with 100dvh root')
}
assert(layoutCss.includes('@media (min-width: 768px)'), 'desktop v3 inset retained')
assert(
  layoutCss.includes('.layout[data-shell=\'v3\']'),
  'Classic is not coupled: v3 still opt-in',
)

assert(sidebar.includes("matchMedia('(max-width: 767px)')"), 'sidebar mobile query is 767')
{
  const navBlock = sidebarCss.slice(sidebarCss.indexOf('.nav {'), sidebarCss.indexOf('.navItem'))
  assert(navBlock.includes('min-height: 0'), 'nav can shrink so overflow-y works')
  assert(navBlock.includes('overflow-y: auto'), 'nav remains the scroll region')
}
{
  const footerBlock = sidebarCss.slice(
    sidebarCss.indexOf('.footer {'),
    sidebarCss.indexOf('.userMenu'),
  )
  assert(footerBlock.includes('flex-shrink: 0'), 'footer does not collapse into nav')
}
{
  const logoBlock = sidebarCss.slice(
    sidebarCss.indexOf('.logoRow {'),
    sidebarCss.indexOf('.logo {'),
  )
  assert(logoBlock.includes('flex-shrink: 0'), 'drawer header does not collapse')
}
{
  const mobile = sidebarCss.slice(sidebarCss.indexOf('@media (max-width: 767px)'))
  const desktopV3 = sidebarCss.slice(sidebarCss.indexOf('/* V3 floating rail'))
  assert(mobile.includes('overflow: hidden'), 'mobile drawer clips overlay')
  assert(mobile.includes('position: fixed'), 'mobile drawer stays a drawer')
  assert(desktopV3.includes('border-radius: 24px'), 'desktop v3 rail geometry unchanged')
  assert(!desktopV3.includes('overflow: hidden'), 'desktop v3 rail not clipped like the drawer')
}

assert(textAction.includes('@media (max-width: 767px)'), 'text action breakpoint is 767px')
assert(textAction.includes('min-height: var(--touch-target)'), 'mobile action hit box is 44px token')
assert(textAction.includes('button.textAction'), 'rule targets UI actions, not raw span text')
assert(!textAction.includes('padding: 0 var(--control-padding'), 'no extra button padding')

const financeCss = read(
  'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.module.css',
)
const logisticsCss = read(
  'src/features/weddings/modern-detail/ModernWeddingLogisticsWorkspace.module.css',
)
const overviewCss = read(
  'src/features/weddings/modern-detail/ModernWeddingOverview.module.css',
)
const questionnaireCss = read(
  'src/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace.module.css',
)
assert(financeCss.includes('composes: textAction'), 'finance quiet links use shared action')
assert(logisticsCss.includes('composes: textAction'), 'logistics quiet actions use shared action')
assert(overviewCss.includes('composes: textAction'), 'overview quiet links use shared action')
assert(
  questionnaireCss.includes('composes: textAction'),
  'questionnaire quiet actions use shared action',
)
assert(
  logisticsCss.includes('.inlineLink'),
  'logistics prose inline links remain a separate class',
)
assert(
  !/^\.inlineLink\s*\{[^}]*composes: textAction/m.test(logisticsCss),
  'prose inline links are not composed as text actions',
)

assert(tabsCss.includes('top: var(--mobile-shell-sticky-height, 0px)'), 'tabs sit below sticky shell')
assert(tabsCss.includes('z-index: 4'), 'tabs stay below shell z-index 5')
assert(portal.includes('zIndex = 1200'), 'kebab portal still overlays shell/tabs')
assert(cockpitCss.includes('z-index: 40'), 'cockpit bottom nav layer unchanged')
assert(cockpitCss.includes('position: fixed'), 'cockpit bottom nav stays fixed')
assert(!cockpitCss.includes('--mobile-shell-sticky-height'), 'cockpit IA not rewritten onto shell token')

const feature720 = [
  'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.module.css',
  'src/features/weddings/modern-detail/ModernWeddingLogisticsWorkspace.module.css',
]
for (const file of feature720) {
  assert(read(file).includes('@media (max-width: 720px)'), `${file} 720px left untouched`)
}

console.log('PASS  mobile-shell-phase-0 acceptance')
