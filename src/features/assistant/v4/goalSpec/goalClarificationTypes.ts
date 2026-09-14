/**
 * U2 — GoalSpec-native typed clarification types (shadow / local).
 * Clarification answer = typed semantic patch. Not NL. Not LLM.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type {
  ClarificationLabelKey,
  ClarificationQuestionKey,
} from './goalClarificationCopy'
import type { GoalMissingSlot, GoalSpec } from './goalSpec'

/** Typed option value for U2 primary slot (measure) + scaffolding. */
export type GoalClarificationValue = SemanticFieldId | string

export type GoalClarificationOption = {
  /** Stable option id (usually equals value). */
  id: string
  /** Authoritative semantic value — never the Polish label. */
  value: GoalClarificationValue
  /** Presentation lookup key only. */
  labelKey: ClarificationLabelKey
}

export type GoalClarificationRequest = {
  id: string
  slot: GoalMissingSlot
  questionKey: ClarificationQuestionKey
  options: GoalClarificationOption[]
  /** Exact GoalSpec that produced NeedsClarification. */
  pendingGoal: GoalSpec
  preservedActiveCollectionQuery: DomainQuery | null
  depth: number
  signature: string
}

export type GoalClarificationAnswer = {
  clarificationId: string
  slot: GoalMissingSlot
  selectedValue: GoalClarificationValue
}

export type ApplyGoalClarificationResult =
  | { ok: true; goal: GoalSpec }
  | {
      ok: false
      reason:
        | 'stale_clarification_id'
        | 'slot_mismatch'
        | 'invalid_selected_value'
        | 'unsupported_slot'
    }
