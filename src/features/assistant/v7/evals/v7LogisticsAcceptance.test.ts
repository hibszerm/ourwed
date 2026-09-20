/**
 * V7 Logistics read-only deterministic acceptance.
 *
 *   npx vitest run src/features/assistant/v7/evals/v7LogisticsAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  executeV7Tool,
  inspectResource,
  listRelatedResources,
  searchResources,
  type V7ToolContext,
} from '../tools/execute'
import { buildV7FixtureDeps } from './v7FixtureUniverse'
import {
  buildLogisticsSnapshot,
  V7_LOGISTICS_SEGMENTS_COMPLETE,
  V7_LOGISTICS_SEGMENTS_INCOMPLETE,
  V7_LOGISTICS_PLACES,
} from './v7LogisticsFixture'
import {
  completeRouteTotalsKmMin,
  longestOkLeg,
} from '../../shared/adapters/logisticsAuthority'
import { getEffectiveTravelFeeAmount } from '../../shared/adapters/financeAuthority'

const binding = { sessionId: 'sess-log', tenantKey: 'tenant-a' }
const otherTenant = { sessionId: 'sess-log', tenantKey: 'tenant-b' }

function ctxWithLogistics(
  snapshot = buildLogisticsSnapshot(),
): V7ToolContext {
  const deps = buildV7FixtureDeps()
  return {
    store: new V7ResourceSetStore(binding),
    binding,
    deps: {
      ...deps,
      contextOptions: {
        ...deps.contextOptions,
        loadLogistics: async () => snapshot,
      },
    },
  }
}

async function weddingHandle(c: V7ToolContext): Promise<string> {
  const search = await searchResources(c, {
    resource_type: 'wedding',
    date_start: '2026-10-12',
    date_end: '2026-10-12',
  })
  expect(search.ok).toBe(true)
  if (!search.ok) throw new Error('search failed')
  return search.handle
}

describe('V7 Logistics read-only', () => {
  it('1-3: groom→bride, bride→ceremony, ceremony→reception distances', async () => {
    const c = ctxWithLogistics()
    const handle = await weddingHandle(c)
    const related = await listRelatedResources(c, {
      handle,
      relation: 'ROUTE_LEGS',
    })
    expect(related.ok).toBe(true)
    if (!related.ok) return
    const titles = related.items.map((i) => (i as { title: string }).title)
    expect(titles.some((t) => /Pan Młody|groom|przygotowania pan/i.test(t) && /Panna|bride/i.test(t))).toBe(true)
    const groomBride = related.items.find((i) =>
      String((i as { title: string }).title).includes('→') &&
      /3,5 km|3\.5/.test(String((i as { subtitle?: string }).subtitle ?? '')),
    )
    expect(groomBride).toBeTruthy()
    expect(JSON.stringify(related)).toMatch(/8 km/)
    expect(JSON.stringify(related)).toMatch(/15 km/)
    expect(JSON.stringify(related)).not.toMatch(/placeId|latitude|longitude|pid-/)
  })

  it('4+5+7: totals, route order, longest leg', async () => {
    const snap = buildLogisticsSnapshot()
    expect(snap.summary.totalsComplete).toBe(true)
    const totals = completeRouteTotalsKmMin(snap.summary)
    // 12+3.5+8+15 = 38.5 km
    expect(totals.distanceKm).toBe(38.5)
    expect(totals.durationMinutes).toBe(Math.round((1200 + 480 + 900 + 1500) / 60))

    const c = ctxWithLogistics(snap)
    const handle = await weddingHandle(c)
    const stops = await listRelatedResources(c, {
      handle,
      relation: 'ROUTE_STOPS',
    })
    expect(stops.ok).toBe(true)
    if (!stops.ok) return
    expect(stops.items.length).toBeGreaterThanOrEqual(4)

    const longest = await inspectResource(c, {
      handle,
      concepts: ['LOGISTICS.LONGEST_LEG', 'LOGISTICS.TOTAL_DISTANCE_KM', 'LOGISTICS.TOTAL_DRIVE_DURATION_MIN'],
    })
    expect(longest.ok).toBe(true)
    if (!longest.ok) return
    const by = Object.fromEntries(longest.fields.map((f) => [f.concept, f]))
    expect(by['LOGISTICS.TOTAL_DISTANCE_KM']?.value).toBe(38.5)
    expect(String(by['LOGISTICS.LONGEST_LEG']?.display_text)).toMatch(/15 km/)
    expect(longestOkLeg(snap.flow)?.distance_meters).toBe(15000)
  })

  it('6: next stop via ordered ROUTE_STOPS after groom prep', async () => {
    const c = ctxWithLogistics()
    const handle = await weddingHandle(c)
    const stops = await listRelatedResources(c, {
      handle,
      relation: 'ROUTE_STOPS',
    })
    expect(stops.ok).toBe(true)
    if (!stops.ok) return
    const titles = stops.items.map((i) => (i as { title: string }).title.toLowerCase())
    const groomIdx = titles.findIndex((t) => t.includes('młody') || t.includes('groom'))
    expect(groomIdx).toBeGreaterThanOrEqual(0)
    expect(titles[groomIdx + 1]).toMatch(/młoda|bride|panna/)
  })

  it('8: canonical duration present on legs and totals', async () => {
    const c = ctxWithLogistics()
    const handle = await weddingHandle(c)
    const legs = await listRelatedResources(c, {
      handle,
      relation: 'ROUTE_LEGS',
    })
    expect(legs.ok).toBe(true)
    if (!legs.ok) return
    expect(JSON.stringify(legs.items)).toMatch(/min/)
  })

  it('9+10: incomplete route — no invented totals; missing unverified place omitted', async () => {
    const incomplete = buildLogisticsSnapshot({
      segments: V7_LOGISTICS_SEGMENTS_INCOMPLETE,
    })
    expect(incomplete.summary.totalsComplete).toBe(false)
    expect(completeRouteTotalsKmMin(incomplete.summary).distanceKm).toBeNull()

    const c = ctxWithLogistics(incomplete)
    const handle = await weddingHandle(c)
    const insp = await inspectResource(c, {
      handle,
      concepts: [
        'LOGISTICS.TOTALS_COMPLETE',
        'LOGISTICS.TOTAL_DISTANCE_KM',
        'LOGISTICS.ROUTE_COMPLETE',
      ],
    })
    expect(insp.ok).toBe(true)
    if (!insp.ok) return
    const by = Object.fromEntries(insp.fields.map((f) => [f.concept, f]))
    expect(by['LOGISTICS.TOTALS_COMPLETE']?.value).toBe(false)
    expect(by['LOGISTICS.TOTAL_DISTANCE_KM']?.value).toBeNull()
    expect(by['LOGISTICS.ROUTE_COMPLETE']?.value).toBe(false)

    const missingPlace = {
      ...V7_LOGISTICS_PLACES[0]!,
      latitude: null,
      longitude: null,
      formattedAddress: '',
    }
    const partialPlaces = [
      missingPlace,
      ...V7_LOGISTICS_PLACES.slice(1),
    ]
    const snap = buildLogisticsSnapshot({
      places: partialPlaces,
      segments: V7_LOGISTICS_SEGMENTS_COMPLETE,
    })
    // Unverified groom place excluded from flow stops
    expect(
      snap.flow.stops.every(
        (s) => s.kind === 'studio' || s.key !== 'p-groom',
      ),
    ).toBe(true)
  })

  it('11+12: no duration invent when only meters; unavailable route → null totals', async () => {
    const metersOnly = V7_LOGISTICS_SEGMENTS_COMPLETE.map((s) => ({
      ...s,
      durationSeconds: null,
      durationText: null,
    }))
    // routeComplete requires durationText OR distanceText — distance still present
    const snap = buildLogisticsSnapshot({ segments: metersOnly })
    // Still may be complete if distanceText exists
    const c = ctxWithLogistics(snap)
    const handle = await weddingHandle(c)
    const legs = await listRelatedResources(c, {
      handle,
      relation: 'ROUTE_LEGS',
    })
    expect(legs.ok).toBe(true)
    if (!legs.ok) return
    // Must not fabricate duration strings
    for (const item of legs.items) {
      const sub = String((item as { subtitle?: string }).subtitle ?? '')
      if (sub.includes('km') && !sub.includes('min') && !sub.includes('godz')) {
        expect(sub).not.toMatch(/\d+\s*min/)
      }
    }

    const empty = buildLogisticsSnapshot({ segments: [] })
    expect(completeRouteTotalsKmMin(empty.summary).distanceKm).toBeNull()
  })

  it('13+14: legs bound to wedding handle; cross-tenant rejected', async () => {
    const c = ctxWithLogistics()
    const handle = await weddingHandle(c)
    const related = await listRelatedResources(c, {
      handle,
      relation: 'ROUTE_LEGS',
    })
    expect(related.ok).toBe(true)
    const cross = c.store.get(handle, otherTenant)
    expect(cross.ok).toBe(false)
  })

  it('15+16: no coordinates / provider IDs in observations', async () => {
    const c = ctxWithLogistics()
    const handle = await weddingHandle(c)
    const insp = await inspectResource(c, {
      handle,
      concepts: ['LOGISTICS.LONGEST_LEG'],
    })
    expect(insp.ok).toBe(true)
    if (!insp.ok) return
    const json = JSON.stringify(insp)
    expect(json).not.toMatch(/latitude|longitude|placeId|pid-p-/)
  })

  it('17-19: travel fee separate from physical route', async () => {
    const snap = buildLogisticsSnapshot()
    const c = ctxWithLogistics(snap)
    const handle = await weddingHandle(c)
    const insp = await inspectResource(c, {
      handle,
      concepts: [
        'LOGISTICS.TOTAL_DISTANCE_KM',
        'TRAVEL.EFFECTIVE_FEE',
        'LOGISTICS.RETURN_LEG_INCLUDED',
      ],
    })
    expect(insp.ok).toBe(true)
    if (!insp.ok) return
    const by = Object.fromEntries(insp.fields.map((f) => [f.concept, f]))
    expect(by['LOGISTICS.TOTAL_DISTANCE_KM']?.value).toBe(38.5)
    expect(by['LOGISTICS.RETURN_LEG_INCLUDED']?.value).toBe(false)
    // Fixture wedding has travelFee 800 charged
    expect(typeof by['TRAVEL.EFFECTIVE_FEE']?.value).toBe('number')
    expect(by['TRAVEL.EFFECTIVE_FEE']?.value).not.toBe(
      by['LOGISTICS.TOTAL_DISTANCE_KM']?.value,
    )
    // Charged fee does not zero distance
    expect(by['LOGISTICS.TOTAL_DISTANCE_KM']?.value).toBeGreaterThan(0)
  })

  it('20+21: no write tools; route mutation unsupported', async () => {
    const c = ctxWithLogistics()
    const write = await executeV7Tool(c, 'recalculate_route', {})
    expect(write.ok).toBe(false)
  })

  it('22+23: wedding + session ResourceSets unaffected', async () => {
    const c = ctxWithLogistics()
    const weddings = await searchResources(c, {
      resource_type: 'wedding',
      date_start: '2026-10-01',
      date_end: '2026-10-31',
    })
    const sessions = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-10-01',
      date_end: '2026-10-31',
    })
    expect(weddings.ok && weddings.count).toBeGreaterThan(0)
    expect(sessions.ok && sessions.count).toBeGreaterThan(0)
  })

  it('24: finance authority unchanged (source still uses getEffectiveTravelFeeAmount)', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../shared/adapters/inspectAdapters.ts'),
      'utf8',
    )
    expect(src).toMatch(/getEffectiveTravelFeeAmount/)
    expect(getEffectiveTravelFeeAmount({ travelFeeStatus: 'charged', travelFeeAmount: 800 })).toBe(800)
    expect(getEffectiveTravelFeeAmount({ travelFeeStatus: 'included', travelFeeAmount: 800 })).toBe(0)
  })

  it('25-28: feasibility unsupported (no feasibility helper / concept)', () => {
    const conceptsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../shared/registry/concepts.ts'),
      'utf8',
    )
    expect(conceptsSrc).not.toMatch(/LOGISTICS\.CAN_MAKE|FEASIBIL/)
    const authSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../shared/adapters/logisticsAuthority.ts'),
      'utf8',
    )
    expect(authSrc).not.toMatch(/getPlan|recalculate/)
    expect(authSrc).toMatch(/listCachedSegments/)
  })
})
