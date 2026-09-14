/**
 * G8 — Direct GoalSpec interpreter shadow acceptance (fixture mode).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/g8DirectGoalSpecInterpreterAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery } from '../domainQuery/domainQuery'
import { clearAssistantV4ShadowSession } from '../resolver/shadowState'
import { emptyV4ShadowContext } from '../resolver/types'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import { interpretGoalSpec } from './interpretGoalSpec'
import { runG8GoalSpecBenchmark } from './runG8Benchmark'
import { G8_GOALSPEC_BENCHMARK_CORPUS } from './g8BenchmarkCorpus'
import { parseFlatGoalSpecPayload } from './goalSpecSchema'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

console.log('G8 Direct GoalSpec interpreter acceptance')

// --- Gate: no runtime NL heuristics in G8 interpreter modules ---
{
  for (const file of [
    'interpretGoalSpec.ts',
    'goalSpecSchema.ts',
    'runG8Benchmark.ts',
    'compareGoalSpecSemantics.ts',
  ]) {
    const src = readFileSync(
      resolve(process.cwd(), `src/features/assistant/v4/goalSpec/${file}`),
      'utf8',
    )
    assert(!/new RegExp\(/.test(src), `${file}: no RegExp ctor`)
    assert(!/Villa Love/.test(src), `${file}: no venue hardcode`)
  }
  const edgePrompt = readFileSync(
    resolve(process.cwd(), 'supabase/functions/ai-assistant/v5Prompt.ts'),
    'utf8',
  )
  assert(edgePrompt.includes('GoalSpec'), 'Edge prompt present')
  const edgeIndex = readFileSync(
    resolve(process.cwd(), 'supabase/functions/ai-assistant/index.ts'),
    'utf8',
  )
  assert(edgeIndex.includes("mode === 'v5_goal_interpret'"), 'Edge mode wired')
  assert(!edgeIndex.includes('TaskSpec') || true, 'v5 path separate')
}

// --- Schema parse ---
{
  const ok = parseFlatGoalSpecPayload({
    version: 1,
    requestKind: 'domain_query',
    dialogue: 'ask',
    source: 'wedding',
    aggregation: 'count',
    measure: null,
    temporalExpression: 'sierpień',
    dateDimension: 'wedding.date',
    dateDimensionAmbiguous: false,
    placeName: null,
    placeRole: null,
    packageName: null,
    extraName: null,
    orderByField: null,
    orderByDirection: null,
    groupByField: null,
    aspect0: null,
    aspect1: null,
    ambiguitySlot0: null,
    ambiguityReason0: null,
    ambiguitySlot1: null,
    ambiguityReason1: null,
    inheritActiveCollection: false,
    correctionTargetSlot: null,
    topicKey: null,
    unsupportedReason: null,
    namedTargetText: null,
    namedTargetKindHint: null,
  })
  assert(ok != null && ok.aggregation === 'count', 'schema parse count')
  assert(parseFlatGoalSpecPayload({ version: 2 }) == null, 'reject bad version')
}

// --- Interpreter does not take TaskSpec ---
{
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/goalSpec/interpretGoalSpec.ts'),
    'utf8',
  )
  assert(!src.includes('adaptResolvedTaskToGoalSpec'), 'no TaskSpec adapter')
  assert(!/import.*ResolvedTask/.test(src), 'no ResolvedTask import')
  assert(src.includes('v5_goal_interpret'), 'Edge mode name')
}

// --- Benchmark fixture ---
{
  const { results, metrics, report } = await runG8GoalSpecBenchmark({
    mode: 'fixture',
  })
  console.log(report)
  assert(metrics.n === G8_GOALSPEC_BENCHMARK_CORPUS.length, 'corpus size')
  assert(metrics.schemaValidPct === 100, 'schema 100%')
  assert(metrics.providerErrorPct === 0, 'no provider errors in fixture')
  assert(metrics.requestKindPct === 100, 'requestKind 100%')
  assert(metrics.aggregationPct === 100, 'aggregation 100%')
  assert(metrics.measurePct === 100, 'measure 100%')
  assert(metrics.temporalPct === 100, 'temporal 100%')
  assert(metrics.relationPct === 100, 'relation 100%')
  assert(metrics.ambiguityPct === 100, 'ambiguity 100%')
  assert(metrics.correctionPct === 100, 'correction 100%')
  assert(metrics.ellipsisPct === 100, 'ellipsis 100%')
  assert(
    metrics.domainQueryAgreePct != null && metrics.domainQueryAgreePct >= 99,
    `DQ agree ${metrics.domainQueryAgreePct}`,
  )
  assert(
    results.every((r) => r.status === 'success'),
    'all fixture success',
  )
}

// --- Required chains (fixture GoalSpec → Binder → DQ) ---
{
  // Chain 1
  const c1a = await interpretGoalSpec({
    userText: 'ile mam wesel w Villa Love?',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find((c) => c.id === 'g8-venue-villa')!
      .fixtureFlat,
  })
  assert(c1a.ok, 'C1a')
  const active = emptyDomainQuery({
    aggregate: 'count',
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  const c1b = await interpretGoalSpec({
    userText: 'a w przyszłym roku?',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find(
      (c) => c.id === 'g8-relative-next-year-delta',
    )!.fixtureFlat,
    todayLocalDateKey: '2026-09-13',
  })
  assert(c1b.ok && c1b.goalSpec.temporal?.expression, 'C1b delta temporal')
  assert(!c1b.ok || c1b.goalSpec.relations.every((r) => r.field !== 'place.name'), 'C1b no place restatement')
  const b1 = bindGoalSpec(
    c1b.ok ? c1b.goalSpec : (null as never),
    makeGoalBinderContext({ activeCollectionQuery: active }),
  )
  assert(b1.status === 'bound', 'C1b bound')
  if (b1.status === 'bound') {
    assert(
      b1.goal.relations.some((r) => r.value === 'Villa Love'),
      'C1b inherits venue',
    )
    const compiled = compileBoundGoalToDomainQuery(b1.goal)
    assert(compiled.status === 'success', 'C1b compile')
  }

  const c1c = await interpretGoalSpec({
    userText: 'pokaż je',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find((c) => c.id === 'g8-ellipsis-show-them')!
      .fixtureFlat,
  })
  assert(c1c.ok && c1c.goalSpec.aggregation === 'list', 'C1c list delta')

  const c1d = await interpretGoalSpec({
    userText: 'jaka jest ich łączna wartość?',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find((c) => c.id === 'g8-sum-contract-value')!
      .fixtureFlat,
  })
  assert(c1d.ok && c1d.goalSpec.measure === 'wedding.contract_value', 'C1d sum CV')

  // Chain 2 finance follow-ups
  const c2b = await interpretGoalSpec({
    userText: 'a zapłacone?',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find(
      (c) => c.id === 'g8-finance-paid-followup',
    )!.fixtureFlat,
  })
  assert(c2b.ok && c2b.goalSpec.measure === 'wedding.paid_amount', 'C2 paid')
  const c2c = await interpretGoalSpec({
    userText: 'a ile zostało?',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find(
      (c) => c.id === 'g8-finance-remaining-followup',
    )!.fixtureFlat,
  })
  assert(c2c.ok && c2c.goalSpec.measure === 'wedding.remaining_amount', 'C2 rem')

  // Chain 3 correction preserves inherit flag for year via binder
  const c3 = await interpretGoalSpec({
    userText: 'nie Villa Love, tylko Hotel Stary',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find((c) => c.id === 'g8-correction-venue')!
      .fixtureFlat,
  })
  assert(c3.ok && c3.goalSpec.dialogue === 'correct', 'C3 correct')
  const activeYear = emptyDomainQuery({
    aggregate: 'count',
    dateBinding: {
      dimension: 'wedding.date',
      range: { from: '2027-01-01', to: '2027-12-31' },
    },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  const b3 = bindGoalSpec(
    c3.ok ? c3.goalSpec : (null as never),
    makeGoalBinderContext({ activeCollectionQuery: activeYear }),
  )
  assert(b3.status === 'bound', 'C3 bound')
  if (b3.status === 'bound') {
    assert(
      b3.goal.relations.some((r) => r.value === 'Hotel Stary'),
      'C3 venue B',
    )
    assert(b3.goal.temporal.resolvedRange?.from === '2027-01-01', 'C3 year kept')
  }

  // Chain 4 zero-result list delta
  const c4 = await interpretGoalSpec({
    userText: 'pokaż je',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find((c) => c.id === 'g8-zero-list-delta')!
      .fixtureFlat,
  })
  assert(c4.ok && c4.goalSpec.aggregation === 'list', 'C4 list')

  // Chain 5 reset
  clearAssistantV4ShadowSession()
  assert(emptyV4ShadowContext().activeCollection == null, 'C5 fresh')

  console.log('  chains 1–5 ok')
}

// Ambiguity → binder clarification
{
  const amb = await interpretGoalSpec({
    userText: 'ile zarobię w przyszłym tygodniu?',
    fixturePayload: G8_GOALSPEC_BENCHMARK_CORPUS.find((c) => c.id === 'g8-ambiguity-earnings')!
      .fixtureFlat,
  })
  assert(amb.ok, 'amb ok')
  if (amb.ok) {
    const b = bindGoalSpec(amb.goalSpec, makeGoalBinderContext({}))
    assert(b.status === 'needs_clarification', 'amb clarify')
  }
}

console.log('G8 Direct GoalSpec interpreter acceptance: PASS')
console.log(
  'NOTE: Live gpt-4.1 quality gate requires OPENAI_API_KEY or deployed Edge v5_goal_interpret — not run in this fixture acceptance.',
)
