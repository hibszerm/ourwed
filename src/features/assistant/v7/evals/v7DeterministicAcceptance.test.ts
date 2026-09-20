/**
 * V7 deterministic acceptance — ResourceSet, auth, finance, loop, hygiene.
 *
 *   npx vitest run src/features/assistant/v7/evals/v7DeterministicAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  aggregateResources,
  executeV7Tool,
  refineResources,
  searchResources,
  sortResources,
  inspectResource,
  type V7ToolContext,
} from '../tools/execute'
import { V7_MAX_TOOL_CALLS_PER_TURN } from '../agent/loop'
import { containsV7InternalLeak, sanitizeV7UserText } from '../render/sanitize'
import {
  getContractValue,
  getEffectiveTravelFeeAmount,
  getRemainingToPay,
  getTotalPaid,
  hasPaidDepositPayment,
} from '../../shared/adapters/financeAuthority'
import { ALL_CONCEPT_KEYS } from '../../shared/registry'
import {
  buildV7FixtureDeps,
  buildV7FixtureUniverse,
  fixtureLargestRemainingInYearEnd,
  fixtureRemainingYearEndIds,
  fixtureRemainingYearEndSum,
  V7_FIXTURE_TODAY,
  V7_FIXTURE_WEDDINGS,
} from './v7FixtureUniverse'

const binding = { sessionId: 'sess-a', tenantKey: 'tenant-a' }
const otherBinding = { sessionId: 'sess-b', tenantKey: 'tenant-a' }
const otherTenant = { sessionId: 'sess-a', tenantKey: 'tenant-b' }

function ctx(store: V7ResourceSetStore): V7ToolContext {
  return { store, binding, deps: buildV7FixtureDeps() }
}

describe('V7 ResourceSet exactness', () => {
  it('preserves membership, order, refine subset, sort+limit, immutability, zero sets', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)

    const search = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return
    const expected = fixtureRemainingYearEndIds()
    expect(store.get(search.handle, binding).ok && store.get(search.handle, binding).ok
      ? (store.get(search.handle, binding) as { ok: true; record: { memberIds: string[] } }).record.memberIds
      : []).toEqual(expected)
    expect(search.count).toBe(expected.length)

    const parentIds = [
      ...(store.get(search.handle, binding) as { ok: true; record: { memberIds: readonly string[] } })
        .record.memberIds,
    ]

    const refined = await refineResources(c, {
      handle: search.handle,
      predicates: [
        { concept: 'FIN.DEPOSIT_PAID', comparator: 'eq', value: false },
      ],
    })
    expect(refined.ok).toBe(true)
    if (!refined.ok) return
    const child = store.get(refined.handle, binding)
    expect(child.ok).toBe(true)
    if (!child.ok) return
    expect(child.record.memberIds.every((id) => parentIds.includes(id))).toBe(
      true,
    )
    // Parent unchanged
    const parentAfter = store.get(search.handle, binding)
    expect(parentAfter.ok && parentAfter.record.memberIds).toEqual(parentIds)

    const sorted = await sortResources(c, {
      handle: search.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
    })
    expect(sorted.ok).toBe(true)
    if (!sorted.ok) return
    const top = store.get(sorted.handle, binding)
    expect(top.ok && top.record.memberIds).toEqual([
      fixtureLargestRemainingInYearEnd().id,
    ])
    expect(
      (store.get(search.handle, binding) as { ok: true; record: { memberIds: readonly string[] } })
        .record.memberIds,
    ).toEqual(parentIds)

    const empty = await searchResources(c, {
      date_start: '2099-01-01',
      date_end: '2099-12-31',
    })
    expect(empty.ok && empty.count).toBe(0)
    if (empty.ok) {
      const z = store.get(empty.handle, binding)
      expect(z.ok && z.record.count).toBe(0)
    }
  })
})

describe('V7 session/tenant binding', () => {
  it('rejects cross-session, cross-tenant, unknown handle; blocks identity injection', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      date_start: '2026-01-01',
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const crossSess = store.get(search.handle, otherBinding)
    expect(crossSess.ok).toBe(false)
    if (!crossSess.ok) expect(crossSess.code).toBe('CROSS_SESSION')

    const crossTen = store.get(search.handle, otherTenant)
    expect(crossTen.ok).toBe(false)
    if (!crossTen.ok) expect(crossTen.code).toBe('CROSS_TENANT')

    const unknown = store.get('rs_does_not_exist', binding)
    expect(unknown.ok).toBe(false)

    const injected = await executeV7Tool(c, 'search_resources', {
      date_start: '2026-01-01',
      date_end: '2026-12-31',
      ownerId: 'evil',
    })
    expect(injected.ok).toBe(false)
    if (!injected.ok) expect(injected.code).toBe('IDENTITY_INJECTION_REJECTED')

    store.close()
    expect(store.get(search.handle, binding).ok).toBe(false)
    expect(store.listHandles()).toEqual([])
  })
})

describe('V7 registry authority', () => {
  it('rejects unknown concept, bad op/comparator; accepts allowed; blocks SENS if any', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {})
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const unknown = await refineResources(c, {
      handle: search.handle,
      predicates: [
        { concept: 'FAKE.CONCEPT', comparator: 'eq', value: 1 },
      ],
    })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.code).toBe('UNKNOWN_CONCEPT')

    const badCmp = await refineResources(c, {
      handle: search.handle,
      predicates: [
        {
          concept: 'CONTACT.BRIDE_NAME',
          comparator: 'eq',
          value: 'Julia',
        },
      ],
    })
    expect(badCmp.ok).toBe(false)
    if (!badCmp.ok) {
      expect(badCmp.code).toBe('COMPARATOR_NOT_ALLOWED')
      expect(badCmp.allowedComparators).toContain('contains')
    }

    const goodCmp = await refineResources(c, {
      handle: search.handle,
      predicates: [
        {
          concept: 'CONTACT.BRIDE_NAME',
          comparator: 'contains',
          value: 'Julia',
        },
      ],
    })
    expect(goodCmp.ok).toBe(true)

    const badAgg = await aggregateResources(c, {
      handle: search.handle,
      concept: 'CONTACT.BRIDE_PHONE',
      operation: 'sum',
    })
    expect(badAgg.ok).toBe(false)
    if (!badAgg.ok) expect(badAgg.code).toBe('AGGREGATION_NOT_ALLOWED')

    expect(ALL_CONCEPT_KEYS.length).toBe(89)
    expect(ALL_CONCEPT_KEYS.every((k) => !k.includes('NOTES'))).toBe(true)
  })
})

describe('V7 finance authority', () => {
  it('uses canonical helpers via light rows / inspect; no local formula rewrite', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const deps = buildV7FixtureDeps()
    const search = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const sum = await aggregateResources(c, {
      handle: search.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      operation: 'sum',
    })
    expect(sum.ok && sum.value).toBe(fixtureRemainingYearEndSum())
    expect(sum.ok && sum.set_unchanged).toBe(true)

    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../tools/execute.ts'),
      'utf8',
    )
    expect(src.includes('contractValue - paidAmount')).toBe(false)
    expect(src.includes('getRemainingToPay')).toBe(false) // light-row path; inspect uses authority
    expect(src.includes('remainingAmount')).toBe(true)

    const w = V7_FIXTURE_WEDDINGS.find((x) => x.id === 'w-julia-adam')!
    const wedding = await deps.contextOptions!.loadWedding!(w.id)
    const payments = await deps.contextOptions!.loadPayments!(w.id)
    expect(getContractValue(wedding!)).toBe(w.contractValue)
    expect(getTotalPaid(payments)).toBe(w.paidAmount)
    expect(
      getRemainingToPay(getContractValue(wedding!), payments),
    ).toBe(w.contractValue - w.paidAmount)
    expect(hasPaidDepositPayment(payments)).toBe(true)
    expect(getEffectiveTravelFeeAmount(wedding!)).toBe(w.travelFee)

    const sorted = await sortResources(c, {
      handle: search.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
    })
    expect(sorted.ok).toBe(true)
    if (!sorted.ok) return
    const inspected = await inspectResource(c, {
      handle: sorted.handle,
      concepts: ['CONTACT.BRIDE_PHONE', 'FIN.REMAINING_TO_PAY'],
    })
    expect(inspected.ok).toBe(true)
    if (!inspected.ok) return
    const phone = inspected.fields.find((f) => f.concept === 'CONTACT.BRIDE_PHONE')
    expect(phone?.value).toBe('+48 501 222 333') // Anna — largest remaining
  })
})

describe('V7 tool loop bounds + self-correction surface', () => {
  it('exposes allowedComparators for safe correction; caps at max tool calls constant', async () => {
    expect(V7_MAX_TOOL_CALLS_PER_TURN).toBeLessThanOrEqual(6)
    expect(V7_MAX_TOOL_CALLS_PER_TURN).toBeGreaterThanOrEqual(4)

    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {})
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const err = await refineResources(c, {
      handle: search.handle,
      predicates: [
        { concept: 'CONTACT.BRIDE_NAME', comparator: 'eq', value: 'x' },
      ],
    })
    expect(err.ok).toBe(false)
    if (!err.ok) {
      expect(err.code).toBe('COMPARATOR_NOT_ALLOWED')
      expect(err.allowedComparators).toEqual(
        expect.arrayContaining(['contains']),
      )
    }

    // Correction succeeds with allowed comparator
    const fixed = await refineResources(c, {
      handle: search.handle,
      predicates: [
        {
          concept: 'CONTACT.BRIDE_NAME',
          comparator: 'contains',
          value: 'Julia',
        },
      ],
    })
    expect(fixed.ok).toBe(true)

    // No silent substitution for unknown concept
    const nosub = await aggregateResources(c, {
      handle: search.handle,
      concept: 'FIN.FAKE_METRIC',
      operation: 'sum',
    })
    expect(nosub.ok).toBe(false)
    if (!nosub.ok) expect(nosub.code).toBe('UNKNOWN_CONCEPT')
  })
})

describe('V7 context / aggregate non-mutation', () => {
  it('keeps prior handles after aggregate and top-1; close destroys state', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return
    const h1 = search.handle

    await aggregateResources(c, {
      handle: h1,
      concept: 'WEDDING.DATE',
      operation: 'count',
    })
    expect(store.get(h1, binding).ok).toBe(true)

    const top = await sortResources(c, {
      handle: h1,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
    })
    expect(top.ok).toBe(true)
    if (!top.ok) return
    expect(store.listHandles().map((h) => h.handle).sort()).toEqual(
      [h1, top.handle].sort(),
    )

    store.close()
    expect(store.isClosed).toBe(true)
    expect(store.listHandles()).toEqual([])
  })
})

describe('V7 error hygiene', () => {
  it('sanitizer strips handles, concepts, tool names, UUIDs', () => {
    const dirty =
      'FIN.REMAINING_TO_PAY na rs_abc123 to 100; search_resources UUID 550e8400-e29b-41d4-a716-446655440000 COMPARATOR_NOT_ALLOWED'
    expect(containsV7InternalLeak(dirty)).toBe(true)
    const clean = sanitizeV7UserText(dirty)
    expect(containsV7InternalLeak(clean)).toBe(false)
    expect(clean.includes('rs_')).toBe(false)
    expect(clean.includes('FIN.')).toBe(false)
  })
})

describe('V7 owner failure conversation gold (tools only)', () => {
  it('executes the exact 5-turn tool sequence on fixtures', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)

    // T1 count remaining year
    const t1 = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(t1.ok && t1.count).toBe(fixtureRemainingYearEndIds().length)
    if (!t1.ok) return

    const count = await aggregateResources(c, {
      handle: t1.handle,
      concept: 'WEDDING.DATE',
      operation: 'count',
    })
    expect(count.ok && count.value).toBe(4)

    // T2 describe
    const desc = await executeV7Tool(c, 'describe_resource_set', {
      handle: t1.handle,
    })
    expect(desc.ok).toBe(true)

    // T3 sum remaining
    const sum = await aggregateResources(c, {
      handle: t1.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      operation: 'sum',
    })
    expect(sum.ok && sum.value).toBe(fixtureRemainingYearEndSum())

    // T4 top remaining
    const top = await sortResources(c, {
      handle: t1.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
    })
    expect(top.ok).toBe(true)
    if (!top.ok) return
    const topId = (
      store.get(top.handle, binding) as {
        ok: true
        record: { memberIds: readonly string[] }
      }
    ).record.memberIds[0]
    expect(topId).toBe(fixtureLargestRemainingInYearEnd().id)

    // T5 bride phone
    const phone = await inspectResource(c, {
      handle: top.handle,
      concepts: ['CONTACT.BRIDE_PHONE'],
    })
    expect(phone.ok).toBe(true)
    if (!phone.ok) return
    expect(phone.fields[0]?.value).toBe(
      fixtureLargestRemainingInYearEnd().bridePhone,
    )
  })
})

describe('V7 universe fixture sanity', () => {
  it('has expected year-end membership', () => {
    expect(fixtureRemainingYearEndIds()).toEqual([
      'w-kasia-tomek',
      'w-julia-adam',
      'w-anna-piotr',
      'w-ola-marek',
    ])
    // Anna unpaid remaining 15000 is largest
    expect(fixtureLargestRemainingInYearEnd().id).toBe('w-anna-piotr')
    expect(buildV7FixtureUniverse().length).toBe(V7_FIXTURE_WEDDINGS.length)
  })
})
