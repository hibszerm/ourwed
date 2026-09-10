/**
 * Guide discovery eligibility — session 0→>0 transition (no wedding-count ceiling).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/onboarding/guide/guideDiscoveryIntegrationAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseGuideIntegrationPreference } from '@/features/onboarding/guide/guideIntegrationPreference'
import {
  shouldAnimateGuideCompass,
  shouldShowGuideDiscoveryModal,
} from '@/features/onboarding/guide/guideDiscoveryRules'
import { GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY } from '@/lib/guideDiscovery/eligibleSession'
import { deriveSetupGuidanceState } from '@/features/onboarding/setup/setupGuidanceReadiness'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    throw err
  }
}

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const basePref = {
  discovered: false,
  modalDismissed: false,
  sidebarVisible: true,
}

function modalEligible(overrides: {
  discoveryEligible?: boolean
  showingFirstRunHome?: boolean
  preference?: typeof basePref
  isCalmOperationalSurface?: boolean
}) {
  return shouldShowGuideDiscoveryModal({
    preference: overrides.preference ?? basePref,
    discoveryEligible: overrides.discoveryEligible ?? false,
    showingFirstRunHome: overrides.showingFirstRunHome ?? false,
    isCalmOperationalSurface: overrides.isCalmOperationalSurface ?? true,
  })
}

run('visibility default ON / undefined does not hide', () => {
  assert(parseGuideIntegrationPreference(null).sidebarVisible === true, 'null')
  assert(
    parseGuideIntegrationPreference('{"discovered":true}').sidebarVisible ===
      true,
    'missing sidebarVisible',
  )
  assert(
    parseGuideIntegrationPreference(
      '{"sidebarVisible":false}',
    ).sidebarVisible === false,
    'explicit false',
  )
})

run('1–3 wedding-count heuristic removed', () => {
  const rules = read('src/features/onboarding/guide/guideDiscoveryRules.ts')
  const pref = read(
    'src/features/onboarding/guide/guideIntegrationPreference.ts',
  )
  assert(!rules.includes('GUIDE_DISCOVERY_EARLY_HISTORY_MAX'), 'no ceiling import')
  assert(!pref.includes('GUIDE_DISCOVERY_EARLY_HISTORY_MAX'), 'ceiling removed')
  assert(!rules.includes('totalWeddingHistoryCount'), 'no history count gate')
  assert(rules.includes('discoveryEligible'), 'uses session marker')
})

run('compass readiness attention matrix A–H', () => {
  const incomplete = false
  const complete = true

  // A: discovered=false, prep incomplete → animate
  assert(
    shouldAnimateGuideCompass({
      preference: basePref,
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: incomplete,
    }),
    'A incomplete + undiscovered',
  )

  // B: discovered=true, prep incomplete → STILL animate (new rule)
  assert(
    shouldAnimateGuideCompass({
      preference: { ...basePref, discovered: true },
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: incomplete,
    }),
    'B discovered still animates when prep incomplete',
  )

  // C: discovered=true, prep complete → static
  assert(
    !shouldAnimateGuideCompass({
      preference: { ...basePref, discovered: true },
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: complete,
    }),
    'C prep complete static',
  )

  // D: discovered=false, prep complete → static
  assert(
    !shouldAnimateGuideCompass({
      preference: basePref,
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: complete,
    }),
    'D prep complete even if undiscovered',
  )

  // E: prep incomplete, route=/przewodnik → static
  assert(
    !shouldAnimateGuideCompass({
      preference: basePref,
      isGuideRouteActive: true,
      prefersReducedMotion: false,
      isGuidePreparationComplete: incomplete,
    }),
    'E guide route static',
  )

  // F: reduced motion → static
  assert(
    !shouldAnimateGuideCompass({
      preference: basePref,
      isGuideRouteActive: false,
      prefersReducedMotion: true,
      isGuidePreparationComplete: incomplete,
    }),
    'F reduced motion static',
  )

  // G: modalDismissed — modal off, compass may animate
  assert(
    !modalEligible({
      discoveryEligible: true,
      preference: { ...basePref, modalDismissed: true },
    }),
    'G modal dismissed never returns',
  )
  assert(
    shouldAnimateGuideCompass({
      preference: { ...basePref, modalDismissed: true },
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: incomplete,
    }),
    'G compass still animates when dismissed + incomplete',
  )

  // H: discovered — modal off, compass may animate
  assert(
    !modalEligible({
      discoveryEligible: true,
      preference: { ...basePref, discovered: true },
    }),
    'H modal never after discovered',
  )
  assert(
    shouldAnimateGuideCompass({
      preference: { ...basePref, discovered: true },
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: incomplete,
    }),
    'H compass still animates when discovered + incomplete',
  )

  assert(
    !shouldAnimateGuideCompass({
      preference: { ...basePref, sidebarVisible: false },
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: incomplete,
    }),
    'hidden sidebar never animates',
  )
})

run('compass uses shared Guide preparation readiness', () => {
  const rules = read('src/features/onboarding/guide/guideDiscoveryRules.ts')
  const sidebar = read('src/layouts/Sidebar.tsx')
  const readiness = read(
    'src/features/onboarding/setup/setupGuidanceReadiness.ts',
  )
  assert(rules.includes('isGuidePreparationComplete'), 'rules take readiness')
  {
    const compassFn = rules.slice(
      rules.indexOf('export function shouldAnimateGuideCompass'),
      rules.indexOf('export function shouldShowGuideDiscoveryModal'),
    )
    assert(!compassFn.includes('discovered'), 'discovered no longer gates compass')
  }
  assert(sidebar.includes('isGuidePreparationComplete'), 'sidebar wires readiness')
  assert(sidebar.includes('studioPackagesSetupSignalsQueryKey'), 'same query key as Guide')
  assert(sidebar.includes('listSetupSignals'), 'setup signals')
  assert(readiness.includes('isGuidePreparationComplete'), 'alias exported')
  assert(
    deriveSetupGuidanceState({
      packages: [{ id: 'p', name: 'A', activeContractTemplateId: 't1' }],
      companyName: null,
    }).isCoreReady === true,
    'core ready = prep complete proxy',
  )
  assert(
    deriveSetupGuidanceState({
      packages: [{ id: 'p', name: 'A', activeContractTemplateId: null }],
      companyName: 'Studio',
    }).isCoreReady === false,
    'company alone does not complete prep',
  )
})

run('matrix A–D: established history without marker → NO modal', () => {
  for (const _count of [1, 2, 3, 50]) {
    assert(
      !modalEligible({ discoveryEligible: false }),
      `no marker → no modal (history ${_count} irrelevant)`,
    )
  }
})

run('matrix E–H: marker present → eligible on calm dashboard', () => {
  assert(modalEligible({ discoveryEligible: true }), 'eligible with marker')
})

run('matrix I: history already >0 does not invent eligibility in rules', () => {
  assert(
    !modalEligible({ discoveryEligible: false }),
    'without marker never eligible',
  )
})

run('matrix J: First Run / session skip → NO modal', () => {
  assert(
    !modalEligible({
      discoveryEligible: true,
      showingFirstRunHome: true,
    }),
    'first run home blocks even with marker',
  )
  assert(
    !modalEligible({
      discoveryEligible: false,
      showingFirstRunHome: false,
    }),
    'skip empty: no marker',
  )
})

run('matrix L–M: discovered / dismissed never again', () => {
  assert(
    !modalEligible({
      discoveryEligible: true,
      preference: { ...basePref, discovered: true },
    }),
    'discovered',
  )
  assert(
    !modalEligible({
      discoveryEligible: true,
      preference: { ...basePref, modalDismissed: true },
    }),
    'dismissed',
  )
})

run('session key + first-booking wiring paths', () => {
  assert(
    GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY === 'ourwed:guide.discoveryEligible',
    'session key',
  )
  const create = read('src/pages/NewWeddingPage.tsx')
  const importPage = read('src/pages/WeddingImportPage.tsx')
  const approve = read('src/lib/api/questionnaireService.ts')
  const session = read('src/lib/guideDiscovery/eligibleSession.ts')
  const host = read(
    'src/features/onboarding/guide/GuideDiscoveryModalHost.tsx',
  )
  const libEligibleImport =
    "from '@/lib/guideDiscovery/eligibleSession'"

  assert(create.includes('markGuideDiscoveryEligibleIfFirstBooking'), 'create')
  assert(create.includes('priorHistoryCount'), 'create prior')
  assert(create.includes('countWeddingHistory'), 'create authoritative count')
  assert(create.includes('isFullCreatePartialError'), 'partial still marks')
  assert(
    importPage.includes('markGuideDiscoveryEligibleIfFirstBooking'),
    'import',
  )
  assert(importPage.includes('priorHistoryCount'), 'import prior')
  assert(importPage.includes('countWeddingHistory'), 'import authoritative count')
  assert(importPage.includes('importedCount > 0'), 'import success gate')
  assert(
    approve.includes('markGuideDiscoveryEligibleIfFirstBooking'),
    'questionnaire approve',
  )
  assert(approve.includes('countWeddingHistory'), 'approve prior count')
  assert(approve.includes('priorWeddingHistoryCount'), 'approve prior var')
  // Writers + host must share one store module (Vite DEV can fork on dual paths).
  assert(create.includes(libEligibleImport), 'create imports lib store')
  assert(importPage.includes(libEligibleImport), 'import imports lib store')
  assert(approve.includes(libEligibleImport), 'approve imports lib store')
  assert(host.includes(libEligibleImport), 'host imports lib store')
  assert(
    !create.includes('guideDiscoveryEligibleSession'),
    'create not via wrapper',
  )
  assert(
    !host.includes('guideDiscoveryEligibleSession'),
    'host not via wrapper',
  )
  assert(
    session.includes("sessionStorage.setItem"),
    'sessionStorage write',
  )
  assert(
    session.includes('subscribeGuideDiscoveryEligible'),
    'same-tab subscribe',
  )
  assert(
    session.includes('notifyGuideDiscoveryEligibleListeners'),
    'same-tab notify',
  )
  assert(
    !create.includes('GUIDE_DISCOVERY_EARLY_HISTORY_MAX'),
    'create has no ceiling',
  )
})

run('host no longer uses wedding-count prop', () => {
  const host = read(
    'src/features/onboarding/guide/GuideDiscoveryModalHost.tsx',
  )
  const classic = read('src/pages/DashboardPage.tsx')
  const modern = read('src/pages/DashboardV3Page.tsx')
  assert(!host.includes('totalWeddingHistoryCount'), 'host no count')
  assert(host.includes('readGuideDiscoveryEligible'), 'host reads marker')
  assert(host.includes('subscribeGuideDiscoveryEligible'), 'host same-tab')
  assert(host.includes('retainGuideDiscoveryEligibleSnapshot'), 'host retain')
  assert(host.includes('useSyncExternalStore'), 'host external store')
  assert(!host.includes('() => false'), 'no false server snapshot')
  assert(classic.includes('GuideDiscoveryModalHost'), 'classic host')
  assert(modern.includes('GuideDiscoveryModalHost'), 'modern host')
  assert(
    classic.includes('showingFirstRunHome={false}'),
    'classic operational only',
  )
})

run('modal copy polish', () => {
  const modal = read(
    'src/features/onboarding/guide/GuideDiscoveryModal.tsx',
  )
  const css = read(
    'src/features/onboarding/guide/GuideDiscoveryModal.module.css',
  )
  const sharedModal = read('src/components/ui/Modal.tsx')
  assert(modal.includes('Poznaj Przewodnik'), 'title')
  assert(
    modal.includes(
      'Zacznij od Przewodnika, który pomoże Ci poznać OurWed i krok po kroku',
    ),
    'intro',
  )
  assert(
    modal.includes('Poznasz najważniejsze funkcje'),
    'benefit functions',
  )
  assert(
    modal.includes('Przejdziesz krok po kroku przez konfigurację'),
    'benefit config',
  )
  assert(
    modal.includes('Otrzymasz praktyczne wskazówki'),
    'benefit tips',
  )
  assert(modal.includes('BookOpen'), 'functions icon')
  assert(modal.includes('ListChecks'), 'config icon')
  assert(modal.includes('Lightbulb'), 'tips icon')
  assert(
    modal.includes(
      'Znajdziesz tam najważniejsze ustawienia, funkcje i wskazówki potrzebne',
    ),
    'support',
  )
  assert(modal.includes('Otwórz Przewodnik'), 'primary')
  assert(modal.includes('Może później'), 'secondary')
  assert(!modal.includes('Poznaj OurWed we własnym tempie'), 'old title gone')
  assert(!modal.includes('eyebrow'), 'no uppercase eyebrow')
  assert(modal.includes('entrance="settle"'), 'premium entrance')
  assert(modal.includes('mobilePresentation="center"'), 'mobile centered parity')
  assert(modal.includes('discoveryPanel'), 'surface polish class')
  assert(css.includes('.benefits'), 'benefit panel')
  assert(css.includes('max-width: min(520px'), 'desktop width ~520')
  assert(css.includes('.intro'), 'intro identity')
  assert(
    css.includes('.discoveryPanel > footer'),
    'mobile footer row override',
  )
  assert(sharedModal.includes("entrance?: 'default' | 'settle'"), 'Modal settle API')
  assert(sharedModal.includes('panelClassName'), 'panelClassName API')
  assert(
    sharedModal.includes("mobilePresentation?: 'sheet' | 'center'"),
    'center mobile API exists',
  )
})

run('direct Guide visit clears eligible via markDiscovered', () => {
  const pref = read(
    'src/features/onboarding/guide/guideIntegrationPreference.ts',
  )
  const page = read('src/pages/PrzewodnikPage.tsx')
  assert(pref.includes('clearGuideDiscoveryEligible'), 'clear on discover/dismiss')
  assert(page.includes('markDiscovered'), 'visit marks discovered')
})

run('settings + compass regression wiring', () => {
  const appearance = read('src/pages/AppearanceSettingsPage.tsx')
  const sidebar = read('src/layouts/Sidebar.tsx')
  const css = read('src/layouts/Sidebar.module.css')
  assert(appearance.includes('Pokazuj Przewodnik w menu'), 'settings')
  assert(sidebar.includes('guideAttention'), 'attention class on row')
  assert(sidebar.includes('isGuidePreparationComplete'), 'prep readiness wired')
  assert(!sidebar.includes('guideCompassMark'), 'no halo mark')
  assert(!sidebar.includes('guideCompassAttention'), 'no halo class')
  assert(css.includes('guideAttentionSweep'), 'sweep keyframes')
  assert(css.includes('10s'), '10s cadence')
  assert(!css.includes('guideAttentionSweep 30s'), 'no 30s sweep')
  assert(css.includes('guideAttention::after'), 'row sweep pseudo')
  assert(css.includes('--color-sidebar-text-active'), 'sidebar tokens')
  assert(css.includes('brightness(1.45)'), 'glyph lift tuned')
  assert(css.includes('4.75%'), 'row wash tuned')
  assert(!css.includes('guideCompassHalo'), 'halo keyframes removed')
  assert(!css.includes('guideCompassSurface'), 'surface keyframes removed')
  assert(!css.includes('guideCompassIconLift'), 'icon lift removed')
  assert(!css.includes('360deg'), 'no spin')
})

run('readiness independent of discovery', () => {
  const ready = deriveSetupGuidanceState({
    packages: [{ id: '1', name: 'A', activeContractTemplateId: 't' }],
    companyName: null,
  })
  assert(ready.isCoreReady, 'company optional')
})

console.log('\nAll Guide discovery integration acceptance checks passed.')
