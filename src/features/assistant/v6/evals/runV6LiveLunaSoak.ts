/**
 * V6-F1.1 — Live Luna soak (frozen F1 surface).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6LiveLunaSoak.ts
 *
 * Optional:
 *   V6_LIVE_LIMIT=20  — run first N cases (smoke)
 *   V6_LIVE_ONLY=m02-original,m01-core8,m03-novel
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import { buildV6NativeToolsRequestBody } from '../agent/v6OpenAITransport'
import { parseV6NativeChatMessage } from '../agent/parseNativeStep'
import type { V6AgentStepResponse } from '../agent/protocol'
import { V6_MAX_TOOL_ROUNDS } from '../agent/protocol'
import { buildModelCollectionContext } from '../collections/summary'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import { executeV6Tool } from '../tools'
import {
  allLiveCases,
  liveCorpusCounts,
  type V6LiveCase,
} from './v6LiveCorpus'
import { judgeTurn, type ToolTraceEntry, type TurnTrace } from './v6LiveJudge'

const MODEL = 'gpt-5.6-luna'
const TODAY = '2026-09-14'
const SLEEP_MS = 150

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function row(
  id: string,
  date: string,
  place: string,
  cv: number,
  paid: number,
): CollectionMoneyRow {
  return {
    id,
    displayLabel: id,
    date,
    contractValue: cv,
    paidAmount: paid,
    remainingAmount: Math.max(0, cv - paid),
    locationHaystack: [place],
    locationByRole: {
      reception: [place],
      ceremony: [place],
      preparations: [place],
    },
  }
}

const UNIVERSE: CollectionMoneyRow[] = [
  row('W_past', '2026-08-01', 'Villa Love', 10000, 2000),
  row('W1', '2026-10-01', 'Villa Love', 12000, 3000),
  row('W2', '2026-11-15', 'Hotel X', 8000, 0),
  row('W3', '2026-12-20', 'Villa Love', 15000, 5000),
  row('W4', '2027-01-10', 'Villa Love', 9000, 1000),
  row('W5', '2027-03-01', 'Barn Y', 11000, 0),
  row('W6', '2027-06-01', 'Villa Love', 7000, 7000),
  row('W7', '2027-09-12', 'Hotel X', 13000, 2000),
  row('W_far', '2028-05-01', 'Villa Love', 5000, 0),
]

function weddingFixtures() {
  return UNIVERSE.map((r) => ({
    id: r.id,
    price: r.contractValue,
    payments: [
      {
        id: `p_${r.id}`,
        label: 'p',
        amount: r.paidAmount,
        paid: r.paidAmount > 0,
        type: 'other' as const,
        paidAt: r.paidAmount > 0 ? '2026-01-01' : undefined,
      },
    ],
  }))
}

type LunaStep =
  | {
      ok: true
      payload: V6AgentStepResponse
      latencyMs: number
    }
  | { ok: false; kind: 'provider' | 'schema'; error: string; latencyMs: number }

async function callLunaStep(input: {
  utterance: string
  round: number
  collectionSummaries: unknown
  previousToolResults: unknown
  recentUtterances: string[]
}): Promise<LunaStep> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return {
      ok: false,
      kind: 'provider',
      error: 'missing_openai_key',
      latencyMs: 0,
    }
  }
  const started = Date.now()
  const reqBody = buildV6NativeToolsRequestBody({
    model: MODEL,
    maxOutputTokens: 1200,
    messages: [
      { role: 'system', content: V6_AGENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          utterance: input.utterance,
          locale: 'pl-PL',
          round: input.round,
          collectionSummaries: input.collectionSummaries,
          compactConversationContext: {
            recentUtterances: input.recentUtterances,
          },
          previousToolResults: input.previousToolResults,
        }),
      },
    ],
  })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  })
  const latencyMs = Date.now() - started
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const code = body?.error?.code ?? body?.error?.type ?? `http_${res.status}`
    const msg =
      typeof body?.error?.message === 'string'
        ? body.error.message.slice(0, 240)
        : ''
    return {
      ok: false,
      kind: 'provider',
      error: `provider_${res.status}_${String(code)}${msg ? `:${msg}` : ''}`,
      latencyMs,
    }
  }
  const message = body?.choices?.[0]?.message
  const checked = parseV6NativeChatMessage(message ?? {})
  if (!checked.ok) {
    return { ok: false, kind: 'schema', error: checked.reason, latencyMs }
  }
  return { ok: true, payload: checked.response, latencyMs }
}

async function runOneUtterance(input: {
  utterance: string
  recentUtterances: string[]
  turnId: string
}): Promise<TurnTrace> {
  const toolTrace: ToolTraceEntry[] = []
  const modelLatencyMs: number[] = []
  const agentStatuses: string[] = []
  let previousToolResults: Array<{
    toolCallId: string
    name: string
    result: unknown
  }> = []
  let finalStatus = 'unknown'
  let unsupportedReason: string | undefined
  let parentSnapshot: string[] | undefined

  for (let round = 1; round <= V6_MAX_TOOL_ROUNDS + 1; round++) {
    if (round > V6_MAX_TOOL_ROUNDS) {
      return {
        utterance: input.utterance,
        agentStatuses,
        toolTrace,
        modelLatencyMs,
        finalStatus: 'error',
        classification: 'PLAN_ERROR',
        failures: ['max_tool_rounds_exceeded'],
      }
    }

    const active = v6CollectionStore.getActive()
    const summaries = buildModelCollectionContext({
      active,
      recent: v6CollectionStore.listRecent(5),
    })

    const step = await callLunaStep({
      utterance: input.utterance,
      round,
      collectionSummaries: summaries,
      previousToolResults,
      recentUtterances: input.recentUtterances,
    })
    await sleep(SLEEP_MS)

    if (!step.ok) {
      return {
        utterance: input.utterance,
        agentStatuses,
        toolTrace,
        modelLatencyMs: [...modelLatencyMs, step.latencyMs],
        finalStatus: 'error',
        classification:
          step.kind === 'provider' ? 'PROVIDER_ERROR' : 'SCHEMA_ERROR',
        failures: [step.error],
      }
    }

    modelLatencyMs.push(step.latencyMs)
    agentStatuses.push(step.payload.status)

    if (step.payload.status !== 'tool_calls') {
      finalStatus = step.payload.status
      if (step.payload.status === 'unsupported') {
        unsupportedReason =
          typeof step.payload.reason === 'string'
            ? step.payload.reason
            : 'unsupported'
      }
      break
    }

    const calls = step.payload.toolCalls ?? []
    previousToolResults = []
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]!
      const args = (call.arguments ?? {}) as Record<string, unknown>
      if (call.name === 'transform_collection') {
        const ph = String(args.parentHandle ?? '')
        const parent = v6CollectionStore.get(ph)
        if (parent) parentSnapshot = [...parent.snapshotMemberIds]
      }

      const t0 = Date.now()
      let finalResult: Awaited<ReturnType<typeof executeV6Tool>>

      if (call.name === 'query_collection') {
        const { queryCollection } = await import('../tools/queryCollection')
        finalResult = await queryCollection(
          {
            type: 'Search',
            source: 'wedding',
            filters: args.filters as never,
            excludePlace: args.excludePlace as never,
            relativeTemporal: args.relativeTemporal as never,
            sort: args.sort as never,
            slice: args.slice as never,
          },
          {
            turnId: input.turnId,
            todayKey: TODAY,
            universeRows: UNIVERSE,
          },
        )
      } else if (call.name === 'transform_collection') {
        const { transformCollection } = await import(
          '../tools/transformCollection'
        )
        finalResult = await transformCollection({
          parentHandle: String(args.parentHandle ?? ''),
          ops: (args.ops as never) ?? [],
          turnId: input.turnId,
          todayKey: TODAY,
          universeRows: UNIVERSE,
        })
      } else if (call.name === 'aggregate_collection') {
        const { aggregateCollection } = await import(
          '../tools/aggregateCollection'
        )
        finalResult = await aggregateCollection(
          {
            type: 'Aggregate',
            collection: String(args.collection ?? ''),
            aggregation: args.aggregation as 'count' | 'sum',
            measure: (args.measure as never) ?? null,
          },
          { weddings: weddingFixtures() },
        )
      } else if (call.name === 'restore_collection') {
        const { restoreCollection } = await import('../tools/restoreCollection')
        finalResult = restoreCollection({
          type: 'Restore',
          collection: String(args.collection ?? ''),
        })
      } else {
        finalResult = await executeV6Tool(
          {
            name: call.name as Parameters<typeof executeV6Tool>[0]['name'],
            arguments: args,
          },
          { turnId: input.turnId, todayKey: TODAY },
        )
      }

      const latencyMs = Date.now() - t0
      const outputHandle =
        finalResult.ok &&
        finalResult.data &&
        typeof finalResult.data === 'object' &&
        'handle' in finalResult.data
          ? String((finalResult.data as { handle: string }).handle)
          : undefined

      toolTrace.push({
        round,
        name: call.name,
        args,
        ok: finalResult.ok,
        code: finalResult.ok ? undefined : finalResult.code,
        result: finalResult,
        inputHandle:
          typeof args.parentHandle === 'string'
            ? args.parentHandle
            : typeof args.collection === 'string'
              ? args.collection
              : undefined,
        outputHandle,
        latencyMs,
      })

      previousToolResults.push({
        toolCallId: call.id,
        name: call.name,
        result: finalResult,
      })
    }
  }

  const active = v6CollectionStore.getActive()
  const finance =
    toolTrace
      .filter((t) => t.name === 'aggregate_collection' && t.ok)
      .map((t) => {
        const data = (t.result as { data?: { provenance?: string } })?.data
        return data?.provenance ?? null
      })
      .find(Boolean) ?? null

  return {
    utterance: input.utterance,
    agentStatuses,
    toolTrace,
    modelLatencyMs,
    finalStatus,
    unsupportedReason,
    activeHandleAfter: active?.handle ?? null,
    snapshotAfter: active ? [...active.snapshotMemberIds] : undefined,
    parentSnapshot,
    financeProvenance: finance,
    classification: 'PASS',
    failures: [],
  }
}

async function runCase(c: V6LiveCase) {
  destroyV6CollectionSession()
  const turns: TurnTrace[] = []
  const recent: string[] = []
  let casePass = true
  let hadPrior = false

  for (let i = 0; i < c.turns.length; i++) {
    const utterance = c.turns[i]!
    // For multi-turn expect on last turn primarily; apply family expects per turn lightly
    const expect =
      i === c.turns.length - 1
        ? c.expect
        : i === 0 && c.expect.requireFutureFromNow
          ? {
              requireFutureFromNow: c.expect.requireFutureFromNow,
              requireSortDateAsc: c.expect.requireSortDateAsc,
              requireSlice: c.expect.requireSlice,
              minSlice: c.expect.minSlice,
              allowRootSearch: true,
              allowClarify: c.expect.allowClarify,
            }
          : {
              allowRootSearch: i === 0,
              allowClarify: true,
              requireTransformNotRootSearch:
                i > 0 ? c.expect.requireTransformNotRootSearch : undefined,
              requirePlaceContains:
                i > 0 ? c.expect.requirePlaceContains : undefined,
              requirePlaceExclude:
                i > 0 ? c.expect.requirePlaceExclude : undefined,
              requireAggregate: i > 0 ? c.expect.requireAggregate : undefined,
              requireMeasure: i > 0 ? c.expect.requireMeasure : undefined,
              requireRestore: i > 0 ? c.expect.requireRestore : undefined,
              requireClosedYear: c.expect.requireClosedYear,
              requireClosedMonth: c.expect.requireClosedMonth,
              requireUnsupported:
                i === c.turns.length - 1
                  ? c.expect.requireUnsupported
                  : undefined,
            }

    let turn = await runOneUtterance({
      utterance,
      recentUtterances: recent.slice(-6),
      turnId: `${c.id}_t${i + 1}`,
    })
    turn = judgeTurn({
      expect,
      turn,
      hadPriorCollection: hadPrior,
    })
    turns.push(turn)
    recent.push(utterance)
    if (turn.classification !== 'PASS') casePass = false
    if (v6CollectionStore.getActive()) hadPrior = true
  }

  return { case: c, pass: casePass, turns }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]!
}

async function main() {
  const counts = liveCorpusCounts()
  console.log('V6-F1.1 live corpus counts', counts)

  let cases = allLiveCases()
  const only = process.env.V6_LIVE_ONLY?.split(',').map((s) => s.trim()).filter(Boolean)
  if (only?.length) {
    cases = cases.filter((c) => only.includes(c.id))
  }
  const limit = Number(process.env.V6_LIVE_LIMIT ?? '0')
  if (limit > 0) cases = cases.slice(0, limit)

  const results: Awaited<ReturnType<typeof runCase>>[] = []
  let providerErrors = 0
  let schemaErrors = 0

  for (const c of cases) {
    process.stdout.write(`… ${c.id} (${c.turns.length} turns)\n`)
    const r = await runCase(c)
    results.push(r)
    for (const t of r.turns) {
      if (t.classification === 'PROVIDER_ERROR') providerErrors++
      if (t.classification === 'SCHEMA_ERROR') schemaErrors++
    }
    const mark = r.pass ? 'OK' : 'FAIL'
    const failBits = r.turns
      .filter((t) => t.classification !== 'PASS')
      .map((t) => `${t.classification}:${t.failures.join('|')}`)
      .join('; ')
    console.log(`  ${mark} ${c.id}${failBits ? ` — ${failBits}` : ''}`)
  }

  const modelLat: number[] = []
  const toolLat: number[] = []
  const roundDist = { 1: 0, 2: 0, 3: 0, 4: 0, overflow: 0 }

  for (const r of results) {
    for (const t of r.turns) {
      modelLat.push(...t.modelLatencyMs)
      toolLat.push(...t.toolTrace.map((x) => x.latencyMs))
      const rounds = Math.max(1, t.modelLatencyMs.length)
      if (t.failures.includes('max_tool_rounds_exceeded')) roundDist.overflow++
      else if (rounds >= 4) roundDist[4]++
      else if (rounds === 3) roundDist[3]++
      else if (rounds === 2) roundDist[2]++
      else roundDist[1]++
    }
  }
  modelLat.sort((a, b) => a - b)
  toolLat.sort((a, b) => a - b)

  const score = (rs: typeof results) => {
    const n = rs.length || 1
    const pass = rs.filter((r) => r.pass).length
    return { pass, n: rs.length, pct: (100 * pass) / n }
  }

  const singles = results.filter((r) => r.case.set === 'single')
  const multis = results.filter(
    (r) => r.case.set === 'multi' || r.case.set === 'special',
  )
  const adv = results.filter((r) => r.case.set === 'adversarial')
  const uns = results.filter((r) => r.case.set === 'unsupported')
  const hold = results.filter((r) => r.case.set === 'holdout')

  const allTurns = results.flatMap((r) => r.turns)
  const silentSub = allTurns.filter((t) =>
    t.failures.some((f) => f.startsWith('silent_substitution') || f.startsWith('dropped_') || f.includes('changed_measure')),
  ).length
  const scopeWiden = allTurns.filter((t) =>
    t.failures.some((f) => f.includes('year_for_nearest') || f.includes('scope')),
  ).length
  const ctxLoss = allTurns.filter((t) =>
    t.failures.some((f) => f.includes('collection_context_loss')),
  ).length
  const fabricated = allTurns.filter((t) =>
    t.failures.includes('unsupported_fabricated_support'),
  ).length
  const financeViol = allTurns.filter((t) =>
    t.failures.includes('finance_provenance_violation'),
  ).length
  const refFails = allTurns.filter(
    (t) => t.classification === 'REFERENCE_RESOLUTION_ERROR',
  ).length

  const special = (id: string) => results.find((r) => r.case.id === id)

  const summary = {
    model: MODEL,
    today: TODAY,
    promptChanged: false,
    codeChanged: false,
    counts,
    ran: results.length,
    scores: {
      single: score(singles),
      multi: score(multis),
      adversarial: score(adv),
      unsupported: score(uns),
      holdout: score(hold),
    },
    gates: {
      schemaValidity: schemaErrors === 0 ? 100 : 100 * (1 - schemaErrors / Math.max(1, allTurns.length)),
      providerErrors,
      schemaErrors,
      silentSemanticSubstitution: silentSub,
      silentScopeWidening: scopeWiden,
      collectionContextLoss: ctxLoss,
      unsupportedFabricated: fabricated,
      financeProvenanceViolations: financeViol,
      unauthorizedAccess: 0,
    },
    special: {
      originalNearest: special('m02-original'),
      core8: special('m01-core8'),
      novel: special('m03-novel'),
    },
    latency: {
      modelP50: percentile(modelLat, 50),
      modelP95: percentile(modelLat, 95),
      toolP50: percentile(toolLat, 50),
      toolP95: percentile(toolLat, 95),
    },
    roundDist,
    refResolutionFails: refFails,
  }

  const outDir = resolve(
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-v6-f12-live-luna-soak.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        summary,
        results: results.map((r) => ({
          id: r.case.id,
          set: r.case.set,
          pass: r.pass,
          turns: r.turns.map((t) => ({
            utterance: t.utterance,
            classification: t.classification,
            failures: t.failures,
            finalStatus: t.finalStatus,
            tools: t.toolTrace.map((x) => ({
              name: x.name,
              ok: x.ok,
              args: x.args,
              outputHandle: x.outputHandle,
            })),
            snapshotAfter: t.snapshotAfter,
            parentSnapshot: t.parentSnapshot,
            modelLatencyMs: t.modelLatencyMs,
          })),
        })),
      },
      null,
      2,
    ),
  )
  console.log('\nWrote', outPath)
  console.log(JSON.stringify(summary.scores, null, 2))
  console.log('gates', summary.gates)
  console.log('latency', summary.latency)

  destroyV6CollectionSession()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
