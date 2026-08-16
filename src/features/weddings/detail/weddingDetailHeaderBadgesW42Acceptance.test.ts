/**
 * Workflow retirement W4.2 — Wedding Detail header business badge cleanup.
 * Keeps assignment-type "Ślub"; removes Nowe / Oczekuje / Umowa shorthand.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/weddings/detail/weddingDetailHeaderBadgesW42Acceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getHeaderStatusBadges } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { getWeddingBusinessStatus } from '@/features/weddings/presentation/getWeddingBusinessStatus'
import type { Couple, Wedding } from '@/types/wedding'

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

run('1. header keeps Ślub assignment-type badge', () => {
  const badges = getHeaderStatusBadges()
  assertEq(badges.length, 1, 'single badge')
  assertEq(badges[0]?.id, 'entity', 'entity id')
  assertEq(badges[0]?.label, 'Ślub', 'Ślub label')
  const header = src('src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx')
  assert(header.includes('getHeaderStatusBadges'), 'wired')
  assert(header.includes('wedding-header-status-badges'), 'testid')
})

run('2–4. header does not render Nowe / Oczekuje / Umowa business badges', () => {
  for (const status of ['none', 'generated', 'sent', 'signed'] as const) {
    // Contract status must not affect header badges (helper call below proves independence).
    void status
    const badges = getHeaderStatusBadges()
    assertEq(badges.length, 1, `status=${status}`)
    assert(!badges.some((b) => b.id === 'business'), `no business id (${status})`)
    assert(!badges.some((b) => b.label === 'Nowe'), `no Nowe (${status})`)
    assert(!badges.some((b) => b.label === 'Oczekuje'), `no Oczekuje (${status})`)
    assert(!badges.some((b) => b.label === 'Umowa'), `no Umowa (${status})`)
  }
  const selectors = src(
    'src/features/weddings/detail/v2/weddingWorkspaceSelectors.ts',
  )
  assert(!selectors.includes('getWeddingBusinessStatus'), 'selector decoupled')
  assert(!selectors.includes("id: 'business'"), 'no business badge factory')
})

run('5. contract functionality still exists elsewhere', () => {
  const finance = src(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  const progress = src(
    'src/features/weddings/detail/v2/buildWeddingProgressSummary.ts',
  )
  const overview = src(
    'src/features/weddings/detail/v2/WeddingOverviewWorkspace.tsx',
  )
  assert(finance.includes('Umowa'), 'finance workspace contract copy')
  assert(progress.includes('Umowa podpisana') || progress.includes('Oczekuje na podpis'), 'progress contract items')
  assert(
    overview.includes('resolveWeddingNextAction') ||
      overview.includes('WeddingNextActionCard') ||
      overview.includes('NextAction'),
    'overview next action surface',
  )
})

run('6. stale/missing contract status cannot create second header badge', () => {
  const missing = getHeaderStatusBadges()
  assertEq(missing.length, 1, 'missing contract')
  assertEq(missing[0]?.label, 'Ślub', 'still Ślub')
  // Helper still maps truth — header no longer calls it.
  assertEq(getWeddingBusinessStatus(wedding({ contract: { status: 'none' } })).label, 'Nowe', 'helper')
  assertEq(getWeddingBusinessStatus(wedding({ contract: { status: 'signed' } })).label, 'Umowa', 'helper signed')
})

run('7. mobile header layout safe (no empty second pill gap)', () => {
  const header = src('src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx')
  const css = src('src/features/weddings/detail/v2/WeddingDetailV2.module.css')
  assert(header.includes('styles.commandPills'), 'pills wrapper')
  assert(css.includes('.commandPills'), 'pills css')
  assert(css.includes('flex-wrap'), 'wrap ok')
  // Only maps statusBadges + optional archived — no placeholder second slot.
  assert(!header.includes("id: 'business'"), 'no business slot')
  assert(!header.includes('getWeddingBusinessStatus'), 'no business import')
  assert(header.includes("wedding.status === 'archived'"), 'archived pill preserved')
})

run('8. Dashboard W4.1 stays clean', () => {
  const hero = src('src/features/dashboard/components/NextWeddingCard.tsx')
  const next = src('src/features/dashboard/components/NextAssignmentsSection.tsx')
  assert(!hero.includes('getWeddingBusinessStatus'), 'dashboard nearest clean')
  assert(!next.includes('getWeddingBusinessStatus'), 'dashboard upcoming clean')
  assert(hero.includes('assignmentTypeLabel'), 'dashboard type badge')
  assert(next.includes('assignmentTypeLabel'), 'upcoming type badge')
})

run('9. no replacement lifecycle badge introduced', () => {
  const header = src('src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx')
  assert(!header.includes('WorkflowBadge'), 'no WorkflowBadge')
  assert(!header.includes('WORKFLOW_STAGE_LABELS'), 'no stage labels')
  assert(!header.includes('getWorkflowStatus'), 'no workflow engine status')
  assert(!header.includes('resolveWeddingNextAction'), 'no Next Action badge')
  const badges = getHeaderStatusBadges()
  assertEq(badges.length, 1, 'exactly one')
})

if (process.exitCode) {
  console.error('\nW4.2 Wedding Detail header badges retirement failed.')
} else {
  console.log('\nW4.2 Wedding Detail header badges retirement: all checks passed.')
}
