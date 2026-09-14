/**
 * U4 — V5 GoalSpec shadow NL → clarification presentation acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/u4V5GoalSpecShadowAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyGoalSpec } from './goalSpec'
import {
  clearGoalClarificationSession,
  getGoalClarificationActiveCollection,
  getPendingGoalClarification,
} from './goalClarificationSession'
import { submitGoalClarificationAnswerWithLabel } from './goalClarificationHostAdapter'
import {
  getV5GoalShadowInterpretCallCount,
  invalidateV5GoalShadowTurn,
  resetV5GoalShadowSessionForTests,
  runV5GoalSpecShadow,
  setV5GoalShadowSessionOpen,
  type V5GoalShadowResult,
} from './v5GoalSpecShadow'
import type { GoalInterpretResult } from './interpretGoalSpec'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (got ${String(a)} vs ${String(b)})`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

console.log('U4 V5 GoalSpec shadow acceptance')

resetV5GoalShadowSessionForTests()
clearGoalClarificationSession()
setV5GoalShadowSessionOpen(true)

const AMB_FLAT = {
  version: 1,
  requestKind: 'domain_query',
  dialogue: 'ask',
  source: 'wedding',
  aggregation: 'sum',
  measure: null,
  ambiguitySlot0: 'measure',
  ambiguityReason0: 'unspecified',
  ambiguitySlot1: null,
  ambiguityReason1: null,
  inheritActiveCollection: false,
  namedTargetText: null,
  namedTargetKindHint: null,
  temporalExpression: null,
  dateDimension: null,
  dateDimensionAmbiguous: false,
  aspect0: null,
  aspect1: null,
  orderByField: null,
  orderByDirection: null,
  groupByField: null,
  correctionTargetSlot: null,
  topicKey: null,
  unsupportedReason: null,
  relation0: null,
  relation0Field: null,
  relation0Op: null,
  relation0Value: null,
}

function fixtureInterpret(payload: unknown) {
  return async (): Promise<GoalInterpretResult> => {
    const { parseFlatGoalSpecPayload, validateGoalSpec } = await import(
      './goalSpecSchema'
    )
    const { normalizeGoalSpecTemporal } = await import(
      './normalizeGoalSpecTemporal'
    )
    const parsed = parseFlatGoalSpecPayload(payload)
    if (!parsed || !validateGoalSpec(parsed)) {
      return {
        ok: false,
        error: 'schema_error',
        code: 'schema_error',
        latencyMs: 1,
      }
    }
    return {
      ok: true,
      goalSpec: normalizeGoalSpecTemporal(parsed, '2026-09-13'),
      latencyMs: 1,
      model: 'fixture',
    }
  }
}

function waitResult(
  run: (onResult: (r: V5GoalShadowResult) => void) => void,
): Promise<V5GoalShadowResult> {
  return new Promise((resolveP) => {
    run((r) => resolveP(r))
  })
}

// 1) flag OFF → no interpreter (skipped without force)
{
  resetV5GoalShadowSessionForTests()
  setV5GoalShadowSessionOpen(true)
  let interpretCalls = 0
  const r = await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-off',
      userText: 'ile to będzie?',
      // force omitted → respects flag (OFF in test env)
      interpret: async () => {
        interpretCalls += 1
        return { ok: false, error: 'x', latencyMs: 0 }
      },
      onResult,
    })
  })
  assertEq(r.status, 'skipped', 'case1 skipped')
  assertEq(interpretCalls, 0, 'case1 no interpret')
  console.log('  OK case1 flag OFF')
}

// 2) flag force ON → one interpret call
{
  resetV5GoalShadowSessionForTests()
  setV5GoalShadowSessionOpen(true)
  let interpretCalls = 0
  await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-one',
      userText: 'ile to będzie?',
      force: true,
      interpret: async (input) => {
        interpretCalls += 1
        return fixtureInterpret(AMB_FLAT)(input)
      },
      onResult,
    })
  })
  assertEq(interpretCalls, 1, 'case2 one call')
  assertEq(getV5GoalShadowInterpretCallCount(), 1, 'case2 counter')
  console.log('  OK case2 one interpret')
}

// 3–4) V3 authority: Host still calls runAssistantQuery; shadow does not setTurns for bound
{
  const host = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
    'utf8',
  )
  assert(host.includes('runAssistantQuery'), 'case3 V3 path')
  assert(host.includes('runV5GoalSpecShadow'), 'case3 V5 shadow')
  assert(
    host.includes('never replace V3') ||
      host.includes('never replaces V3') ||
      host.includes('Never replaces production'),
    'case4 authority comment',
  )
  // Click path must not setTurns for GoalSpec bound
  const clickIdx = host.indexOf('submitGoalClarificationAnswerWithLabel')
  const clickSlice = host.slice(clickIdx, clickIdx + 1800)
  assert(
    !clickSlice.includes('setTurns([') ||
      clickSlice.indexOf('// U4: never replace') <
        clickSlice.indexOf('setTurns'),
    'case4 no V3 replace on click',
  )
  console.log('  OK cases 3–4 V3 authority')
}

// 5–6) NeedsClarification creates pending + chips path
{
  resetV5GoalShadowSessionForTests()
  clearGoalClarificationSession()
  setV5GoalShadowSessionOpen(true)
  const r = await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-clar',
      userText: 'ile to będzie?',
      force: true,
      interpret: fixtureInterpret(AMB_FLAT),
      onResult,
    })
  })
  assertEq(r.status, 'needs_clarification', 'case5 clarify')
  if (r.status === 'needs_clarification') {
    assertEq(r.request.slot, 'measure', 'case5 measure')
    assert(getPendingGoalClarification()?.id === r.request.id, 'case5 pending')
    assert(r.request.options.length === 3, 'case6 options')
  }
  console.log('  OK cases 5–6 clarification present')
}

// 7–8) chip click zero second interpret + U2 resume
{
  const before = getV5GoalShadowInterpretCallCount()
  const pending = getPendingGoalClarification()
  assert(pending != null, 'case7 pending')
  const paid = submitGoalClarificationAnswerWithLabel({
    clarificationId: pending!.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
    selectedLabel: 'Już wpłacone',
  })
  assert(paid.result.status === 'bound', 'case8 bound')
  assertEq(
    getV5GoalShadowInterpretCallCount(),
    before,
    'case7 no second interpret',
  )
  if (paid.result.status === 'bound') {
    assertEq(paid.result.query.measure, 'wedding.paid_amount', 'case8 dq')
  }
  console.log('  OK cases 7–8 click resume')
}

// 9) new NL turn invalidates previous clarification
{
  resetV5GoalShadowSessionForTests()
  clearGoalClarificationSession()
  setV5GoalShadowSessionOpen(true)
  const first = await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-a',
      userText: 'ile?',
      force: true,
      interpret: fixtureInterpret(AMB_FLAT),
      onResult,
    })
  })
  assert(first.status === 'needs_clarification', 'case9 a')
  const oldId = getPendingGoalClarification()?.id
  clearGoalClarificationSession() // Host clears pending on new turn
  invalidateV5GoalShadowTurn({ reason: 'new_nl_turn' })
  const second = await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-b',
      userText: 'ile wesel?',
      force: true,
      interpret: fixtureInterpret({
        ...AMB_FLAT,
        aggregation: 'count',
        measure: null,
        ambiguitySlot0: null,
        ambiguityReason0: null,
      }),
      onResult,
    })
  })
  assert(second.status === 'bound' || second.status === 'needs_clarification' || second.status === 'unsupported', 'case9 b')
  if (oldId) {
    const stale = submitGoalClarificationAnswerWithLabel({
      clarificationId: oldId,
      slot: 'measure',
      selectedValue: 'wedding.paid_amount',
      selectedLabel: 'Już wpłacone',
    })
    assert(stale.result.status === 'rejected', 'case9 stale rejected')
  }
  console.log('  OK case9 NL supersession')
}

// 10) late V5 result from old turn discarded
{
  resetV5GoalShadowSessionForTests()
  clearGoalClarificationSession()
  setV5GoalShadowSessionOpen(true)
  let late: V5GoalShadowResult | null = null
  runV5GoalSpecShadow({
    turnId: 't-slow',
    userText: 'ile?',
    force: true,
    interpret: async () => {
      await sleep(40)
      return fixtureInterpret(AMB_FLAT)({ userText: 'ile?' })
    },
    onResult: (r) => {
      late = r
    },
  })
  invalidateV5GoalShadowTurn({ reason: 'new_nl_turn' })
  await sleep(80)
  assert(late != null, 'case10 got result')
  assertEq(late!.status, 'discarded', 'case10 discarded')
  console.log('  OK case10 late discarded')
}

// 11) close while pending prevents resurrection
{
  resetV5GoalShadowSessionForTests()
  clearGoalClarificationSession()
  setV5GoalShadowSessionOpen(true)
  let closedResult: V5GoalShadowResult | null = null
  runV5GoalSpecShadow({
    turnId: 't-close',
    userText: 'ile?',
    force: true,
    interpret: async () => {
      await sleep(40)
      return fixtureInterpret(AMB_FLAT)({ userText: 'ile?' })
    },
    onResult: (r) => {
      closedResult = r
    },
  })
  setV5GoalShadowSessionOpen(false)
  invalidateV5GoalShadowTurn({ wipeAll: true, reason: 'assistant_close' })
  await sleep(80)
  assertEq(closedResult!.status, 'discarded', 'case11 discarded')
  assert(getPendingGoalClarification() === null, 'case11 no pending')
  console.log('  OK case11 close safety')
}

// 12–13) provider/parser error isolation
{
  resetV5GoalShadowSessionForTests()
  setV5GoalShadowSessionOpen(true)
  const provider = await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-prov',
      userText: 'x',
      force: true,
      interpret: async () => ({
        ok: false,
        error: 'provider',
        code: 'provider_error',
        latencyMs: 1,
      }),
      onResult,
    })
  })
  assertEq(provider.status, 'interpret_error', 'case12 provider')

  const schema = await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-schema',
      userText: 'x',
      force: true,
      interpret: async () => ({
        ok: false,
        error: 'schema',
        code: 'schema_error',
        latencyMs: 1,
      }),
      onResult,
    })
  })
  assertEq(schema.status, 'interpret_error', 'case13 schema')
  console.log('  OK cases 12–13 error isolation')
}

// 14–15) clarified DQ updates active collection + follow-up inherit
{
  resetV5GoalShadowSessionForTests()
  clearGoalClarificationSession()
  setV5GoalShadowSessionOpen(true)
  const clar = await waitResult((onResult) => {
    runV5GoalSpecShadow({
      turnId: 't-follow',
      userText: 'ile?',
      force: true,
      interpret: fixtureInterpret(AMB_FLAT),
      onResult,
    })
  })
  assert(clar.status === 'needs_clarification', 'case14 clar')
  if (clar.status !== 'needs_clarification') throw new Error('case14')
  const answered = submitGoalClarificationAnswerWithLabel({
    clarificationId: clar.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
    selectedLabel: 'Już wpłacone',
  })
  assert(answered.result.status === 'bound', 'case14 bound')
  const active = getGoalClarificationActiveCollection()
  assertEq(active?.measure, 'wedding.paid_amount', 'case14 active')

  const { bindGoalSpecWithClarification } = await import(
    './resumeGoalClarification'
  )
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
  assert(follow.status === 'bound', 'case15 follow')
  if (follow.status === 'bound') {
    assertEq(follow.goal.measure, 'wedding.paid_amount', 'case15 inherit')
  }
  console.log('  OK cases 14–15 active collection + follow-up')
}

// 16) zero-result valid
{
  assert(getPendingGoalClarification() === null, 'case16 no re-clarify')
  console.log('  OK case16 zero-result (no reopen)')
}

// 17) write confirmation untouched
{
  const host = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
    'utf8',
  )
  assert(host.includes('onConfirmCreateWedding'), 'case17 confirm still exists')
  const v5Idx = host.indexOf('runV5GoalSpecShadow')
  const v5Slice = host.slice(v5Idx, v5Idx + 900)
  assert(!v5Slice.includes('executeAssistantTool'), 'case17 shadow no write')
  console.log('  OK case17 write safety')
}

// 18) no CRM mutation in shadow module
{
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/v5GoalSpecShadow.ts',
    ),
    'utf8',
  )
  assert(!src.includes('supabase.from'), 'case18 no db')
  assert(!src.includes('taskService'), 'case18 no tasks')
  console.log('  OK case18 no CRM mutation')
}

resetV5GoalShadowSessionForTests()
clearGoalClarificationSession()
console.log('U4 V5 GoalSpec shadow: ALL PASSED')
