/**
 * Wedding payment delete parity — ledger delete, CTA morph, agreed deposit preserved.
 * Run via: npm run test:finance-center (included)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'
import {
  getDepositPaid,
  getRemainingToPay,
  getTotalPaid,
} from '@/lib/utils/finance'
import { getAgreedDeposit } from '@/lib/utils/commercial'
import type { Payment } from '@/types/wedding'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: expected ${String(b)}, got ${String(a)}`)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

function pay(
  partial: Pick<Payment, 'id' | 'type' | 'amount' | 'paid'> &
    Partial<Payment>,
): Payment {
  return {
    label: partial.type === 'deposit' ? 'Zadatek' : 'Wpłata',
    paidAt: partial.paid ? '2026-06-01' : undefined,
    ...partial,
  }
}

{
  // A — delete only paid deposit
  const cv = 5000
  const agreed = 1000
  const before = [pay({ id: 'd1', type: 'deposit', amount: 1000, paid: true })]
  assertEq(getTotalPaid(before), 1000, 'A totalPaid before')
  assertEq(getRemainingToPay(cv, before), 4000, 'A remaining before')
  assert(hasPaidDepositPayment(before), 'A CTA Dodaj wpłatę before')

  const after: Payment[] = []
  assertEq(getTotalPaid(after), 0, 'A totalPaid after delete')
  assertEq(getRemainingToPay(cv, after), 5000, 'A remaining after')
  assertEq(getAgreedDeposit({ depositAmount: agreed }), 1000, 'A agreed preserved')
  assert(!hasPaidDepositPayment(after), 'A CTA Dodaj zadatek after')
  console.log('PASS  A  delete deposit → totals + CTA morph')
}

{
  // B — delete installment keeps deposit CTA
  const cv = 5000
  const payments = [
    pay({ id: 'd1', type: 'deposit', amount: 1000, paid: true }),
    pay({ id: 'i1', type: 'installment', amount: 2000, paid: true }),
  ]
  const after = payments.filter((p) => p.id !== 'i1')
  assertEq(getTotalPaid(after), 1000, 'B totalPaid')
  assertEq(getRemainingToPay(cv, after), 4000, 'B remaining')
  assert(hasPaidDepositPayment(after), 'B CTA remains Dodaj wpłatę')
  console.log('PASS  B  delete installment keeps deposit CTA')
}

{
  // C — multiple paid deposits; delete one → CTA still Dodaj wpłatę
  const payments = [
    pay({ id: 'd1', type: 'deposit', amount: 500, paid: true }),
    pay({ id: 'd2', type: 'deposit', amount: 500, paid: true }),
  ]
  const after = payments.filter((p) => p.id !== 'd1')
  assert(hasPaidDepositPayment(after), 'C still has paid deposit')
  assertEq(getDepositPaid(after), 500, 'C deposit paid sum')
  console.log('PASS  C  delete one of multiple deposits')
}

{
  // D — delete last paid deposit → Dodaj zadatek
  const payments = [
    pay({ id: 'd1', type: 'deposit', amount: 1000, paid: true }),
    pay({ id: 'i1', type: 'installment', amount: 500, paid: true }),
  ]
  const after = payments.filter((p) => p.id !== 'd1')
  assert(!hasPaidDepositPayment(after), 'D CTA Dodaj zadatek')
  assert(getTotalPaid(after) === 500, 'D installment remains')
  console.log('PASS  D  delete last deposit → Dodaj zadatek')
}

{
  // E — fully paid → delete one → not fully paid
  const cv = 3000
  const payments = [
    pay({ id: 'd1', type: 'deposit', amount: 1000, paid: true }),
    pay({ id: 'i1', type: 'installment', amount: 2000, paid: true }),
  ]
  assertEq(getRemainingToPay(cv, payments), 0, 'E fully paid before')
  const after = payments.filter((p) => p.id !== 'i1')
  assertEq(getRemainingToPay(cv, after), 2000, 'E remaining after delete')
  assert(getRemainingToPay(cv, after) > 0, 'E no stale fully-paid')
  console.log('PASS  E  fully paid → delete restores remaining')
}

{
  // F — Finance Center invalidation via useInvalidateWedding
  const workspace = read(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  assertIncludes(workspace, 'useInvalidateWedding', 'F: invalidates wedding')
  assertIncludes(workspace, 'paymentService.delete', 'F: deletes via service')
  const invalidate = read('src/features/weddings/hooks/useInvalidateWedding.ts')
  assertIncludes(invalidate, 'invalidateFinanceQueries', 'F: finance center')
  assertIncludes(invalidate, "queryKey: ['weddings']", 'F: wedding caches')
  assertIncludes(invalidate, "queryKey: ['dashboard']", 'F: dashboard')
  console.log('PASS  F  finance/wedding invalidation on delete')
}

{
  // G — delete does not mutate commercial snapshot fields
  const workspace = read(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  assertIncludes(workspace, 'paymentService.delete', 'G: only payment delete')
  assertIncludes(
    workspace,
    'async function confirmDeletePayment()',
    'G: dedicated delete handler',
  )
  const deleteFn = workspace.slice(
    workspace.indexOf('async function confirmDeletePayment()'),
    workspace.indexOf('return (', workspace.indexOf('async function confirmDeletePayment()')),
  )
  assertIncludes(deleteFn, 'paymentService.delete', 'G: delete handler calls service')
  assertNotIncludes(deleteFn, 'weddingService', 'G: delete handler no wedding write')
  assertNotIncludes(deleteFn, 'depositAmount', 'G: no agreed deposit mutation')
  assertNotIncludes(deleteFn, 'TravelFee', 'G: no travel fee mutation')
  assertIncludes(
    workspace,
    'Ustalona kwota zadatku w umowie pozostanie bez zmian',
    'G: copy states agreed deposit preserved',
  )
  console.log('PASS  G  delete does not mutate commercial terms')
}

{
  // H — owner-scoped paymentService.delete + RLS policy exists
  const svc = read('src/lib/api/paymentService.ts')
  assertIncludes(svc, 'async delete(id: string)', 'H: delete exists')
  assertIncludes(
    svc,
    "supabase.from('payments').delete().eq('id', id)",
    'H: client delete by id',
  )
  const rls = read('supabase/migrations/20260811230000_pro_mutation_gate.sql')
  assertIncludes(rls, 'payments_delete_own', 'H: RLS delete policy')
  assertIncludes(rls, 'is_wedding_owner(wedding_id)', 'H: owner scoped')
  assertIncludes(rls, 'account_has_pro_access()', 'H: Pro gate on delete')
  console.log('PASS  H  security path unchanged (owner RLS)')
}

{
  const workspace = read(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  assertIncludes(workspace, 'finance-edit-payment', 'UX: edit control')
  assertIncludes(workspace, 'finance-delete-payment', 'UX: delete control')
  assertIncludes(workspace, 'Usunąć zadatek?', 'UX: deposit confirm title')
  assertIncludes(workspace, 'Usunąć wpłatę?', 'UX: installment confirm title')
  assertIncludes(workspace, "variant=\"danger\"", 'UX: destructive confirm')
  assertIncludes(workspace, 'hasPaidDepositPayment(payments)', 'UX: CTA uses canonical')
  assertNotIncludes(workspace, 'window.confirm', 'UX: Modal not window.confirm')
  const modal = read('src/features/weddings/actions/AddPaymentModal.tsx')
  assertIncludes(modal, 'paymentService.update', 'edit path uses update')
  console.log('PASS  UX  edit/delete + Modal confirm + edit modal')
}

{
  const workspace = read(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  const deleteFn = workspace.slice(
    workspace.indexOf('async function confirmDeletePayment()'),
    workspace.indexOf('return (', workspace.indexOf('async function confirmDeletePayment()')),
  )
  const deleteCallAt = deleteFn.indexOf('paymentService.delete')
  const closeAt = deleteFn.indexOf('setPendingDelete(null)')
  const invalidateAt = deleteFn.indexOf('await invalidate(')
  assert(deleteCallAt >= 0 && closeAt > deleteCallAt, 'success closes after delete')
  assert(
    invalidateAt < 0 || closeAt < invalidateAt,
    'modal closes before invalidate (no stuck confirm)',
  )
  assertIncludes(deleteFn, 'Zadatek został usunięty.', 'deposit success toast')
  assertIncludes(deleteFn, 'Wpłata została usunięta.', 'payment success toast')
  assertIncludes(deleteFn, "showToast(", 'success feedback')
  assertIncludes(deleteFn, "'error'", 'error toast keeps modal via early return')
  assertIncludes(deleteFn, 'setDeleting(false)', 'pending cleared')
  assertIncludes(deleteFn, 'return', 'failure returns before close')
  assertIncludes(workspace, 'disabled={deleting}', 'confirm disabled while pending')
  assertIncludes(workspace, 'Usuwanie…', 'pending label')

  const toastCss = read('src/components/ui/Toast.module.css')
  assertIncludes(toastCss, 'z-index: 12000', 'toast above modal')

  const sessionPage = read('src/pages/SessionDetailPage.tsx')
  assertIncludes(sessionPage, 'Zaliczka została usunięta.', 'session deposit toast')
  assertIncludes(sessionPage, 'Wpłata została usunięta.', 'session payment toast')
  console.log('PASS  UX  delete success closes modal + toast parity')
}

console.log('OK  weddingPaymentDeleteAcceptance')
