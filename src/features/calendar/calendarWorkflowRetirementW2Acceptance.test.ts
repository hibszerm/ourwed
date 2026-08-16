/**
 * WorkflowStage retirement W2 — Calendar off legacy workflow engine.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/calendar/calendarWorkflowRetirementW2Acceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hrefForWeddingNextAction } from '@/features/calendar/utils/hrefForWeddingNextAction'
import {
  toCalendarEvent,
  WEDDING_CALENDAR_COLORS,
} from '@/features/calendar/utils/calendarEvents'
import { resolveWeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'
import type { WeddingPlace } from '@/types/travel'
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

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Anna',
    partner2: 'Jan',
    partner1FirstName: 'Anna',
    partner1LastName: 'Kowalska',
    partner2FirstName: 'Jan',
    partner2LastName: 'Kowalski',
    partner1Phone: '500100200',
    email: 'a@b.pl',
    phone: '500100200',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2026-09-20',
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

function place(role: WeddingPlace['role'], label: string): WeddingPlace {
  return {
    id: `p-${role}`,
    weddingId: 'w1',
    role,
    label,
    placeId: null,
    formattedAddress: label,
    latitude: null,
    longitude: null,
    sortOrder: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

function paidDeposit(): Wedding['payments'][number] {
  return {
    id: 'pay1',
    label: 'Zadatek',
    type: 'deposit',
    amount: 2000,
    paid: true,
    paidAt: '2026-01-01',
    method: 'transfer',
  }
}

// --- Source architecture ---

run('1. Calendar no longer calls legacy getNextRecommendedAction', () => {
  const drawer = src('src/features/calendar/components/CalendarDrawer.tsx')
  const events = src('src/features/calendar/utils/calendarEvents.ts')
  assert(!drawer.includes('getNextRecommendedAction'), 'drawer')
  assert(!events.includes('getNextRecommendedAction'), 'events')
  assert(!drawer.includes('workflowEngine'), 'no engine import in drawer')
})

run('2. Calendar uses resolveWeddingNextAction via drawer enrichment', () => {
  const drawer = src('src/features/calendar/components/CalendarDrawer.tsx')
  const hook = src('src/features/calendar/hooks/useCalendarWeddingNextAction.ts')
  assert(drawer.includes('useCalendarWeddingNextAction'), 'drawer hook')
  assert(hook.includes('resolveWeddingNextAction'), 'hook resolves')
  assert(hook.includes("['weddings', userId, weddingId]"), 'reuses wedding detail key')
  assert(hook.includes("['wedding-places', userId, weddingId]"), 'reuses places key')
  assert(hook.includes("'prewedding-questionnaire'"), 'reuses prewedding key')
  assert(hook.includes('operationalTimesQueryKey'), 'reuses ops times key')
})

run('3. stale workflowStage cannot alter Calendar CTA (shared resolver)', () => {
  const base = wedding({
    workflowStage: 'wedding_day',
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'generated' },
  })
  const a = resolveWeddingNextAction(base)
  assertEq(a?.id, 'mark_contract_signed', 'stage ignored — mark signed')
  const b = resolveWeddingNextAction({
    ...base,
    workflowStage: 'completed',
  })
  assertEq(b?.id, 'mark_contract_signed', 'completed stage still ignored')
})

run('4. waiting questionnaire produces no fake CTA', () => {
  const action = resolveWeddingNextAction(
    wedding({
      questionnaires: {
        contractData: { status: 'sent' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      couple: couple({
        partner1FirstName: '',
        partner1LastName: '',
        partner1: '',
        partner1Phone: '',
        phone: '',
        email: '',
      }),
    }),
  )
  assertEq(action, null, 'waiting — null')
})

run('5. unsigned contract produces mark-signed action', () => {
  const action = resolveWeddingNextAction(
    wedding({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      contract: { status: 'sent' },
    }),
  )
  assertEq(action?.id, 'mark_contract_signed', 'mark signed')
  assertEq(
    hrefForWeddingNextAction('w1', action!),
    '/sluby/w1?tab=contract_finance',
    'href',
  )
})

run('6. unpaid deposit produces record-deposit action', () => {
  const action = resolveWeddingNextAction(
    wedding({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      contract: { status: 'signed' },
      depositAmount: 2000,
      payments: [],
    }),
  )
  assertEq(action?.id, 'record_deposit', 'deposit')
})

run('7. completed prewedding + missing locations produces locations action', () => {
  const action = resolveWeddingNextAction(
    wedding({
      date: '2026-08-20',
      ceremonyLocation: '',
      receptionLocation: '',
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      contract: { status: 'signed' },
      payments: [paidDeposit()],
    }),
    {
      today: '2026-08-10',
      preweddingStatus: 'completed',
      places: [],
      canonicalApplyCandidateCount: 0,
    },
  )
  assertEq(action?.id, 'complete_core_locations', 'locations')
})

run('8. missing ceremony time produces ceremony-time action', () => {
  const places = [place('ceremony', 'Kościół'), place('reception', 'Sala')]
  const action = resolveWeddingNextAction(
    wedding({
      date: '2026-08-20',
      ceremonyTime: undefined,
      ceremonyLocation: 'Kościół',
      receptionLocation: 'Sala',
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      contract: { status: 'signed' },
      payments: [paidDeposit()],
    }),
    {
      today: '2026-08-10',
      preweddingStatus: 'completed',
      places,
      operationalTimes: {},
      canonicalApplyCandidateCount: 0,
    },
  )
  assertEq(action?.id, 'set_ceremony_time', 'ceremony time')
})

run('9. imminent ready wedding produces Cockpit', () => {
  const places = [place('ceremony', 'Kościół'), place('reception', 'Sala')]
  const action = resolveWeddingNextAction(
    wedding({
      date: '2026-08-16',
      ceremonyTime: '14:00',
      ceremonyLocation: 'Kościół',
      receptionLocation: 'Sala',
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      contract: { status: 'signed' },
      payments: [paidDeposit()],
    }),
    {
      today: '2026-08-16',
      preweddingStatus: 'completed',
      places,
      operationalTimes: {},
      canonicalApplyCandidateCount: 0,
    },
  )
  assertEq(action?.id, 'open_cockpit', 'cockpit')
  assertEq(
    hrefForWeddingNextAction('w1', action!),
    '/sluby/w1/dzien-slubu',
    'cockpit href',
  )
})

run('10. past ready wedding does not invent postproduction CTA', () => {
  const action = resolveWeddingNextAction(
    wedding({
      date: '2026-07-01',
      workflowStage: 'post_production',
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      contract: { status: 'signed' },
      payments: [paidDeposit()],
    }),
    {
      today: '2026-08-16',
      preweddingStatus: 'completed',
      places: [place('ceremony', 'A'), place('reception', 'B')],
    },
  )
  assertEq(action, null, 'past — no invented delivery CTA')
})

run('11. stage label not rendered as Calendar status', () => {
  const drawer = src('src/features/calendar/components/CalendarDrawer.tsx')
  const chip = src('src/features/calendar/components/CalendarEventChip.tsx')
  const events = src('src/features/calendar/utils/calendarEvents.ts')
  assert(!drawer.includes('stageLabel'), 'drawer no stageLabel')
  assert(!drawer.includes('statusMessage'), 'drawer no statusMessage')
  assert(!chip.includes('statusMessage'), 'chip no statusMessage')
  assert(!events.includes('stageLabel'), 'dto no stageLabel')
  assert(!events.includes('statusMessage'), 'dto no statusMessage')
  assert(!events.includes('WORKFLOW_STAGE_LABELS'), 'no stage labels')
})

run('12. event color does not depend on workflowStage', () => {
  const events = src('src/features/calendar/utils/calendarEvents.ts')
  assert(!events.includes('getWorkflowStageColor'), 'no stage color fn')
  assert(!events.includes('workflowStage'), 'builder ignores stage')
  assert(events.includes('WEDDING_CALENDAR_COLORS'), 'neutral constant')
  const a = toCalendarEvent(wedding({ workflowStage: 'reservation', accentColor: '#aaa' }))
  const b = toCalendarEvent(wedding({ workflowStage: 'completed', accentColor: '#aaa' }))
  assertEq(JSON.stringify(a.colors), JSON.stringify(b.colors), 'colors stable vs stage')
  assertEq(JSON.stringify(a.colors), JSON.stringify(WEDDING_CALENDAR_COLORS), 'neutral')
  assertEq(a.packageColor, b.packageColor, 'accent preserved')
})

run('13. same wedding visual identity remains stable if workflowStage changes', () => {
  const a = toCalendarEvent(wedding({ workflowStage: 'deposit' }))
  const b = toCalendarEvent(wedding({ workflowStage: 'post_production' }))
  assertEq(a.colors.background, b.colors.background, 'bg')
  assertEq(a.packageColor, '#112233', 'package accent')
  assertEq(b.packageColor, '#112233', 'package accent unchanged')
})

run('14. no workflow-stage legend copy remains', () => {
  const calDir = [
    'src/features/calendar/components/CalendarToolbar.tsx',
    'src/features/calendar/components/CalendarSummary.tsx',
    'src/pages/CalendarPage.tsx',
  ]
  for (const f of calDir) {
    const s = src(f)
    assert(!s.includes('Rezerwacja'), `${f} no Rezerwacja legend`)
    assert(!s.includes('Postprodukcja'), `${f} no Postprodukcja`)
    assert(!s.includes('Formalności'), `${f} no Formalności`)
  }
})

run('15. session/external events unchanged path', () => {
  const drawer = src('src/features/calendar/components/CalendarDrawer.tsx')
  assert(drawer.includes("entityType === 'session'"), 'session branch')
  assert(drawer.includes('Otwórz sesję'), 'session CTA')
  const events = src('src/features/calendar/utils/calendarEvents.ts')
  assert(events.includes('SESSION_CALENDAR_COLORS'), 'session colors')
  assert(events.includes('toCalendarSessionEvent'), 'session builder')
})

run('16–21. Calendar first-paint remains light; enrichment is drawer-scoped', () => {
  const page = src('src/pages/CalendarPage.tsx')
  const hook = src('src/features/calendar/hooks/useCalendarWeddingNextAction.ts')
  const light = src('src/lib/api/calendarLightService.ts')
  const firstPaint = src('src/lib/performance/calendarFirstPaintAcceptance.test.ts')
  assert(!page.includes('useCalendarWeddingNextAction'), 'page no drawer enrichment')
  assert(!page.includes('weddingService.getById'), 'page no getById')
  assert(!page.includes('weddingService.getAll'), 'page no getAll')
  assert(hook.includes('weddingService.getById'), 'drawer-only getById')
  assert(hook.includes('enabled: active'), 'gated queries')
  assert(!light.includes('finalizeWeddingViews('), 'light no finalize call')
  assert(!light.includes('finalizeWeddingView('), 'light no finalize singular')
  assert(firstPaint.includes('CalendarPage does not call getAll'), 'guard preserved')
})

run('href catalog covers all action ids', () => {
  const ids = [
    'send_contract_questionnaire',
    'generate_contract',
    'mark_contract_signed',
    'record_deposit',
    'send_prewedding',
    'review_apply',
    'complete_core_locations',
    'set_ceremony_time',
    'open_cockpit',
  ] as const
  for (const id of ids) {
    const href = hrefForWeddingNextAction('w1', {
      id,
      title: 't',
      priority: 'blocker',
      destination:
        id === 'generate_contract'
          ? { kind: 'route', path: '/sluby/w1/umowy/nowa' }
          : id === 'open_cockpit'
            ? { kind: 'cockpit' }
            : { kind: 'wedding_tab', tab: 'overview' },
    })
    assert(href.includes('/sluby/w1'), `${id} → ${href}`)
  }
})

if (process.exitCode) {
  console.error('\nW2 Calendar workflow retirement failed.')
  process.exit(1)
} else {
  console.log('\nW2 Calendar workflow retirement: all checks passed.')
}
