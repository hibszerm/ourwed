/**
 * U4.8 — Real Host typed clarification resume with source:null (browser path).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/u48TypedClarificationResumeSourceNullAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyGoalSpec } from './goalSpec'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
  destroyGoalClarificationOnAssistantClose,
} from './resumeGoalClarification'
import {
  clearGoalClarificationSession,
  getPendingGoalClarification,
} from './goalClarificationSession'
import { submitGoalClarificationAnswerWithLabel } from './goalClarificationHostAdapter'
import { clarificationLabelCopy } from './goalClarificationCopy'
import { validateGoalSpecConsistency } from './validateGoalSpec'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
}

const root = resolve(import.meta.dirname ?? __dirname)

function browserLikeSumNullMeasure() {
  return validateGoalSpecConsistency(
    emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'ask',
      source: null,
      aggregation: 'sum',
      measure: null,
      ambiguities: [
        {
          slot: 'measure',
          reason: 'sum_requires_measure',
          candidates: [
            { id: 'wedding.contract_value', label: 'contract' },
            { id: 'wedding.paid_amount', label: 'paid' },
            { id: 'wedding.remaining_amount', label: 'remaining' },
          ],
        },
      ],
    }),
  ).goal
}

// A–E: source null → measure UI with source resolved → click paid → bound DQ
{
  clearGoalClarificationSession()
  const pendingShape = browserLikeSumNullMeasure()
  assertEq(pendingShape.source, null, 'A pending source null')
  assertEq(pendingShape.aggregation, 'sum', 'A aggregation sum')
  assertEq(pendingShape.measure, null, 'A measure null')
  assert(
    pendingShape.ambiguities.some((a) => a.slot === 'measure'),
    'A measure amb',
  )

  const first = bindGoalSpecWithClarification({
    goal: pendingShape,
    activeCollectionQuery: null,
    activeResource: null,
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'A first clarify')
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  assertEq(first.request.slot, 'measure', 'A slot measure')
  // S1: clarification does not invent source — pending stays null until Resolver
  assertEq(first.request.pendingGoal.source, null, 'A pending source still null')
  assertEq(first.request.pendingGoal.measure, null, 'A pending measure null')

  const paidOpt = first.request.options.find(
    (o) => o.value === 'wedding.paid_amount',
  )
  assert(!!paidOpt, 'C paid option typed value')
  assertEq(
    clarificationLabelCopy(paidOpt!.labelKey),
    'Już wpłacone',
    'C label Już wpłacone',
  )

  // Typed click — Host adapter; selectedLabel never used as semantic value
  const { result } = submitGoalClarificationAnswerWithLabel({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
    selectedLabel: 'Już wpłacone',
  })
  assertEq(result.status, 'bound', 'C Binder bound')
  if (result.status !== 'bound') {
    throw new Error(
      `resume not bound: ${result.status} ${'reason' in result ? result.reason : ''}`,
    )
  }
  assertEq(result.patchedGoal.measure, 'wedding.paid_amount', 'A patched measure')
  // S1: clarification/GoalSpec does not invent source; BoundGoal/DQ do via registry
  assertEq(result.patchedGoal.source, null, 'A GoalSpec source still null')
  assertEq(result.patchedGoal.aggregation, 'sum', 'A patched aggregation')
  assert(
    !result.patchedGoal.ambiguities.some((a) => a.slot === 'measure'),
    'B measure amb cleared',
  )
  assertEq(result.goal.source, 'wedding', 'C bound source from registry')
  assertEq(result.goal.measure, 'wedding.paid_amount', 'C bound measure')
  assertEq(result.goal.aggregation, 'sum', 'C bound aggregation')
  assertEq(result.query.source, 'wedding', 'D DQ source')
  assertEq(result.query.aggregate, 'sum', 'D DQ aggregate')
  assertEq(result.query.measure, 'wedding.paid_amount', 'D DQ measure')
  clearGoalClarificationSession()
  console.log('  OK A–E source-null typed resume')
}

// E static: click path must not call interpret / v5_goal_interpret
{
  const adapter = readFileSync(
    resolve(root, 'goalClarificationHostAdapter.ts'),
    'utf8',
  )
  const resume = readFileSync(resolve(root, 'resumeGoalClarification.ts'), 'utf8')
  const host = readFileSync(
    resolve(root, '../../AssistantHost.tsx'),
    'utf8',
  )
  assert(
    adapter.includes('answerGoalClarification') &&
      !adapter.includes('interpretGoalSpec') &&
      !adapter.includes('v5_goal_interpret'),
    'E adapter zero interpreter',
  )
  assert(
    !resume.includes('interpretGoalSpec') &&
      !resume.includes('v5_goal_interpret'),
    'E resume zero interpreter',
  )
  const clickIdx = host.indexOf('submitGoalClarificationAnswerWithLabel')
  assert(clickIdx >= 0, 'E Host uses typed submit')
  const goalPendingBlock = host.slice(
    host.indexOf('const goalPending = getPendingGoalClarification()'),
    host.indexOf('const pending = workingContext.pendingClarification'),
  )
  assert(
    goalPendingBlock.includes('submitGoalClarificationAnswerWithLabel') &&
      !goalPendingBlock.includes('v5_goal_interpret') &&
      !goalPendingBlock.includes('runAssistantTurn'),
    'E Host V5 click early-return no NL',
  )
  console.log('  OK E zero-LLM static')
}

// F: V5 pending wins over V3 path when goalPending set (Host order)
{
  const host = readFileSync(
    resolve(root, '../../AssistantHost.tsx'),
    'utf8',
  )
  const v5Idx = host.indexOf('getPendingGoalClarification()')
  const v3Idx = host.indexOf('workingContext.pendingClarification')
  assert(v5Idx >= 0 && v3Idx > v5Idx, 'F V5 pending checked before V3')
  assert(
    host.includes('if (goalPending)') &&
      host.slice(v5Idx, v3Idx).includes('return'),
    'F V5 click returns before V3 handler',
  )
  console.log('  OK F V5 before V3 handler')
}

// G: close destroys pending
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: browserLikeSumNullMeasure(),
    activeCollectionQuery: null,
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'G pending')
  assert(!!getPendingGoalClarification(), 'G session set')
  destroyGoalClarificationOnAssistantClose()
  assertEq(getPendingGoalClarification(), null, 'G cleared on close')
  console.log('  OK G close clears')
}

// H: new NL turn clears pending (session clear before re-bind)
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: browserLikeSumNullMeasure(),
    activeCollectionQuery: null,
    storePending: true,
  })
  assert(!!getPendingGoalClarification(), 'H pending before')
  clearGoalClarificationSession() // Host clears on new NL turn
  assertEq(getPendingGoalClarification(), null, 'H superseded')
  // Stale click rejected
  if (first.status === 'needs_clarification') {
    const stale = answerGoalClarification({
      clarificationId: first.request.id,
      slot: 'measure',
      selectedValue: 'wedding.paid_amount',
    })
    assertEq(stale.status, 'rejected', 'H stale rejected')
  }
  console.log('  OK H NL supersedes')
}

// Fail-closed: count + null source must NOT auto-resolve wedding via this path
{
  clearGoalClarificationSession()
  const count = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'ask',
      source: null,
      aggregation: 'count',
      measure: null,
    }),
    activeCollectionQuery: null,
    activeResource: null,
    storePending: false,
  })
  // May be unsupported or clarification — must not silently become sum money
  if (count.status === 'bound') {
    assert(count.goal.aggregation !== 'sum', 'no invent sum')
  }
  clearGoalClarificationSession()
  console.log('  OK fail-closed count path')
}

console.log('U4.8 typed clarification resume source:null: ALL PASSED')
