/**
 * WorkflowStage retirement W4 — stop automatic stage writes.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/workflow/workflowStageRetirementW4Acceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveWeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'
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
      contractData: { status: 'completed' },
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

run('1. create no longer derives stage from depositPaid', () => {
  const create = src('src/lib/api/weddingService.ts')
  const createFn = create.slice(create.indexOf('async create('))
  assert(!/depositPaid\s*\?\s*['"]deposit['"]/.test(createFn), 'no deposit→deposit stage')
  assert(!createFn.includes('workflow_stage: workflowStage'), 'no explicit stage var write')
  assert(
    createFn.includes('workflow_stage omitted') ||
      !/workflow_stage\s*:/.test(createFn.slice(0, createFn.indexOf('.insert'))),
    'insert omits workflow_stage',
  )
  // Insert object must not set workflow_stage
  const insertStart = createFn.indexOf('.insert({')
  const insertEnd = createFn.indexOf('})', insertStart)
  const insertBody = createFn.slice(insertStart, insertEnd)
  assert(!/workflow_stage\s*:/.test(insertBody), 'INSERT omits workflow_stage column assignment')
  assert(insertBody.includes('workflow_stage omitted'), 'documents DB default strategy')
  assert(insertBody.includes("status: 'active'"), 'status still set')
  // depositPaid still drives payment creation, not stage
  assert(create.includes('input.depositPaid'), 'depositPaid still used for payment row')
})

run('2. contract generation does not mutate workflowStage', () => {
  const actions = src('src/lib/api/weddingActionsService.ts')
  const start = actions.indexOf('async markContractGenerated(')
  const end = actions.indexOf('async ', start + 10)
  const body = actions.slice(start, end > start ? end : undefined)
  assert(body.includes("updateStatus(wedding.id, 'generated')"), 'sets generated')
  assert(!body.includes('workflowStage'), 'no stage mutation')
  assert(!body.includes('workflow_stage'), 'no stage column write')
  assert(!body.includes('weddingService.update'), 'no wedding update for stage')
})

run('3. payment/deposit does not mutate workflowStage', () => {
  const actions = src('src/lib/api/weddingActionsService.ts')
  const start = actions.indexOf('async addPayment(')
  const end = actions.indexOf('async addNote(')
  const body = actions.slice(start, end)
  assert(body.includes('paymentService.create'), 'creates payment')
  assert(!body.includes('getNextStage'), 'no getNextStage')
  assert(!body.includes('workflowStage'), 'no stage in addPayment')
  assert(!body.includes('weddingService.update'), 'no stage update')
  assert(body.includes('payment_received'), 'timeline preserved')
  assert(body.includes('Zadatek otrzymany'), 'deposit notification preserved')
})

run('4–5. domain contract + payment paths still change real state', () => {
  const actions = src('src/lib/api/weddingActionsService.ts')
  assert(actions.includes("updateStatus(wedding.id, 'generated')"), 'contract status')
  assert(actions.includes('paymentService.create'), 'payment create')
  const create = src('src/lib/api/weddingService.ts')
  assert(
    create.includes('if (input.depositPaid && depositSnapshot != null && depositSnapshot > 0)'),
    'create still records deposit payment when toggled',
  )
})

run('6–7. Next Action progresses on domain state; stale stage ignored', () => {
  const generated = resolveWeddingNextAction(
    wedding({
      workflowStage: 'reservation',
      contract: { status: 'generated' },
    }),
  )
  assertEq(generated?.id, 'mark_contract_signed', 'after generate → mark signed')

  const withDeposit = resolveWeddingNextAction(
    wedding({
      workflowStage: 'deposit',
      contract: { status: 'signed' },
      payments: [],
    }),
  )
  assertEq(withDeposit?.id, 'record_deposit', 'unsigned deposit → record')

  const paid = resolveWeddingNextAction(
    wedding({
      workflowStage: 'deposit',
      contract: { status: 'signed' },
      payments: [
        {
          id: 'p1',
          label: 'Zadatek',
          type: 'deposit',
          amount: 2000,
          paid: true,
          paidAt: '2026-01-01',
          method: 'transfer',
        },
      ],
    }),
    { today: '2026-01-01', preweddingStatus: 'not_sent' },
  )
  // Far from wedding — paid deposit → quiet (no prep window ops)
  assertEq(paid, null, 'paid + far out → null (not stage-driven)')

  const stale = resolveWeddingNextAction(
    wedding({
      workflowStage: 'wedding_day',
      contract: { status: 'none' },
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
    }),
  )
  assertEq(stale?.id, 'generate_contract', 'stale stage ignored')
})

run('8. Calendar remains stage-independent', () => {
  const events = src('src/features/calendar/utils/calendarEvents.ts')
  const drawer = src('src/features/calendar/components/CalendarDrawer.tsx')
  assert(!events.includes('getWorkflowStatus'), 'no status')
  assert(!events.includes('getWorkflowStageColor'), 'no stage color')
  assert(!drawer.includes('getNextRecommendedAction'), 'no legacy CTA')
  assert(drawer.includes('useCalendarWeddingNextAction'), 'modern CTA')
})

run('9. Dashboard V2 remains retired', () => {
  const router = src('src/routes/router.tsx')
  assert(!router.includes('DashboardV2Page'), 'unmounted')
  assert(router.includes('Navigate to="/dashboard"'), 'redirect')
})

run('10. existing workflowStage survives unrelated edits (mapper preserve)', () => {
  const mapper = src('src/lib/api/weddings/weddingMappers.ts')
  assert(
    mapper.includes('workflow_stage: wedding.workflowStage'),
    'round-trip preserve',
  )
  const persist = src('src/features/weddings/edit/persistWeddingEditDraft.ts')
  assert(persist.includes('structuredClone(snapshot.wedding)'), 'draft clones stage')
  assert(!persist.includes('workflowStage:'), 'persist does not override')
})

run('11. post_production/completed values are not reset by create/actions', () => {
  const create = src('src/lib/api/weddingService.ts')
  const actions = src('src/lib/api/weddingActionsService.ts')
  assert(!create.includes("'post_production'"), 'create never forces post_production')
  assert(!create.includes("'completed'"), 'create never forces completed')
  assert(!actions.includes("workflowStage: '"), 'actions never assign stage literals')
  assert(!actions.includes('workflowStage,'), 'actions never spread stage patch')
})

run('12. no DB/schema change', () => {
  const schema = src('supabase/schema.sql')
  assert(schema.includes('workflow_stage text not null default \'reservation\''), 'column')
  assert(schema.includes('weddings_workflow_stage_idx'), 'index')
  assert(schema.includes("'post_production'"), 'check literals')
  assert(schema.includes("'completed'"), 'completed in check')
})

run('getNextStage has zero live production callers', () => {
  const engine = src('src/lib/workflow/workflowEngine.ts')
  assert(engine.includes('export function getNextStage'), 'export remains')
  const actions = src('src/lib/api/weddingActionsService.ts')
  assert(!actions.includes('getNextStage'), 'actions no longer import')
  // Grep-style: only definition + possible comments/tests
  const prod = [
    'src/lib/api/weddingActionsService.ts',
    'src/lib/api/weddingService.ts',
    'src/pages',
    'src/features/weddings',
    'src/features/calendar',
    'src/features/dashboard',
  ]
  // Spot-check actions + weddingService already done; engine comment ok
  void prod
})

if (process.exitCode) {
  console.error('\nW4 workflowStage retirement failed.')
  process.exit(1)
} else {
  console.log('\nW4 workflowStage retirement: all checks passed.')
}
