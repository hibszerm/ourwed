/**
 * U2 — Create / resume GoalSpec clarifications through existing Binder.
 * Clarification click path: zero interpreter / OpenAI / Edge calls.
 */

import { ASSISTANT_MAX_CLARIFICATION_DEPTH } from '../../orchestration/clarificationState'
import type { DomainQuery } from '../domainQuery/domainQuery'
import {
  SEMANTIC_FIELD_IDS,
  SEMANTIC_FIELD_REGISTRY,
  type SemanticFieldId,
} from '../domainQuery/fieldRegistry'
import {
  applyGoalClarificationAnswer,
  isGoalClarificationPatchSlot,
} from './applyGoalClarificationAnswer'
import {
  bindGoalSpec,
  makeGoalBinderContext,
} from './bindGoalSpec'
import type {
  BinderNeedsClarification,
  BindGoalSpecResult,
  GoalBinderContext,
} from './binderTypes'
import type { BoundGoal } from './boundGoal'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import { deriveMeasureClarificationOptions } from './deriveMeasureClarificationOptions'
import {
  questionKeyForSlot,
  type ClarificationLabelKey,
} from './goalClarificationCopy'
import {
  clearGoalClarificationSession,
  getGoalClarificationActiveCollection,
  getPendingGoalClarification,
  setGoalClarificationActiveCollection,
  setPendingGoalClarification,
} from './goalClarificationSession'
import type {
  GoalClarificationAnswer,
  GoalClarificationOption,
  GoalClarificationRequest,
} from './goalClarificationTypes'
import type { GoalMissingSlot, GoalSpec } from './goalSpec'

export { ASSISTANT_MAX_CLARIFICATION_DEPTH as GOAL_CLARIFICATION_MAX_DEPTH }

export type GoalClarificationResumeResult =
  | {
      status: 'bound'
      goal: BoundGoal
      query: DomainQuery
      patchedGoal: GoalSpec
    }
  | {
      status: 'needs_clarification'
      request: GoalClarificationRequest
      patchedGoal: GoalSpec
    }
  | { status: 'unsupported'; reason: string; patchedGoal?: GoalSpec }
  | {
      status: 'rejected'
      reason:
        | 'no_pending'
        | 'stale_clarification_id'
        | 'slot_mismatch'
        | 'invalid_selected_value'
        | 'unsupported_slot'
        | 'max_depth'
    }

function createClarificationId(): string {
  return `gcl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clarificationSignature(input: {
  slot: GoalMissingSlot
  optionIds: string[]
  depth: number
}): string {
  return [
    input.slot,
    String(input.depth),
    [...input.optionIds].sort().join(','),
  ].join('|')
}

function primarySlot(
  clarification: BinderNeedsClarification,
): GoalMissingSlot | null {
  const ordered: GoalMissingSlot[] = [
    'source',
    'aggregation',
    'entity_kind',
    'measure',
    'date_dimension',
    'target',
    'other',
  ]
  const present = new Set([
    ...clarification.missingSlots,
    ...clarification.ambiguousSlots,
  ])
  for (const s of ordered) {
    if (!present.has(s)) continue
    // Only slots with presentation + allowlisted apply support (S2)
    if (isGoalClarificationPatchSlot(s)) {
      return s
    }
  }
  return null
}

function optionsFromBinderChoices(
  clarification: BinderNeedsClarification,
): GoalClarificationOption[] {
  const choices = clarification.choices ?? []
  return choices.map((c) => ({
    id: c.id,
    value: c.id,
    labelKey: 'entity_kind.generic' as ClarificationLabelKey,
  }))
}

/** G7: registry date-dimension fields only (currently wedding.date). */
function deriveDateDimensionClarificationOptions(): GoalClarificationOption[] {
  const options: GoalClarificationOption[] = []
  for (const id of SEMANTIC_FIELD_IDS) {
    const def = SEMANTIC_FIELD_REGISTRY[id]
    if (!def.isDateDimension) continue
    options.push({
      id,
      value: id,
      labelKey:
        id === 'wedding.date'
          ? 'date_dimension.wedding_date'
          : 'entity_kind.generic',
    })
  }
  return options
}

/**
 * Build a typed clarification request from Binder NeedsClarification + GoalSpec.
 * Patch-only for UI slots. Does not invent source / aggregation (S1 Resolver owns source).
 */
export function createGoalClarificationRequest(input: {
  goal: GoalSpec
  clarification: BinderNeedsClarification
  depth: number
  measureCandidateOverride?: readonly SemanticFieldId[]
}):
  | { status: 'request'; request: GoalClarificationRequest }
  | { status: 'auto_resolve'; goal: GoalSpec }
  | { status: 'unsupported'; reason: string }
  | { status: 'max_depth' } {
  if (input.depth >= ASSISTANT_MAX_CLARIFICATION_DEPTH) {
    return { status: 'max_depth' }
  }

  const slot = primarySlot(input.clarification)
  if (!slot) {
    // Binder may emit non-UI slots (e.g. source after defer failure).
    // If measure is still unresolved for sum, present measure clarification.
    const measureDerived = deriveMeasureClarificationOptions(input.goal)
    if (measureDerived.status === 'auto_resolve') {
      return {
        status: 'auto_resolve',
        goal: {
          ...input.goal,
          measure: measureDerived.measure,
          ambiguities: input.goal.ambiguities.filter(
            (a) => a.slot !== 'measure',
          ),
        },
      }
    }
    if (measureDerived.status === 'clarify') {
      const request: GoalClarificationRequest = {
        id: createClarificationId(),
        slot: 'measure',
        questionKey: 'measure',
        options: measureDerived.options,
        pendingGoal: input.goal,
        preservedActiveCollectionQuery:
          input.clarification.preservedContext?.activeCollectionQuery ?? null,
        depth: input.depth,
        signature: clarificationSignature({
          slot: 'measure',
          optionIds: measureDerived.options.map((o) => o.id),
          depth: input.depth,
        }),
      }
      return { status: 'request', request }
    }
    return { status: 'unsupported', reason: 'clarification_slot_missing' }
  }

  const questionKey = questionKeyForSlot(slot)
  if (!questionKey) {
    return { status: 'unsupported', reason: `slot_${slot}_not_clarifiable` }
  }

  let options: GoalClarificationOption[]

  if (slot === 'measure') {
    const derived = deriveMeasureClarificationOptions(
      input.goal,
      input.measureCandidateOverride,
    )
    if (derived.status === 'not_applicable') {
      // Temporary shape for option derivation only — does not patch pendingGoal.source.
      const fallback = deriveMeasureClarificationOptions(
        {
          ...input.goal,
          aggregation: 'sum',
          measure: null,
        },
        input.measureCandidateOverride,
      )
      if (fallback.status === 'auto_resolve') {
        return {
          status: 'auto_resolve',
          goal: {
            ...input.goal,
            measure: fallback.measure,
            ambiguities: input.goal.ambiguities.filter(
              (a) => a.slot !== 'measure',
            ),
          },
        }
      }
      if (fallback.status === 'clarify') {
        options = fallback.options
      } else if (fallback.status === 'unsupported') {
        return { status: 'unsupported', reason: fallback.reason }
      } else {
        return { status: 'unsupported', reason: 'measure_not_applicable' }
      }
    } else if (derived.status === 'auto_resolve') {
      return {
        status: 'auto_resolve',
        goal: {
          ...input.goal,
          measure: derived.measure,
          ambiguities: input.goal.ambiguities.filter(
            (a) => a.slot !== 'measure',
          ),
        },
      }
    } else if (derived.status === 'unsupported') {
      return { status: 'unsupported', reason: derived.reason }
    } else {
      options = derived.options
    }
  } else if (slot === 'date_dimension') {
    options = optionsFromBinderChoices(input.clarification)
    if (options.length === 0) {
      options = deriveDateDimensionClarificationOptions()
    }
    if (options.length === 1) {
      const only = options[0]!
      const synthetic: GoalClarificationRequest = {
        id: createClarificationId(),
        slot,
        questionKey,
        options,
        pendingGoal: input.goal,
        preservedActiveCollectionQuery:
          input.clarification.preservedContext?.activeCollectionQuery ?? null,
        depth: input.depth,
        signature: clarificationSignature({
          slot,
          optionIds: options.map((o) => o.id),
          depth: input.depth,
        }),
      }
      const applied = applyGoalClarificationAnswer(synthetic, {
        clarificationId: synthetic.id,
        slot,
        selectedValue: only.value,
      })
      if (applied.ok) {
        return { status: 'auto_resolve', goal: applied.goal }
      }
    }
  } else {
    // entity_kind (and future allowlisted non-measure slots)
    options = optionsFromBinderChoices(input.clarification)
    if (options.length === 0) {
      return { status: 'unsupported', reason: 'no_clarification_options' }
    }
    if (options.length === 1) {
      const only = options[0]!
      const synthetic: GoalClarificationRequest = {
        id: createClarificationId(),
        slot,
        questionKey,
        options,
        pendingGoal: input.goal,
        preservedActiveCollectionQuery:
          input.clarification.preservedContext?.activeCollectionQuery ?? null,
        depth: input.depth,
        signature: clarificationSignature({
          slot,
          optionIds: options.map((o) => o.id),
          depth: input.depth,
        }),
      }
      const applied = applyGoalClarificationAnswer(synthetic, {
        clarificationId: synthetic.id,
        slot,
        selectedValue: only.value,
      })
      if (applied.ok) {
        return { status: 'auto_resolve', goal: applied.goal }
      }
    }
  }

  if (options.length === 0) {
    return { status: 'unsupported', reason: 'no_clarification_options' }
  }

  const request: GoalClarificationRequest = {
    id: createClarificationId(),
    slot,
    questionKey,
    options,
    pendingGoal: input.goal,
    preservedActiveCollectionQuery:
      input.clarification.preservedContext?.activeCollectionQuery ?? null,
    depth: input.depth,
    signature: clarificationSignature({
      slot,
      optionIds: options.map((o) => o.id),
      depth: input.depth,
    }),
  }
  return { status: 'request', request }
}

function binderContextFrom(
  active: DomainQuery | null,
  resource: GoalBinderContext['activeResource'] = null,
): GoalBinderContext {
  return makeGoalBinderContext({
    activeCollectionQuery: active,
    activeResource: resource,
  })
}

/**
 * Bind GoalSpec; if measure (or other) clarification is required, create typed request.
 * Auto-resolves unique candidates without UI.
 */
export function bindGoalSpecWithClarification(input: {
  goal: GoalSpec
  activeCollectionQuery?: DomainQuery | null
  activeResource?: GoalBinderContext['activeResource']
  depth?: number
  measureCandidateOverride?: readonly SemanticFieldId[]
  /** When true, store pending request in ephemeral session. */
  storePending?: boolean
}):
  | { status: 'bound'; goal: BoundGoal; query: DomainQuery; goalSpec: GoalSpec }
  | {
      status: 'needs_clarification'
      request: GoalClarificationRequest
      goalSpec: GoalSpec
    }
  | { status: 'unsupported'; reason: string; goalSpec: GoalSpec } {
  const depth = input.depth ?? 0
  const active =
    input.activeCollectionQuery !== undefined
      ? input.activeCollectionQuery
      : getGoalClarificationActiveCollection()
  const ctx = binderContextFrom(active ?? null, input.activeResource ?? null)

  let goal = input.goal
  let bindResult: BindGoalSpecResult = bindGoalSpec(goal, ctx)
  let guard = 0

  while (guard++ < ASSISTANT_MAX_CLARIFICATION_DEPTH + 2) {
    if (bindResult.status === 'bound') {
      const compiled = compileBoundGoalToDomainQuery(bindResult.goal)
      if (compiled.status !== 'success') {
        setPendingGoalClarification(null)
        return {
          status: 'unsupported',
          reason: compiled.reason,
          goalSpec: goal,
        }
      }
      setPendingGoalClarification(null)
      if (input.storePending !== false) {
        setGoalClarificationActiveCollection(compiled.query)
      }
      return {
        status: 'bound',
        goal: bindResult.goal,
        query: compiled.query,
        goalSpec: goal,
      }
    }

    if (bindResult.status === 'unsupported') {
      setPendingGoalClarification(null)
      return {
        status: 'unsupported',
        reason: bindResult.reason,
        goalSpec: goal,
      }
    }

    // needs_clarification
    const created = createGoalClarificationRequest({
      goal,
      clarification: bindResult.clarification,
      depth,
      measureCandidateOverride: input.measureCandidateOverride,
    })

    if (created.status === 'max_depth') {
      setPendingGoalClarification(null)
      return { status: 'unsupported', reason: 'max_clarification_depth', goalSpec: goal }
    }
    if (created.status === 'unsupported') {
      setPendingGoalClarification(null)
      return { status: 'unsupported', reason: created.reason, goalSpec: goal }
    }
    if (created.status === 'auto_resolve') {
      goal = created.goal
      bindResult = bindGoalSpec(goal, ctx)
      continue
    }

    if (input.storePending !== false) {
      setPendingGoalClarification(created.request)
    }
    return {
      status: 'needs_clarification',
      request: created.request,
      goalSpec: goal,
    }
  }

  setPendingGoalClarification(null)
  return { status: 'unsupported', reason: 'clarification_loop', goalSpec: goal }
}

/**
 * Apply typed clarification answer and resume Binder → DomainQuery.
 * Click path is local/deterministic only (no model / Edge reinterpretation).
 */
export function answerGoalClarification(
  answer: GoalClarificationAnswer,
  options?: {
    activeResource?: GoalBinderContext['activeResource']
    measureCandidateOverride?: readonly SemanticFieldId[]
  },
): GoalClarificationResumeResult {
  const pending = getPendingGoalClarification()
  if (!pending) {
    return { status: 'rejected', reason: 'no_pending' }
  }
  if (pending.depth + 1 > ASSISTANT_MAX_CLARIFICATION_DEPTH) {
    return { status: 'rejected', reason: 'max_depth' }
  }

  const applied = applyGoalClarificationAnswer(pending, answer)
  if (!applied.ok) {
    return { status: 'rejected', reason: applied.reason }
  }

  const active =
    pending.preservedActiveCollectionQuery ??
    getGoalClarificationActiveCollection()

  const resumed = bindGoalSpecWithClarification({
    goal: applied.goal,
    activeCollectionQuery: active,
    activeResource: options?.activeResource ?? null,
    depth: pending.depth + 1,
    measureCandidateOverride: options?.measureCandidateOverride,
    storePending: true,
  })

  if (resumed.status === 'bound') {
    return {
      status: 'bound',
      goal: resumed.goal,
      query: resumed.query,
      patchedGoal: resumed.goalSpec,
    }
  }
  if (resumed.status === 'needs_clarification') {
    return {
      status: 'needs_clarification',
      request: resumed.request,
      patchedGoal: resumed.goalSpec,
    }
  }
  return {
    status: 'unsupported',
    reason: resumed.reason,
    patchedGoal: resumed.goalSpec,
  }
}

/** Test / close helper — destroy ephemeral clarification state. */
export function destroyGoalClarificationOnAssistantClose(): void {
  clearGoalClarificationSession()
}
