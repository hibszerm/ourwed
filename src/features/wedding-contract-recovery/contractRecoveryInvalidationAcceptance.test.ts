/**
 * Contract recovery apply must refresh Wedding Detail + Finance without F5.
 * Run via: npx tsx --tsconfig tsconfig.app.json src/features/wedding-contract-recovery/contractRecoveryInvalidationAcceptance.test.ts
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

const page = read('src/pages/WeddingContractRecoveryPage.tsx')
const invalidateWedding = read(
  'src/features/weddings/hooks/useInvalidateWedding.ts',
)
const financeInvalidate = read(
  'src/features/finance/invalidateFinanceQueries.ts',
)
const useWedding = read('src/features/weddings/hooks/useWedding.ts')

{
  assertIncludes(
    useWedding,
    "queryKey: ['weddings', userId, id]",
    'Wedding Detail uses weddings family',
  )
  assertIncludes(
    page,
    'useInvalidateWedding',
    'recovery imports canonical wedding invalidation',
  )
  assertIncludes(
    page,
    'invalidateWedding(weddingId)',
    'successful apply invalidates wedding + Finance',
  )
  assertNotIncludes(
    page,
    "queryKey: ['wedding', weddingId]",
    'obsolete singular wedding key must not remain',
  )
  assertNotIncludes(
    page,
    'invalidateQueries()',
    'no unscoped global invalidation',
  )
  assertIncludes(
    invalidateWedding,
    "queryKey: ['weddings']",
    'canonical helper prefixes weddings family',
  )
  assertIncludes(
    invalidateWedding,
    'invalidateFinanceQueries',
    'canonical helper reaches Finance Center',
  )
  assertIncludes(
    financeInvalidate,
    'FINANCE_QUERY_ROOT',
    'Finance invalidation stays scoped to finance root',
  )
  assertIncludes(
    page,
    "queryKey: ['wedding-source-contracts', weddingId]",
    'recovery still refreshes source contracts',
  )
  assertIncludes(
    page,
    "queryKey: ['wedding-contract-package-snapshots', weddingId]",
    'recovery still refreshes package snapshots',
  )
  console.log(
    'PASS  recovery apply invalidates weddings family + Finance (stale CV/deposit after apply)',
  )
}

console.log('\nAll contract recovery invalidation guards passed.')
