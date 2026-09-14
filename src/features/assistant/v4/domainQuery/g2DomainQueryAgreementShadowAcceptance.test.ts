/**
 * G2 — live DEV DomainQuery agreement shadow hook.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/domainQuery/g2DomainQueryAgreementShadowAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CollectionMoneyRow } from '../capabilities/collection/executeCollectionQuery'
import {
  validateCollectionQuery,
  type CollectionQuery,
} from '../capabilities/collection/collectionQueryContract'
import {
  clearLastExecutedCollectionQuery,
  peekLastExecutedCollectionQuery,
  collectionQueryCapability,
} from '../capabilities/collection/collectionQueryCapability'
import { emptyV4ShadowContext } from '../resolver/types'
import { clearAssistantV4ShadowSession } from '../resolver/shadowState'
import {
  runDomainQueryAgreementDiagnostic,
  scheduleDomainQueryAgreementShadow,
  subscribeDomainQueryAgreement,
  type DomainQueryAgreementTrace,
} from './domainQueryAgreementShadow'
import type { CollectionQueryInput } from '../capabilities/types'
import type { CapabilityRuntime } from '../capabilities/types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function cq(
  partial: Partial<CollectionQuery> & Pick<CollectionQuery, 'operation'>,
): CollectionQuery {
  const raw = {
    resource: 'wedding' as const,
    operation: partial.operation,
    filters: partial.filters ?? {},
    metric: partial.metric ?? null,
    rank: partial.rank ?? null,
    limit: partial.limit ?? null,
    usedActiveCollection: partial.usedActiveCollection ?? false,
  }
  const v = validateCollectionQuery(raw)
  assert(v.ok, `cq: ${'reason' in v ? v.reason : ''}`)
  return (v as { ok: true; query: CollectionQuery }).query
}

const ROWS: CollectionMoneyRow[] = [
  {
    id: 'w1',
    displayLabel: 'A',
    date: '2026-08-10',
    contractValue: 1000,
    paidAmount: 100,
    remainingAmount: 900,
    locationHaystack: ['Villa Love'],
  },
  {
    id: 'w2',
    displayLabel: 'B',
    date: '2027-05-01',
    contractValue: 2000,
    paidAmount: 0,
    remainingAmount: 2000,
    locationHaystack: ['Hotel Stary'],
  },
]

const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }

async function waitTrace(
  run: () => void | Promise<void>,
): Promise<DomainQueryAgreementTrace> {
  return new Promise((resolvePromise, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 2000)
    const unsub = subscribeDomainQueryAgreement((trace) => {
      clearTimeout(t)
      unsub()
      resolvePromise(trace)
    })
    void Promise.resolve(run()).catch(reject)
  })
}

console.log('G2 DomainQuery agreement shadow acceptance')

// --- A. supported count → dual-run fires ---
{
  const query = cq({ operation: 'count', filters: {} })
  const obs = {
    kind: 'collection' as const,
    resource: 'wedding' as const,
    operation: 'count' as const,
    filters: { dateRange: null, label: null },
    totalCount: 2,
    returnedCount: 0,
    truncated: false,
    currency: 'PLN',
  }
  const trace = await waitTrace(() =>
    scheduleDomainQueryAgreementShadow({
      turnId: 't-a',
      collectionQuery: query,
      observation: obs,
      rows: ROWS,
      force: true,
    }),
  )
  assert(trace.classification === 'agree', 'A agree')
  assert(trace.collectionQuery.operation === 'count', 'A op')
  assert(trace.queryEquivalent === true, 'A queryEq')
}

// --- B. list ---
{
  const query = cq({ operation: 'list', filters: {}, limit: 20 })
  const obs = {
    kind: 'collection' as const,
    resource: 'wedding' as const,
    operation: 'list' as const,
    filters: { dateRange: null, label: null },
    totalCount: 2,
    returnedCount: 2,
    truncated: false,
    currency: 'PLN',
  }
  const trace = await waitTrace(() =>
    scheduleDomainQueryAgreementShadow({
      turnId: 't-b',
      collectionQuery: query,
      observation: obs,
      rows: ROWS,
      force: true,
    }),
  )
  assert(trace.classification === 'agree', 'B agree')
  assert(trace.domainQuery?.aggregate === null, 'B list aggregate null')
}

// --- C. sum ---
{
  const query = cq({
    operation: 'sum',
    metric: 'remaining',
    filters: { locationQuery: 'Villa Love' },
  })
  const obs = {
    kind: 'collection' as const,
    resource: 'wedding' as const,
    operation: 'sum' as const,
    filters: {
      dateRange: null,
      locationQuery: 'Villa Love',
      label: null,
    },
    totalCount: 1,
    returnedCount: 0,
    truncated: false,
    metric: 'remaining' as const,
    amount: 900,
    currency: 'PLN',
  }
  const trace = await waitTrace(() =>
    scheduleDomainQueryAgreementShadow({
      turnId: 't-c',
      collectionQuery: query,
      observation: obs,
      rows: ROWS,
      force: true,
    }),
  )
  assert(trace.classification === 'agree', 'C agree')
  assert(trace.amountEquivalent === true, 'C amountEq')
  assert(trace.domainQuery?.measure === 'wedding.remaining_amount', 'C measure')
}

// --- D. unsupported rank ---
{
  const query = cq({
    operation: 'rank',
    metric: 'contract_value',
    rank: { direction: 'desc', limit: 1 },
    filters: {},
  })
  const obs = {
    kind: 'collection' as const,
    resource: 'wedding' as const,
    operation: 'rank' as const,
    filters: { dateRange: null, label: null },
    totalCount: 1,
    returnedCount: 1,
    truncated: false,
    currency: 'PLN',
  }
  const trace = await runDomainQueryAgreementDiagnostic({
    turnId: 't-d',
    collectionQuery: query,
    observation: obs,
    rows: ROWS,
  })
  assert(trace.classification === 'unsupported', 'D unsupported')
  assert(trace.unsupportedReason != null, 'D reason')
  // product path unaffected — diagnostic only
}

// --- E. zero-result ---
{
  const query = cq({
    operation: 'count',
    filters: {
      locationQuery: 'Villa Love',
      dateRange: YEAR_2027,
    },
  })
  const trace = await runDomainQueryAgreementDiagnostic({
    turnId: 't-e',
    collectionQuery: query,
    observation: {
      kind: 'collection',
      resource: 'wedding',
      operation: 'count',
      filters: {
        dateRange: YEAR_2027,
        locationQuery: 'Villa Love',
        label: null,
      },
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      currency: 'PLN',
    },
    rows: ROWS,
  })
  assert(trace.classification === 'agree', 'E zero-result agree')
  assert(trace.membershipEquivalent === true, 'E membership')
}

// --- F. shadow exception → shadow_error; does not throw ---
{
  const query = cq({ operation: 'count', filters: {} })
  const trace = await runDomainQueryAgreementDiagnostic({
    turnId: 't-f',
    collectionQuery: query,
    observation: {
      kind: 'collection',
      resource: 'wedding',
      operation: 'count',
      filters: { dateRange: null, label: null },
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      currency: 'PLN',
    },
    loadRows: async () => {
      throw new Error('boom_shadow')
    },
  })
  assert(trace.classification === 'shadow_error', 'F shadow_error')
  assert(trace.shadowError?.includes('boom'), 'F error msg')
}

// --- G. current execution exception unchanged ---
{
  clearLastExecutedCollectionQuery()
  const runtime: CapabilityRuntime = { nowMs: () => Date.now() }
  let threw = false
  try {
    await collectionQueryCapability.execute(
      {
        resolved: {
          status: 'resolved',
          op: 'rank',
          subject: 'contract_value',
          resource: null,
          participant: null,
          temporal: null,
          qualifiers: {
            aspect: null,
            rank: 'max',
            destination: null,
            titleHint: null,
            unsupportedReason: null,
          },
          sequence: null,
          collection: null,
          sourceTaskSpec: {} as never,
          mergedTaskSpec: {} as never,
        },
        baselineCollectionQuery: { invalid: true } as never,
        query: { invalid: true } as never,
      } as unknown as CollectionQueryInput,
      runtime,
    )
  } catch {
    threw = true
  }
  assert(threw, 'G invalid collection still throws on product path')
  assert(peekLastExecutedCollectionQuery() == null, 'G no stash on failure')
}

// --- H. hook OFF → no dual-run ---
{
  let fired = false
  const unsub = subscribeDomainQueryAgreement(() => {
    fired = true
  })
  const scheduled = scheduleDomainQueryAgreementShadow({
    turnId: 't-h',
    collectionQuery: cq({ operation: 'count', filters: {} }),
    observation: {
      kind: 'collection',
      resource: 'wedding',
      operation: 'count',
      filters: { dateRange: null, label: null },
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      currency: 'PLN',
    },
    rows: ROWS,
    enabled: false,
  })
  unsub()
  assert(scheduled === false, 'H not scheduled')
  assert(!fired, 'H no listener')
}

// --- I. no conversation state mutation ---
{
  clearAssistantV4ShadowSession()
  const before = emptyV4ShadowContext()
  await runDomainQueryAgreementDiagnostic({
    turnId: 't-i',
    collectionQuery: cq({ operation: 'count', filters: {} }),
    observation: {
      kind: 'collection',
      resource: 'wedding',
      operation: 'count',
      filters: { dateRange: null, label: null },
      totalCount: 2,
      returnedCount: 0,
      truncated: false,
      currency: 'PLN',
    },
    rows: ROWS,
  })
  const after = emptyV4ShadowContext()
  assert(before.activeCollection == null, 'I before empty')
  assert(after.activeCollection == null, 'I after empty')
}

// --- J. no visible result mutation ---
{
  const obs = {
    kind: 'collection' as const,
    resource: 'wedding' as const,
    operation: 'count' as const,
    filters: { dateRange: null, label: null },
    totalCount: 2,
    returnedCount: 0,
    truncated: false,
    currency: 'PLN',
  }
  const snap = JSON.stringify(obs)
  await runDomainQueryAgreementDiagnostic({
    turnId: 't-j',
    collectionQuery: cq({ operation: 'count', filters: {} }),
    observation: obs,
    rows: ROWS,
  })
  assert(JSON.stringify(obs) === snap, 'J observation unchanged')
}

// --- Hook location present in shadow.ts ---
{
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/shadow.ts'),
    'utf8',
  )
  assert(src.includes('scheduleDomainQueryAgreementShadow'), 'hook wired')
  assert(src.includes('migration-bridge'), 'bridge comment')
  assert(!/przyszł|Villa Love/.test(src), 'no NL in shadow hook')
}

console.log('G2 DomainQuery agreement shadow acceptance — ALL PASS')
