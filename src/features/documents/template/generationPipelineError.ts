/**
 * Typed generation pipeline errors — preserve stage + cause for diagnostics.
 * User-facing copy stays friendly; internals keep the original exception.
 */

import { devErrorArgs, devInfoArgs } from '@/lib/debug/devConsole'

export type GenerationPipelineStage =
  | 'review_state_validation'
  | 'generation_input_build'
  | 'source_data_snapshot'
  | 'manual_overrides_merge'
  | 'semantic_values_resolution'
  | 'slot_binding_resolution'
  | 'replacement_plan_build'
  | 'phase_c_validation'
  | 'docx_source_load'
  | 'docx_render'
  | 'artifact_upload'
  | 'generated_contract_persist'
  | 'generation_version_persist'
  | 'response_mapping'
  | 'unexpected_generation_error'

export type GenerationErrorCode =
  | 'generation_input_invalid'
  | 'template_not_usable'
  | 'template_version_not_found'
  | 'source_docx_not_found'
  | 'slot_map_version_mismatch'
  | 'slot_binding_unresolved'
  | 'replacement_plan_invalid'
  | 'phase_c_blocked'
  | 'docx_render_failed'
  | 'artifact_upload_failed'
  | 'generated_contract_persist_failed'
  | 'generation_version_persist_failed'
  | 'unexpected_generation_error'

export type GenerationPipelineErrorInit = {
  code: GenerationErrorCode
  stage: GenerationPipelineStage
  message: string
  cause?: unknown
  correlationId: string
  templateId?: string | null
  templateVersionId?: string | null
  weddingId?: string | null
  /** When set, UI must merge into GenerationReviewState — not show a dead-end diagnostic. */
  actionableReview?: ActionableGenerationReviewPayload | null
}

export type ActionableGenerationReviewPayload = {
  editableFields: Array<{
    id: string
    registryKey: string
    label: string
    placeholder?: string
    group: 'package' | 'wedding' | 'other'
    sourceLabel: string
  }>
  contextualMessages: string[]
}

export class GenerationPipelineError extends Error {
  readonly code: GenerationErrorCode
  readonly stage: GenerationPipelineStage
  readonly correlationId: string
  readonly templateId: string | null
  readonly templateVersionId: string | null
  readonly weddingId: string | null
  readonly cause: unknown
  readonly actionableReview: ActionableGenerationReviewPayload | null

  constructor(init: GenerationPipelineErrorInit) {
    super(init.message, init.cause != null ? { cause: init.cause } : undefined)
    this.name = 'GenerationPipelineError'
    this.code = init.code
    this.stage = init.stage
    this.correlationId = init.correlationId
    this.templateId = init.templateId ?? null
    this.templateVersionId = init.templateVersionId ?? null
    this.weddingId = init.weddingId ?? null
    this.cause = init.cause
    this.actionableReview = init.actionableReview ?? null
  }

  toJSON() {
    return {
      code: this.code,
      stage: this.stage,
      message: this.message,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message, stack: this.cause.stack }
          : this.cause ?? null,
      correlationId: this.correlationId,
      templateId: this.templateId,
      templateVersionId: this.templateVersionId,
      weddingId: this.weddingId,
      actionableReview: this.actionableReview,
      stack: this.stack,
    }
  }
}

export function createGenerationCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8).toUpperCase()
  }
  return `G${Date.now().toString(36).toUpperCase()}`
}

const DEV =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)

export type GenerationStageTrace = {
  correlationId: string
  templateId?: string | null
  templateVersionId?: string | null
  weddingId?: string | null
}

export function logGenerationStage(
  trace: GenerationStageTrace,
  stage: GenerationPipelineStage,
  status: 'started' | 'succeeded' | 'failed' | 'needs_review',
  extra?: Record<string, unknown>,
) {
  // Browser production: no stage dumps (IDs / messages / stacks).
  if (!DEV) return
  const payload = {
    correlationId: trace.correlationId,
    stage,
    status,
    templateId: trace.templateId ?? null,
    templateVersionId: trace.templateVersionId ?? null,
    weddingId: trace.weddingId ?? null,
    ...extra,
  }
  if (status === 'failed') {
    devErrorArgs('[contract-generation]', payload)
  } else {
    devInfoArgs('[contract-generation]', payload)
  }
}

export function wrapGenerationFailure(
  trace: GenerationStageTrace,
  stage: GenerationPipelineStage,
  code: GenerationErrorCode,
  err: unknown,
  fallbackMessage: string,
): GenerationPipelineError {
  if (err instanceof GenerationPipelineError) return err
  const message =
    err instanceof Error && err.message.trim()
      ? err.message
      : fallbackMessage
  logGenerationStage(trace, stage, 'failed', {
    errorName: err instanceof Error ? err.name : typeof err,
    errorCode: code,
    // Message only in DEV (function already no-ops outside DEV).
    errorMessage: message,
  })
  return new GenerationPipelineError({
    code,
    stage,
    message,
    cause: err,
    correlationId: trace.correlationId,
    templateId: trace.templateId,
    templateVersionId: trace.templateVersionId,
    weddingId: trace.weddingId,
  })
}

/** Friendly UI copy; includes diagnostic code in development. */
export function userFacingGenerationErrorMessage(err: unknown): string {
  const QUALITY_USER_MESSAGE =
    'Nie udało się bezpiecznie wygenerować umowy. Treść dokumentu została zabezpieczona przed nieautoryzowaną zmianą.'

  if (err instanceof GenerationPipelineError) {
    if (
      err.code === 'docx_render_failed' ||
      /QUALITY CHECK FAILED|zabezpieczona przed nieautoryzowaną/i.test(
        err.message,
      )
    ) {
      if (DEV) {
        return `${QUALITY_USER_MESSAGE} Kod diagnostyczny: ${err.correlationId}`
      }
      return QUALITY_USER_MESSAGE
    }
    const base = 'Nie udało się wygenerować umowy.'
    if (DEV) {
      return `${base} Kod diagnostyczny: ${err.correlationId}`
    }
    // Photographer-safe specific messages we already author in Polish.
    if (
      err.code === 'generation_input_invalid' ||
      err.message.startsWith('Uzupełnij') ||
      err.message.startsWith('Wybierz') ||
      err.message.startsWith('Wpisz')
    ) {
      return err.message
    }
    return `${base} Spróbuj ponownie.`
  }
  if (err instanceof Error && err.message.trim()) {
    if (/QUALITY CHECK FAILED/i.test(err.message)) {
      return QUALITY_USER_MESSAGE
    }
    // Prefer concrete Polish engine messages over a total black hole —
    // still avoid dumping stacks in the UI.
    if (/uzupełnij|wybierz|brak |szablon|wpisz/i.test(err.message)) {
      return err.message
    }
  }
  return 'Nie udało się wygenerować umowy. Spróbuj ponownie.'
}
