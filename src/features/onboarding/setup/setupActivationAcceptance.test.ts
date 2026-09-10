/**
 * Phase 3.1 — package → contract template activation acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/onboarding/setup/setupActivationAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  deriveGuideActivationStage,
  deriveSetupGuidanceState,
  isGuidePreparationComplete,
  isSetupCoreReady,
} from '@/features/onboarding/setup/setupGuidanceReadiness'
import { SETUP_GUIDANCE_ROUTES } from '@/features/onboarding/setup/setupGuidanceRoutes'
import { FIRST_RUN_ROUTES } from '@/features/onboarding/firstRunRoutes'
import { buildGuidePreparePresentation } from '@/features/onboarding/guide/guidePreparePresentation'
import { shouldAnimateGuideCompass } from '@/features/onboarding/guide/guideDiscoveryRules'
import { parseGuideIntegrationPreference } from '@/features/onboarding/guide/guideIntegrationPreference'

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

const none: [] = []
const oneBare = [
  { id: 'p1', name: 'Mini', activeContractTemplateId: null as string | null },
]
const oneReady = [
  { id: 'p1', name: 'Mini', activeContractTemplateId: 'tmpl-1' },
]
const mixed = [
  { id: 'a', name: 'A', activeContractTemplateId: 'tmpl-1' },
  { id: 'b', name: 'B', activeContractTemplateId: null as string | null },
]

run('A: 0 packages → not_started; package recommended; no dead template CTA', () => {
  assert(deriveGuideActivationStage(none) === 'not_started', 'stage')
  const presentation = buildGuidePreparePresentation(
    deriveSetupGuidanceState({ packages: none, companyName: null }),
  )
  assert(presentation.activationStage === 'not_started', 'presentation stage')
  assert(presentation.summary === null, 'no summary yet')
  const packages = presentation.modules.find((m) => m.id === 'packages')!
  const templates = presentation.modules.find((m) => m.id === 'templates')!
  assert(packages.recommendedNext === true, 'packages recommended')
  assert(packages.statusLabel === 'Do ustawienia', 'packages status')
  assert(packages.actions[0]?.label === 'Dodaj pakiet →', 'packages CTA')
  assert(
    packages.body.includes('zleceniach, ankietach i umowach'),
    'why packages',
  )
  assert(templates.statusLabel === 'Wymaga pakietu', 'template depends')
  assert(templates.actions.length === 0, 'no dead CTA')
  assert(
    templates.body.includes('W kolejnym kroku'),
    'template explains next after package',
  )
})

run('B: package without template → package_without_template; template next', () => {
  assert(
    deriveGuideActivationStage(oneBare) === 'package_without_template',
    'stage',
  )
  const state = deriveSetupGuidanceState({ packages: oneBare })
  assert(state.packageRow === 'started', 'package started not false Gotowe')
  assert(state.templateRow === 'actionable', 'template actionable')
  assert(!state.isCoreReady, 'not core ready')
  const presentation = buildGuidePreparePresentation(state)
  assert(presentation.summary?.title === 'Następny krok', 'summary next')
  const packages = presentation.modules.find((m) => m.id === 'packages')!
  const templates = presentation.modules.find((m) => m.id === 'templates')!
  assert(packages.statusLabel === 'Pakiet dodany', 'pakiet dodany')
  assert(packages.statusTone === 'started', 'started tone')
  assert(templates.recommendedNext === true, 'template recommended')
  assert(templates.actions[0]?.label === 'Dodaj wzór umowy →', 'template CTA')
  assert(
    templates.actions[0]?.to === SETUP_GUIDANCE_ROUTES.packages,
    'template → packages',
  )
  const workspace = read(
    'src/features/studio/packages/modern/ModernPackagesWorkspace.tsx',
  )
  const section = read('src/features/studio/PackageContractSection.tsx')
  assert(workspace.includes('emphasizeNextStep'), 'workspace wires next step')
  assert(section.includes('package-contract-next-step'), 'next-step test id')
  assert(section.includes('Dodaj wzór umowy'), 'next-step title')
  assert(section.includes('Przypisz plik DOCX'), 'next-step why')
})

run('C: package + template → core_ready', () => {
  assert(deriveGuideActivationStage(oneReady) === 'core_ready', 'stage')
  assert(isSetupCoreReady(oneReady), 'boolean')
  assert(isGuidePreparationComplete(oneReady), 'alias')
  const presentation = buildGuidePreparePresentation(
    deriveSetupGuidanceState({ packages: oneReady, companyName: null }),
  )
  assert(presentation.activationStage === 'core_ready', 'presentation')
  assert(
    presentation.summary?.title === 'Podstawowa konfiguracja jest gotowa',
    'success title',
  )
  assert(
    !presentation.summary?.body.includes('każdą umowę'),
    'no overclaim wedding gen',
  )
  assert(
    presentation.modules.find((m) => m.id === 'packages')?.statusLabel ===
      'Gotowe',
    'packages gotowe only when core',
  )
  assert(
    presentation.modules.find((m) => m.id === 'templates')?.statusLabel ===
      'Gotowe',
    'templates gotowe',
  )
})

run('D: mixed packages — global core ready; incomplete stays local', () => {
  assert(deriveGuideActivationStage(mixed) === 'core_ready', 'global stage')
  assert(isSetupCoreReady(mixed), 'global boolean')
  assert(isGuidePreparationComplete(mixed), 'prep complete')
  const workspace = read(
    'src/features/studio/packages/modern/ModernPackagesWorkspace.tsx',
  )
  assert(
    workspace.includes('studioHasLinkedTemplate'),
    'local emphasize gated by studio-wide template',
  )
  assert(
    workspace.includes(
      '!pkg.activeContractTemplateId && !studioHasLinkedTemplate',
    ),
    'B without template does not re-emphasize after A is ready',
  )
  assert(
    workspace.includes("data-has-template={"),
    'local honesty attribute on slot',
  )
})

run('E: company absent + package/template ready → core_ready', () => {
  const state = deriveSetupGuidanceState({
    packages: oneReady,
    companyName: null,
  })
  assert(state.isCoreReady, 'core ready')
  assert(state.activationStage === 'core_ready', 'stage')
  assert(state.companyRow === 'optional_cta', 'company still optional')
})

run('F: travel not in core readiness', () => {
  const readiness = read(
    'src/features/onboarding/setup/setupGuidanceReadiness.ts',
  )
  assert(!readiness.includes('travel'), 'no travel in readiness module')
  assert(isSetupCoreReady(oneReady), 'core ignores travel settings')
})

run('G–I: import / quick create / questionnaire remain reachable at 0 packages', () => {
  assert(FIRST_RUN_ROUTES.import === '/sluby/import', 'import route')
  assert(
    FIRST_RUN_ROUTES.createExisting === '/sluby/nowy?quick=1',
    'quick route',
  )
  assert(
    FIRST_RUN_ROUTES.collectByQuestionnaire.includes('/ankiety/dane-do-umowy'),
    'questionnaire route',
  )
  const router = read('src/routes/router.tsx')
  assert(router.includes("path: '/sluby/import'"), 'import routed')
  assert(router.includes("path: '/sluby/nowy'"), 'new wedding routed')
  assert(
    router.includes("path: '/ankiety/dane-do-umowy'"),
    'questionnaire editor routed',
  )
  const prepare = read(
    'src/features/onboarding/guide/guidePreparePresentation.ts',
  )
  assert(!prepare.includes('Navigate'), 'prepare does not force nav gates')
  const firstRun = read('src/features/onboarding/FirstRunHome.tsx')
  assert(firstRun.includes('FIRST_RUN_ROUTES.import'), 'first-run import')
  assert(
    firstRun.includes('FIRST_RUN_ROUTES.createExisting'),
    'first-run quick',
  )
})

run('J: template link invalidates studio-packages (setup signals refresh)', () => {
  const page = read('src/pages/PackagesPage.tsx')
  assert(
    page.includes("invalidateQueries({ queryKey: ['studio-packages'] })"),
    'packages invalidate prefix',
  )
  assert(
    page.includes('onPackageUpdated={() => void invalidate()}'),
    'contract section update invalidates',
  )
  const section = read('src/features/studio/PackageContractSection.tsx')
  assert(section.includes('onPackageUpdated(result.package)'), 'calls update')
  assert(section.includes('uploadPackageContractTemplate'), 'upload path')
})

run('K: core_ready → Guide attention false via shared readiness', () => {
  assert(isGuidePreparationComplete(oneReady), 'prep complete')
  assert(
    !shouldAnimateGuideCompass({
      preference: parseGuideIntegrationPreference(null),
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: isGuidePreparationComplete(oneReady),
    }),
    'sweep off when prep complete',
  )
  assert(
    shouldAnimateGuideCompass({
      preference: parseGuideIntegrationPreference(null),
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: isGuidePreparationComplete(oneBare),
    }),
    'sweep on when package without template',
  )
})

run('boolean semantics unchanged (length + some template id)', () => {
  const readiness = read(
    'src/features/onboarding/setup/setupGuidanceReadiness.ts',
  )
  assert(readiness.includes('packages.length === 0'), 'empty guard')
  assert(
    readiness.includes('packages.some((pkg) => Boolean(pkg.activeContractTemplateId))'),
    'some template',
  )
  assert(
    readiness.includes('isGuidePreparationComplete'),
    'prep alias preserved',
  )
})

console.log('\nAll Phase 3.1 setup activation checks passed.')
