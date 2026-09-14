/**
 * G0 — DomainQuery + Semantic Field Registry foundation acceptance.
 * Shadow only. No NL heuristics. Composition via DomainQuery alone.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/domainQuery/g0DomainQueryFoundationAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CollectionMoneyRow } from '../capabilities/collection/executeCollectionQuery'
import {
  executeCollectionQueryOnRows,
} from '../capabilities/collection/executeCollectionQuery'
import {
  validateCollectionQuery,
  type CollectionQuery,
} from '../capabilities/collection/collectionQueryContract'
import {
  SEMANTIC_FIELD_IDS,
  SEMANTIC_FIELD_REGISTRY,
  getSemanticField,
} from './fieldRegistry'
import { emptyDomainQuery, type DomainQuery } from './domainQuery'
import { validateDomainQuery } from './validateDomainQuery'
import { executeDomainQueryOnRows } from './executeDomainQuery'
import {
  collectionQueryToDomainQuery,
  compareCollectionVsDomainObservation,
} from './compareCollectionShadow'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function mustOk(raw: unknown) {
  const v = validateDomainQuery(raw)
  assert(v.ok, `validate: ${'reason' in v ? v.reason : ''}`)
  return (v as { ok: true; query: DomainQuery }).query
}

function run(rows: CollectionMoneyRow[], q: DomainQuery) {
  const r = executeDomainQueryOnRows(rows, q)
  assert(r.ok, `exec: ${r.ok === false ? r.failure.detail : ''}`)
  return r as Extract<typeof r, { ok: true }>
}

const YEAR_2026 = { from: '2026-01-01', to: '2026-12-31' }
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }
const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }

/** Composition fixture — not production venue hardcoding in engine. */
const ROWS: CollectionMoneyRow[] = [
  {
    id: 'vl-2026-a',
    displayLabel: 'VL 2026 A',
    date: '2026-06-10',
    contractValue: 10000,
    paidAmount: 2000,
    remainingAmount: 8000,
    locationHaystack: ['Villa Love', 'Stęszew'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'vl-2026-b',
    displayLabel: 'VL 2026 B',
    date: '2026-08-20',
    contractValue: 12000,
    paidAmount: 12000,
    remainingAmount: 0,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'], ceremony: ['Villa Love'] },
  },
  {
    id: 'vl-2028',
    displayLabel: 'VL 2028',
    date: '2028-05-01',
    contractValue: 15000,
    paidAmount: 1000,
    remainingAmount: 14000,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'hs-2027-a',
    displayLabel: 'HS 2027 A',
    date: '2027-03-01',
    contractValue: 9000,
    paidAmount: 0,
    remainingAmount: 9000,
    locationHaystack: ['Hotel Stary', 'Kraków'],
    locationByRole: { reception: ['Hotel Stary'] },
  },
  {
    id: 'hs-2027-b',
    displayLabel: 'HS 2027 B',
    date: '2027-09-15',
    contractValue: 11000,
    paidAmount: 5000,
    remainingAmount: 6000,
    locationHaystack: ['Hotel Stary'],
    locationByRole: { reception: ['Hotel Stary'] },
  },
  {
    id: 'other-2027',
    displayLabel: 'Other 2027',
    date: '2027-07-01',
    contractValue: 7000,
    paidAmount: 7000,
    remainingAmount: 0,
    locationHaystack: ['Sala Inna'],
    locationByRole: { reception: ['Sala Inna'] },
  },
]

function placeContains(name: string): DomainQuery['relations'] {
  return [
    { relation: 'place', field: 'place.name', op: 'contains', value: name },
  ]
}

console.log('G0 DomainQuery foundation acceptance')

// --- Registry ---
assert(SEMANTIC_FIELD_IDS.length === 6, '6 G0 fields')
assert(!!getSemanticField('wedding.contract_value'), 'CV field')
assert(
  SEMANTIC_FIELD_REGISTRY['wedding.contract_value'].sot.includes('getContractValue'),
  'CV SoT mapping',
)
assert(
  SEMANTIC_FIELD_REGISTRY['wedding.paid_amount'].sot.includes('getTotalPaid'),
  'paid SoT',
)
assert(
  SEMANTIC_FIELD_REGISTRY['wedding.remaining_amount'].sot.includes(
    'getRemainingToPay',
  ),
  'remaining SoT',
)
assert(getSemanticField('weddings.price') == null, 'no DB column field')
assert(getSemanticField('villa_love_next_year') == null, 'no question-shaped field')

// --- Validation fail-closed ---
assert(
  !validateDomainQuery({
    version: 1,
    source: 'wedding',
    filters: [],
    relations: [],
    measure: 'wedding.date',
    aggregate: 'sum',
    orderBy: [],
    limit: null,
    dateBinding: null,
  }).ok,
  'reject sum wedding.date',
)
assert(
  !validateDomainQuery({
    version: 1,
    source: 'wedding',
    filters: [],
    relations: [],
    measure: 'unknown.field',
    aggregate: 'sum',
    orderBy: [],
    limit: null,
    dateBinding: null,
  }).ok,
  'reject unknown measure',
)
assert(
  !validateDomainQuery({
    version: 1,
    source: 'session',
    filters: [],
    relations: [],
    measure: null,
    aggregate: 'count',
    orderBy: [],
    limit: null,
    dateBinding: null,
    userId: 'x',
  }).ok,
  'reject identity / bad source',
)
assert(
  !validateDomainQuery({
    version: 1,
    source: 'wedding',
    filters: [],
    relations: [],
    measure: null,
    aggregate: 'count',
    orderBy: [],
    limit: null,
    dateBinding: null,
    sql: 'select *',
  }).ok,
  'reject sql',
)
assert(
  !validateDomainQuery({
    version: 1,
    source: 'wedding',
    filters: [],
    relations: [],
    measure: null,
    aggregate: 'count',
    orderBy: [],
    limit: null,
    dateBinding: null,
    table: 'weddings',
  }).ok,
  'reject table',
)
{
  const capped = validateDomainQuery({
    version: 1,
    source: 'wedding',
    filters: [],
    relations: [],
    measure: null,
    aggregate: null,
    orderBy: [],
    limit: 999,
    dateBinding: null,
  })
  assert(capped.ok, 'large limit accepted then capped')
  if (capped.ok) assert(capped.query.limit === 20, 'limit capped at 20')
}

// --- COMPOSITION PROOF A–H (same language, no intents) ---
{
  // A. count all
  const a = run(ROWS, mustOk(emptyDomainQuery({ aggregate: 'count' })))
  assert(a.observation.totalCount === 6, 'A count all = 6')

  // B. count in date range 2027
  const b = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'count',
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  assert(b.observation.totalCount === 3, 'B count 2027 = 3')

  // C. count at venue
  const c = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'count',
        relations: placeContains('Villa Love'),
      }),
    ),
  )
  assert(c.observation.totalCount === 3, 'C Villa Love = 3')

  // D. venue AND date 2027 → 0
  const dQuery = mustOk(
    emptyDomainQuery({
      aggregate: 'count',
      relations: placeContains('Villa Love'),
      dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
    }),
  )
  const d = run(ROWS, dQuery)
  assert(d.observation.totalCount === 0, 'D Villa Love ∩ 2027 = 0')
  assert(
    d.activeCollection.query.relations.some(
      (r) => r.field === 'place.name' && r.value === 'Villa Love',
    ),
    'D zero-result keeps place in query identity',
  )
  assert(
    d.activeCollection.query.dateBinding?.range.from === '2027-01-01',
    'D zero-result keeps dateBinding',
  )
  assert(d.activeCollection.resultCount === 0, 'D resultCount 0')

  // E. list same as D
  const e = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: null,
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
        limit: 20,
      }),
    ),
  )
  assert(e.observation.totalCount === 0, 'E list empty count')
  assert((e.observation.items ?? []).length === 0, 'E list []')
  assert(e.observation.aggregate === 'list', 'E list op')

  // F. sum CV for D
  const f = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'sum',
        measure: 'wedding.contract_value',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  assert(f.observation.amount === 0, 'F sum CV = 0')

  // G. sum paid for D
  const g = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'sum',
        measure: 'wedding.paid_amount',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  assert(g.observation.amount === 0, 'G sum paid = 0')

  // H. sum remaining for D
  const h = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'sum',
        measure: 'wedding.remaining_amount',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  assert(h.observation.amount === 0, 'H sum remaining = 0')
}

// --- VILLA LOVE ARCHITECTURE BENCHMARK ---
{
  const q1 = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'count',
        relations: placeContains('Villa Love'),
      }),
    ),
  )
  assert(q1.observation.totalCount === 3, 'Q1 Villa Love collection = 3')

  const q2 = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'count',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  assert(q2.observation.totalCount === 0, 'Q2 Villa Love 2027 = 0')

  const q3 = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: null,
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
        limit: 20,
      }),
    ),
  )
  assert((q3.observation.items ?? []).length === 0, 'Q3 list []')

  const q4 = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'count',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
      }),
    ),
  )
  assert(q4.observation.totalCount === 1, 'Q4 Villa Love 2028 = 1')
  const q4list = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: null,
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
        limit: 20,
      }),
    ),
  )
  assert(
    q4list.observation.items?.[0]?.resource.id === 'vl-2028',
    'Q4 only VL 2028',
  )

  const q5 = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'sum',
        measure: 'wedding.contract_value',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  assert(q5.observation.amount === 0, 'Q5 sum CV Villa Love 2027 = 0')
}

// --- Generalization gate: combinations without dedicated handlers ---
{
  // place + date + aggregate (2026 Villa Love)
  const p = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'count',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2026 },
      }),
    ),
  )
  assert(p.observation.totalCount === 2, 'place+date count 2026 VL = 2')

  // date + financial measure
  const money = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'sum',
        measure: 'wedding.contract_value',
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  assert(money.observation.amount === 27000, 'date+CV 2027 = 9k+11k+7k')

  // place + date + financial
  const pdm = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'sum',
        measure: 'wedding.remaining_amount',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2026 },
      }),
    ),
  )
  assert(pdm.observation.amount === 8000, 'place+date+remaining')

  // zero-result + operation change preserves query filters
  const zeroCount = run(
    ROWS,
    mustOk(
      emptyDomainQuery({
        aggregate: 'count',
        relations: placeContains('Villa Love'),
        dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
      }),
    ),
  )
  const zeroList = run(ROWS, {
    ...zeroCount.activeCollection.query,
    aggregate: null,
    limit: 20,
  })
  assert(zeroList.ok && zeroList.observation.totalCount === 0, 'zero→list still 0')
  assert(
    zeroList.ok &&
      zeroList.activeCollection.query.relations[0]?.value === 'Villa Love',
    'operation change keeps place',
  )
}

// --- Dual-run structural compare vs CollectionQuery (supported subset) ---
{
  const cqRaw = {
    resource: 'wedding' as const,
    operation: 'count' as const,
    filters: {
      locationQuery: 'Hotel Stary',
      dateRange: YEAR_2027,
    },
    usedActiveCollection: false,
  }
  const cqV = validateCollectionQuery(cqRaw)
  assert(cqV.ok, 'cq valid')
  const cq = (cqV as { ok: true; query: CollectionQuery }).query
  const cqExec = executeCollectionQueryOnRows(ROWS, cq)
  const dq = collectionQueryToDomainQuery(cq)
  assert(!!dq, 'adapt cq→dq')
  const dqExec = run(ROWS, dq!)
  const cmp = compareCollectionVsDomainObservation({
    collection: cqExec.observation,
    domain: dqExec.observation,
  })
  assert(cmp.agree, `dual-run agree: ${cmp.reasons.join(',')}`)
}

// --- No NL / intent / phrase branches in G0 module ---
{
  const dir = resolve(process.cwd(), 'src/features/assistant/v4/domainQuery')
  for (const f of [
    'executeDomainQuery.ts',
    'validateDomainQuery.ts',
    'fieldRegistry.ts',
    'domainQuery.ts',
  ]) {
    const src = readFileSync(resolve(dir, f), 'utf8')
    assert(!/Villa Love/i.test(src), `${f}: no venue hardcode`)
    assert(!/przyszł/i.test(src), `${f}: no Polish phrase branch`)
    assert(!/includes\(['"]a w/.test(src), `${f}: no utterance match`)
    assert(!/tryDeterministic/.test(src), `${f}: no continuation heuristic`)
  }
}

// --- Executor reuses commercial path (via weddingToCollectionRow) ---
{
  const execSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/domainQuery/executeDomainQuery.ts',
    ),
    'utf8',
  )
  assert(execSrc.includes('weddingToCollectionRow'), 'reuses collection row SoT')
  assert(execSrc.includes('listWeddingsForList'), 'live path list-light')
  assert(!execSrc.includes('listByWeddingId('), 'no N+1 place loop')
}

console.log('G0 DomainQuery foundation acceptance — ALL PASS')
