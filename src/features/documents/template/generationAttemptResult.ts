/**
 * Generation attempt outcomes — actionable review is not a failure.
 */

import type { CompletenessField } from './buildContractCompleteness'
import type { ActionableGenerationReviewPayload } from './generationPipelineError'
import type { TransformContractResult } from './ContractTransformationService'

/** Internal signal: actionable review — not a technical failure. */
export class TransformNeedsReviewSignal {
  readonly kind = 'needs_review' as const
  readonly messages: string[]
  readonly actionableReview: ActionableGenerationReviewPayload
  readonly correlationId: string

  constructor(
    messages: string[],
    actionableReview: ActionableGenerationReviewPayload,
    correlationId: string,
  ) {
    this.messages = messages
    this.actionableReview = actionableReview
    this.correlationId = correlationId
  }
}

export type ActionableReviewIssue = {
  id:
    | 'teaser_duration_missing'
    | 'coverage_duration_end_time_collision'
    | 'coverage_duration_missing'
    | 'coverage_end_time_missing'
    | string
  message: string
  registryKeys: string[]
}

export type GenerationReviewStatePatch = {
  editableFields: CompletenessField[]
  contextualMessages: string[]
  issues: ActionableReviewIssue[]
}

export type GenerationAttemptResult =
  | {
      status: 'completed'
      artifact: TransformContractResult
    }
  | {
      status: 'needs_review'
      issues: ActionableReviewIssue[]
      reviewStatePatch: GenerationReviewStatePatch
      /** Present only when a pipeline attempt already started; never for client-side blockers. */
      correlationId?: string | null
    }

export function actionablePayloadToReviewPatch(
  payload: ActionableGenerationReviewPayload,
  messages: string[],
): GenerationReviewStatePatch {
  const issues: ActionableReviewIssue[] = []
  const keys = new Set(payload.editableFields.map((f) => f.registryKey))
  if (keys.has('teaser_duration')) {
    issues.push({
      id: 'teaser_duration_missing',
      message:
        messages.find((m) => /teledysk|długość teledysku/i.test(m)) ||
        'Uzupełnij długość teledysku przed generowaniem.',
      registryKeys: ['teaser_duration'],
    })
  }
  if (keys.has('coverage_duration') || keys.has('coverage_end_time')) {
    issues.push({
      id: 'coverage_duration_end_time_collision',
      message:
        messages.find((m) => /połączone|czas trwania reportażu/i.test(m)) ||
        'Czas trwania reportażu i godzina zakończenia zostały błędnie połączone.',
      registryKeys: ['coverage_duration', 'coverage_end_time'].filter((k) =>
        keys.has(k),
      ),
    })
  }

  return {
    editableFields: payload.editableFields.map((field) => ({
      slotId: `actionable-${field.id}`,
      registryKey: field.registryKey,
      label: field.label,
      group: field.group,
      value: '',
      missing: true,
      source: 'manual' as const,
      sourceLabel: field.sourceLabel,
      placeholder: field.placeholder,
    })),
    contextualMessages: payload.contextualMessages,
    issues,
  }
}
