/**
 * Phase 2.6 — Fair interpreter model A/B (interpretation only).
 *
 * Usage:
 *   OURWED_ACCESS_TOKEN=... OURWED_V4_EVAL_SECRET=... \
 *   npx tsx --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/benchmark/runModelAB.ts
 *
 * Optional:
 *   V4_AB_MODELS=gpt-4.1-mini,gpt-4.1
 *   V4_AB_SKIP_REPEAT=1
 *   V4_AB_LIMIT=0          # 0 = full
 *
 * Freeze: identical prompt/schema/corpus/settings; only model changes.
 * Does NOT change product default model.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchTaskSpecExpectation } from '../expect'
import { parseFlatTaskSpecPayload } from '../taskSpecSchema'
import type { AssistantTaskSpec } from '../taskSpec'
import { makeTaskSpec } from '../expect'
import { resolveTaskSpec } from '../resolver/resolve'
import {
  emptyV4ShadowContext,
  type V4ShadowContext,
} from '../resolver/types'
import { ASSISTANT_V4_BENCHMARK_CORPUS } from './corpus'
import { ASSISTANT_V4_HOLDOUT_CORPUS } from './holdoutCorpus'
import { ASSISTANT_V4_MULTITURN_AB_CORPUS } from './multiTurnAbCorpus'
import { ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS } from './subjectDistanceCorpus'
import { ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT } from './holdoutSubjectDistance'
import {
  ASSISTANT_V4_MT_SUBJECT_DEV,
  ASSISTANT_V4_MT_SUBJECT_HOLDOUT,
} from './multiTurnSubjectCorpus'
import { scoreCorrectedEndState } from './endStateScore'
import { CORRECTION_PROTOCOL_REVIEW } from './protocolReview'
import { SUBJECT_DISTANCE_CONTRACT_V27 } from './subjectDistanceContract'
import {
  aggregatePhase26,
  formatPhase26,
  type Phase26CaseScore,
} from './metricsPhase26'
import type { AssistantBenchmarkCase } from './corpus'

function env(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v || undefined
}

function correctionCategory(
  c: AssistantBenchmarkCase,
): Phase26CaseScore['correctionCategory'] {
  if (c.expected.taskSpec.forbidCorrection) return 'negative'
  const slot = c.expected.taskSpec.correctionSlot
  if (slot === 'participant') return 'participant'
  if (slot === 'metric') return 'metric'
  if (slot === 'temporal') return 'temporal'
  if (slot === 'subject') return 'subject'
  if (slot === 'resource') return 'resource'
  if (c.tags?.includes('rank') || c.expected.taskSpec.rank) return 'rank'
  if (c.expected.taskSpec.requireCorrection) return 'other'
  return undefined
}

function shadowFromCase(c: AssistantBenchmarkCase): V4ShadowContext {
  const ctx = emptyV4ShadowContext()
  const sc = c.input.semanticContext
  if (!sc) return ctx
  if (sc.activeResourceKind === 'wedding') {
    ctx.activeResource = {
      kind: 'wedding',
      id: 'bench-w',
      label: 'Bench Wedding',
    }
  }
  if (sc.activeResourceKind === 'session') {
    ctx.activeResource = {
      kind: 'session',
      id: 'bench-s',
      label: 'Bench Session',
    }
  }
  if (sc.previousTask) {
    const pt = sc.previousTask
    ctx.previousTaskSpec = makeTaskSpec({
      op: (pt.op as AssistantTaskSpec['op']) ?? 'get',
      subject: pt.subject ?? null,
      resource: pt.resourceKind
        ? ({ kind: pt.resourceKind } as AssistantTaskSpec['resource'])
        : { kind: 'active_resource' },
      participant: pt.participantValue
        ? { kind: 'explicit', value: pt.participantValue }
        : null,
      temporal: pt.temporalPhrase
        ? { phrase: pt.temporalPhrase, kind: 'day' }
        : null,
      qualifiers: {
        aspect: pt.aspect ?? null,
        rank: pt.rank ?? null,
        destination: pt.destination ?? null,
        titleHint: null,
        unsupportedReason: null,
      },
    })
  } else if (sc.previousOp) {
    ctx.previousTaskSpec = makeTaskSpec({
      op: sc.previousOp,
      subject: sc.previousSubject ?? null,
      resource: { kind: 'active_resource' },
      participant: sc.activeParticipantHint
        ? { kind: 'explicit', value: sc.activeParticipantHint }
        : null,
      temporal: sc.lastTemporalPhrase
        ? { phrase: sc.lastTemporalPhrase, kind: 'day' }
        : null,
    })
  }
  if (sc.hasSequenceContext) {
    ctx.sequenceCursor = { kind: 'day_plan' }
  }
  return ctx
}

const KNOWN_PO = [
  { id: 'where-today', match: (t: string) => /gdzie dzisiaj jadę/i.test(t) },
  {
    id: 'maksymilian',
    match: (t: string) => /szykuje się Maksymilian/i.test(t),
  },
  {
    id: 'bartek-maks',
    match: (t: string) => /miałem na myśli Maksa/i.test(t),
  },
  { id: 'a-julka', match: (t: string) => /^a Julka\?$/i.test(t.trim()) },
  {
    id: 'ceremony-after-prep',
    match: (t: string) => /a ślub o której będzie/i.test(t),
  },
  { id: 'potem', match: (t: string) => /a co potem\?/i.test(t) },
  {
    id: 'distance-prep',
    match: (t: string) => /daleko mam na przygotowania Julii/i.test(t),
  },
  { id: 'do-kiedy', match: (t: string) => /^do kiedy\?$/i.test(t.trim()) },
  {
    id: 'metric-corr',
    match: (t: string) => /nie wartość.*wpłac/i.test(t),
  },
  {
    id: 'temporal-corr',
    match: (t: string) => /nie jutro.*sobot/i.test(t),
  },
] as const

async function main() {
  const url = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL') ??
    'https://xyycwllsovpxlcustpcv.supabase.co'
  const anon =
    env('VITE_SUPABASE_ANON_KEY') ??
    env('SUPABASE_ANON_KEY') ??
    env('VITE_SUPABASE_PUBLISHABLE_KEY')
  const accessToken = env('OURWED_ACCESS_TOKEN')
  const evalSecret =
    env('OURWED_V4_EVAL_SECRET') ??
    (() => {
      try {
        return readFileSync('/tmp/ourwed-v4-eval.secret', 'utf8').trim()
      } catch {
        return undefined
      }
    })()

  if (!anon || !accessToken) {
    console.error('Need anon key + OURWED_ACCESS_TOKEN')
    process.exit(1)
  }
  if (!evalSecret) {
    console.error('Need OURWED_V4_EVAL_SECRET (or /tmp/ourwed-v4-eval.secret)')
    process.exit(1)
  }

    const models = (
    env('V4_AB_MODELS') ?? 'gpt-4.1'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const outDir = resolve(
    env('V4_AB_OUT') ?? '/tmp/ourwed-v4-model-ab',
  )
  mkdirSync(outDir, { recursive: true })

  const focusedOnly = env('V4_AB_FOCUSED_ONLY') === '1'
  const development = focusedOnly
    ? [...ASSISTANT_V4_MT_SUBJECT_DEV]
    : [
        ...ASSISTANT_V4_BENCHMARK_CORPUS,
        ...ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS,
        ...ASSISTANT_V4_MT_SUBJECT_DEV,
      ]
  const holdout = focusedOnly
    ? [...ASSISTANT_V4_MT_SUBJECT_HOLDOUT]
    : [
        ...ASSISTANT_V4_HOLDOUT_CORPUS,
        ...ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT,
        ...ASSISTANT_V4_MT_SUBJECT_HOLDOUT,
      ]
  const multiturn = focusedOnly ? [] : [...ASSISTANT_V4_MULTITURN_AB_CORPUS]

  // Dedupe by id (subject suite may overlap known PO phrases with different ids)
  const dedupe = (cases: typeof development) => {
    const m = new Map<string, (typeof cases)[0]>()
    for (const c of cases) m.set(c.id, c)
    return [...m.values()]
  }
  const developmentUnique = dedupe(development)
  const holdoutUnique = dedupe(holdout)

  // Dedupe multiturn ids that already exist in development
  const developmentCases = developmentUnique
  const holdoutCases = holdoutUnique
  const devIds = new Set(developmentCases.map((c) => c.id))
  const multiturnExtra = multiturn.filter((c) => !devIds.has(c.id))

  const limit = Number(env('V4_AB_LIMIT') ?? '0')
  const skipRepeat = env('V4_AB_SKIP_REPEAT') === '1'

  const hardSubset = [
    ...ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS.filter(
      (c) =>
        c.expected.taskSpec.op === 'get_distance' ||
        (Array.isArray(c.expected.taskSpec.op) &&
          c.expected.taskSpec.op.includes('get_distance')),
    ),
    ...developmentCases.filter((c) => c.expected.taskSpec.requireCorrection),
  ]
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    .slice(0, 20)

  type PlanItem = {
    case: AssistantBenchmarkCase
    split: Phase26CaseScore['corpusSplit']
    run: number
  }

  const plan: PlanItem[] = []
  const pushAll = (
    cases: AssistantBenchmarkCase[],
    split: Phase26CaseScore['corpusSplit'],
  ) => {
    let list = cases
    if (limit > 0) list = list.slice(0, limit)
    for (const c of list) plan.push({ case: c, split, run: 1 })
  }

  pushAll(developmentCases, 'development')
  pushAll(holdoutCases, 'holdout')
  pushAll(multiturnExtra, 'multiturn')
  if (!skipRepeat) {
    for (const c of hardSubset) {
      for (let run = 1; run <= 3; run++) {
        plan.push({ case: c, split: 'repeatability', run })
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        models,
        focusedOnly,
        development: developmentCases.length,
        holdout: holdoutCases.length,
        subjectSuite: ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS.length,
        subjectHoldout: ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT.length,
        mtSubjectDev: ASSISTANT_V4_MT_SUBJECT_DEV.length,
        mtSubjectHoldout: ASSISTANT_V4_MT_SUBJECT_HOLDOUT.length,
        multiturnExtra: multiturnExtra.length,
        hardRepeat: skipRepeat ? 0 : hardSubset.length * 3,
        planSize: plan.length,
        callsApprox: plan.length * models.length,
        contract: SUBJECT_DISTANCE_CONTRACT_V27.version,
        protocolReview: CORRECTION_PROTOCOL_REVIEW.version,
      },
      null,
      2,
    ),
  )

  const accessTokenRef = { current: accessToken }
  const refreshAccessToken = async (): Promise<boolean> => {
    try {
      const { execFileSync } = await import('node:child_process')
      execFileSync('node', ['/tmp/ourwed-mint-v4-token.cjs'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      accessTokenRef.current = readFileSync(
        '/tmp/ourwed-v4-access.token',
        'utf8',
      ).trim()
      console.log('[auth] refreshed OURWED_ACCESS_TOKEN')
      return Boolean(accessTokenRef.current)
    } catch (e) {
      console.warn('[auth] refresh failed', e instanceof Error ? e.message : e)
      return false
    }
  }

  // Proactive refresh if JWT likely <25min remaining (eval-only).
  try {
    const parts = accessTokenRef.current.split('.')
    if (parts[1]) {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { exp?: number }
      const left = (payload.exp ?? 0) * 1000 - Date.now()
      if (left < 25 * 60 * 1000) await refreshAccessToken()
    }
  } catch {
    /* ignore */
  }

  async function interpret(
    model: string,
    utterance: string,
    semanticContextSummary: unknown,
  ): Promise<{
    ok: boolean
    taskSpec: ReturnType<typeof parseFlatTaskSpecPayload>
    latencyMs: number
    error?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    modelUsed?: string
  }> {
    const maxAttempts = 5
    let last: {
      ok: boolean
      taskSpec: ReturnType<typeof parseFlatTaskSpecPayload>
      latencyMs: number
      error?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number }
      modelUsed?: string
    } | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now()
      const res = await fetch(`${url}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessTokenRef.current}`,
          apikey: anon!,
          'Content-Type': 'application/json',
          'x-ourwed-v4-eval': evalSecret!,
        },
        body: JSON.stringify({
          mode: 'v4_interpret',
          utterance,
          locale: 'pl-PL',
          semanticContextSummary,
          // Prefer server V4 default (gpt-4.1). Eval override only when forced.
          ...(env('V4_AB_FORCE_EVAL') === '1'
            ? { evalModel: model, evalAuth: evalSecret }
            : {}),
        }),
      })
      const latencyMs = Date.now() - started
      const body = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null
      if (!body || body.status !== 'task_spec') {
        const code =
          typeof body?.code === 'string'
            ? body.code
            : `http_${res.status}`
        last = {
          ok: false,
          taskSpec: null,
          latencyMs,
          error: code,
        }
        const authFail =
          code === 'unauthorized' ||
          code === 'UNAUTHORIZED_ASYMMETRIC_JWT' ||
          res.status === 401
        if (authFail && attempt < maxAttempts) {
          const refreshed = await refreshAccessToken()
          if (refreshed) continue
        }
        if (
          (code === 'provider_rate_limit' || res.status === 429) &&
          attempt < maxAttempts
        ) {
          const wait = 1500 * attempt + Math.floor(Math.random() * 500)
          await new Promise((x) => setTimeout(x, wait))
          continue
        }
        return last
      }
      const taskSpec = parseFlatTaskSpecPayload(body.taskSpec)
      const diagnostics =
        body.diagnostics && typeof body.diagnostics === 'object'
          ? (body.diagnostics as Record<string, unknown>)
          : null
      const usage =
        diagnostics?.usage && typeof diagnostics.usage === 'object'
          ? (diagnostics.usage as {
              prompt_tokens?: number
              completion_tokens?: number
            })
          : undefined
      return {
        ok: Boolean(taskSpec),
        taskSpec,
        latencyMs,
        error: taskSpec ? undefined : 'schema_validation_failed',
        usage,
        modelUsed:
          typeof diagnostics?.model === 'string' ? diagnostics.model : model,
      }
    }
    return last!
  }

  const report: Record<string, unknown> = {
    phase: '2.6',
    frozen: {
      prompt: 'V4_INTERPRETER_SYSTEM_PROMPT',
      schema: 'ASSISTANT_V4_TASKSPEC_JSON_SCHEMA',
      temperature: 0,
      max_tokens: 800,
      resolver: 'frozen',
      protocolReview: CORRECTION_PROTOCOL_REVIEW,
      subjectDistanceContract: SUBJECT_DISTANCE_CONTRACT_V27,
    },
    truthAudit: {
      casesChangedBeforeFreeze: [
        'Removed one-endpoint destination requirements when subject already names the endpoint (dist-julia, dist-ceremony, mt-morphology-t4, mt-prep reception distance).',
        'Canonicalized one-endpoint distance subject away from route|domain unions toward domain subject.',
        'Ellipsis el-gdzie/el-ile allow inherit|get_*.',
        'sf-next-action allows get_next.',
        'pad-route-prep allows get|get_distance with route|preparations.',
        'holdout distance subjects canonicalized to preparations/reception.',
      ],
      casesExcludedAmbiguous: [],
      developmentSize: developmentCases.length,
      holdoutSize: holdoutCases.length,
      multiturnExtraSize: multiturnExtra.length,
      subjectSuite: ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS.length,
      subjectHoldout: ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT.length,
    },
    models: {},
  }

  for (const model of models) {
    console.log(`\n=== MODEL ${model} ===`)
    const scores: Phase26CaseScore[] = []
    const failures: Array<Record<string, unknown>> = []
    const knownPo: Record<string, { pass: boolean; brief: string }> = {}
    const resolverStats = {
      n: 0,
      resolvedOk: 0,
      correctionApplied: 0,
      correctionN: 0,
      inheritOk: 0,
      inheritN: 0,
      overridePreserved: 0,
      overrideN: 0,
      falseClarification: 0,
      falseDiscovery: 0,
    }

    let i = 0
    for (const item of plan) {
      i += 1
      const c = item.case
      if (i % 25 === 0) {
        console.log(`  ${model} progress ${i}/${plan.length}`)
      }
      const r = await interpret(
        model,
        c.input.userText,
        c.input.semanticContext ?? null,
      )
      const match = r.taskSpec
        ? matchTaskSpecExpectation(r.taskSpec, c.expected.taskSpec)
        : null
      const end = r.taskSpec
        ? scoreCorrectedEndState(
            r.taskSpec,
            c.expected.taskSpec,
            c.tags ?? [],
          )
        : null
      const expectedCorrection =
        c.expected.taskSpec.requireCorrection === true ||
        c.expected.taskSpec.op === 'correction'
      const actualCorrection = r.taskSpec?.op === 'correction'

      const score: Phase26CaseScore = {
        id: item.run > 1 ? `${c.id}#r${item.run}` : c.id,
        category: c.category,
        ok: Boolean(match?.ok),
        latencyMs: r.latencyMs,
        schemaOk: Boolean(r.taskSpec),
        match,
        error: r.error,
        expectedCorrection,
        actualCorrection: Boolean(actualCorrection),
        corpusSplit: item.split,
        correctionCategory: correctionCategory(c),
        relationOk: end?.relationOk,
        patchOk: end?.patchOk,
        endStateOk: end?.endStateOk,
        functionalEquivalent: end?.functionalEquivalent,
        resourceOk:
          match == null
            ? undefined
            : !match.diffs.some((d) => d.field === 'resourceKind'),
        qualifierOk:
          match == null
            ? undefined
            : !match.diffs.some((d) =>
                ['aspect', 'rank', 'destination'].includes(d.field),
              ),
        inputTokens: r.usage?.prompt_tokens ?? null,
        outputTokens: r.usage?.completion_tokens ?? null,
        model: r.modelUsed ?? model,
        actualOp: r.taskSpec?.op,
        expectedOp: Array.isArray(c.expected.taskSpec.op)
          ? c.expected.taskSpec.op.join('|')
          : String(c.expected.taskSpec.op ?? ''),
        diffs: match?.diffs,
      }
      scores.push(score)

      if (!score.ok) {
        failures.push({
          id: score.id,
          split: item.split,
          text: c.input.userText,
          diffs: match?.diffs ?? r.error,
          actual: r.taskSpec
            ? {
                op: r.taskSpec.op,
                subject: r.taskSpec.subject,
                participant: r.taskSpec.participant,
                temporal: r.taskSpec.temporal,
                correction: r.taskSpec.correction,
                resource: r.taskSpec.resource,
              }
            : null,
          end,
        })
      }

      for (const po of KNOWN_PO) {
        if (po.match(c.input.userText) && item.run === 1) {
          knownPo[po.id] = {
            pass: Boolean(match?.ok || end?.endStateOk),
            brief: r.taskSpec
              ? `${r.taskSpec.op}/${r.taskSpec.subject ?? 'null'}`
              : r.error ?? 'fail',
          }
        }
      }

      // Resolver impact (frozen)
      if (r.taskSpec) {
        resolverStats.n += 1
        const shadow = shadowFromCase(c)
        const resolved = resolveTaskSpec(r.taskSpec, shadow)
        if (resolved.status === 'resolved') resolverStats.resolvedOk += 1
        if (resolved.status === 'needs_clarification') {
          resolverStats.falseClarification += 1
        }
        if (resolved.status === 'requires_discovery') {
          resolverStats.falseDiscovery += 1
        }
        if (expectedCorrection) {
          resolverStats.correctionN += 1
          if (r.taskSpec.op === 'correction' && resolved.status === 'resolved') {
            resolverStats.correctionApplied += 1
          } else if (
            end?.endStateOk &&
            resolved.status === 'resolved'
          ) {
            resolverStats.correctionApplied += 1
          }
        }
        if (
          c.expected.taskSpec.requireInheritSignal ||
          c.expected.taskSpec.op === 'inherit'
        ) {
          resolverStats.inheritN += 1
          if (resolved.status === 'resolved') resolverStats.inheritOk += 1
        }
        if (
          c.expected.taskSpec.requireExplicitSubject ||
          c.expected.taskSpec.forbidCorrection
        ) {
          resolverStats.overrideN += 1
          if (match?.scores.operation && resolved.status !== 'needs_clarification') {
            resolverStats.overridePreserved += 1
          }
        }
      }

      await new Promise((x) => setTimeout(x, Number(env('V4_AB_DELAY_MS') ?? '200')))
    }

    const all = aggregatePhase26(scores)
    const dev = aggregatePhase26(
      scores.filter((s) => s.corpusSplit === 'development'),
    )
    const ho = aggregatePhase26(
      scores.filter((s) => s.corpusSplit === 'holdout'),
    )
    const mt = aggregatePhase26(
      scores.filter((s) => s.corpusSplit === 'multiturn'),
    )

    // Repeatability: same id root consistency across runs
    const byRoot = new Map<string, string[]>()
    for (const s of scores.filter((x) => x.corpusSplit === 'repeatability')) {
      const root = s.id.replace(/#r\d+$/, '')
      const key = `${s.actualOp}|${s.match?.scores.subject}|${s.actualCorrection}`
      if (!byRoot.has(root)) byRoot.set(root, [])
      byRoot.get(root)!.push(key)
    }
    let consistent = 0
    for (const keys of byRoot.values()) {
      if (keys.length >= 2 && keys.every((k) => k === keys[0])) consistent += 1
    }
    const consistencyRate =
      byRoot.size === 0 ? 1 : consistent / byRoot.size

    // Multi-turn conversation consistency
    const convoIds = new Set(
      multiturnExtra.map((c) => c.conversationId).filter(Boolean) as string[],
    )
    let convoOk = 0
    for (const cid of convoIds) {
      const turns = scores.filter(
        (s) =>
          s.corpusSplit === 'multiturn' &&
          multiturnExtra.find((c) => c.id === s.id)?.conversationId === cid,
      )
      if (turns.length && turns.every((t) => t.ok || t.endStateOk)) convoOk += 1
    }

    const modelReport = {
      model,
      metricsAll: all,
      metricsDevelopment: dev,
      metricsHoldout: ho,
      metricsMultiturn: mt,
      metricsFormatted: {
        all: formatPhase26(all),
        development: formatPhase26(dev),
        holdout: formatPhase26(ho),
      },
      resolverImpact: {
        resolvedTaskAccuracy:
          resolverStats.n === 0 ? 1 : resolverStats.resolvedOk / resolverStats.n,
        correctionApplicationAccuracy:
          resolverStats.correctionN === 0
            ? 1
            : resolverStats.correctionApplied / resolverStats.correctionN,
        inheritanceResolutionAccuracy:
          resolverStats.inheritN === 0
            ? 1
            : resolverStats.inheritOk / resolverStats.inheritN,
        explicitOverridePreservationRate:
          resolverStats.overrideN === 0
            ? 1
            : resolverStats.overridePreserved / resolverStats.overrideN,
        falseClarificationRate:
          resolverStats.n === 0
            ? 0
            : resolverStats.falseClarification / resolverStats.n,
        falseDiscoveryRate:
          resolverStats.n === 0
            ? 0
            : resolverStats.falseDiscovery / resolverStats.n,
      },
      knownPo,
      repeatability: {
        hardCases: byRoot.size,
        runsPerCase: 3,
        semanticConsistencyRate: consistencyRate,
      },
      multiturn: {
        conversations: convoIds.size,
        conversationsFullyOkOrEndState: convoOk,
      },
      failures: failures.slice(0, 80),
      failureCount: failures.length,
      scores: scores.map((s) => ({
        id: s.id,
        split: s.corpusSplit,
        ok: s.ok,
        op: s.actualOp,
        corr: s.actualCorrection,
        end: s.endStateOk,
        rel: s.relationOk,
        patch: s.patchOk,
        lat: s.latencyMs,
        inTok: s.inputTokens,
        outTok: s.outputTokens,
        err: s.error,
      })),
    }

    ;(report.models as Record<string, unknown>)[model] = modelReport
    writeFileSync(
      resolve(outDir, `model-${model.replace(/[^a-z0-9.-]/gi, '_')}.json`),
      JSON.stringify(modelReport, null, 2),
    )
    console.log(formatPhase26(all))
    console.log('holdout:\n' + formatPhase26(ho))
  }

  writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outDir}/report.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
