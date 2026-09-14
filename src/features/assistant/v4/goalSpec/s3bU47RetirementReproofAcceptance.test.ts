/**
 * S3B — U4.7 retirement re-proof (post-S4B query family contract).
 *
 * Uses S4B artifact (no live Luna). Confirms both recovery rules removed.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/s3bU47RetirementReproofAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { adaptGoalSpecToGoalEnvelope } from './adaptGoalSpecToGoalEnvelope'
import { isQueryGoal } from './goalEnvelope'
import { emptyGoalSpec } from './goalSpec'
import { clearGoalClarificationSession } from './goalClarificationSession'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
} from './resumeGoalClarification'
import { validateGoalSpecConsistency } from './validateGoalSpec'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
}

console.log('S3B U4.7 retirement re-proof')

const validatorSrc = readFileSync(
  resolve(process.cwd(), 'src/features/assistant/v4/goalSpec/validateGoalSpec.ts'),
  'utf8',
)
const bindSrc = readFileSync(
  resolve(process.cwd(), 'src/features/assistant/v4/goalSpec/bindGoalSpec.ts'),
  'utf8',
)
const resolverSrc = readFileSync(
  resolve(
    process.cwd(),
    'src/features/assistant/v4/goalSpec/resolveCollectionSource.ts',
  ),
  'utf8',
)
const hostSrc = readFileSync(
  resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
  'utf8',
)

assert(!validatorSrc.includes('MISCLASSIFIED_MONETARY_SUM_KIND'), 'kind rule removed')
assert(!validatorSrc.includes('MISSING_SUM_MEASURE_AMBIGUITY'), 'amb rule removed')
assert(!validatorSrc.includes('recoverMisclassified'), 'helper removed')
assert(!bindSrc.includes('recoverMisclassified'), 'binder clean')
assert(!resolverSrc.includes('MISCLASSIFIED'), 'resolver clean')
// No application promotion heuristic relocating family from aggregation alone.
assert(
  !/requestKind\s*=\s*['"]domain_query['"].{0,80}aggregation/.test(bindSrc),
  'no binder kind rewrite from aggregation',
)
console.log('  OK source retirement')

// S4B artifact current-contract incomplete queries
{
  const art = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'src/features/assistant/v4/benchmark/artifacts/phase-s4b-luna-query-family.json',
      ),
      'utf8',
    ),
  )
  assertEq(art.metrics.incompleteQueryFamilyAccuracy, 1, 'S4B incomplete')
  assertEq(art.metrics.falseQueryFamilyPromotion, 0, 'S4B false promo')
  assertEq(art.metrics.fullThinAgreement, 1, 'S4B full≡thin')
  assertEq(art.metrics.falseConcreteMeasureGuesses, 0, 'S4B no guess')

  const incomplete = art.rows.filter(
    (r: { ok: boolean; class: string }) =>
      r.ok &&
      (r.class === 'B_ambiguous_monetary' ||
        r.class === 'C_missing_measure_monetary'),
  )
  for (const r of incomplete as Array<{
    id: string
    requestKind: string
    dialogue?: 'ask' | 'inherit' | 'correct'
    aggregation: string | null
    ambiguitySlots: string[]
  }>) {
    assertEq(r.requestKind, 'domain_query', `${r.id} family`)
    const goal = emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: r.dialogue ?? 'ask',
      source: 'wedding',
      aggregation: (r.aggregation as 'sum') ?? 'sum',
      measure: null,
      ambiguities: (r.ambiguitySlots || [])
        .filter((s) => s === 'measure')
        .map((s) => ({ slot: s as 'measure', reason: 'sum_requires_measure' })),
    })
    for (const policy of ['full', 'thin'] as const) {
      clearGoalClarificationSession()
      const v = validateGoalSpecConsistency(goal, undefined, { policy })
      const b = bindGoalSpecWithClarification({
        goal: v.goal,
        storePending: false,
      })
      assertEq(v.goal.requestKind, 'domain_query', `${r.id} ${policy} kind`)
      assertEq(b.status, 'needs_clarification', `${r.id} ${policy} clarify`)
      if (b.status === 'needs_clarification') {
        assertEq(b.request.slot, 'measure', `${r.id} slot`)
      }
    }
    assert(isQueryGoal(adaptGoalSpecToGoalEnvelope(goal)), `${r.id} QueryGoal`)
  }
  console.log(`  OK S4B incomplete (${incomplete.length}) full≡thin clarify`)
}

// Gates 13–15: bare sum without ambiguity metadata
{
  clearGoalClarificationSession()
  const bare = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [],
  })
  const v = validateGoalSpecConsistency(bare)
  assertEq(v.status, 'valid', 'bare validator valid')
  assertEq(v.goal.ambiguities.length, 0, 'no synth')
  const b = bindGoalSpecWithClarification({ goal: v.goal, storePending: true })
  assertEq(b.status, 'needs_clarification', 'bare clarify')
  if (b.status !== 'needs_clarification') throw new Error('unreachable')
  assertEq(b.request.slot, 'measure', 'bare slot')
  const ids = b.request.options.map((o) => o.id).sort()
  assert(
    ids.includes('wedding.paid_amount') &&
      ids.includes('wedding.contract_value') &&
      ids.includes('wedding.remaining_amount'),
    'typed registry options',
  )
  const resumed = answerGoalClarification({
    clarificationId: b.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assertEq(resumed.status, 'bound', 'zero-LLM resume')
  if (resumed.status === 'bound') {
    assertEq(resumed.query.measure, 'wedding.paid_amount', 'resume measure')
    assertEq(resumed.query.aggregate, 'sum', 'resume agg')
  }
  console.log('  OK bare → clarify → typed options → resume')
}

// Legacy B/C/D + G
{
  for (const [id, goal] of [
    [
      'B',
      emptyGoalSpec({
        requestKind: 'clarification',
        aggregation: 'sum',
        measure: null,
      }),
    ],
    [
      'C',
      emptyGoalSpec({
        requestKind: 'unsupported',
        unsupportedReason: 'x',
        aggregation: 'sum',
        measure: null,
      }),
    ],
    [
      'D',
      emptyGoalSpec({
        requestKind: 'unsupported',
        aggregation: 'sum',
        measure: null,
        ambiguities: [],
      }),
    ],
    [
      'G',
      emptyGoalSpec({
        requestKind: 'unsupported',
        aggregation: 'sum',
        measure: 'wedding.paid_amount',
      }),
    ],
  ] as const) {
    clearGoalClarificationSession()
    const v = validateGoalSpecConsistency(goal)
    const b = bindGoalSpecWithClarification({
      goal: v.goal,
      storePending: false,
    })
    assertEq(v.goal.requestKind, goal.requestKind, `${id} kind kept`)
    assertEq(b.status, 'unsupported', `${id} fail-closed`)
    assert(!isQueryGoal(adaptGoalSpecToGoalEnvelope(goal)), `${id} NonQuery`)
  }
  console.log('  OK B/C/D/G CONTRACT_VIOLATION / SAFE_NON_QUERY fail-closed')
}

// Host unchanged for authority
{
  assert(hostSrc.includes('V3') || hostSrc.includes('v3'), 'Host still V3-aware')
  console.log('  OK Host not cut over (spot-check)')
}

console.log('S3B U4.7 retirement re-proof: ALL PASSED')
