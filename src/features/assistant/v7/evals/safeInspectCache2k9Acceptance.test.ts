/**
 * Phase 2K.9 — shared inspect read-context: Golden semantic parity + read reuse.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  executeV7Tool,
  inspectResource,
  type V7ToolContext,
  type V7ToolDeps,
} from '../tools/execute'
import {
  WeddingReadContext,
  type WeddingReadContextOverrides,
} from '../../v6/adapters/WeddingReadContext'
import {
  SessionReadContext,
  type SessionReadContextOverrides,
} from '../../v6/adapters/SessionReadContext'
import { inspectConcept } from '../../v6/adapters/inspectAdapters'
import { inspectSessionConcept } from '../../v6/adapters/sessionInspectAdapters'
import { getConcept, isConceptKey } from '../../v6/registry'
import {
  assertConceptMatchesResource,
  assertInspectProjection,
  resolveConceptKey,
} from '../tools/authorize'
import {
  buildV7FixtureDeps,
  V7_FIXTURE_WEDDINGS,
  V7_FIXTURE_SESSIONS,
} from './v7FixtureUniverse'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

/** Mirror of tools/execute.ts scrubIds for Golden parity comparison. */
function scrubIds(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const scrubbed = { ...(value as Record<string, unknown>) }
  for (const k of Object.keys(scrubbed)) {
    if (/id$/i.test(k) || k === 'id') delete scrubbed[k]
  }
  return scrubbed
}

const binding = { sessionId: 'sess-2k9', tenantKey: 'tenant-2k9' }
const julia = V7_FIXTURE_WEDDINGS.find((w) => w.id === 'w-julia-adam')!
const anna = V7_FIXTURE_WEDDINGS.find((w) => w.id === 'w-anna-piotr')!
const sessionA = V7_FIXTURE_SESSIONS[0]!

type InspectOk = {
  ok: true
  handle: string
  ordinal: number
  display_name: string | null
  fields: Array<{
    concept: string
    value: unknown
    filled: boolean
    display_text?: string | null
    privacy: string
  }>
}

/**
 * Golden 2K.8 semantics: new read context per concept (for parity comparison only).
 */
async function inspectResourceGoldenPerConcept(
  ctx: V7ToolContext,
  args: { handle: string; ordinal?: number; concepts: string[] },
): Promise<InspectOk | { ok: false; code: string; message: string }> {
  const got = ctx.store.get(args.handle, ctx.binding)
  if (!got.ok) return { ok: false, code: got.code, message: got.code }
  let ordinal = args.ordinal
  if (ordinal == null) {
    if (got.record.count !== 1) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'ordinal_required' }
    }
    ordinal = 1
  }
  const memberId = got.record.memberIds[ordinal - 1]!
  const fields: InspectOk['fields'] = []
  for (const raw of args.concepts) {
    const resolved = resolveConceptKey(raw)
    if (!resolved.ok) return resolved as never
    const matchErr = assertConceptMatchesResource(
      resolved.key,
      got.record.resourceType,
    )
    if (matchErr) return matchErr as never
    const projErr = assertInspectProjection(resolved.key)
    if (projErr) return projErr as never

    const inspected =
      got.record.resourceType === 'session'
        ? await inspectSessionConcept(
            new SessionReadContext(memberId, ctx.deps?.sessionContextOptions),
            resolved.key,
          )
        : await inspectConcept(
            new WeddingReadContext(memberId, ctx.deps?.contextOptions),
            resolved.key,
          )
    fields.push({
      concept: resolved.key,
      value: scrubIds(inspected.value),
      filled: inspected.filled,
      display_text: inspected.displayText ?? null,
      privacy: isConceptKey(resolved.key)
        ? getConcept(resolved.key).privacy
        : 'OPERATIONAL',
    })
  }
  // Match production display_name path (universe) — unchanged in 2K.9.
  const optimized = await inspectResource(ctx, args)
  if (!optimized.ok) return optimized as never
  return {
    ok: true,
    handle: got.record.handle,
    ordinal,
    display_name: optimized.display_name,
    fields,
  }
}

function fieldFingerprint(fields: InspectOk['fields']) {
  return fields.map((f) => ({
    concept: f.concept,
    value: f.value,
    filled: f.filled,
    display_text: f.display_text ?? null,
    privacy: f.privacy,
  }))
}

function makeInstrumentedDeps(): {
  deps: V7ToolDeps
  counts: {
    loadWedding: Map<string, number>
    loadOperationalDay: Map<string, number>
    loadSession: Map<string, number>
  }
} {
  const base = buildV7FixtureDeps()
  const counts = {
    loadWedding: new Map<string, number>(),
    loadOperationalDay: new Map<string, number>(),
    loadSession: new Map<string, number>(),
  }
  const baseCtx = base.contextOptions ?? {}
  const baseSession = base.sessionContextOptions ?? {}

  const contextOptions: WeddingReadContextOverrides = {
    ...baseCtx,
    loadWedding: async (id) => {
      counts.loadWedding.set(id, (counts.loadWedding.get(id) ?? 0) + 1)
      return baseCtx.loadWedding ? baseCtx.loadWedding(id) : null
    },
    loadOperationalDay: async (id) => {
      counts.loadOperationalDay.set(
        id,
        (counts.loadOperationalDay.get(id) ?? 0) + 1,
      )
      // Empty-ok day: concepts resolve to unfilled without adapter changes.
      return {
        status: 'ok',
        slots: [],
      } as never
    },
  }

  const sessionContextOptions: SessionReadContextOverrides = {
    ...baseSession,
    loadSession: async (id) => {
      counts.loadSession.set(id, (counts.loadSession.get(id) ?? 0) + 1)
      return baseSession.loadSession ? baseSession.loadSession(id) : null
    },
  }

  return {
    deps: { ...base, contextOptions, sessionContextOptions },
    counts,
  }
}

function toolCtx(
  store: V7ResourceSetStore,
  deps: V7ToolDeps,
): V7ToolContext {
  return { store, binding, deps: { ...deps, todayKey: '2026-09-18' } }
}

describe('Phase 2K.9 safe inspect read-context', () => {
  it('source: one context construction site per resource type in inspect field loader', () => {
    const src = readSrc('src/features/assistant/v7/tools/execute.ts')
    const helper = src.slice(
      src.indexOf('async function loadInspectFieldsForMember'),
      src.indexOf('const SORT_EVIDENCE_MEMBER_CAP'),
    )
    expect(helper).toContain('sharedWeddingCtx')
    expect(helper).toContain('sharedSessionCtx')
    expect(helper).toContain('new WeddingReadContext')
    expect(helper).toContain('new SessionReadContext')
    // inspect_resource delegates to the shared helper (no per-concept new Context)
    const inspectBlock = src.slice(
      src.indexOf('export async function inspectResource'),
      src.indexOf('export async function listRelatedResources'),
    )
    expect(inspectBlock).toContain('loadInspectFieldsForMember')
    expect(inspectBlock).not.toContain('new WeddingReadContext')
    expect(inspectBlock).not.toContain('new SessionReadContext')
    expect(
      readSrc('src/features/assistant/components/AssistantSurface.tsx'),
    ).toContain('data-phase="k31-correctness-followup"')
  })

  it('1–5. wedding multi-concept / contact / location / ops / empty — parity + one base wedding load', async () => {
    const { deps, counts } = makeInstrumentedDeps()
    const store = new V7ResourceSetStore(binding)
    const rec = store.create({
      resourceType: 'wedding',
      memberIds: [julia.id],
      description: 'one',
    })
    const ctx = toolCtx(store, deps)
    const concepts = [
      'WEDDING.DATE',
      'WEDDING.DISPLAY_NAME',
      'CONTACT.BRIDE_NAME',
      'CONTACT.BRIDE_PHONE',
      'CONTACT.GROOM_PHONE',
      'PLACE.BRIDE_PREP_PLACE',
      'PLACE.BRIDE_PREP_ADDRESS',
      'OPS.BRIDE_PREP_TIME',
    ]
    const args = { handle: rec.handle, ordinal: 1, concepts }

    const t0 = Date.now()
    const optimized = await inspectResource(ctx, args)
    const durationMs = Date.now() - t0
    expect(optimized.ok).toBe(true)
    if (!optimized.ok) return

    counts.loadWedding.clear()
    counts.loadOperationalDay.clear()
    const golden = await inspectResourceGoldenPerConcept(ctx, args)
    expect(golden.ok).toBe(true)
    if (!golden.ok) return

    // Re-run optimized for clean counters after golden comparison path.
    counts.loadWedding.clear()
    counts.loadOperationalDay.clear()
    const again = await inspectResource(ctx, args)
    expect(again.ok).toBe(true)
    if (!again.ok) return

    expect(again.handle).toBe(golden.handle)
    expect(again.ordinal).toBe(golden.ordinal)
    expect(again.display_name).toBe(golden.display_name)
    expect(fieldFingerprint(again.fields)).toEqual(
      fieldFingerprint(golden.fields),
    )
    expect(again.fields.map((f) => f.concept)).toEqual(concepts)

    // Base wedding read once (DATE/NAME/CONTACT all use getWedding).
    expect(counts.loadWedding.get(julia.id)).toBe(1)
    // Operational-day concepts share one getOperationalDay.
    expect(counts.loadOperationalDay.get(julia.id)).toBe(1)

    // Empty groom phone on anna fixture separately
    const store2 = new V7ResourceSetStore(binding)
    const annaRec = store2.create({
      resourceType: 'wedding',
      memberIds: [anna.id],
      description: 'anna',
    })
    const empty = await inspectResource(toolCtx(store2, deps), {
      handle: annaRec.handle,
      ordinal: 1,
      concepts: ['CONTACT.GROOM_PHONE', 'CONTACT.BRIDE_PHONE'],
    })
    expect(empty.ok).toBe(true)
    if (!empty.ok) return
    const groom = empty.fields.find((f) => f.concept === 'CONTACT.GROOM_PHONE')
    const bride = empty.fields.find((f) => f.concept === 'CONTACT.BRIDE_PHONE')
    expect(groom?.filled).toBe(false)
    expect(bride?.filled).toBe(true)

    // Duration is informational only (CI variance).
    expect(durationMs).toBeGreaterThanOrEqual(0)
  })

  it('6. session multi-concept — parity + one session load', async () => {
    const { deps, counts } = makeInstrumentedDeps()
    const store = new V7ResourceSetStore(binding)
    const rec = store.create({
      resourceType: 'session',
      memberIds: [sessionA.id],
      description: 'sess',
    })
    const ctx = toolCtx(store, deps)
    const concepts = ['SESSION.DATE', 'SESSION.DISPLAY_NAME']
    const args = { handle: rec.handle, ordinal: 1, concepts }

    const optimized = await inspectResource(ctx, args)
    const golden = await inspectResourceGoldenPerConcept(ctx, args)
    expect(optimized.ok && golden.ok).toBe(true)
    if (!optimized.ok || !golden.ok) return
    expect(fieldFingerprint(optimized.fields)).toEqual(
      fieldFingerprint(golden.fields),
    )

    counts.loadSession.clear()
    await inspectResource(ctx, args)
    expect(counts.loadSession.get(sessionA.id)).toBe(1)
  })

  it('7. multiple ResourceSet members do not share entity read state', async () => {
    const { deps, counts } = makeInstrumentedDeps()
    const store = new V7ResourceSetStore(binding)
    const rec = store.create({
      resourceType: 'wedding',
      memberIds: [julia.id, anna.id],
      description: 'two',
    })
    const ctx = toolCtx(store, deps)
    const concepts = ['WEDDING.DATE', 'CONTACT.BRIDE_PHONE']

    await inspectResource(ctx, {
      handle: rec.handle,
      ordinal: 1,
      concepts,
    })
    await inspectResource(ctx, {
      handle: rec.handle,
      ordinal: 2,
      concepts,
    })

    expect(counts.loadWedding.get(julia.id)).toBe(1)
    expect(counts.loadWedding.get(anna.id)).toBe(1)
  })

  it('8. concept / authorization failure unchanged', async () => {
    const { deps } = makeInstrumentedDeps()
    const store = new V7ResourceSetStore(binding)
    const rec = store.create({
      resourceType: 'wedding',
      memberIds: [julia.id],
      description: 'one',
    })
    const ctx = toolCtx(store, deps)

    const bad = await executeV7Tool(ctx, 'inspect_resource', {
      handle: rec.handle,
      ordinal: 1,
      concepts: ['NOT.A.REAL.CONCEPT'],
    })
    expect(bad.ok).toBe(false)

    const domainMismatch = await executeV7Tool(ctx, 'inspect_resource', {
      handle: rec.handle,
      ordinal: 1,
      concepts: ['SESSION.DATE'],
    })
    expect(domainMismatch.ok).toBe(false)
  })
})
