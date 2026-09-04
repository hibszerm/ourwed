/**
 * Wedding delivery deadline D2 — snapshot, policy, derived UI, package form.
 * Run: npm run test:delivery-deadline-d2
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveDeliveryDueDate } from '@/lib/utils/deliveryDueDate'
import {
  applyDeliveryTermFormToWedding,
  applyManualDeliveryDueDate,
  getDeliveryDeadlineBand,
  getDeliveryDeadlineState,
  markDeliveryCompleted,
  readDeliveryTermForm,
  reconcileDeliveryDeadline,
  restorePackageDeliveryDueDate,
  snapshotDeliveryDeadlineFromRule,
  undoDeliveryCompleted,
  writeDeliveryTermForm,
} from '@/lib/utils/weddingDeliveryDeadline'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
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

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

run('A. package months=5 / wedding 2026-08-17 → 2027-01-17 package', () => {
  const snap = snapshotDeliveryDeadlineFromRule({
    weddingDate: '2026-08-17',
    deliveryMonths: 5,
    deliveryDays: null,
  })
  assertEq(snap.deliveryDueDate, '2027-01-17', 'due')
  assertEq(snap.deliveryDueSource, 'package', 'source')
  assertEq(snap.deliveryCompletedAt, null, 'not completed')
})

run('B. package days=30 → +30 calendar days, source package', () => {
  const snap = snapshotDeliveryDeadlineFromRule({
    weddingDate: '2026-08-17',
    deliveryMonths: null,
    deliveryDays: 30,
  })
  assertEq(snap.deliveryDueDate, '2026-09-16', 'due')
  assertEq(snap.deliveryDueSource, 'package', 'source')
})

run('C. legacy both set → months win', () => {
  const snap = snapshotDeliveryDeadlineFromRule({
    weddingDate: '2026-08-17',
    deliveryMonths: 5,
    deliveryDays: 10,
  })
  assertEq(snap.deliveryDueDate, '2027-01-17', 'months win')
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 5,
      deliveryDays: 10,
    }),
    '2027-01-17',
    'calculator months win',
  )
})

run('D. no rule → due null, source null', () => {
  const snap = snapshotDeliveryDeadlineFromRule({
    weddingDate: '2026-08-17',
    deliveryMonths: null,
    deliveryDays: null,
  })
  assertEq(snap.deliveryDueDate, null, 'due')
  assertEq(snap.deliveryDueSource, null, 'source')
})

run('E. month-end clamp persists (31 Jan + 1m)', () => {
  assertEq(
    snapshotDeliveryDeadlineFromRule({
      weddingDate: '2026-01-31',
      deliveryMonths: 1,
    }).deliveryDueDate,
    '2026-02-28',
    'non-leap',
  )
  assertEq(
    snapshotDeliveryDeadlineFromRule({
      weddingDate: '2028-01-31',
      deliveryMonths: 1,
    }).deliveryDueDate,
    '2028-02-29',
    'leap',
  )
})

run('F/G. catalog edit does not write weddings; create uses snapshot helper', () => {
  const pkg = src('src/lib/api/packageService.ts')
  assert(!pkg.includes("from('weddings')"), 'package service does not mutate weddings')
  const create = src('src/lib/api/weddingService.ts')
  assert(
    create.includes('snapshotDeliveryDeadlineFromRule'),
    'create snapshots concrete due date',
  )
  assert(
    create.includes('delivery_due_date: deliveryDeadline.deliveryDueDate'),
    'create persists due date',
  )
})

run('Package change: package-source recomputes; manual preserved; completed preserved', () => {
  const date = '2026-08-17'
  const pkgA = reconcileDeliveryDeadline({
    previous: {
      date,
      deliveryMonths: 5,
      deliveryDays: null,
      deliveryDueSource: 'package',
    },
    next: { date, deliveryMonths: 3, deliveryDays: null },
  })
  assertEq(pkgA.deliveryDueDate, '2026-11-17', '3 months')
  assertEq(pkgA.deliveryDueSource, 'package', 'still package')

  const manual = reconcileDeliveryDeadline({
    previous: {
      date,
      deliveryMonths: 5,
      deliveryDays: null,
      deliveryDueDate: '2027-01-31',
      deliveryDueSource: 'manual',
    },
    next: { date, deliveryMonths: 3, deliveryDays: null },
  })
  assertEq(manual.deliveryDueDate, '2027-01-31', 'manual due kept')
  assertEq(manual.deliveryDueSource, 'manual', 'manual source kept')

  const completed = reconcileDeliveryDeadline({
    previous: {
      date,
      deliveryMonths: 5,
      deliveryDueDate: '2027-01-17',
      deliveryDueSource: 'package',
      deliveryCompletedAt: '2027-01-12T10:00:00.000Z',
    },
    next: { date, deliveryMonths: 3 },
  })
  assertEq(completed.deliveryDueDate, '2027-01-17', 'completed due kept')
  assertEq(
    completed.deliveryCompletedAt,
    '2027-01-12T10:00:00.000Z',
    'completion kept',
  )
})

run('Wedding date change: package recomputes; manual preserved; completed preserved', () => {
  const pkg = reconcileDeliveryDeadline({
    previous: {
      date: '2026-08-17',
      deliveryMonths: 5,
      deliveryDueDate: '2027-01-17',
      deliveryDueSource: 'package',
    },
    next: {
      date: '2026-08-24',
      deliveryMonths: 5,
    },
  })
  assertEq(pkg.deliveryDueDate, '2027-01-24', 'recomputed')

  const manual = reconcileDeliveryDeadline({
    previous: {
      date: '2026-08-17',
      deliveryMonths: 5,
      deliveryDueDate: '2027-01-31',
      deliveryDueSource: 'manual',
    },
    next: { date: '2026-08-24', deliveryMonths: 5 },
  })
  assertEq(manual.deliveryDueDate, '2027-01-31', 'manual kept')

  const completed = reconcileDeliveryDeadline({
    previous: {
      date: '2026-08-17',
      deliveryMonths: 5,
      deliveryDueDate: '2027-01-17',
      deliveryDueSource: 'package',
      deliveryCompletedAt: '2027-01-10T12:00:00.000Z',
    },
    next: { date: '2026-08-24', deliveryMonths: 5 },
  })
  assertEq(completed.deliveryDueDate, '2027-01-17', 'completed due kept')
  assert(completed.deliveryCompletedAt != null, 'completed stays completed')
})

run('Manual override does not change months/days; restore returns package', () => {
  const months = 5
  const days: number | null = null
  const manual = applyManualDeliveryDueDate('2027-01-31')
  assertEq(manual.deliveryDueDate, '2027-01-31', 'manual due')
  assertEq(manual.deliveryDueSource, 'manual', 'source')
  assertEq(months, 5, 'months unchanged')
  assertEq(days, null, 'days unchanged')

  const restored = restorePackageDeliveryDueDate({
    date: '2026-08-17',
    deliveryMonths: months,
    deliveryDays: days,
    deliveryDueDate: '2027-01-31',
    deliveryDueSource: 'manual',
  })
  assertEq(restored.deliveryDueDate, '2027-01-17', 'restored due')
  assertEq(restored.deliveryDueSource, 'package', 'restored source')
})

run('Mark delivered / undo — due stays, no status enum', () => {
  const base = {
    deliveryDueDate: '2027-01-17',
    deliveryDueSource: 'package' as const,
    deliveryCompletedAt: null,
  }
  const done = markDeliveryCompleted(base, '2027-01-12T09:00:00.000Z')
  assertEq(done.deliveryDueDate, '2027-01-17', 'due stays')
  assertEq(done.deliveryCompletedAt, '2027-01-12T09:00:00.000Z', 'completed')
  assertEq(
    getDeliveryDeadlineState(done),
    'completed',
    'derived completed',
  )
  const undone = undoDeliveryCompleted(done)
  assertEq(undone.deliveryCompletedAt, null, 'reopened')
  assertEq(undone.deliveryDueDate, '2027-01-17', 'due still there')
  assertEq(
    getDeliveryDeadlineState({
      ...undone,
      todayKey: '2027-01-20',
    }),
    'overdue',
    'past due after undo',
  )
})

run('Derived states: none / upcoming / due_today / overdue / completed', () => {
  assertEq(
    getDeliveryDeadlineState({ deliveryDueDate: null, todayKey: '2026-08-17' }),
    'none',
    'none',
  )
  const upcoming = getDeliveryDeadlineBand({
    deliveryDueDate: '2027-01-17',
    deliveryCompletedAt: null,
    todayKey: '2026-08-17',
  })
  assertEq(upcoming.state, 'upcoming', 'upcoming')
  assertEq(upcoming.contextLabel, 'za 153 dni', '153 days')
  const near = getDeliveryDeadlineBand({
    deliveryDueDate: '2026-08-25',
    deliveryCompletedAt: null,
    todayKey: '2026-08-17',
  })
  assertEq(near.contextLabel, 'za 8 dni', 'near')
  const today = getDeliveryDeadlineBand({
    deliveryDueDate: '2026-08-17',
    deliveryCompletedAt: null,
    todayKey: '2026-08-17',
  })
  assertEq(today.state, 'due_today', 'today')
  assertEq(today.contextLabel, 'dzisiaj', 'dzisiaj')
  const overdue = getDeliveryDeadlineBand({
    deliveryDueDate: '2026-08-14',
    deliveryCompletedAt: null,
    todayKey: '2026-08-17',
  })
  assertEq(overdue.state, 'overdue', 'overdue')
  assertEq(overdue.contextLabel, '3 dni po terminie', '3 days late')
  const completed = getDeliveryDeadlineBand({
    deliveryDueDate: '2027-01-17',
    deliveryCompletedAt: '2027-01-12T10:00:00.000Z',
    todayKey: '2027-01-20',
  })
  assertEq(completed.state, 'completed', 'completed')
  assert(completed.contextLabel?.startsWith('Oddano ') === true, 'Oddano prefix')
  assert(completed.dueLabel !== completed.contextLabel, 'due not replaced')
})

run('Package form: months win on load; save clears the other unit', () => {
  assertEq(readDeliveryTermForm(5, 10).unit, 'months', 'legacy both → months')
  assertEq(readDeliveryTermForm(5, 10).value, '5', 'legacy value')
  assertEq(readDeliveryTermForm(null, 30).unit, 'calendar_days', 'days unit')
  assertEq(readDeliveryTermForm(null, 30).value, '30', 'days value')
  assertEq(readDeliveryTermForm(null, null).unit, 'months', 'empty default unit')
  assertEq(readDeliveryTermForm(null, null).value, '', 'empty value')

  const months = writeDeliveryTermForm('months', '5')
  assertEq(months.deliveryMonths, 5, 'write months')
  assertEq(months.deliveryDays, null, 'clears days')
  const days = writeDeliveryTermForm('calendar_days', '30')
  assertEq(days.deliveryDays, 30, 'write days')
  assertEq(days.deliveryMonths, null, 'clears months')
  const switched = applyDeliveryTermFormToWedding(
    {
      date: '2026-08-17',
      deliveryMonths: 5,
      deliveryDays: null,
      deliveryDueSource: 'package',
    },
    'calendar_days',
    '5',
  )
  assertEq(switched.deliveryMonths, null, 'switch clears months')
  assertEq(switched.deliveryDays, 5, 'switch writes days')
})

run('SQL backfill uses wedding snapshot + months-win + replica role', () => {
  const sql = src(
    'supabase/migrations/20260817120000_wedding_delivery_deadline.sql',
  )
  assert(sql.includes('wedding_date'), 'uses wedding_date')
  assert(sql.includes('delivery_months'), 'uses snapshot months')
  assert(sql.includes('delivery_days'), 'uses snapshot days')
  assert(!sql.includes('from public.packages'), 'does not read packages')
  assert(sql.includes('session_replication_role = replica'), 'owner trigger bypass')
  const monthsBranch = sql.indexOf('delivery_months is not null')
  const daysBranch = sql.indexOf('delivery_days is not null')
  assert(monthsBranch >= 0 && monthsBranch < daysBranch, 'months win in SQL')
  assert(sql.includes("then 'package'"), 'source package when derived')
  assert(!sql.includes('delivery_completed_at ='), 'does not auto-complete')
})

run('UI: package number+unit; no business days; header 5th cell', () => {
  const packagesPage = [
    src('src/pages/PackagesPage.tsx'),
    src('src/features/studio/packages/modern/ModernPackagesWorkspace.tsx'),
  ].join('\n')
  assert(packagesPage.includes('Termin oddania'), 'package label')
  assert(packagesPage.includes('miesięcy'), 'months option')
  assert(packagesPage.includes('dni kalendarzowych'), 'calendar days option')
  assert(!packagesPage.includes('dni roboczych'), 'no business days')
  assert(packagesPage.includes('writeDeliveryTermForm'), 'save clears unused unit')

  const packageFields = src(
    'src/features/weddings/detail/editing/fields/PackageFields.tsx',
  )
  assert(packageFields.includes('Termin oddania'), 'wedding package term label')
  assert(packageFields.includes('dni kalendarzowych'), 'wedding calendar days')
  assert(!packageFields.includes('Oddanie (miesiące)'), 'old two-input gone')
  assert(packageFields.includes('reconcileDeliveryDeadline'), 'package apply reconciles')

  const band = src(
    'src/features/weddings/detail/v2/WeddingOverviewBand.tsx',
  )
  assert(band.includes('Termin oddania'), 'header cell')
  assert(band.includes('Termin płatności'), 'payment due remains')
  const css = src(
    'src/features/weddings/detail/v2/WeddingDetailV2.module.css',
  )
  assert(css.includes('repeat(5, minmax(0, 1fr))'), 'desktop five cells')
  assert(css.includes('nth-child(5)'), 'mobile full-width fifth cell')
  assert(css.includes('min-height: 44px'), 'touch target')

  const modal = src(
    'src/features/weddings/detail/v2/DeliveryDeadlineModal.tsx',
  )
  assert(modal.includes('Przywróć termin z pakietu'), 'restore')
  assert(modal.includes('Oznacz jako oddane'), 'mark delivered')
  assert(modal.includes('Cofnij oznaczenie'), 'undo')
  assert(!modal.includes('workflowStage'), 'no workflow stage')
})

run('Freeze: no deadline table, dashboard box, tasks, contract due var, after_delivery', () => {
  const migration = src(
    'supabase/migrations/20260817120000_wedding_delivery_deadline.sql',
  )
  assert(!migration.includes('wedding_deadlines'), 'no deadline table')
  const dash = src('src/lib/api/dashboardService.ts')
  assert(
    dash.includes('DASHBOARD_LIGHT_WEDDING_SELECT'),
    'dashboard light select still exists',
  )
  assert(
    !dash.includes(
      "DASHBOARD_LIGHT_WEDDING_SELECT =\n  'id, user_id, bride_name, groom_name, display_name, email, phone, wedding_date, ceremony_time, venue, status, workflow_stage, package_name, package_id, contract_value, deposit_amount, currency, accent_color, bride_preparation_location, groom_preparation_location, created_at, updated_at, delivery_due_date",
    ),
    'dashboard light select unchanged',
  )
  const vars = src('src/lib/utils/contractCommercialVariables.ts')
  assert(vars.includes("'delivery_months'"), 'delivery_months var')
  assert(vars.includes("'delivery_days'"), 'delivery_days var')
  assert(vars.includes("'delivery_term_text'"), 'prose var')
  assert(vars.includes("'delivery_time'"), 'delivery_time var')
  assert(!vars.includes('delivery_due_date'), 'no concrete due contract var')
  const deadline = src('src/lib/utils/weddingDeliveryDeadline.ts')
  assert(!deadline.includes('finalPaymentDueDate'), 'does not touch final payment')
  assert(!deadline.includes('after_delivery'), 'does not touch after_delivery')
  assert(!deadline.includes('workflow_stage'), 'no workflow_stage')
  assert(!deadline.includes('workflowStage'), 'no workflowStage field')
})

if (process.exitCode) {
  console.error('\ndelivery deadline D2: failed')
} else {
  console.log('\ndelivery deadline D2: done')
}
