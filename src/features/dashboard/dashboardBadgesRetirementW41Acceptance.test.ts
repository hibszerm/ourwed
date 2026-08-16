/**
 * WorkflowStage retirement W4.1 — Dashboard V1 badge cleanup.
 * Removes legacy commercial lifecycle badges (Nowe / Oczekuje / Umowa) from
 * nearest + upcoming cards; keeps assignment-type badge (Ślub / Sesja).
 *
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/dashboard/dashboardBadgesRetirementW41Acceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getWeddingBusinessStatus } from '@/features/weddings/presentation/getWeddingBusinessStatus'
import type { Couple, Wedding, WorkflowStage } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function couple(): Couple {
  return {
    partner1: 'Julia',
    partner2: 'Maksymilian',
    partner1FirstName: 'Julia',
    partner1LastName: 'Kanicka',
    partner2FirstName: 'Maksymilian',
    partner2LastName: 'Ruth',
    partner1Phone: '500100200',
    email: 'a@b.pl',
    phone: '500100200',
    venue: 'Hotel Stary',
    city: 'Kraków',
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2026-08-17',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Gold',
    price: 10000,
    depositAmount: 2000,
    currency: 'PLN',
    accentColor: '#112233',
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    createdAt: '2026-01-01',
    ...partial,
  }
}

const LEGACY_STAGES: WorkflowStage[] = [
  'reservation',
  'contract',
  'deposit',
  'preparation',
  'post_production',
  'completed',
]

run('1. nearest card keeps assignment-type badge only', () => {
  const hero = src('src/features/dashboard/components/NextWeddingCard.tsx')
  assert(hero.includes('assignmentTypeLabel'), 'Ślub / Sesja type badge')
  assert(hero.includes('Najbliższe zlecenie'), 'nearest label')
  assert(!hero.includes('getWeddingBusinessStatus'), 'no business status')
  assert(!hero.includes('workflowStage'), 'no workflowStage')
  assert(!hero.includes('WORKFLOW_STAGE_LABELS'), 'no stage labels')
  assert(!hero.includes('WorkflowBadge'), 'no WorkflowBadge')
  assert(!hero.includes("'Nowe'"), 'no Nowe literal')
  assert(!hero.includes("'Umowa'"), 'no Umowa literal')
  assert(!hero.includes("'Oczekuje'"), 'no Oczekuje literal')
  assert(!hero.includes('resolveWeddingNextAction'), 'no Next Action on card')
})

run('2. upcoming cards keep assignment-type badge only', () => {
  const next = src('src/features/dashboard/components/NextAssignmentsSection.tsx')
  assert(next.includes('assignmentTypeLabel'), 'Ślub / Sesja type badge')
  assert(next.includes('Kolejne zlecenia'), 'upcoming section')
  assert(!next.includes('getWeddingBusinessStatus'), 'no business status')
  assert(!next.includes('workflowStage'), 'no workflowStage')
  assert(!next.includes('WORKFLOW_STAGE_LABELS'), 'no stage labels')
  assert(!next.includes('WorkflowBadge'), 'no WorkflowBadge')
  assert(!next.includes("'Nowe'"), 'no Nowe literal')
  assert(!next.includes("'Umowa'"), 'no Umowa literal')
  assert(!next.includes("'Oczekuje'"), 'no Oczekuje literal')
  assert(!next.includes('resolveWeddingNextAction'), 'no Next Action on cards')
})

run('3. Dashboard V1 does not derive visible card status from workflowStage', () => {
  const page = src('src/pages/DashboardPage.tsx')
  const hero = src('src/features/dashboard/components/NextWeddingCard.tsx')
  const next = src('src/features/dashboard/components/NextAssignmentsSection.tsx')
  assert(!page.includes('workflowStage'), 'page ignores stage')
  assert(!page.includes('WORKFLOW_STAGE_LABELS'), 'page no stage labels')
  assert(!page.includes('getWeddingBusinessStatus'), 'page no business helper')
  assert(!hero.includes('workflowStage'), 'hero ignores stage')
  assert(!next.includes('workflowStage'), 'upcoming ignores stage')
})

run('4. stale workflowStage cannot change Dashboard V1 visible badges', () => {
  for (const stage of LEGACY_STAGES) {
    const w = wedding({ workflowStage: stage, contract: { status: 'signed' } })
    // Helper still maps contract truth — cards no longer call it.
    assertEq(getWeddingBusinessStatus(w).label, 'Umowa', `stage=${stage}`)
  }
  const hero = src('src/features/dashboard/components/NextWeddingCard.tsx')
  const next = src('src/features/dashboard/components/NextAssignmentsSection.tsx')
  assert(!hero.includes('getWeddingBusinessStatus'), 'hero not wired')
  assert(!next.includes('getWeddingBusinessStatus'), 'upcoming not wired')
  assert(
    !LEGACY_STAGES.some((s) => hero.includes(s) || next.includes(s)),
    'no stage id literals in card sources',
  )
})

run('5. no replacement lifecycle badge introduced on Dashboard cards', () => {
  const hero = src('src/features/dashboard/components/NextWeddingCard.tsx')
  const next = src('src/features/dashboard/components/NextAssignmentsSection.tsx')
  const badgeCount = (s: string) =>
    (s.match(/<Badge[\s>]/g) ?? []).length
  assertEq(badgeCount(hero), 1, 'hero single Badge')
  assertEq(badgeCount(next), 1, 'upcoming single Badge')
  assert(hero.includes('assignmentTypeLabel'), 'hero type only')
  assert(next.includes('assignmentTypeLabel'), 'upcoming type only')
  assert(!hero.includes('getHeaderStatusBadges'), 'no detail header badges')
  assert(!next.includes('getHeaderStatusBadges'), 'no detail header badges')
  assert(!hero.includes('getWorkflowStatus'), 'no workflow engine status')
  assert(!next.includes('getWorkflowStatus'), 'no workflow engine status')
})

run('6. former second-badge labels are contract.status, not workflowStage', () => {
  assertEq(getWeddingBusinessStatus(wedding({ contract: { status: 'none' } })).label, 'Nowe', 'none')
  assertEq(
    getWeddingBusinessStatus(wedding({ contract: { status: 'generated' } })).label,
    'Oczekuje',
    'generated',
  )
  assertEq(
    getWeddingBusinessStatus(wedding({ contract: { status: 'sent' } })).label,
    'Oczekuje',
    'sent',
  )
  assertEq(
    getWeddingBusinessStatus(wedding({ contract: { status: 'signed' } })).label,
    'Umowa',
    'signed',
  )
  const helper = src(
    'src/features/weddings/presentation/getWeddingBusinessStatus.ts',
  )
  assert(helper.includes("wedding.contract?.status"), 'contract.status source')
  assert(!helper.includes('workflowStage'), 'helper ignores workflowStage')
})

run('7. Dashboard first-paint architecture remains light', () => {
  const firstPaint = src('src/lib/performance/dashboardFirstPaintAcceptance.test.ts')
  const service = src('src/lib/api/dashboardService.ts')
  const page = src('src/pages/DashboardPage.tsx')
  assert(page.includes('useDashboardAssignments'), 'light assignments hook')
  assert(!page.includes('useWeddings('), 'no heavy useWeddings')
  assert(service.includes('DASHBOARD_LIGHT_WEDDING_SELECT'), 'light select')
  assert(service.includes('listByWeddingIds'), 'batch contract enrich kept')
  assert(service.includes('weddingPlaceService.listByWeddingIds'), 'batch places')
  assert(!service.includes('getById'), 'no getById per card')
  assert(!service.includes('resolveWeddingNextAction'), 'no Next Action hydrate')
  assert(firstPaint.includes('getAssignmentLists'), 'first-paint guard')
  assert(firstPaint.includes('contractService.listByWeddingIds'), 'batch contracts guarded')
})

run('8. Detail header business badges unchanged (out of W4.1 scope)', () => {
  const header = src('src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx')
  const selectors = src(
    'src/features/weddings/detail/v2/weddingWorkspaceSelectors.ts',
  )
  assert(header.includes('getHeaderStatusBadges'), 'detail still uses badges')
  assert(selectors.includes('getWeddingBusinessStatus'), 'detail still maps status')
})

if (process.exitCode) {
  console.error('\nW4.1 Dashboard V1 badges retirement failed.')
} else {
  console.log('\nW4.1 Dashboard V1 badges retirement: all checks passed.')
}
