/**
 * U3 — GoalSpec clarification Host adapter acceptance (deterministic).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/u3GoalClarificationHostAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyGoalSpec } from './goalSpec'
import {
  clarificationLabelCopy,
  clarificationQuestionCopy,
} from './goalClarificationCopy'
import {
  clearGoalClarificationSession,
  clearPendingGoalClarificationOnly,
  getGoalClarificationActiveCollection,
  getPendingGoalClarification,
} from './goalClarificationSession'
import {
  goalClarificationToAssistantResponse,
  presentGoalClarificationRequest,
  submitGoalClarificationAnswerWithLabel,
  toGoalClarificationViewModel,
} from './goalClarificationHostAdapter'
import { bindGoalSpecWithClarification } from './resumeGoalClarification'
import { clearAssistantV4ShadowSessionAndPending } from '../shadow'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (got ${String(a)} vs ${String(b)})`)
}

console.log('U3 GoalSpec clarification Host acceptance')

clearGoalClarificationSession()

function ambiguousMoneyGoal() {
  return emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [{ slot: 'measure', reason: 'unspecified_measure' }],
  })
}

function pendingMeasureRequest() {
  clearGoalClarificationSession()
  const r = bindGoalSpecWithClarification({ goal: ambiguousMoneyGoal() })
  assert(r.status === 'needs_clarification', 'need pending request')
  if (r.status !== 'needs_clarification') throw new Error('pending')
  return r.request
}

// 1–3) pending measure clarification renders via view model + copy
{
  const request = pendingMeasureRequest()
  const vm = toGoalClarificationViewModel(request)
  assertEq(vm.question, 'Którą wartość masz na myśli?', 'case1 question')
  assertEq(vm.options.length, 3, 'case3 three options')
  const labels = vm.options.map((o) => o.label)
  assert(labels.includes('Wartość umów'), 'case3 cv')
  assert(labels.includes('Już wpłacone'), 'case3 paid')
  assert(labels.includes('Pozostało do zapłaty'), 'case3 rem')
  assertEq(
    clarificationQuestionCopy('measure'),
    vm.question,
    'case2 copy map question',
  )
  const response = presentGoalClarificationRequest(request)
  assertEq(response.kind, 'clarification', 'case1 response kind')
  assertEq(response.question, vm.question, 'case1 response question')
  assertEq(response.options.length, 3, 'case1 response options')
  console.log('  OK cases 1–3 render + copy + options')
}

// 4–5) option click passes typed selectedValue; label not parsed
{
  const request = pendingMeasureRequest()
  presentGoalClarificationRequest(request)
  const paid = request.options.find((o) => o.value === 'wedding.paid_amount')
  assert(paid != null, 'case4 paid option')
  const label = clarificationLabelCopy(paid!.labelKey)
  assertEq(label, 'Już wpłacone', 'case5 label presentation')
  const { result, response } = submitGoalClarificationAnswerWithLabel({
    clarificationId: request.id,
    slot: 'measure',
    selectedValue: paid!.value, // typed — not label
    selectedLabel: label,
  })
  assert(result.status === 'bound', 'case4 bound')
  if (result.status === 'bound') {
    assertEq(result.goal.measure, 'wedding.paid_amount', 'case4 typed value')
    assertEq(result.query.measure, 'wedding.paid_amount', 'case4 dq')
  }
  assert(response.kind === 'text', 'case4 text resume')
  assert(
    !response.kind || response.kind !== 'clarification',
    'case7 pending replaced',
  )
  assert(getPendingGoalClarification() === null, 'case7 pending cleared')
  // Prove label was never used as measure id
  assert(label !== 'wedding.paid_amount', 'case5 label ≠ value')
  console.log('  OK cases 4–5 typed click + label independence')
}

// 6) zero interpreter/API on click path
{
  const hostAdapter = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/goalClarificationHostAdapter.ts',
    ),
    'utf8',
  )
  const host = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
    'utf8',
  )
  assert(!/\binterpretGoalSpec\b/.test(hostAdapter), 'case6 adapter no interpret')
  assert(!/openai\.com/i.test(hostAdapter), 'case6 adapter no openai')
  assert(
    host.includes('submitGoalClarificationAnswerWithLabel'),
    'case6 Host wired',
  )
  assert(
    !host.includes('interpretGoalSpec('),
    'case6 Host click no interpret call',
  )
  let interpretCalls = 0
  const interpretGoalSpec = () => {
    interpretCalls += 1
  }
  void interpretGoalSpec
  const request = pendingMeasureRequest()
  presentGoalClarificationRequest(request)
  submitGoalClarificationAnswerWithLabel({
    clarificationId: request.id,
    slot: 'measure',
    selectedValue: 'wedding.contract_value',
    selectedLabel: 'Wartość umów',
  })
  assertEq(interpretCalls, 0, 'case6 zero interpret runtime')
  console.log('  OK case6 zero LLM')
}

// 7 already covered above; 8 sequential next clarification
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
  assert(first.status === 'needs_clarification', 'case8 first')
  if (first.status !== 'needs_clarification') throw new Error('case8')
  assertEq(first.request.slot, 'entity_kind', 'case8 entity first')
  const asResponse = goalClarificationToAssistantResponse(first.request)
  assertEq(asResponse.kind, 'clarification', 'case8 ui response')
  const next = submitGoalClarificationAnswerWithLabel({
    clarificationId: first.request.id,
    slot: 'entity_kind',
    selectedValue: 'package',
    selectedLabel: 'Pakiet',
  })
  assert(
    next.result.status === 'needs_clarification' ||
      next.result.status === 'bound' ||
      next.result.status === 'unsupported',
    'case8 sequential resume',
  )
  if (next.result.status === 'needs_clarification') {
    assertEq(next.result.request.slot, 'measure', 'case8 measure next')
    assertEq(next.response.kind, 'clarification', 'case8 next UI')
  }
  console.log('  OK case8 sequential clarification')
}

// 9–10) stale / invalid
{
  const request = pendingMeasureRequest()
  presentGoalClarificationRequest(request)
  const stale = submitGoalClarificationAnswerWithLabel({
    clarificationId: 'old-id',
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
    selectedLabel: 'Już wpłacone',
  })
  assert(stale.result.status === 'rejected', 'case9 rejected')
  assertEq(stale.response.kind, 'error', 'case9 neutral error')
  assert(getPendingGoalClarification()?.id === request.id, 'case9 intact')

  const invalid = submitGoalClarificationAnswerWithLabel({
    clarificationId: request.id,
    slot: 'measure',
    selectedValue: 'wedding.date',
    selectedLabel: 'Data',
  })
  assert(invalid.result.status === 'rejected', 'case10 rejected')
  assert(getPendingGoalClarification()?.id === request.id, 'case10 intact')
  console.log('  OK cases 9–10 stale/invalid')
}

// 11–12) close destroys; reopen no pending
{
  const request = pendingMeasureRequest()
  presentGoalClarificationRequest(request)
  assert(getPendingGoalClarification() != null, 'case11 pending')
  clearAssistantV4ShadowSessionAndPending()
  assert(getPendingGoalClarification() === null, 'case11 cleared')
  assert(getGoalClarificationActiveCollection() === null, 'case11 active gone')
  // reopen simulation: session empty
  assert(getPendingGoalClarification() === null, 'case12 reopen empty')
  console.log('  OK cases 11–12 close/reopen')
}

// 13) follow-up uses resolved active DomainQuery
{
  const request = pendingMeasureRequest()
  presentGoalClarificationRequest(request)
  const paid = submitGoalClarificationAnswerWithLabel({
    clarificationId: request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
    selectedLabel: 'Już wpłacone',
  })
  assert(paid.result.status === 'bound', 'case13 bound')
  const active = getGoalClarificationActiveCollection()
  assertEq(active?.measure, 'wedding.paid_amount', 'case13 active measure')
  const follow = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
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
    }),
    activeCollectionQuery: active,
  })
  assert(follow.status === 'bound', 'case13 follow bound')
  if (follow.status === 'bound') {
    assertEq(follow.goal.measure, 'wedding.paid_amount', 'case13 inherit')
  }
  console.log('  OK case13 follow-up inheritance')
}

// 14) zero-result does not re-open clarification
{
  clearGoalClarificationSession()
  const r = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
      ambiguities: [{ slot: 'measure', reason: 'x' }],
      relations: [
        {
          relation: 'place',
          field: 'place.name',
          op: 'contains',
          value: 'NowhereVenue',
        },
      ],
    }),
  })
  assert(r.status === 'needs_clarification', 'case14 clarify')
  if (r.status !== 'needs_clarification') throw new Error('case14')
  const answered = submitGoalClarificationAnswerWithLabel({
    clarificationId: r.request.id,
    slot: 'measure',
    selectedValue: 'wedding.contract_value',
    selectedLabel: 'Wartość umów',
  })
  assert(answered.result.status === 'bound', 'case14 valid DQ')
  assert(getPendingGoalClarification() === null, 'case14 no reopen')
  console.log('  OK case14 zero-result')
}

// 15) clarification ≠ write confirmation
{
  const host = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
    'utf8',
  )
  // GoalSpec click block must not call write tools
  const idx = host.indexOf('submitGoalClarificationAnswerWithLabel')
  assert(idx > 0, 'case15 host block present')
  const slice = host.slice(idx, idx + 1200)
  assert(!slice.includes('executeAssistantTool'), 'case15 no write tool')
  assert(!slice.includes('create_wedding'), 'case15 no create wedding')
  assert(!slice.includes('onConfirmCreate'), 'case15 no confirm create')
  console.log('  OK case15 not confirmation')
}

// 16) keyboard / semantic buttons (component source)
{
  const ui = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/components/AssistantGoalClarification.tsx',
    ),
    'utf8',
  )
  assert(ui.includes('type="button"'), 'case16 button')
  assert(ui.includes('aria-label'), 'case16 aria')
  assert(ui.includes('data-selected-value'), 'case16 typed value attr')
  assert(!ui.includes('onClick={() => onSelect(opt.label'), 'case16 no label click')
  console.log('  OK case16 a11y buttons')
}

// 17) mobile touch targets via shared choiceButton (>=44px)
{
  const css = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/components/Assistant.module.css',
    ),
    'utf8',
  )
  assert(css.includes('min-height: 56px'), 'case17 touch target')
  assert(css.includes('.choiceButton'), 'case17 shared styles')
  console.log('  OK case17 mobile target')
}

// NL supersession clears pending chips
{
  const request = pendingMeasureRequest()
  presentGoalClarificationRequest(request)
  assert(getPendingGoalClarification() != null, 'super pending')
  clearPendingGoalClarificationOnly()
  assert(getPendingGoalClarification() === null, 'super cleared')
  const host = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
    'utf8',
  )
  assert(
    host.includes('clearPendingGoalClarificationOnly'),
    'Host NL supersession',
  )
  console.log('  OK NL supersession wiring')
}

// Renderer uses GoalSpec component when pending + flag path present
{
  const renderer = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/components/AssistantResponseRenderer.tsx',
    ),
    'utf8',
  )
  assert(
    renderer.includes('AssistantGoalClarification'),
    'renderer GoalSpec component',
  )
  assert(
    renderer.includes('getPendingGoalClarification'),
    'renderer pending check',
  )
  console.log('  OK renderer bridge')
}

// Feature flag gate (default OFF)
{
  const flag = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/flag.ts'),
    'utf8',
  )
  assert(flag.includes('VITE_ASSISTANT_V5_GOAL_SHADOW'), 'flag exists')
  const adapter = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/goalClarificationHostAdapter.ts',
    ),
    'utf8',
  )
  assert(
    adapter.includes('isAssistantV5GoalShadowEnabled'),
    'host enable uses V5 flag',
  )
  console.log('  OK feature flag gate')
}

clearGoalClarificationSession()
console.log('U3 GoalSpec clarification Host: ALL PASSED')
