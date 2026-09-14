/**
 * S4A — QueryGoal envelope foundation acceptance (shadow only).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/s4aQueryGoalEnvelopeFoundationAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery } from '../domainQuery/domainQuery'
import { adaptGoalSpecToGoalEnvelope } from './adaptGoalSpecToGoalEnvelope'
import { isQueryGoal } from './goalEnvelope'
import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import { projectQueryGoalToLegacyGoalSpec } from './projectQueryGoalToLegacyGoalSpec'
import { resolveViaGoalEnvelopeShadow } from './resolveViaGoalEnvelopeShadow'
import {
  clearGoalClarificationSession,
} from './goalClarificationSession'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
} from './resumeGoalClarification'
import { validateGoalSpecConsistency } from './validateGoalSpec'
import { AUGUST_2026 } from './regression/semanticRegressionCases'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
}

const MONEY_AMB = {
  slot: 'measure' as const,
  reason: 'sum_requires_measure',
  candidates: [
    { id: 'wedding.contract_value', label: 'c' },
    { id: 'wedding.paid_amount', label: 'p' },
    { id: 'wedding.remaining_amount', label: 'r' },
  ],
}

function legacyFull(goal: GoalSpec) {
  clearGoalClarificationSession()
  const v = validateGoalSpecConsistency(goal, undefined, { policy: 'full' })
  return bindGoalSpecWithClarification({
    goal: v.goal,
    storePending: false,
  })
}

function legacyThin(goal: GoalSpec) {
  clearGoalClarificationSession()
  const v = validateGoalSpecConsistency(goal, undefined, { policy: 'thin' })
  return bindGoalSpecWithClarification({
    goal: v.goal,
    storePending: false,
  })
}

console.log('S4A QueryGoal envelope foundation')

// A: domain_query + sum + measure missing → QueryGoal → NeedsClarification
{
  const legacy = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
  })
  const before = JSON.stringify(legacy)
  const env = adaptGoalSpecToGoalEnvelope(legacy)
  assert(isQueryGoal(env), 'A QueryGoal')
  if (!isQueryGoal(env)) throw new Error('unreachable')
  assertEq(env.measure.status, 'missing', 'A measure missing')
  assertEq(env.aggregation.status, 'resolved', 'A agg')
  const shadow = resolveViaGoalEnvelopeShadow(legacy)
  assertEq(shadow.status, 'needs_clarification', 'A clarify')
  if (shadow.status === 'needs_clarification') {
    assertEq(shadow.slot, 'measure', 'A slot')
  }
  assertEq(JSON.stringify(legacy), before, 'K no mutate')
  console.log('  OK A incomplete QueryGoal → clarify measure')
}

// B: domain_query + paid → bound
{
  const legacy = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
  })
  const env = adaptGoalSpecToGoalEnvelope(legacy)
  assert(isQueryGoal(env), 'B QueryGoal')
  if (isQueryGoal(env)) {
    assertEq(env.measure.status, 'resolved', 'B measure')
  }
  const shadow = resolveViaGoalEnvelopeShadow(legacy)
  assertEq(shadow.status, 'bound', 'B bound')
  if (shadow.status === 'bound') {
    assertEq(shadow.query.measure, 'wedding.paid_amount', 'B DQ')
  }
  console.log('  OK B resolved QueryGoal → DQ')
}

// C: missing source + paid → Resolver derives wedding
{
  const legacy = emptyGoalSpec({
    requestKind: 'domain_query',
    source: null,
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
  })
  const env = adaptGoalSpecToGoalEnvelope(legacy)
  assert(isQueryGoal(env), 'C QueryGoal')
  if (isQueryGoal(env)) {
    assertEq(env.source.status, 'missing', 'C source missing in envelope')
  }
  const shadow = resolveViaGoalEnvelopeShadow(legacy)
  assertEq(shadow.status, 'bound', 'C bound')
  if (shadow.status === 'bound') {
    assertEq(shadow.source, 'wedding', 'C Resolver source')
  }
  console.log('  OK C adapter does not resolve source; Resolver does')
}

// D: Villa Love relation → source wedding
{
  const legacy = emptyGoalSpec({
    requestKind: 'domain_query',
    source: null,
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  const shadow = resolveViaGoalEnvelopeShadow(legacy)
  assertEq(shadow.status, 'bound', 'D bound')
  if (shadow.status === 'bound') {
    assertEq(shadow.source, 'wedding', 'D source')
    assert(
      shadow.query.relations.some((r) => r.value === 'Villa Love'),
      'D place',
    )
  }
  console.log('  OK D place relation ≠ collection source')
}

// E: zero-result active context identity
{
  const active = emptyDomainQuery({
    source: 'wedding',
    aggregate: 'count',
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
    dateBinding: {
      dimension: 'wedding.date',
      range: AUGUST_2026,
    },
  })
  const legacy = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    source: 'wedding',
    aggregation: 'list',
    inheritance: { fromActiveCollection: true, fromPrevious: true },
  })
  const shadow = resolveViaGoalEnvelopeShadow(legacy, {
    activeCollectionQuery: active,
  })
  assertEq(shadow.status, 'bound', 'E bound')
  if (shadow.status === 'bound') {
    assertEq(shadow.query.dateBinding?.range.from, AUGUST_2026.from, 'E date')
    assert(
      shadow.query.relations.some((r) => r.value === 'Villa Love'),
      'E venue',
    )
  }
  console.log('  OK E zero-result identity via Resolver context')
}

// F: unsupported empty → not QueryGoal
{
  const legacy = emptyGoalSpec({
    requestKind: 'unsupported',
    aggregation: null,
    measure: null,
  })
  const env = adaptGoalSpecToGoalEnvelope(legacy)
  assert(!isQueryGoal(env), 'F not query')
  assertEq(env.kind, 'unsupported', 'F kind')
  const shadow = resolveViaGoalEnvelopeShadow(legacy)
  assertEq(shadow.status, 'unsupported', 'F unsupported')
  console.log('  OK F non-query empty')
}

// G/H: adapter purity
{
  const adapter = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/adaptGoalSpecToGoalEnvelope.ts',
    ),
    'utf8',
  )
  assert(
    !/goal\.unsupportedReason|unsupportedReason\s*===|unsupportedReason\s*\?/.test(
      adapter,
    ),
    'G no unsupportedReason routing',
  )
  assert(!/utterance|userText|RegExp|wpłynęło|pokaż/.test(adapter), 'H no NL')
  assert(!/activeCollection|getFieldCollectionSource|activeResource/.test(adapter), 'I no context')
  console.log('  OK G–I adapter purity')
}

// J: ambiguous measure stays typed, not unsupported
{
  const legacy = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [MONEY_AMB],
  })
  const env = adaptGoalSpecToGoalEnvelope(legacy)
  assert(isQueryGoal(env), 'J QueryGoal')
  if (isQueryGoal(env)) {
    assertEq(env.measure.status, 'ambiguous', 'J ambiguous')
    assert((env.measure.candidates?.length ?? 0) >= 3, 'J candidates')
  }
  const shadow = resolveViaGoalEnvelopeShadow(legacy)
  assertEq(shadow.status, 'needs_clarification', 'J clarify not unsupported')
  console.log('  OK J ambiguous measure')
}

// L: typed clarification zero-LLM after envelope projection
{
  clearGoalClarificationSession()
  const legacy = emptyGoalSpec({
    requestKind: 'domain_query',
    source: null,
    aggregation: 'sum',
    measure: null,
    ambiguities: [MONEY_AMB],
  })
  const env = adaptGoalSpecToGoalEnvelope(legacy)
  assert(isQueryGoal(env), 'L QueryGoal')
  if (!isQueryGoal(env)) throw new Error('unreachable')
  const projected = projectQueryGoalToLegacyGoalSpec(env)
  const first = bindGoalSpecWithClarification({
    goal: projected,
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'L clarify')
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  const resumed = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assertEq(resumed.status, 'bound', 'L bound')
  if (resumed.status === 'bound') {
    assertEq(resumed.patchedGoal.source, null, 'L GoalSpec source no writeback')
    assertEq(resumed.goal.source, 'wedding', 'L BoundGoal')
  }
  clearGoalClarificationSession()
  console.log('  OK L envelope → typed resume zero-LLM')
}

// --- S3 A–H envelope comparison ---
console.log('  S3 A–H envelope shadow:')
const HIST: Array<{ id: string; goal: GoalSpec }> = [
  {
    id: 'A',
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
      ambiguities: [MONEY_AMB],
    }),
  },
  {
    id: 'B',
    goal: emptyGoalSpec({
      requestKind: 'clarification',
      aggregation: 'sum',
      measure: null,
      ambiguities: [MONEY_AMB],
    }),
  },
  {
    id: 'C',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      unsupportedReason: 'DIAGNOSTIC_ONLY',
      aggregation: 'sum',
      measure: null,
      ambiguities: [MONEY_AMB],
    }),
  },
  {
    id: 'D',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: 'sum',
      measure: null,
    }),
  },
  {
    id: 'E',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: null,
      measure: null,
    }),
  },
  {
    id: 'F',
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
    }),
  },
  {
    id: 'G',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
    }),
  },
  {
    id: 'H',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
    }),
  },
]

for (const h of HIST) {
  const full = legacyFull(h.goal)
  const thin = legacyThin(h.goal)
  const env = adaptGoalSpecToGoalEnvelope(h.goal)
  const shadow = resolveViaGoalEnvelopeShadow(h.goal)
  const fullS =
    full.status === 'needs_clarification'
      ? `clarify(${full.request.slot})`
      : full.status
  const thinS =
    thin.status === 'needs_clarification'
      ? `clarify(${thin.request.slot})`
      : thin.status === 'unsupported'
        ? `unsupported`
        : thin.status
  const envS = isQueryGoal(env) ? `QueryGoal/${env.measure.status}` : env.kind
  const shS =
    shadow.status === 'needs_clarification'
      ? `clarify(${shadow.slot})`
      : shadow.status
  console.log(
    `    ${h.id}: full=${fullS} thin=${thinS} env=${envS} shadow=${shS}`,
  )
}

// Fixture G must NOT become QueryGoal
{
  const g = emptyGoalSpec({
    requestKind: 'unsupported',
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
  })
  const env = adaptGoalSpecToGoalEnvelope(g)
  assert(!isQueryGoal(env), 'G not QueryGoal')
  assertEq(env.kind, 'unsupported', 'G unsupported envelope')
  console.log('  OK fixture G: unsupported+sum+paid stays non-query (no U4.7 relocate)')
}

// B/C/D: envelope does not force QueryGoal (legacy limitation)
{
  for (const id of ['B', 'C', 'D'] as const) {
    const row = HIST.find((h) => h.id === id)!
    const env = adaptGoalSpecToGoalEnvelope(row.goal)
    assert(!isQueryGoal(env), `${id} not QueryGoal without Luna contract`)
  }
  console.log('  OK B/C/D remain non-query (CONTRACT_VIOLATION_FIXTURE / S4B forbids these shapes)')
}

// Target contract note: incomplete query must be QueryGoal under future Luna
{
  // Documented by A already
  console.log('  OK target S4B: incomplete monetary sum → emit domain_query/QueryGoal')
}

console.log('S4A QueryGoal envelope foundation: ALL PASSED')
