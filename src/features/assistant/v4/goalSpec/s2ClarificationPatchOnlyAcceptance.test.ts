/**
 * S2 — Clarification patch-only + GoalSpec/BoundGoal ownership acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/s2ClarificationPatchOnlyAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyGoalClarificationAnswer,
  isGoalClarificationPatchSlot,
} from './applyGoalClarificationAnswer'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { clarificationLabelCopy } from './goalClarificationCopy'
import {
  clearGoalClarificationSession,
  clearPendingGoalClarificationOnly,
  getPendingGoalClarification,
  setPendingGoalClarification,
} from './goalClarificationSession'
import type { GoalClarificationRequest } from './goalClarificationTypes'
import { emptyGoalSpec } from './goalSpec'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
  destroyGoalClarificationOnAssistantClose,
} from './resumeGoalClarification'
import { submitGoalClarificationAnswerWithLabel } from './goalClarificationHostAdapter'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
}

function snap(goal: unknown): string {
  return JSON.stringify(goal)
}

console.log('S2 Clarification patch-only hardening')

// A–C: measure patches measure only; Resolver derives source
{
  clearGoalClarificationSession()
  const pending = emptyGoalSpec({
    requestKind: 'domain_query',
    source: null,
    aggregation: 'sum',
    measure: null,
    ambiguities: [{ slot: 'measure', reason: 'sum_requires_measure' }],
  })
  const before = snap(pending)
  const first = bindGoalSpecWithClarification({
    goal: pending,
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'A clarify')
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  assertEq(snap(first.request.pendingGoal), before, 'A pending unchanged in request')
  assertEq(first.request.pendingGoal.source, null, 'A source null')

  const applied = applyGoalClarificationAnswer(first.request, {
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(applied.ok, 'A apply')
  if (!applied.ok) throw new Error('unreachable')
  assertEq(applied.goal.measure, 'wedding.paid_amount', 'A measure')
  assertEq(applied.goal.source, null, 'B source not patched')
  assertEq(applied.goal.aggregation, 'sum', 'A agg unchanged')
  assertEq(snap(pending), before, 'D pending GoalSpec immutable')
  assertEq(snap(first.request.pendingGoal), before, 'D request.pendingGoal immutable')

  const bound = bindGoalSpec(
    applied.goal,
    makeGoalBinderContext({}),
  )
  assertEq(bound.status, 'bound', 'C bound')
  if (bound.status === 'bound') {
    assertEq(bound.goal.source, 'wedding', 'C BoundGoal source')
    assertEq(bound.goal.measure, 'wedding.paid_amount', 'C BoundGoal measure')
  }
  assertEq(applied.goal.source, null, 'E GoalSpec still null after bind')
  console.log('  OK A–E measure patch + ownership')
}

// F: display label cannot change semantic value
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
    }),
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'F clarify')
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  const a = submitGoalClarificationAnswerWithLabel({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
    selectedLabel: 'Już wpłacone',
  })
  clearGoalClarificationSession()
  const second = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
    }),
    storePending: true,
  })
  if (second.status !== 'needs_clarification') throw new Error('unreachable')
  const b = submitGoalClarificationAnswerWithLabel({
    clarificationId: second.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
    selectedLabel: 'TOTALLY DIFFERENT LABEL NOT IN COPY',
  })
  assertEq(a.result.status, 'bound', 'F a bound')
  assertEq(b.result.status, 'bound', 'F b bound')
  if (a.result.status === 'bound' && b.result.status === 'bound') {
    assertEq(a.result.goal.measure, b.result.goal.measure, 'F same measure')
    assertEq(a.result.query.measure, 'wedding.paid_amount', 'F DQ')
  }
  assertEq(
    clarificationLabelCopy('measure.paid_amount'),
    'Już wpłacone',
    'F copy exists',
  )
  console.log('  OK F label independence')
}

// G: invalid typed value rejected
{
  const req: GoalClarificationRequest = {
    id: 's2-inv',
    slot: 'measure',
    questionKey: 'measure',
    options: [
      {
        id: 'wedding.paid_amount',
        value: 'wedding.paid_amount',
        labelKey: 'measure.paid_amount',
      },
    ],
    pendingGoal: emptyGoalSpec({
      source: null,
      aggregation: 'sum',
      measure: null,
    }),
    preservedActiveCollectionQuery: null,
    depth: 0,
    signature: 'x',
  }
  const bad = applyGoalClarificationAnswer(req, {
    clarificationId: 's2-inv',
    slot: 'measure',
    selectedValue: 'wedding.contract_value',
  })
  assert(!bad.ok && bad.reason === 'invalid_selected_value', 'G reject')
  console.log('  OK G invalid value')
}

// H: one answer cannot patch two slots (slot_mismatch / allowlist)
{
  const req: GoalClarificationRequest = {
    id: 's2-two',
    slot: 'measure',
    questionKey: 'measure',
    options: [
      {
        id: 'wedding.paid_amount',
        value: 'wedding.paid_amount',
        labelKey: 'measure.paid_amount',
      },
    ],
    pendingGoal: emptyGoalSpec({
      source: null,
      aggregation: 'sum',
      measure: null,
      temporal: {
        expression: null,
        resolvedRange: null,
        dateDimension: null,
        dateDimensionAmbiguous: true,
      },
    }),
    preservedActiveCollectionQuery: null,
    depth: 0,
    signature: 'x',
  }
  const mismatch = applyGoalClarificationAnswer(req, {
    clarificationId: 's2-two',
    slot: 'date_dimension',
    selectedValue: 'wedding.date',
  })
  assert(!mismatch.ok && mismatch.reason === 'slot_mismatch', 'H mismatch')
  const ok = applyGoalClarificationAnswer(req, {
    clarificationId: 's2-two',
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(ok.ok, 'H measure ok')
  if (ok.ok) {
    assertEq(ok.goal.measure, 'wedding.paid_amount', 'H measure')
    assertEq(ok.goal.source, null, 'H no source')
    assertEq(ok.goal.temporal?.dateDimension, null, 'H no date dim')
    assertEq(ok.goal.temporal?.dateDimensionAmbiguous, true, 'H date amb untouched')
  }
  console.log('  OK H single-slot only')
}

// I: after one slot, another may remain (entity then measure)
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
      relations: [
        {
          relation: 'unknown',
          field: null,
          op: 'eq',
          value: { text: 'Gold', kindHint: 'unknown' },
          ambiguousKinds: ['package', 'extra'],
        },
      ],
      ambiguities: [
        {
          slot: 'entity_kind',
          reason: 'kind',
          candidates: [
            { id: 'package', label: 'package' },
            { id: 'extra', label: 'extra' },
          ],
        },
        { slot: 'measure', reason: 'sum_requires_measure' },
      ],
    }),
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'I first')
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  assertEq(first.request.slot, 'entity_kind', 'I entity first')
  const afterEntity = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'entity_kind',
    selectedValue: 'package',
  })
  assertEq(afterEntity.status, 'needs_clarification', 'I still missing measure')
  if (afterEntity.status === 'needs_clarification') {
    assertEq(afterEntity.request.slot, 'measure', 'I measure next')
    assertEq(afterEntity.patchedGoal.measure, null, 'I measure still null')
    assert(
      !afterEntity.patchedGoal.ambiguities.some((a) => a.slot === 'entity_kind'),
      'I entity amb cleared',
    )
  }
  clearGoalClarificationSession()
  console.log('  OK I multi-missing sequential')
}

// J: date_dimension patches only date dimension
{
  const pending = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    measure: null,
    temporal: {
      expression: 'sierpień',
      resolvedRange: { from: '2026-08-01', to: '2026-08-31' },
      dateDimension: null,
      dateDimensionAmbiguous: true,
    },
    ambiguities: [{ slot: 'date_dimension', reason: 'which_date' }],
  })
  const before = snap(pending)
  const req: GoalClarificationRequest = {
    id: 's2-date',
    slot: 'date_dimension',
    questionKey: 'date_dimension',
    options: [
      {
        id: 'wedding.date',
        value: 'wedding.date',
        labelKey: 'date_dimension.wedding_date',
      },
    ],
    pendingGoal: pending,
    preservedActiveCollectionQuery: null,
    depth: 0,
    signature: 'd',
  }
  const applied = applyGoalClarificationAnswer(req, {
    clarificationId: 's2-date',
    slot: 'date_dimension',
    selectedValue: 'wedding.date',
  })
  assert(applied.ok, 'J apply')
  if (!applied.ok) throw new Error('unreachable')
  assertEq(applied.goal.temporal?.dateDimension, 'wedding.date', 'J dim')
  assertEq(applied.goal.temporal?.dateDimensionAmbiguous, false, 'J flag')
  assertEq(applied.goal.source, 'wedding', 'J source untouched')
  assertEq(applied.goal.measure, null, 'J measure untouched')
  assertEq(applied.goal.aggregation, 'count', 'J agg untouched')
  assertEq(snap(pending), before, 'J pending immutable')
  // non-date field rejected
  const bad = applyGoalClarificationAnswer(req, {
    clarificationId: 's2-date',
    slot: 'date_dimension',
    selectedValue: 'wedding.paid_amount',
  })
  assert(!bad.ok, 'J reject money as date dim')
  console.log('  OK J date_dimension patch-only')
}

// K: entity_kind patches kind only
{
  const pending = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'list',
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: { text: 'Villa', kindHint: null },
        ambiguousKinds: ['venue', 'package'],
      },
    ],
    ambiguities: [{ slot: 'entity_kind', reason: 'kind' }],
  })
  const req: GoalClarificationRequest = {
    id: 's2-ek',
    slot: 'entity_kind',
    questionKey: 'entity_kind',
    options: [
      { id: 'venue', value: 'venue', labelKey: 'entity_kind.generic' },
      { id: 'package', value: 'package', labelKey: 'entity_kind.generic' },
    ],
    pendingGoal: pending,
    preservedActiveCollectionQuery: null,
    depth: 0,
    signature: 'e',
  }
  const applied = applyGoalClarificationAnswer(req, {
    clarificationId: 's2-ek',
    slot: 'entity_kind',
    selectedValue: 'venue',
  })
  assert(applied.ok, 'K apply')
  if (!applied.ok) throw new Error('unreachable')
  const rel = applied.goal.relations[0]!
  assertEq(rel.ambiguousKinds, undefined, 'K amb kinds cleared')
  assert(
    rel.value &&
      typeof rel.value === 'object' &&
      'kindHint' in rel.value &&
      rel.value.kindHint === 'venue',
    'K kindHint',
  )
  assertEq(applied.goal.source, 'wedding', 'K source')
  assertEq(applied.goal.measure, null, 'K measure')
  console.log('  OK K entity_kind patch-only')
}

// L: zero-LLM static
{
  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/applyGoalClarificationAnswer.ts',
    ),
    'utf8',
  )
  const resumeSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/resumeGoalClarification.ts',
    ),
    'utf8',
  )
  const adapterSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/goalClarificationHostAdapter.ts',
    ),
    'utf8',
  )
  for (const [name, src] of [
    ['apply', applySrc],
    ['resume', resumeSrc],
    ['adapter', adapterSrc],
  ] as const) {
    assert(!/\binterpretGoalSpec\b/.test(src), `${name} no interpret`)
    assert(!/v5_goal_interpret/.test(src), `${name} no edge mode`)
    assert(!/openai\.com/i.test(src), `${name} no openai endpoint`)
  }
  assert(!/tryAutoResolveWeddingCollectionSource/.test(resumeSrc), 'no U4.8')
  assert(!/source \?\? ['"]wedding['"]/.test(resumeSrc), 'no source??wedding')
  assert(isGoalClarificationPatchSlot('measure'), 'allowlist measure')
  assert(isGoalClarificationPatchSlot('date_dimension'), 'allowlist date')
  assert(!isGoalClarificationPatchSlot('aggregation'), 'no aggregation UI')
  assert(!isGoalClarificationPatchSlot('source'), 'no source UI slot')
  console.log('  OK L zero-LLM + U4.8 audit')
}

// M–N: NL supersede + close
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: null,
      aggregation: 'sum',
      measure: null,
    }),
    storePending: true,
  })
  assert(!!getPendingGoalClarification(), 'M pending')
  const id = getPendingGoalClarification()!.id
  clearPendingGoalClarificationOnly()
  assertEq(getPendingGoalClarification(), null, 'M cleared')
  const stale = answerGoalClarification({
    clarificationId: id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assertEq(stale.status, 'rejected', 'M stale')

  setPendingGoalClarification({
    id: 'close-me',
    slot: 'measure',
    questionKey: 'measure',
    options: [
      {
        id: 'wedding.paid_amount',
        value: 'wedding.paid_amount',
        labelKey: 'measure.paid_amount',
      },
    ],
    pendingGoal: emptyGoalSpec({ aggregation: 'sum', measure: null }),
    preservedActiveCollectionQuery: null,
    depth: 0,
    signature: 'c',
  })
  destroyGoalClarificationOnAssistantClose()
  assertEq(getPendingGoalClarification(), null, 'N close')
  console.log('  OK M–N state ownership')
}

// Full resume: GoalSpec.source stays null; BoundGoal/DQ wedding
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: null,
      aggregation: 'sum',
      measure: null,
    }),
    storePending: true,
  })
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  const resumed = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assertEq(resumed.status, 'bound', 'resume bound')
  if (resumed.status === 'bound') {
    assertEq(resumed.patchedGoal.source, null, 'F writeback policy GoalSpec')
    assertEq(resumed.goal.source, 'wedding', 'BoundGoal')
    assertEq(resumed.query.source, 'wedding', 'DomainQuery')
    assertEq(resumed.query.measure, 'wedding.paid_amount', 'DQ measure')
  }
  clearGoalClarificationSession()
  console.log('  OK writeback policy end-to-end')
}

console.log('S2 Clarification patch-only hardening: ALL PASSED')
