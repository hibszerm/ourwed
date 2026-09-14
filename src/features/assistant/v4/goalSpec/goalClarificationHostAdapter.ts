/**
 * U3 — Host adapter for GoalSpec clarification (DEV/shadow).
 * Presentation ↔ typed answer. No interpreter. No semantic patch logic in JSX.
 */

import { ASSISTANT_CLARIFICATION_STALE } from '../../copy'
import type { AssistantResponse } from '../../types'
import { isAssistantV5GoalShadowEnabled } from '../flag'
import {
  clarificationLabelCopy,
  clarificationQuestionCopy,
} from './goalClarificationCopy'
import type {
  GoalClarificationRequest,
  GoalClarificationValue,
} from './goalClarificationTypes'
import {
  answerGoalClarification,
  type GoalClarificationResumeResult,
} from './resumeGoalClarification'
import { setPendingGoalClarification } from './goalClarificationSession'

/** DEV/shadow only — never default-on in production. */
export function isGoalClarificationHostEnabled(): boolean {
  return isAssistantV5GoalShadowEnabled()
}

export type GoalClarificationViewModel = {
  clarificationId: string
  slot: GoalClarificationRequest['slot']
  question: string
  options: Array<{
    /** Typed semantic value — submitted as selectedValue. */
    value: GoalClarificationValue
    /** Presentation-only Polish label. */
    label: string
  }>
}

export function toGoalClarificationViewModel(
  request: GoalClarificationRequest,
): GoalClarificationViewModel {
  return {
    clarificationId: request.id,
    slot: request.slot,
    question: clarificationQuestionCopy(request.questionKey),
    options: request.options.map((o) => ({
      value: o.value,
      label: clarificationLabelCopy(o.labelKey),
    })),
  }
}

/**
 * Map pending GoalSpec clarification → existing Assistant clarification response.
 * Option `id` is the typed semantic value (never the Polish label).
 */
export function goalClarificationToAssistantResponse(
  request: GoalClarificationRequest,
): Extract<AssistantResponse, { kind: 'clarification' }> {
  const vm = toGoalClarificationViewModel(request)
  return {
    kind: 'clarification',
    question: vm.question,
    options: vm.options.map((o) => ({
      id: String(o.value),
      label: o.label,
    })),
  }
}

/**
 * Ensure request is the session pending, then return host-facing response.
 */
export function presentGoalClarificationRequest(
  request: GoalClarificationRequest,
): Extract<AssistantResponse, { kind: 'clarification' }> {
  setPendingGoalClarification(request)
  return goalClarificationToAssistantResponse(request)
}

export function goalClarificationResumeToAssistantResponse(
  result: GoalClarificationResumeResult,
  presentationLabel?: string | null,
): AssistantResponse {
  if (result.status === 'bound') {
    const chosen = presentationLabel?.trim()
    return {
      kind: 'text',
      message: chosen
        ? `Wybrano: ${chosen}.`
        : 'Doprecyzowano wartość. Możesz zadać kolejne pytanie.',
    }
  }
  if (result.status === 'needs_clarification') {
    return goalClarificationToAssistantResponse(result.request)
  }
  if (result.status === 'rejected') {
    return {
      kind: 'error',
      message: ASSISTANT_CLARIFICATION_STALE,
    }
  }
  return {
    kind: 'unsupported',
    message: 'Nie mogę dokończyć tego zapytania w obecnej formie.',
  }
}

/**
 * Typed Host click path — zero interpreter / OpenAI / Edge calls.
 * `selectedLabel` is presentation-only and never used as semantic value.
 */
export function submitGoalClarificationAnswerWithLabel(input: {
  clarificationId: string
  slot: GoalClarificationRequest['slot']
  selectedValue: GoalClarificationValue
  selectedLabel: string
}): {
  result: GoalClarificationResumeResult
  response: AssistantResponse
} {
  const result = answerGoalClarification({
    clarificationId: input.clarificationId,
    slot: input.slot,
    selectedValue: input.selectedValue,
  })
  return {
    result,
    response: goalClarificationResumeToAssistantResponse(
      result,
      result.status === 'bound' ? input.selectedLabel : null,
    ),
  }
}
