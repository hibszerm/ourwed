/**
 * Finance Center — mixed-assignment data-access architecture guards.
 * Run: npm run test:finance-center
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const service = read('src/lib/api/financeSeasonService.ts')
const page = read('src/pages/FinancePage.tsx')
const hooks = read('src/features/finance/useFinanceSeason.ts')
const invalidate = read('src/features/finance/invalidateFinanceQueries.ts')
const weddingInvalidate = read(
  'src/features/weddings/hooks/useInvalidateWedding.ts',
)
const aggregate = read('src/lib/finance/financeSeasonAggregate.ts')
const sessionCreate = read('src/features/sessions/hooks/useCreateSession.ts')
const sessionUpdate = read('src/features/sessions/hooks/useUpdateSession.ts')
const sessionDelete = read('src/features/sessions/hooks/useDeleteSession.ts')
const sessionInvalidate = read(
  'src/features/sessions/invalidateSessionFinanceQueries.ts',
)

{
  assertNotIncludes(
    service,
    'weddingService.getAll',
    'finance service must not call getAll',
  )
  assertNotIncludes(
    service,
    'sessionService.getAll',
    'finance service must not hydrate sessions',
  )
  assertNotIncludes(
    service,
    'finalizeWeddingView',
    'no finalizeWeddingView',
  )
  assertNotIncludes(
    service,
    'finalizeWeddingViews',
    'no finalizeWeddingViews',
  )
  assertNotIncludes(page, 'weddingService.getAll', 'page no getAll')
  assertNotIncludes(hooks, 'weddingService.getAll', 'hooks no getAll')
  assertNotIncludes(page, 'sessionService.getAll', 'page no session getAll')
  assertNotIncludes(hooks, 'sessionService.getAll', 'hooks no session getAll')
  console.log('PASS  no wedding/session getAll or hydrate')
}

{
  assertIncludes(
    service,
    'FINANCE_SEASON_WEDDING_SELECT',
    'named select constant',
  )
  assertIncludes(
    service,
    'id, user_id, wedding_date, status, bride_name, groom_name, display_name, contract_value, deposit_amount, currency',
    'required columns only',
  )
  assertIncludes(
    service,
    'FINANCE_SEASON_SESSION_SELECT',
    'named session select constant',
  )
  assertIncludes(
    service,
    'id, user_id, session_date, session_type, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, custom_session_type, total_price, deposit_amount, linked_wedding_id',
    'light session select is pinned',
  )
  assertNotIncludes(service, 'package_items_snapshot', 'no package snapshot')
  assertNotIncludes(service, 'travel_fee_', 'no travel fee columns for CV')
  assertNotIncludes(service, 'from(\'notes\')', 'no notes')
  assertNotIncludes(service, 'from("notes")', 'no notes dq')
  assertNotIncludes(service, 'gallery', 'no gallery')
  assertNotIncludes(service, 'form_answers', 'no forms')
  assertNotIncludes(service, 'wedding_places', 'no places')
  assertNotIncludes(service, 'timeline', 'no timeline')
  console.log('PASS  pinned light wedding + session selects')
}

{
  const firstParallelLoad = service.indexOf(
    'const [weddingsRes, sessionsRes] = await Promise.all([',
  )
  const paymentParallelLoad = service.indexOf(
    'const [paymentsByWeddingId, paymentsBySessionId] = await Promise.all([',
  )
  assert(firstParallelLoad >= 0, 'weddings and sessions must load in Promise.all')
  assert(paymentParallelLoad >= 0, 'both payment batches must load in Promise.all')
  assertIncludes(
    service,
    'paymentService.listByWeddingIds',
    'wedding payments batch',
  )
  assertIncludes(
    service,
    'sessionPaymentService.listBySessionIds',
    'session payments batch',
  )
  assertNotIncludes(
    service,
    'listByWeddingId(',
    'no per-wedding payment N+1',
  )
  assertNotIncludes(
    service,
    'listBySessionId(',
    'no per-session payment N+1',
  )
  assertIncludes(service, ".eq('user_id', userId)", 'owner filter')
  assertIncludes(service, ".in('status'", 'status filter')
  assertIncludes(service, 'active', 'includes active')
  assertIncludes(service, 'archived', 'includes archived')
  assertIncludes(service, ".gte('wedding_date', from)", 'season from')
  assertIncludes(service, ".lte('wedding_date', to)", 'season to')
  assertIncludes(service, ".not('wedding_date', 'is', null)", 'null date excluded')
  assertIncludes(service, ".gte('session_date', from)", 'session season from')
  assertIncludes(service, ".lte('session_date', to)", 'session season to')
  assertIncludes(service, ".not('session_date', 'is', null)", 'null session date')
  console.log('PASS  parallel season rows + two payment batches')
}

{
  assertNotIncludes(service, 'finances', 'no expense fetch')
  assertNotIncludes(service, 'due_date', 'no due-date metrics')
  assertNotIncludes(page, 'Po terminie', 'no overdue UI')
  assertNotIncludes(page, 'Koszty', 'no costs tab')
  assertNotIncludes(page, 'Zysk', 'no profit')
  assertNotIncludes(page, 'cash flow', 'no cash flow copy')
  console.log('PASS  no expenses / due-date / cash-flow')
}

{
  assertNotIncludes(
    aggregate,
    'effectiveTravel',
    'aggregate must not re-add travel',
  )
  assertNotIncludes(aggregate, 'extrasTotal', 'must not re-add extras')
  assertIncludes(aggregate, 'getTotalPaid', 'reuse finance helpers')
  assertIncludes(aggregate, 'getDepositPaid', 'reuse deposit helper')
  assertIncludes(aggregate, 'getRemainingToPay', 'reuse remaining helper')
  console.log('PASS  no double-count; helpers reused')
}

{
  assertIncludes(invalidate, 'FINANCE_QUERY_ROOT', 'invalidate helper')
  assertIncludes(
    weddingInvalidate,
    'invalidateFinanceQueries',
    'wedding invalidate wires finance',
  )
  assertIncludes(hooks, 'staleTime: FINANCE_STALE_MS', 'staleTime')
  assertIncludes(hooks, '30_000', '30s stale')
  console.log('PASS  RQ invalidation + staleTime')
}

{
  for (const [name, source] of [
    ['create session', sessionCreate],
    ['update session', sessionUpdate],
    ['delete session', sessionDelete],
  ] as const) {
    assertIncludes(
      source,
      'invalidateSessionFinanceQueries',
      `${name} invalidates finance`,
    )
  }
  assertIncludes(
    sessionInvalidate,
    'invalidateFinanceQueries(queryClient)',
    'shared session invalidation reaches finance',
  )
  assertIncludes(
    sessionInvalidate,
    'Promise.all(tasks)',
    'session invalidations run together',
  )
  console.log('PASS  session mutations invalidate finance')
}

{
  const travel = read(
    'src/features/weddings/detail/travel-fee/TravelFeeResolveModal.tsx',
  )
  const create = read('src/features/weddings/hooks/useCreateWedding.ts')
  const detail = read('src/pages/WeddingDetailPage.tsx')
  const importPage = read('src/pages/WeddingImportPage.tsx')
  const recovery = read('src/pages/WeddingContractRecoveryPage.tsx')
  assertIncludes(travel, 'invalidateFinanceQueries', 'travel fee')
  assertIncludes(create, 'invalidateFinanceQueries', 'create wedding')
  assertIncludes(detail, 'invalidateFinanceQueries', 'detail save/archive')
  assertIncludes(importPage, 'invalidateFinanceQueries', 'import')
  assertIncludes(recovery, 'useInvalidateWedding', 'recovery uses canonical wedding invalidate')
  assertIncludes(recovery, 'invalidateWedding(weddingId)', 'recovery invalidates after apply')
  assertNotIncludes(
    recovery,
    "queryKey: ['wedding', weddingId]",
    'recovery must not use obsolete singular wedding key',
  )
  assertIncludes(
    weddingInvalidate,
    "queryKey: ['weddings']",
    'canonical wedding invalidate covers weddings family',
  )
  assertIncludes(
    weddingInvalidate,
    'invalidateFinanceQueries',
    'canonical wedding invalidate reaches Finance',
  )
  console.log('PASS  commercial mutations invalidate finance')
}

console.log('\nAll finance data-access guards passed.')
