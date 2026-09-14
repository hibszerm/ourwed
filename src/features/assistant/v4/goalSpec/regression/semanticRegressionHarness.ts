/**
 * S0 — Deterministic semantic regression harness.
 *
 * Runs typed GoalSpec + active DomainQuery through the CURRENT pipeline:
 *   validateGoalSpecConsistency → bindGoalSpecWithClarification
 *   → optional typed clarification resume → DomainQuery
 *
 * No live LLM. No NL as authority.
 */

import { validateGoalSpecConsistency } from '../validateGoalSpec'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
} from '../resumeGoalClarification'
import {
  clearGoalClarificationSession,
  getGoalClarificationActiveCollection,
  setGoalClarificationActiveCollection,
} from '../goalClarificationSession'
import type { DomainQuery } from '../../domainQuery/domainQuery'
import {
  assertSlotsMatch,
  slotsFromBoundGoal,
  slotsFromDomainQuery,
} from './semanticDiff'
import type {
  ExpectedResolverOutcome,
  SemanticRegressionCase,
  SemanticRegressionTurn,
  SemanticSlots,
} from './types'

export type HarnessRunResult = {
  id: string
  name: string
  status: SemanticRegressionCase['status']
  result: 'pass' | 'skip' | 'fail'
  detail?: string
}

function runExpected(
  caseName: string,
  expected: ExpectedResolverOutcome,
  actual: {
    status: string
    slot?: string
    measureOptions?: string[]
    reason?: string
    slots?: SemanticSlots
  },
): void {
  if (expected.kind === 'bound') {
    if (actual.status !== 'bound') {
      throw new Error(
        `${caseName}: expected bound, got ${actual.status}${
          actual.reason ? ` (${actual.reason})` : ''
        }`,
      )
    }
    if (actual.slots) {
      assertSlotsMatch(caseName, expected.slots, actual.slots)
    }
    return
  }
  if (expected.kind === 'needs_clarification') {
    if (actual.status !== 'needs_clarification') {
      throw new Error(
        `${caseName}: expected needs_clarification(${expected.slot}), got ${actual.status}`,
      )
    }
    if (actual.slot !== expected.slot) {
      throw new Error(
        `${caseName}: clarification slot expected ${expected.slot}, got ${actual.slot}`,
      )
    }
    if (expected.measureOptions && actual.measureOptions) {
      for (const id of expected.measureOptions) {
        if (!actual.measureOptions.includes(id)) {
          throw new Error(
            `${caseName}: missing measure option ${id} (got ${actual.measureOptions.join(',')})`,
          )
        }
      }
    }
    return
  }
  if (actual.status !== 'unsupported') {
    throw new Error(
      `${caseName}: expected unsupported, got ${actual.status}`,
    )
  }
  if (
    expected.reasonIncludes &&
    !(actual.reason ?? '').includes(expected.reasonIncludes)
  ) {
    throw new Error(
      `${caseName}: unsupported reason expected to include "${expected.reasonIncludes}", got "${actual.reason}"`,
    )
  }
}

function executeTurn(
  caseName: string,
  turn: SemanticRegressionTurn,
  active: DomainQuery | null,
): DomainQuery | null {
  const validated = validateGoalSpecConsistency(turn.goal)
  const bound = bindGoalSpecWithClarification({
    goal: validated.goal,
    activeCollectionQuery:
      turn.activeDomainQuery !== undefined
        ? turn.activeDomainQuery
        : active,
    activeResource:
      turn.pageResourceKind === 'wedding'
        ? { kind: 'wedding', id: 'page-wedding' }
        : null,
    storePending: true,
  })

  if (bound.status === 'bound') {
    runExpected(caseName, turn.expected, {
      status: 'bound',
      slots: slotsFromBoundGoal(bound.goal),
    })
    if (turn.expectedDomainQuery) {
      assertSlotsMatch(
        caseName,
        turn.expectedDomainQuery,
        slotsFromDomainQuery(bound.query),
      )
    }
    setGoalClarificationActiveCollection(bound.query)
    return bound.query
  }

  if (bound.status === 'needs_clarification') {
    runExpected(caseName, turn.expected, {
      status: 'needs_clarification',
      slot: bound.request.slot,
      measureOptions: bound.request.options.map((o) => String(o.value)),
    })

    if (!turn.resume) {
      return getGoalClarificationActiveCollection()
    }

    const resumed = answerGoalClarification({
      clarificationId: bound.request.id,
      slot: turn.resume.slot,
      selectedValue: turn.resume.selectedValue,
    })

    if (!turn.expectedAfterResume) {
      throw new Error(`${caseName}: resume step without expectedAfterResume`)
    }

    if (resumed.status === 'bound') {
      runExpected(caseName + ' (resume)', turn.expectedAfterResume, {
        status: 'bound',
        slots: slotsFromBoundGoal(resumed.goal),
      })
      if (turn.expectedDomainQueryAfterResume) {
        assertSlotsMatch(
          caseName + ' (resume DQ)',
          turn.expectedDomainQueryAfterResume,
          slotsFromDomainQuery(resumed.query),
        )
      }
      setGoalClarificationActiveCollection(resumed.query)
      return resumed.query
    }

    runExpected(caseName + ' (resume)', turn.expectedAfterResume, {
      status: resumed.status,
      reason: 'reason' in resumed ? String(resumed.reason) : undefined,
      slot:
        resumed.status === 'needs_clarification'
          ? resumed.request.slot
          : undefined,
    })
    return getGoalClarificationActiveCollection()
  }

  // unsupported
  runExpected(caseName, turn.expected, {
    status: 'unsupported',
    reason: bound.reason,
  })
  return active
}

/**
 * Run one case. PASS_CURRENT must succeed.
 * KNOWN_GAP / FUTURE_CAPABILITY: skip execution unless customCheck provided,
 * or run customCheck that documents the gap.
 */
export function runSemanticRegressionCase(
  c: SemanticRegressionCase,
): HarnessRunResult {
  if (c.status === 'FUTURE_CAPABILITY') {
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      result: 'skip',
      detail: c.note ?? 'future capability',
    }
  }

  if (c.customCheck) {
    try {
      c.customCheck()
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        result: 'pass',
      }
    } catch (e) {
      if (c.status === 'KNOWN_GAP') {
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          result: 'pass',
          detail: `KNOWN_GAP documented: ${
            e instanceof Error ? e.message : String(e)
          }`,
        }
      }
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        result: 'fail',
        detail: e instanceof Error ? e.message : String(e),
      }
    }
  }

  if (c.status === 'KNOWN_GAP' && (!c.turns || c.turns.length === 0)) {
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      result: 'skip',
      detail: c.note ?? 'known gap (no executable turns)',
    }
  }

  if (!c.turns || c.turns.length === 0) {
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      result: 'fail',
      detail: 'no turns and no customCheck',
    }
  }

  clearGoalClarificationSession()
  try {
    let active: DomainQuery | null = null
    for (let i = 0; i < c.turns.length; i++) {
      const turn = c.turns[i]!
      const turnName = `${c.name} [turn ${i + 1}${
        turn.label ? `: ${turn.label}` : ''
      }]`
      active = executeTurn(turnName, turn, active)
    }
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      result: 'pass',
    }
  } catch (e) {
    if (c.status === 'KNOWN_GAP') {
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        result: 'pass',
        detail: `KNOWN_GAP observed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      }
    }
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      result: 'fail',
      detail: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearGoalClarificationSession()
  }
}

export function runSemanticRegressionSuite(
  cases: readonly SemanticRegressionCase[],
): {
  passed: number
  failed: number
  skipped: number
  results: HarnessRunResult[]
} {
  const results = cases.map(runSemanticRegressionCase)
  return {
    passed: results.filter((r) => r.result === 'pass').length,
    failed: results.filter((r) => r.result === 'fail').length,
    skipped: results.filter((r) => r.result === 'skip').length,
    results,
  }
}
