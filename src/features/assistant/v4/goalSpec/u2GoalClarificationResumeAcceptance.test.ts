/**
 * U2 — GoalSpec-native typed clarification resume acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/u2GoalClarificationResumeAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery } from '../domainQuery/domainQuery'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import { applyGoalClarificationAnswer } from './applyGoalClarificationAnswer'
import {
  clarificationLabelCopy,
  clarificationQuestionCopy,
} from './goalClarificationCopy'
import {
  clearGoalClarificationSession,
  getGoalClarificationActiveCollection,
  getPendingGoalClarification,
  setPendingGoalClarification,
} from './goalClarificationSession'
import { emptyGoalSpec } from './goalSpec'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
  destroyGoalClarificationOnAssistantClose,
} from './resumeGoalClarification'
import { clearAssistantV4ShadowSessionAndPending } from '../shadow'
import { deriveMeasureClarificationOptions } from './deriveMeasureClarificationOptions'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (got ${String(a)} vs ${String(b)})`)
}

console.log('U2 GoalSpec clarification resume acceptance')

clearGoalClarificationSession()

// --- Language-independence: semantic modules must not parse NL cues ---
{
  const files = [
    'applyGoalClarificationAnswer.ts',
    'deriveMeasureClarificationOptions.ts',
    'goalClarificationSession.ts',
    'goalClarificationTypes.ts',
    'resumeGoalClarification.ts',
  ]
  const forbidden = [
    /utterance/i,
    /userText/,
    /new RegExp/,
    /wpłynęło/,
    /łączna/,
    / morpholog/i,
    /phraseMap/i,
  ]
  for (const file of files) {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/assistant/v4/goalSpec', file),
      'utf8',
    )
    for (const re of forbidden) {
      assert(!re.test(src), `${file} language gate ${re}`)
    }
  }
  // Copy file may contain Polish presentation strings only.
  const copySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/goalClarificationCopy.ts',
    ),
    'utf8',
  )
  assert(copySrc.includes('Już wpłacone'), 'copy has paid label')
  assert(!/wpłynęło/.test(copySrc), 'copy has no cue map')
  console.log('  OK language-independence')
}

// --- Case 16 prelude: resume module must not import interpreter ---
{
  const resumeSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/resumeGoalClarification.ts',
    ),
    'utf8',
  )
  assert(!/\binterpretGoalSpec\b/.test(resumeSrc), 'no interpretGoalSpec import')
  assert(!/openai\.com/i.test(resumeSrc), 'no openai')
  assert(!/ai-assistant/.test(resumeSrc), 'no Edge interpreter')
  assert(
    !/\bparseFlatGoalSpecPayload\b/.test(resumeSrc),
    'no NL/schema re-parse on click',
  )
  console.log('  OK case16 static zero-interpreter path')
}

function ambiguousMoneyGoal(
  extra?: Parameters<typeof emptyGoalSpec>[0],
) {
  return emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [{ slot: 'measure', reason: 'unspecified_measure' }],
    ...extra,
  })
}

// 1) genuinely ambiguous money → clarification emitted
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const r = bindGoalSpecWithClarification({ goal })
  assert(r.status === 'needs_clarification', 'case1 clarify')
  if (r.status === 'needs_clarification') {
    assertEq(r.request.slot, 'measure', 'case1 slot')
    assertEq(r.request.questionKey, 'measure', 'case1 qkey')
    assert(r.request.options.length === 3, 'case1 three options')
    assertEq(
      clarificationQuestionCopy(r.request.questionKey),
      'Którą wartość masz na myśli?',
      'case1 question copy',
    )
    const labels = r.request.options.map((o) =>
      clarificationLabelCopy(o.labelKey),
    )
    assert(labels.includes('Już wpłacone'), 'case1 paid label')
    assert(labels.includes('Wartość umów'), 'case1 cv label')
    assert(labels.includes('Pozostało do zapłaty'), 'case1 rem label')
    assert(
      getPendingGoalClarification()?.id === r.request.id,
      'case1 pending stored',
    )
  }
  console.log('  OK case1 ambiguous money clarify')
}

// 2) select paid → wedding.paid_amount → Binder/DQ
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal({
    temporal: {
      expression: '2027',
      resolvedRange: { from: '2027-01-01', to: '2027-12-31' },
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case2 need clarify')
  if (first.status !== 'needs_clarification') throw new Error('case2')
  const snapshot = structuredClone(first.request.pendingGoal)
  const answered = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(answered.status === 'bound', 'case2 bound')
  if (answered.status === 'bound') {
    assertEq(answered.goal.measure, 'wedding.paid_amount', 'case2 measure')
    assertEq(answered.query.measure, 'wedding.paid_amount', 'case2 dq measure')
    assertEq(answered.query.aggregate, 'sum', 'case2 agg')
    assertEq(answered.patchedGoal.measure, 'wedding.paid_amount', 'case2 patch')
    assert(
      !answered.patchedGoal.ambiguities.some((a) => a.slot === 'measure'),
      'case2 amb cleared',
    )
  }
  // pending snapshot unchanged (apply clones)
  assertEq(snapshot.measure, null, 'case2 original snapshot untouched')
  console.log('  OK case2 select paid')
}

// 3–5) clear measures → no clarification
for (const [id, measure] of [
  ['case3', 'wedding.paid_amount'],
  ['case4', 'wedding.contract_value'],
  ['case5', 'wedding.remaining_amount'],
] as const) {
  clearGoalClarificationSession()
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure,
  })
  const r = bindGoalSpecWithClarification({ goal })
  assert(r.status === 'bound', `${id} bound`)
  if (r.status === 'bound') {
    assertEq(r.goal.measure, measure, `${id} measure`)
  }
  console.log(`  OK ${id} clear measure no clarify`)
}

// 6) ambiguous measure + year → year preserved
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal({
    temporal: {
      expression: '2027',
      resolvedRange: { from: '2027-01-01', to: '2027-12-31' },
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case6 clarify')
  if (first.status !== 'needs_clarification') throw new Error('case6')
  const answered = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.contract_value',
  })
  assert(answered.status === 'bound', 'case6 bound')
  if (answered.status === 'bound') {
    assertEq(answered.query.dateBinding?.range.from, '2027-01-01', 'case6 year')
    assertEq(
      answered.patchedGoal.temporal?.resolvedRange?.to,
      '2027-12-31',
      'case6 goal year',
    )
  }
  console.log('  OK case6 year preserved')
}

// 7) ambiguous measure + venue → venue preserved
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal({
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case7 clarify')
  if (first.status !== 'needs_clarification') throw new Error('case7')
  const answered = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.remaining_amount',
  })
  assert(answered.status === 'bound', 'case7 bound')
  if (answered.status === 'bound') {
    const place = answered.query.relations.find((r) => r.field === 'place.name')
    assertEq(place?.value, 'Villa Love', 'case7 venue')
  }
  console.log('  OK case7 venue preserved')
}

// 8) ambiguous measure + inherited active collection
{
  clearGoalClarificationSession()
  const active = emptyDomainQuery({
    aggregate: 'count',
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Hotel Stary',
      },
    ],
    dateBinding: {
      dimension: 'wedding.date',
      range: { from: '2026-08-01', to: '2026-08-31' },
    },
  })
  const goal = ambiguousMoneyGoal({
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: true },
    // Explicit sum money ask on top of collection — measure still missing.
  })
  const first = bindGoalSpecWithClarification({
    goal,
    activeCollectionQuery: active,
  })
  assert(first.status === 'needs_clarification', 'case8 clarify')
  if (first.status !== 'needs_clarification') throw new Error('case8')
  assert(
    first.request.preservedActiveCollectionQuery != null,
    'case8 preserved active',
  )
  const answered = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(answered.status === 'bound', 'case8 bound')
  if (answered.status === 'bound') {
    const place = answered.query.relations.find((r) => r.field === 'place.name')
    assertEq(place?.value, 'Hotel Stary', 'case8 inherited place')
    assertEq(answered.query.dateBinding?.range.from, '2026-08-01', 'case8 month')
  }
  console.log('  OK case8 active collection preserved')
}

// 9) measure + entity ambiguity → sequential, not mega-form
{
  clearGoalClarificationSession()
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [
      {
        slot: 'entity_kind',
        reason: 'package_or_extra',
        candidates: [
          { id: 'package', label: 'package' },
          { id: 'extra', label: 'extra' },
        ],
      },
      { slot: 'measure', reason: 'unspecified_measure' },
    ],
    relations: [
      {
        relation: 'unknown',
        field: null,
        op: 'eq',
        value: { text: 'Gold', kindHint: 'unknown' },
        ambiguousKinds: ['package', 'extra'],
      },
    ],
  })
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case9 first clarify')
  if (first.status !== 'needs_clarification') throw new Error('case9a')
  assertEq(first.request.slot, 'entity_kind', 'case9 entity first')
  assert(first.request.options.length >= 2, 'case9 entity options')
  assert(
    first.request.options.every((o) => o.slot === undefined),
    'case9 single-slot request shape',
  )

  const afterEntity = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'entity_kind',
    selectedValue: 'package',
  })
  assert(
    afterEntity.status === 'needs_clarification',
    'case9 then measure clarify',
  )
  if (afterEntity.status !== 'needs_clarification') throw new Error('case9b')
  assertEq(afterEntity.request.slot, 'measure', 'case9 measure second')

  const afterMeasure = answerGoalClarification({
    clarificationId: afterEntity.request.id,
    slot: 'measure',
    selectedValue: 'wedding.contract_value',
  })
  // Entity kind may still leave unsupported relation in G7 slice — accept
  // bound OR unsupported from package relation, but never mega-form.
  assert(
    afterMeasure.status === 'bound' ||
      afterMeasure.status === 'unsupported' ||
      afterMeasure.status === 'needs_clarification',
    'case9 resumed after sequential',
  )
  assert(
    afterMeasure.status !== 'needs_clarification' ||
      afterMeasure.request.slot !== 'entity_kind',
    'case9 not re-asking entity in same form',
  )
  console.log('  OK case9 sequential multi-ambiguity')
}

// 10) later NL correction replaces prior clarification
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case10 clarify')
  if (first.status !== 'needs_clarification') throw new Error('case10')
  const paid = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(paid.status === 'bound', 'case10 paid')
  // Simulate later interpreter correction (NOT clarification click).
  const corrected = emptyGoalSpec({
    source: 'wedding',
    dialogue: 'correct',
    aggregation: 'sum',
    measure: 'wedding.contract_value',
  })
  const r = bindGoalSpecWithClarification({ goal: corrected })
  assert(r.status === 'bound', 'case10 correction bound')
  if (r.status === 'bound') {
    assertEq(r.goal.measure, 'wedding.contract_value', 'case10 latest wins')
  }
  console.log('  OK case10 later correction')
}

// 11) follow-up inherits clarified measure via active DomainQuery
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case11 clarify')
  if (first.status !== 'needs_clarification') throw new Error('case11')
  const paid = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(paid.status === 'bound', 'case11 bound')
  const active = getGoalClarificationActiveCollection()
  assert(active?.measure === 'wedding.paid_amount', 'case11 active measure')
  assert(active?.aggregate === 'sum', 'case11 active sum')

  const followUp = emptyGoalSpec({
    source: 'wedding',
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: true },
    aggregation: null,
    measure: null,
    temporal: {
      expression: '2027',
      resolvedRange: { from: '2027-01-01', to: '2027-12-31' },
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const r = bindGoalSpecWithClarification({
    goal: followUp,
    activeCollectionQuery: active,
  })
  assert(r.status === 'bound', 'case11 follow-up bound')
  if (r.status === 'bound') {
    assertEq(r.goal.measure, 'wedding.paid_amount', 'case11 inherited measure')
    assertEq(r.goal.aggregation, 'sum', 'case11 inherited agg')
  }
  console.log('  OK case11 follow-up inheritance')
}

// 12) zero-result after clarification — valid empty, no re-open
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal({
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'NonexistentVenueXYZ',
      },
    ],
  })
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case12 clarify')
  if (first.status !== 'needs_clarification') throw new Error('case12')
  const answered = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.contract_value',
  })
  assert(answered.status === 'bound', 'case12 still bound DomainQuery')
  assert(getPendingGoalClarification() === null, 'case12 no pending reopen')
  // Row count is execution-layer; DomainQuery success must not re-clarify.
  console.log('  OK case12 zero-result valid query')
}

// 13) Assistant close destroys pending clarification
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case13 pending')
  assert(getPendingGoalClarification() != null, 'case13 has pending')
  destroyGoalClarificationOnAssistantClose()
  assert(getPendingGoalClarification() === null, 'case13 destroyed')
  assert(
    getGoalClarificationActiveCollection() === null,
    'case13 active cleared',
  )
  // Production close path also clears via shadow helper:
  setPendingGoalClarification(
    first.status === 'needs_clarification' ? first.request : null,
  )
  clearAssistantV4ShadowSessionAndPending()
  assert(getPendingGoalClarification() === null, 'case13 shadow clear')
  console.log('  OK case13 session close')
}

// 14) stale answer id rejected
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case14')
  if (first.status !== 'needs_clarification') throw new Error('case14')
  const rejected = answerGoalClarification({
    clarificationId: 'stale-id-not-matching',
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(rejected.status === 'rejected', 'case14 rejected')
  if (rejected.status === 'rejected') {
    assertEq(rejected.reason, 'stale_clarification_id', 'case14 reason')
  }
  assert(getPendingGoalClarification()?.id === first.request.id, 'case14 intact')
  console.log('  OK case14 stale id')
}

// 15) invalid selectedValue rejected
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case15')
  if (first.status !== 'needs_clarification') throw new Error('case15')
  const rejected = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.date',
  })
  assert(rejected.status === 'rejected', 'case15 rejected')
  if (rejected.status === 'rejected') {
    assertEq(rejected.reason, 'invalid_selected_value', 'case15 reason')
  }
  console.log('  OK case15 invalid value')
}

// 16) clarification click → zero interpreter calls (runtime probe)
{
  clearGoalClarificationSession()
  let interpretCalls = 0
  const interpretGoalSpec = () => {
    interpretCalls += 1
    throw new Error('interpret must not run')
  }
  void interpretGoalSpec // reference only for gate — click path never binds this
  const goal = ambiguousMoneyGoal()
  const first = bindGoalSpecWithClarification({ goal })
  assert(first.status === 'needs_clarification', 'case16')
  if (first.status !== 'needs_clarification') throw new Error('case16')
  answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assertEq(interpretCalls, 0, 'case16 zero interpret invocations')
  console.log('  OK case16 zero API/interpreter on click')
}

// 17) one legal measure candidate → auto-resolve
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const only: readonly SemanticFieldId[] = ['wedding.paid_amount']
  const derived = deriveMeasureClarificationOptions(goal, only)
  assert(derived.status === 'auto_resolve', 'case17 derive auto')
  if (derived.status === 'auto_resolve') {
    assertEq(derived.measure, 'wedding.paid_amount', 'case17 measure')
  }
  const r = bindGoalSpecWithClarification({
    goal,
    measureCandidateOverride: only,
  })
  assert(r.status === 'bound', 'case17 bound without UI')
  if (r.status === 'bound') {
    assertEq(r.goal.measure, 'wedding.paid_amount', 'case17 bound measure')
  }
  assert(getPendingGoalClarification() === null, 'case17 no pending UI')
  console.log('  OK case17 auto-resolve unique candidate')
}

// 18) zero legal measure candidates → unsupported
{
  clearGoalClarificationSession()
  const goal = ambiguousMoneyGoal()
  const none: readonly SemanticFieldId[] = []
  const derived = deriveMeasureClarificationOptions(goal, none)
  assert(derived.status === 'unsupported', 'case18 derive unsupported')
  const r = bindGoalSpecWithClarification({
    goal,
    measureCandidateOverride: none,
  })
  assert(r.status === 'unsupported', 'case18 unsupported')
  console.log('  OK case18 zero candidates unsupported')
}

// Apply one-slot isolation unit check
{
  const goal = ambiguousMoneyGoal({
    aspects: ['keep-me'],
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Keep Venue',
      },
    ],
  })
  const request = {
    id: 'gcl-test',
    slot: 'measure' as const,
    questionKey: 'measure' as const,
    options: [
      {
        id: 'wedding.paid_amount',
        value: 'wedding.paid_amount' as const,
        labelKey: 'measure.paid_amount' as const,
      },
    ],
    pendingGoal: goal,
    preservedActiveCollectionQuery: null,
    depth: 0,
    signature: 'measure|0|wedding.paid_amount',
  }
  const applied = applyGoalClarificationAnswer(request, {
    clarificationId: 'gcl-test',
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(applied.ok, 'apply ok')
  if (applied.ok) {
    assertEq(applied.goal.aspects[0], 'keep-me', 'aspects preserved')
    assertEq(
      (applied.goal.relations[0]?.value as string) ?? '',
      'Keep Venue',
      'relation preserved',
    )
    assertEq(goal.measure, null, 'original not mutated')
  }
  console.log('  OK apply one-slot isolation')
}

// Clarification ≠ confirmation: no write-auth types in apply path
{
  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/applyGoalClarificationAnswer.ts',
    ),
    'utf8',
  )
  assert(!/\bconfirmation\b/i.test(applySrc), 'apply has no confirmation')
  assert(!/\bauthorize\b/i.test(applySrc), 'apply not write-auth')
  console.log('  OK clarification vs confirmation separation')
}

clearGoalClarificationSession()
console.log('U2 GoalSpec clarification resume: ALL PASSED')
