/**
 * Phase 2K.10-R1 — remove duplicate universe load on rich-sort evidence.
 *
 * Proves:
 * A/B/C/D/E — evidence result parity (display_name, fields, order, null identity)
 * F — universe call count: light-sort + evidence = 1 (was 2)
 * G — standalone inspect still loads universe once (not changed this phase)
 * H — phase marker
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  inspectResource,
  sortResources,
  type V7ToolContext,
  type V7ToolDeps,
} from '../tools/execute'
import {
  buildV7FixtureDeps,
  buildV7FixtureSessionUniverse,
  buildV7FixtureUniverse,
} from './v7FixtureUniverse'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const binding = { sessionId: 'sess-2k10r1', tenantKey: 'tenant-2k10r1' }

function countingDeps(universe?: CollectionMoneyRow[]): {
  deps: V7ToolDeps
  weddingLoads: { n: number }
  sessionLoads: { n: number }
} {
  const base = buildV7FixtureDeps()
  const weddingLoads = { n: 0 }
  const sessionLoads = { n: 0 }
  const weddingUniverse = universe ?? buildV7FixtureUniverse()
  const sessionUniverse = buildV7FixtureSessionUniverse()
  return {
    weddingLoads,
    sessionLoads,
    deps: {
      ...base,
      loadUniverseRows: async () => {
        weddingLoads.n += 1
        return weddingUniverse
      },
      loadSessionUniverseRows: async () => {
        sessionLoads.n += 1
        return sessionUniverse
      },
    },
  }
}

function toolCtx(store: V7ResourceSetStore, deps: V7ToolDeps): V7ToolContext {
  return { store, binding, deps }
}

/** Pre-R1: sort loads universe, evidence loads again — identical labels when data stable. */
async function legacyDoubleLoadDisplayNames(
  sortedMemberIds: string[],
  load: () => Promise<CollectionMoneyRow[]>,
): Promise<Array<string | null>> {
  await load()
  const second = await load()
  return sortedMemberIds.map(
    (id) => second.find((r) => r.id === id)?.displayLabel ?? null,
  )
}

describe('Phase 2K.10-R1 universe reuse', () => {
  it('H — phase + source: evidence reuses sort universe; inspect unchanged', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const execute = readSrc('src/features/assistant/v7/tools/execute.ts')
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(execute).toContain('sortedUniverse')
    expect(execute).toContain('2K.10-R1')

    const inspectBlock = execute.slice(
      execute.indexOf('export async function inspectResource'),
      execute.indexOf('export async function listRelatedResources'),
    )
    expect(inspectBlock).toContain('loadWeddingUniverse')
    expect(inspectBlock).toContain('loadSessionUniverse')
  })

  it('F — light wedding sort + evidence: universe load count was 2, now 1', async () => {
    const { deps, weddingLoads } = countingDeps()
    const store = new V7ResourceSetStore(binding)
    const parent = store.create({
      resourceType: 'wedding',
      memberIds: buildV7FixtureUniverse().map((r) => r.id),
      description: 'set',
    })
    const c = toolCtx(store, deps)

    const rich = await sortResources(c, {
      handle: parent.handle,
      concept: 'WEDDING.DATE',
      direction: 'asc',
      limit: 2,
      evidence_concepts: ['CONTACT.BRIDE_PHONE', 'WEDDING.DISPLAY_NAME'],
    })
    expect(rich.ok).toBe(true)
    expect(weddingLoads.n).toBe(1)
  })

  it('F — light session sort + evidence: session universe load count was 2, now 1', async () => {
    const { deps, sessionLoads } = countingDeps()
    const store = new V7ResourceSetStore(binding)
    const sessions = buildV7FixtureSessionUniverse()
    const parent = store.create({
      resourceType: 'session',
      memberIds: sessions.map((s) => s.id),
      description: 'sessions',
    })
    const c = toolCtx(store, deps)

    const rich = await sortResources(c, {
      handle: parent.handle,
      concept: 'SESSION.DATE',
      direction: 'asc',
      limit: 2,
      evidence_concepts: ['SESSION.DISPLAY_NAME', 'SESSION.DATE'],
    })
    expect(rich.ok).toBe(true)
    expect(sessionLoads.n).toBe(1)
  })

  it('G — standalone inspect still loads universe once (not R1-optimized)', async () => {
    const { deps, weddingLoads } = countingDeps()
    const store = new V7ResourceSetStore(binding)
    const parent = store.create({
      resourceType: 'wedding',
      memberIds: [buildV7FixtureUniverse()[0]!.id],
      description: 'one',
    })
    const c = toolCtx(store, deps)
    const insp = await inspectResource(c, {
      handle: parent.handle,
      ordinal: 1,
      concepts: ['CONTACT.BRIDE_PHONE'],
    })
    expect(insp.ok).toBe(true)
    expect(weddingLoads.n).toBe(1)
  })

  it('A/B/D — wedding rich-sort evidence shape, display_name, multi-member order', async () => {
    const universe = buildV7FixtureUniverse()
    const { deps } = countingDeps(universe)
    const store = new V7ResourceSetStore(binding)
    const parent = store.create({
      resourceType: 'wedding',
      memberIds: universe.map((r) => r.id),
      description: 'set',
    })
    const c = toolCtx(store, deps)
    const concepts = ['CONTACT.BRIDE_PHONE', 'CONTACT.GROOM_PHONE']

    const rich = await sortResources(c, {
      handle: parent.handle,
      concept: 'WEDDING.DATE',
      direction: 'asc',
      limit: 3,
      evidence_concepts: concepts,
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok || !rich.evidence) throw new Error('expected evidence')

    expect(rich.evidence.map((e) => e.ordinal)).toEqual([1, 2, 3])
    expect(rich.count).toBe(3)

    const got = store.get(rich.handle, binding)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    const sortedIds = got.record.memberIds
    expect(sortedIds).toHaveLength(3)

    const expectedNames = sortedIds.map(
      (id) => universe.find((r) => r.id === id)?.displayLabel ?? null,
    )
    expect(rich.evidence.map((e) => e.display_name)).toEqual(expectedNames)

    let legacyLoads = 0
    const legacyNames = await legacyDoubleLoadDisplayNames(
      sortedIds,
      async () => {
        legacyLoads += 1
        return universe
      },
    )
    expect(legacyLoads).toBe(2)
    expect(rich.evidence.map((e) => e.display_name)).toEqual(legacyNames)

    for (const entry of rich.evidence) {
      const insp = await inspectResource(c, {
        handle: rich.handle,
        ordinal: entry.ordinal,
        concepts,
      })
      expect(insp.ok).toBe(true)
      if (!insp.ok) continue
      expect(entry.display_name).toBe(insp.display_name)
      expect(entry.fields).toEqual(insp.fields)
    }
  })

  it('C — session display_name parity with inspect', async () => {
    const { deps } = countingDeps()
    const store = new V7ResourceSetStore(binding)
    const sessions = buildV7FixtureSessionUniverse()
    const parent = store.create({
      resourceType: 'session',
      memberIds: sessions.map((s) => s.id),
      description: 'all sessions',
    })
    const c = toolCtx(store, deps)
    const rich = await sortResources(c, {
      handle: parent.handle,
      concept: 'SESSION.DATE',
      direction: 'asc',
      limit: 2,
      evidence_concepts: ['SESSION.DISPLAY_NAME'],
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok || !rich.evidence) throw new Error('expected evidence')
    for (const entry of rich.evidence) {
      const insp = await inspectResource(c, {
        handle: rich.handle,
        ordinal: entry.ordinal,
        concepts: ['SESSION.DISPLAY_NAME'],
      })
      expect(insp.ok).toBe(true)
      if (!insp.ok) continue
      expect(entry.display_name).toBe(insp.display_name)
      expect(entry.fields).toEqual(insp.fields)
    }
  })

  it('E — missing/nullable displayLabel behaves identically', async () => {
    const base = buildV7FixtureUniverse()
    const withNull: CollectionMoneyRow[] = [
      { ...base[0]!, displayLabel: null as unknown as string },
      ...base.slice(1),
    ]
    const { deps, weddingLoads } = countingDeps(withNull)
    const store = new V7ResourceSetStore(binding)
    const parent = store.create({
      resourceType: 'wedding',
      memberIds: withNull.map((r) => r.id),
      description: 'set',
    })
    const c = toolCtx(store, deps)
    const rich = await sortResources(c, {
      handle: parent.handle,
      concept: 'WEDDING.DATE',
      direction: 'asc',
      limit: 3,
      evidence_concepts: ['WEDDING.DATE'],
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok || !rich.evidence) throw new Error('expected evidence')
    expect(weddingLoads.n).toBe(1)

    const got = store.get(rich.handle, binding)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    const expected = got.record.memberIds.map(
      (id) => withNull.find((r) => r.id === id)?.displayLabel ?? null,
    )
    expect(rich.evidence.map((e) => e.display_name)).toEqual(expected)
  })
})
