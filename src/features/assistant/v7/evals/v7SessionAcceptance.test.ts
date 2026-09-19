/**
 * V7 Session resource deterministic acceptance.
 *
 *   npx vitest run src/features/assistant/v7/evals/v7SessionAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  aggregateResources,
  describeResourceSet,
  executeV7Tool,
  inspectResource,
  listRelatedResources,
  refineResources,
  searchResources,
  sortResources,
  type V7ToolContext,
} from '../tools/execute'
import {
  buildV7FixtureDeps,
  V7_FIXTURE_SESSIONS,
  V7_FIXTURE_TODAY,
  V7_FIXTURE_WEDDINGS,
} from './v7FixtureUniverse'

const binding = { sessionId: 'sess-a', tenantKey: 'tenant-a' }
const otherTenant = { sessionId: 'sess-a', tenantKey: 'tenant-b' }

function ctx(store: V7ResourceSetStore): V7ToolContext {
  return { store, binding, deps: buildV7FixtureDeps() }
}

function memberIds(
  store: V7ResourceSetStore,
  handle: string,
): readonly string[] {
  const got = store.get(handle, binding)
  expect(got.ok).toBe(true)
  if (!got.ok) return []
  return got.record.memberIds
}

describe('V7 Session first-class resource', () => {
  it('1+2: root search by date and date range', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)

    const day = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-09-20',
      date_end: '2026-09-20',
    })
    expect(day.ok).toBe(true)
    if (!day.ok) return
    expect(memberIds(store, day.handle)).toEqual(['s-sept-twenty'])

    const range = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-10-01',
      date_end: '2026-10-31',
    })
    expect(range.ok).toBe(true)
    if (!range.ok) return
    expect(memberIds(store, range.handle)).toEqual([
      's-engagement-oct',
      's-conflict-wedding',
    ])
  })

  it('3+4+5: inspect date, location, type', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-10-05',
      date_end: '2026-10-05',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const inspected = await inspectResource(c, {
      handle: search.handle,
      concepts: [
        'SESSION.DATE',
        'SESSION.LOCATION_SUMMARY',
        'SESSION.TYPE',
        'SESSION.START_TIME',
        'SESSION.END_TIME',
      ],
    })
    expect(inspected.ok).toBe(true)
    if (!inspected.ok) return
    expect(inspected.display_name).toBe('Sesja narzeczeńska Julia')
    const byConcept = Object.fromEntries(
      inspected.fields.map((f) => [f.concept, f]),
    )
    expect(byConcept['SESSION.DATE']?.value).toBe('2026-10-05')
    expect(byConcept['SESSION.TYPE']?.value).toBe('engagement')
    expect(byConcept['SESSION.START_TIME']?.value).toBe('16:00')
    expect(byConcept['SESSION.END_TIME']?.value).toBe('18:00')
    expect(String(byConcept['SESSION.LOCATION_SUMMARY']?.value)).toContain(
      'Park',
    )
    const json = JSON.stringify(inspected)
    expect(json).not.toMatch(/s-engagement-oct/)
    expect(json).not.toMatch(/w-julia-adam/)
  })

  it('6+17: wedding → sessions relation + related_handle exactness', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const weddings = await searchResources(c, {
      resource_type: 'wedding',
      date_start: '2026-10-12',
      date_end: '2026-10-12',
    })
    expect(weddings.ok).toBe(true)
    if (!weddings.ok) return
    expect(memberIds(store, weddings.handle)).toEqual(['w-julia-adam'])

    const related = await listRelatedResources(c, {
      handle: weddings.handle,
      relation: 'SESSIONS',
    })
    expect(related.ok).toBe(true)
    if (!related.ok) return
    expect(related.items.length).toBe(1)
    expect(related.related_handle?.resource_type).toBe('session')
    expect(related.related_handle?.count).toBe(1)
    expect(memberIds(store, related.related_handle!.handle)).toEqual([
      's-engagement-oct',
    ])
  })

  it('7+8+9+10: ResourceSet exactness, refine, sort, aggregate', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-09-01',
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return
    const parentIds = [...memberIds(store, search.handle)]
    expect(parentIds.length).toBeGreaterThanOrEqual(3)

    const refined = await refineResources(c, {
      handle: search.handle,
      predicates: [
        { concept: 'SESSION.HAS_LINKED_WEDDING', comparator: 'eq', value: true },
      ],
    })
    expect(refined.ok).toBe(true)
    if (!refined.ok) return
    const child = memberIds(store, refined.handle)
    expect(child.every((id) => parentIds.includes(id))).toBe(true)
    expect(memberIds(store, search.handle)).toEqual(parentIds)

    const sorted = await sortResources(c, {
      handle: search.handle,
      concept: 'SESSION.DATE',
      direction: 'asc',
      limit: 1,
    })
    expect(sorted.ok).toBe(true)
    if (!sorted.ok) return
    expect(memberIds(store, sorted.handle)).toEqual(['s-sept-twenty'])
    expect(memberIds(store, search.handle)).toEqual(parentIds)

    const counted = await aggregateResources(c, {
      handle: search.handle,
      concept: 'SESSION.DATE',
      operation: 'count',
    })
    expect(counted.ok).toBe(true)
    if (!counted.ok) return
    expect(counted.value).toBe(parentIds.length)
    expect(counted.set_unchanged).toBe(true)
    expect(memberIds(store, search.handle)).toEqual(parentIds)

    const summed = await aggregateResources(c, {
      handle: search.handle,
      concept: 'SESSION.TOTAL_PRICE',
      operation: 'sum',
    })
    expect(summed.ok).toBe(true)
    if (!summed.ok) return
    const expectedSum = parentIds
      .map((id) => V7_FIXTURE_SESSIONS.find((s) => s.id === id)!.totalPrice)
      .reduce((a, b) => a + b, 0)
    expect(summed.value).toBe(expectedSum)
  })

  it('11: zero-result Session set', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const empty = await searchResources(c, {
      resource_type: 'session',
      date_start: '2099-01-01',
      date_end: '2099-12-31',
    })
    expect(empty.ok && empty.count).toBe(0)
  })

  it('12: cross-tenant handle rejection', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-01-01',
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return
    const cross = store.get(search.handle, otherTenant)
    expect(cross.ok).toBe(false)
    if (!cross.ok) expect(cross.code).toBe('CROSS_TENANT')
  })

  it('13: unauthorized / mismatched concept rejection', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-09-20',
      date_end: '2026-09-20',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const mismatch = await inspectResource(c, {
      handle: search.handle,
      concepts: ['FIN.REMAINING_TO_PAY'],
    })
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) expect(mismatch.code).toBe('RESOURCE_MISMATCH')

    const weddingPredOnSession = await refineResources(c, {
      handle: search.handle,
      predicates: [
        { concept: 'WEDDING.DATE', comparator: 'eq', value: '2026-09-20' },
      ],
    })
    expect(weddingPredOnSession.ok).toBe(false)
    if (!weddingPredOnSession.ok) {
      expect(weddingPredOnSession.code).toBe('RESOURCE_MISMATCH')
    }
  })

  it('14: no raw internal IDs in describe/list_related', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-10-05',
      date_end: '2026-10-05',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const described = await describeResourceSet(c, { handle: search.handle })
    expect(described.ok).toBe(true)
    if (!described.ok) return
    expect(JSON.stringify(described)).not.toMatch(/s-engagement-oct/)

    const linked = await listRelatedResources(c, {
      handle: search.handle,
      relation: 'LINKED_WEDDING',
    })
    expect(linked.ok).toBe(true)
    if (!linked.ok) return
    expect(JSON.stringify(linked.items)).not.toMatch(/w-julia-adam/)
    expect(linked.related_handle?.count).toBe(1)
    expect(memberIds(store, linked.related_handle!.handle)).toEqual([
      'w-julia-adam',
    ])
  })

  it('15: Session writes unavailable (no write tools)', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const create = await executeV7Tool(c, 'create_session', {
      date: '2026-09-18',
    })
    expect(create.ok).toBe(false)
    if (!create.ok) expect(create.code).toBe('VALIDATION_ERROR')
  })

  it('16: existing Wedding ResourceSets unaffected', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const weddings = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(weddings.ok).toBe(true)
    if (!weddings.ok) return
    expect(weddings.resource_type).toBe('wedding')
    expect(memberIds(store, weddings.handle).length).toBe(
      V7_FIXTURE_WEDDINGS.filter(
        (w) => w.date >= V7_FIXTURE_TODAY && w.date <= '2026-12-31',
      ).length,
    )
  })
})

describe('V7 Session date-level availability semantics', () => {
  it('18: wedding conflict on requested date', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const weddings = await searchResources(c, {
      resource_type: 'wedding',
      date_start: '2026-10-12',
      date_end: '2026-10-12',
    })
    expect(weddings.ok && weddings.count).toBe(1)
  })

  it('19: session conflict on requested date', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const sessions = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-10-12',
      date_end: '2026-10-12',
    })
    expect(sessions.ok && sessions.count).toBe(1)
    if (!sessions.ok) return
    expect(memberIds(store, sessions.handle)).toEqual(['s-conflict-wedding'])
  })

  it('20: no wedding + no session conflict (free calendar day)', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const freeDay = '2026-09-21'
    const weddings = await searchResources(c, {
      resource_type: 'wedding',
      date_start: freeDay,
      date_end: freeDay,
    })
    const sessions = await searchResources(c, {
      resource_type: 'session',
      date_start: freeDay,
      date_end: freeDay,
    })
    expect(weddings.ok && weddings.count).toBe(0)
    expect(sessions.ok && sessions.count).toBe(0)
  })

  it('21+22: exact-time not inventable; wedding absence alone insufficient', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    // 2026-09-20: no wedding, but session exists — not free
    const weddings = await searchResources(c, {
      resource_type: 'wedding',
      date_start: '2026-09-20',
      date_end: '2026-09-20',
    })
    const sessions = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-09-20',
      date_end: '2026-09-20',
    })
    expect(weddings.ok && weddings.count).toBe(0)
    expect(sessions.ok && sessions.count).toBe(1)

    // Tools expose optional times via inspect; no scheduling engine / free-slot tool
    const inspected = await inspectResource(c, {
      handle: sessions.ok ? sessions.handle : '',
      concepts: ['SESSION.START_TIME', 'SESSION.END_TIME'],
    })
    expect(inspected.ok).toBe(true)
    if (!inspected.ok) return
    // Fixture session on 09-20 has no start/end — date-only truth
    expect(inspected.fields.find((f) => f.concept === 'SESSION.START_TIME')?.value).toBeNull()
    expect(inspected.fields.find((f) => f.concept === 'SESSION.END_TIME')?.value).toBeNull()
  })
})
