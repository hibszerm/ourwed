/**
 * Setup readiness helpers + Dashboard pivot (2A) acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/onboarding/setup/setupGuidanceAcceptance.test.ts
 *
 * Dashboard SetupGuidancePanel is retired. Readiness/signals remain for Guide.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  deriveSetupGuidanceState,
  isGuidePreparationComplete,
  isSetupCoreReady,
  studioPackagesSetupSignalsQueryKey,
} from '@/features/onboarding/setup/setupGuidanceReadiness'
import { SETUP_GUIDANCE_ROUTES } from '@/features/onboarding/setup/setupGuidanceRoutes'
import { shouldShowFirstRunHome } from '@/features/onboarding/firstRunDiscriminator'

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

run('A: 0 weddings → Phase 1 owns zero history', () => {
  assert(
    shouldShowFirstRunHome({ totalWeddingHistoryCount: 0 }),
    'first-run owns zero history',
  )
})

run('history ≥ 1 blocks first-run (established account)', () => {
  assert(
    !shouldShowFirstRunHome({ totalWeddingHistoryCount: 1 }),
    'history blocks first-run',
  )
})

run('B: 0 packages → packages actionable, template depends', () => {
  const state = deriveSetupGuidanceState({ packages: [] })
  assert(state.packageRow === 'actionable', 'packages actionable')
  assert(state.activationStage === 'not_started', 'not started')
  assert(state.templateRow === 'depends_on_package', 'template depends')
  assert(!state.isCoreReady, 'not core ready')
  assert(!isGuidePreparationComplete([]), 'prep incomplete alias')
})

run('C: packages + no template → template actionable', () => {
  const state = deriveSetupGuidanceState({
    packages: [{ id: 'p1', name: 'Mini', activeContractTemplateId: null }],
  })
  assert(state.packageRow === 'started', 'packages started (not false Gotowe)')
  assert(state.activationStage === 'package_without_template', 'activation')
  assert(state.templateRow === 'actionable', 'template actionable')
  assert(!state.isCoreReady, 'not core ready without template')
})

run('D: package + template proxy → core ready', () => {
  const packages = [
    { id: 'p1', name: 'Mini', activeContractTemplateId: 'tmpl-1' },
  ]
  assert(isSetupCoreReady(packages), 'core ready')
  const state = deriveSetupGuidanceState({ packages })
  assert(state.isCoreReady, 'derived core ready')
  assert(state.templateRow === 'ready', 'template ready')
})

run('company optional never blocks core ready', () => {
  const packages = [
    { id: 'p1', name: 'Mini', activeContractTemplateId: 'tmpl-1' },
  ]
  const withoutCompany = deriveSetupGuidanceState({
    packages,
    companyName: null,
  })
  assert(withoutCompany.isCoreReady, 'core ready without company')
  assert(withoutCompany.companyRow === 'optional_cta', 'company optional cta')
  const withCompany = deriveSetupGuidanceState({
    packages: [{ id: 'p1', name: 'Mini', activeContractTemplateId: null }],
    companyName: 'Studio X',
  })
  assert(!withCompany.isCoreReady, 'company does not create core ready')
  assert(withCompany.companyRow === 'quiet_ready', 'company quiet ready')
})

run('CTA routes are real product paths', () => {
  assert(SETUP_GUIDANCE_ROUTES.packages === '/studio/pakiety', 'packages route')
  assert(SETUP_GUIDANCE_ROUTES.company === '/ustawienia/firma', 'company route')
  const router = read('src/routes/router.tsx')
  assert(router.includes("path: '/studio/pakiety'"), 'packages in router')
  assert(router.includes("path: '/ustawienia/firma'"), 'company in router')
})

run('2A: Dashboards no longer mount SetupGuidancePanel', () => {
  const classic = read('src/pages/DashboardPage.tsx')
  const v3 = read('src/pages/DashboardV3Page.tsx')
  assert(!classic.includes('SetupGuidancePanel'), 'classic has no panel')
  assert(!v3.includes('SetupGuidancePanel'), 'v3 has no panel')
  assert(
    !existsSync(
      resolve(process.cwd(), 'src/features/onboarding/setup/SetupGuidancePanel.tsx'),
    ),
    'panel presentation file removed',
  )
  assert(
    !existsSync(
      resolve(
        process.cwd(),
        'src/features/onboarding/setup/setupGuidanceDismiss.ts',
      ),
    ),
    'dashboard dismissal module removed',
  )
  assert(
    !existsSync(
      resolve(
        process.cwd(),
        'src/features/onboarding/setup/useSetupGuidanceState.ts',
      ),
    ),
    'dashboard setup hook removed',
  )
})

run('readiness helpers remain for future Guide', () => {
  const readiness = read(
    'src/features/onboarding/setup/setupGuidanceReadiness.ts',
  )
  const service = read('src/lib/api/packageService.ts')
  const barrel = read('src/features/onboarding/index.ts')
  assert(readiness.includes('isSetupCoreReady'), 'core ready helper')
  assert(readiness.includes('deriveSetupGuidanceState'), 'derive helper')
  assert(readiness.includes('activeContractTemplateId'), 'template proxy')
  assert(
    !readiness.includes('shouldShowSetupGuidance'),
    'dashboard eligibility retired',
  )
  assert(
    !readiness.includes('educationDismissed'),
    'education dismiss not in readiness',
  )
  assert(service.includes('listSetupSignals'), 'light list remains')
  assert(
    service.includes("select('id, name, active_contract_template_id')"),
    'no items hydrate',
  )
  assert(
    JSON.stringify(studioPackagesSetupSignalsQueryKey('u1')) ===
      JSON.stringify(['studio-packages', 'u1', 'setup-signals']),
    'setup-signals query key',
  )
  assert(barrel.includes('deriveSetupGuidanceState'), 'barrel exports derive')
  assert(barrel.includes('isSetupCoreReady'), 'barrel exports core ready')
  assert(barrel.includes('SETUP_GUIDANCE_ROUTES'), 'barrel exports routes')
  assert(!barrel.includes('SetupGuidancePanel'), 'barrel does not export panel')
})

run('V3 nearest-only collapses empty upcoming band (no reserved gap)', () => {
  const v3 = read('src/pages/DashboardV3Page.tsx')
  const css = read('src/pages/DashboardV3Page.module.css')
  assert(
    v3.includes("data-has-upcoming={nextThree.length > 0 ? 'true' : 'false'}"),
    'layout exposes upcoming presence',
  )
  assert(
    v3.includes('{nextThree.length > 0 ? ('),
    'upcoming band is conditional',
  )
  assert(
    css.includes(".layout[data-has-upcoming='false']"),
    'nearest-only grid variant',
  )
  assert(
    css.includes("'feed today'"),
    'nearest-only: feed rises beside today',
  )
  assert(
    css.includes(
      ".layout[data-has-upcoming='true'] .upcoming",
    ),
    'stretch only when upcoming exists',
  )
})

run('Classic NextAssignmentsSection already collapses when empty', () => {
  const section = read(
    'src/features/dashboard/components/NextAssignmentsSection.tsx',
  )
  assert(
    section.includes('if (assignments.length === 0) return null'),
    'classic upcoming returns null',
  )
  const classic = read('src/pages/DashboardPage.tsx')
  assert(
    classic.includes('<NextAssignmentsSection assignments={nextThree} />'),
    'classic mounts section once',
  )
})

console.log('\nAll setup readiness + Dashboard 2A pivot checks passed.')
