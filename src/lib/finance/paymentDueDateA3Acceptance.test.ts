/**
 * A3 V1 — remove non-persistent per-payment due-date UI.
 * Wedding-level final_payment_due_date remains the SoT.
 *
 * Run: npm run test:payment-due-date-a3
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mapPaymentRowToModel } from '@/lib/api/paymentService'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertIncludes(src: string, needle: string, message: string) {
  assert(src.includes(needle), `${message}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, message: string) {
  assert(!src.includes(needle), `${message}: must not include ${JSON.stringify(needle)}`)
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

const financeFields = read(
  'src/features/weddings/detail/editing/fields/FinanceFields.tsx',
)
const persist = read('src/features/weddings/edit/persistWeddingEditDraft.ts')
const paymentService = read('src/lib/api/paymentService.ts')
const weddingMapper = read('src/lib/api/weddings/weddingMappers.ts')
const weddingService = read('src/lib/api/weddingService.ts')

run('A3-1 per-payment row no longer exposes non-persistent Termin', () => {
  assertIncludes(financeFields, 'Termin płatności końcowej', 'wedding-level label stays')
  assertIncludes(financeFields, 'finalPaymentDueDate', 'wedding-level field stays')
  // Exact per-row fake due editor must be gone
  assertNotIncludes(
    financeFields,
    'label="Termin"',
    'no per-payment Termin input',
  )
  assertNotIncludes(
    financeFields,
    'updatePayment(p.id, { dueDate:',
    'no dueDate patch on payment rows',
  )
  assertNotIncludes(financeFields, 'p.dueDate', 'no payment.dueDate binding')
})

run('A3-2 wedding-level finalPaymentDueDate still edits + maps', () => {
  assertIncludes(
    financeFields,
    'finalPaymentDueDate: e.target.value || undefined',
    'FinanceFields edits wedding due',
  )
  assertIncludes(
    weddingMapper,
    'finalPaymentDueDate: row.final_payment_due_date',
    'mapper reads final_payment_due_date',
  )
  assertIncludes(
    weddingService,
    'final_payment_due_date: patch.final_payment_due_date ?? null',
    'weddingService writes final_payment_due_date',
  )
  assertIncludes(persist, 'await weddingService.update(nextWedding)', 'draft saves wedding')
})

run('A3-3 payment_date semantics unchanged', () => {
  assertIncludes(paymentService, 'payment_date: paymentDate', 'create writes payment_date')
  assertIncludes(
    paymentService,
    'patch.payment_date = resolvePaymentDate(input.paid, input.paymentDate)',
    'update resolves payment_date from paid/paidAt',
  )
  assertIncludes(
    persist,
    'paymentDate: payment.paidAt',
    'draft maps paidAt → paymentDate',
  )
  assertIncludes(
    paymentService,
    'No due_date column',
    'mapper documents missing due_date column',
  )
  assertNotIncludes(
    paymentService,
    'due_date:',
    'no due_date write key in paymentService',
  )
})

run('A3-4 payment create/update still works without dueDate plumbing', () => {
  assertIncludes(paymentService, 'async create(input: CreatePaymentInput)', 'create exists')
  assertIncludes(paymentService, 'async update(id: string, input: UpdatePaymentInput)', 'update exists')
  assertNotIncludes(
    paymentService,
    'dueDate?: string | null',
    'create/update inputs drop ignored dueDate',
  )
  assertNotIncludes(persist, 'dueDate: payment.dueDate', 'persist no longer passes dueDate')

  const mapped = mapPaymentRowToModel({
    id: '11111111-1111-1111-1111-111111111111',
    wedding_id: '22222222-2222-2222-2222-222222222222',
    type: 'installment',
    amount: 500,
    payment_date: null,
    method: null,
    note: null,
    created_at: '2026-09-09T00:00:00Z',
  })
  assert(mapped.paid === false, 'unpaid when payment_date null')
  assert(mapped.dueDate === undefined, 'mapper still yields undefined dueDate')
  assert(mapped.amount === 500, 'amount maps')
})

console.log('\nA3 payment due-date V1 acceptance complete.')
