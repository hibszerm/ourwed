/**
 * S4B — Live Luna query-family qualification (local OpenAI; no Edge deploy).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/goalSpec/runS4bLunaQueryFamilyQualification.ts
 *
 * Never prints API key. Focused corpus only (~28). Model: gpt-5.6-luna.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery } from '../domainQuery/domainQuery'
import { adaptGoalSpecToGoalEnvelope } from './adaptGoalSpecToGoalEnvelope'
import { isQueryGoal } from './goalEnvelope'
import type { GoalSpec } from './goalSpec'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import {
  ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
  parseFlatGoalSpecPayload,
} from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import { clearGoalClarificationSession } from './goalClarificationSession'
import { bindGoalSpecWithClarification } from './resumeGoalClarification'
import { validateGoalSpecConsistency } from './validateGoalSpec'
import {
  S4B_QUERY_FAMILY_QUAL_CORPUS,
  s4bCorpusStats,
  type S4bQualCase,
} from './s4bQueryFamilyQualificationCorpus'

const MODEL = 'gpt-5.6-luna'
const TODAY = '2026-09-13'

type LiveCall =
  | { ok: true; goal: GoalSpec; latencyMs: number }
  | { ok: false; kind: 'provider' | 'schema'; error: string; latencyMs: number }

type PipelineSnap = {
  status: string
  slot: string | null
  reason: string | null
  measure: string | null
  aggregation: string | null
  dateFrom: string | null
}

async function callLuna(
  utterance: string,
  semanticContext: unknown,
): Promise<LiveCall> {
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
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: 900,
      messages: [
        { role: 'system', content: V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            utterance,
            semanticContextSummary: semanticContext,
            locale: 'pl-PL',
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'assistant_v5_goal_spec',
          strict: true,
          schema: ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
        },
      },
    }),
  })
  const latencyMs = Date.now() - started
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const code = body?.error?.code ?? body?.error?.type ?? `http_${res.status}`
    return {
      ok: false,
      kind: 'provider',
      error: `provider_${res.status}_${String(code)}`,
      latencyMs,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { ok: false, kind: 'provider', error: 'empty_content', latencyMs }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, kind: 'schema', error: 'json_parse', latencyMs }
  }
  const goal = parseFlatGoalSpecPayload(parsed)
  if (!goal) {
    return { ok: false, kind: 'schema', error: 'schema_error', latencyMs }
  }
  return {
    ok: true,
    goal: normalizeGoalSpecTemporal(goal, TODAY),
    latencyMs,
  }
}

function activeFromContext(semanticContext: unknown) {
  const summary =
    semanticContext &&
    typeof semanticContext === 'object' &&
    'previousGoalSummary' in (semanticContext as object)
      ? (
          semanticContext as {
            previousGoalSummary?: {
              aggregation?: string
              measure?: string
              placeName?: string
              temporalExpression?: string
            }
          }
        ).previousGoalSummary
      : null
  if (!summary) return null
  // DomainQuery list projection uses aggregate=null (see bindGoalSpec mapDomainQueryAggregate).
  const rawAgg = summary.aggregation
  const aggregate =
    rawAgg === 'sum' || rawAgg === 'count'
      ? rawAgg
      : rawAgg === 'list'
        ? null
        : null
  return emptyDomainQuery({
    source: 'wedding',
    aggregate,
    measure: (summary.measure as 'wedding.paid_amount' | null) ?? null,
    dateBinding:
      summary.temporalExpression === 'sierpień'
        ? { dimension: 'wedding.date', range: { from: '2026-08-01', to: '2026-08-31' } }
        : null,
    relations: summary.placeName
      ? [
          {
            relation: 'place',
            field: 'place.name',
            op: 'eq',
            value: summary.placeName,
          },
        ]
      : [],
  })
}

function pipeline(
  goal: GoalSpec,
  policy: 'full' | 'thin',
  semanticContext: unknown,
): PipelineSnap {
  clearGoalClarificationSession()
  const v = validateGoalSpecConsistency(goal, undefined, { policy })
  const bound = bindGoalSpecWithClarification({
    goal: v.goal,
    storePending: false,
    activeCollectionQuery: activeFromContext(semanticContext),
  })
  if (bound.status === 'needs_clarification') {
    return {
      status: 'needs_clarification',
      slot: bound.request.slot,
      reason: null,
      measure: v.goal.measure,
      aggregation: v.goal.aggregation,
      dateFrom: null,
    }
  }
  if (bound.status === 'unsupported') {
    return {
      status: 'unsupported',
      slot: null,
      reason: bound.reason ?? null,
      measure: v.goal.measure,
      aggregation: v.goal.aggregation,
      dateFrom: null,
    }
  }
  if (bound.status === 'bound') {
    return {
      status: 'bound',
      slot: null,
      reason: null,
      measure: bound.query.measure ?? null,
      aggregation: bound.query.aggregate ?? null,
      dateFrom: bound.query.dateBinding?.range.from ?? null,
    }
  }
  // bindGoalSpecWithClarification is a closed union; all statuses handled above.
  const _never: never = bound
  void _never
  return {
    status: 'unsupported',
    slot: null,
    reason: 'unexpected_bind_status',
    measure: v.goal.measure,
    aggregation: v.goal.aggregation,
    dateFrom: null,
  }
}

function hasMeasureAmbiguity(goal: GoalSpec): boolean {
  return goal.ambiguities.some((a) => a.slot === 'measure')
}

function placeText(goal: GoalSpec): string | null {
  for (const r of goal.relations) {
    if (r.relation === 'place' && r.field === 'place.name') {
      const v = r.value
      if (v && typeof v === 'object' && 'text' in v && typeof v.text === 'string') {
        return v.text
      }
      if (typeof v === 'string') return v
    }
  }
  for (const t of goal.targets) {
    if (t.kind === 'named' && t.ref.kindHint === 'venue') return t.ref.text
  }
  return null
}

function temporalText(goal: GoalSpec): string | null {
  return goal.temporal?.expression ?? null
}

function scoreCase(c: S4bQualCase, goal: GoalSpec) {
  const familyOk = goal.requestKind === c.expectedFamily
  const incompleteFamilyOk = c.incompleteSupportedQuery
    ? goal.requestKind === 'domain_query'
    : true
  const falsePromo =
    c.falsePromotionSensitive && goal.requestKind === 'domain_query'

  const measureGuess =
    c.expectMeasureAmbiguity &&
    goal.measure != null &&
    goal.measure.length > 0

  const measureOk =
    c.expectMeasure === undefined
      ? true
      : c.expectMeasure === null
        ? goal.measure == null
        : goal.measure === c.expectMeasure

  const ambOk = c.expectMeasureAmbiguity
    ? goal.measure == null && hasMeasureAmbiguity(goal)
    : true

  const aggOk =
    c.expectAggregation === undefined
      ? true
      : goal.aggregation === c.expectAggregation

  const temporal = temporalText(goal)
  const temporalOk =
    !c.expectTemporalContains ||
    (typeof temporal === 'string' &&
      temporal.toLowerCase().includes(c.expectTemporalContains.toLowerCase()))

  const dialogueOk =
    !c.expectDialogue || goal.dialogue === c.expectDialogue

  const place = placeText(goal)
  const placeOk =
    !c.expectPlaceContains ||
    (typeof place === 'string' && place.includes(c.expectPlaceContains))

  const env = adaptGoalSpecToGoalEnvelope(goal)
  const envelopeOk =
    c.expectedFamily === 'domain_query'
      ? isQueryGoal(env)
      : !isQueryGoal(env)

  return {
    familyOk,
    incompleteFamilyOk,
    falsePromo,
    measureGuess,
    measureOk,
    ambOk,
    aggOk,
    temporalOk,
    dialogueOk,
    placeOk,
    envelopeOk,
    envKind: isQueryGoal(env) ? 'QueryGoal' : 'NonQueryGoal',
    temporal,
    place,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log('S4B live SKIPPED — missing OPENAI_API_KEY')
    process.exitCode = 2
    return
  }

  const stats = s4bCorpusStats()
  console.log('S4B Luna query-family qualification')
  console.log(JSON.stringify({ model: MODEL, corpus: stats }))

  const rows: Array<Record<string, unknown>> = []
  let apiCalls = 0
  let schemaOk = 0
  let providerErr = 0
  let schemaErr = 0

  let familyHits = 0
  let familyN = 0
  let incompleteHits = 0
  let incompleteN = 0
  let falsePromo = 0
  let measureHits = 0
  let measureN = 0
  let ambHits = 0
  let ambN = 0
  let temporalHits = 0
  let temporalN = 0
  let dialogueHits = 0
  let dialogueN = 0
  let placeHits = 0
  let placeN = 0
  let measureGuesses = 0
  let fullThinAgree = 0
  let fullThinN = 0
  let envelopeHits = 0
  let envelopeN = 0
  let binderClarifyMeasure = 0
  let binderBound = 0
  let binderUnsupported = 0

  for (const c of S4B_QUERY_FAMILY_QUAL_CORPUS) {
    apiCalls += 1
    const live = await callLuna(c.utterance, c.semanticContext)
    if (!live.ok) {
      if (live.kind === 'provider') providerErr += 1
      else schemaErr += 1
      rows.push({
        id: c.id,
        class: c.class,
        ok: false,
        error: live.error,
        kind: live.kind,
        latencyMs: live.latencyMs,
      })
      console.log(`  FAIL ${c.id}: ${live.kind} ${live.error}`)
      await sleep(200)
      continue
    }
    schemaOk += 1
    const goal = live.goal
    const sc = scoreCase(c, goal)
    const full = pipeline(goal, 'full', c.semanticContext)
    const thin = pipeline(goal, 'thin', c.semanticContext)
    fullThinN += 1
    const agree =
      full.status === thin.status &&
      full.slot === thin.slot &&
      (full.status !== 'bound' ||
        (full.measure === thin.measure &&
          full.aggregation === thin.aggregation))
    if (agree) fullThinAgree += 1

    familyN += 1
    if (sc.familyOk) familyHits += 1
    if (c.incompleteSupportedQuery) {
      incompleteN += 1
      if (sc.incompleteFamilyOk) incompleteHits += 1
    }
    if (sc.falsePromo) falsePromo += 1
    if (c.expectMeasure !== undefined) {
      measureN += 1
      if (sc.measureOk) measureHits += 1
    }
    if (c.expectMeasureAmbiguity) {
      ambN += 1
      if (sc.ambOk) ambHits += 1
    }
    if (c.expectTemporalContains) {
      temporalN += 1
      if (sc.temporalOk) temporalHits += 1
    }
    if (c.expectDialogue) {
      dialogueN += 1
      if (sc.dialogueOk) dialogueHits += 1
    }
    if (c.expectPlaceContains) {
      placeN += 1
      if (sc.placeOk) placeHits += 1
    }
    if (sc.measureGuess) measureGuesses += 1
    envelopeN += 1
    if (sc.envelopeOk) envelopeHits += 1

    if (thin.status === 'needs_clarification' && thin.slot === 'measure') {
      binderClarifyMeasure += 1
    } else if (thin.status === 'bound') binderBound += 1
    else if (thin.status === 'unsupported') binderUnsupported += 1

    rows.push({
      id: c.id,
      class: c.class,
      utterance: c.utterance,
      ok: true,
      requestKind: goal.requestKind,
      aggregation: goal.aggregation,
      measure: goal.measure,
      dialogue: goal.dialogue,
      temporalExpression: temporalText(goal),
      placeName: placeText(goal),
      ambiguitySlots: goal.ambiguities.map((a) => a.slot),
      score: sc,
      full,
      thin,
      fullThinAgree: agree,
      latencyMs: live.latencyMs,
    })

    const mark =
      sc.familyOk &&
      sc.incompleteFamilyOk &&
      !sc.falsePromo &&
      !sc.measureGuess &&
      sc.envelopeOk
        ? 'OK'
        : 'WEAK'
    console.log(
      `  ${mark} ${c.id}: kind=${goal.requestKind} agg=${goal.aggregation} measure=${goal.measure}` +
        ` amb=[${goal.ambiguities.map((a) => a.slot).join(',')}]` +
        ` full=${full.status}${full.slot ? `(${full.slot})` : ''}` +
        ` thin=${thin.status}${thin.slot ? `(${thin.slot})` : ''}` +
        ` env=${sc.envKind}`,
    )
    await sleep(250)
  }

  const metrics = {
    schemaSuccessRate: schemaOk / Math.max(1, apiCalls),
    schemaOk,
    schemaErr,
    providerErr,
    apiCalls,
    requestFamilyAccuracy: familyHits / Math.max(1, familyN),
    incompleteQueryFamilyAccuracy: incompleteHits / Math.max(1, incompleteN),
    incompleteN,
    incompleteHits,
    falseQueryFamilyPromotion: falsePromo,
    measureCorrectness: measureHits / Math.max(1, measureN),
    ambiguityCorrectness: ambHits / Math.max(1, ambN),
    temporalCorrectness: temporalHits / Math.max(1, temporalN),
    dialogueRelationCorrectness: dialogueHits / Math.max(1, dialogueN),
    placeRelationCorrectness: placeHits / Math.max(1, placeN),
    falseConcreteMeasureGuesses: measureGuesses,
    fullThinAgreement: fullThinAgree / Math.max(1, fullThinN),
    s4aEnvelopeAgreement: envelopeHits / Math.max(1, envelopeN),
    binder: {
      clarifyMeasure: binderClarifyMeasure,
      bound: binderBound,
      unsupported: binderUnsupported,
    },
  }

  const gates = {
    schema100: schemaOk === apiCalls && schemaErr === 0,
    provider0: providerErr === 0,
    incomplete100: incompleteN > 0 && incompleteHits === incompleteN,
    falsePromo0: falsePromo === 0,
    noMeasureGuess: measureGuesses === 0,
    fullThinAgreeOnQueries:
      rows.filter(
        (r) =>
          r.ok === true &&
          (r as { score?: { familyOk?: boolean } }).score?.familyOk &&
          (r as { requestKind?: string }).requestKind === 'domain_query',
      ).every((r) => (r as { fullThinAgree?: boolean }).fullThinAgree === true),
  }

  const ready =
    gates.schema100 &&
    gates.provider0 &&
    gates.incomplete100 &&
    gates.falsePromo0 &&
    gates.noMeasureGuess

  const report = {
    phase: 'S4B',
    model: MODEL,
    corpus: stats,
    metrics,
    gates,
    verdict: ready
      ? 'S4B_CONTRACT_READY_FOR_RETIREMENT_REPROOF'
      : 'S4B_CONTRACT_IMPROVED_BUT_NOT_READY',
    rows,
  }

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-s4b-luna-query-family.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log('\n=== S4B METRICS ===')
  console.log(JSON.stringify(metrics, null, 2))
  console.log('\n=== GATES ===')
  console.log(JSON.stringify(gates, null, 2))
  console.log(`\nVERDICT_HINT: ${report.verdict}`)
  console.log(`artifact: ${outPath}`)
  console.log(`apiCalls: ${apiCalls}`)
}

main().catch((e) => {
  console.error('S4B live fatal:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
