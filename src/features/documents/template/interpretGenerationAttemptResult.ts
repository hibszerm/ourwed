/**
 * Pure interpretation of WeddingContractGenerationService.generate() results
 * for WeddingContractGenerationPage — no silent outcomes.
 */

import type { CompletenessField } from './buildContractCompleteness'
import type { TransformContractResult } from './ContractTransformationService'
import type { GenerationAttemptResult } from './generationAttemptResult'

export type GenerationUiOutcome =
  | {
      kind: 'completed'
      artifact: TransformContractResult
      generatedDocumentId: string | null
      hasDocxBytes: boolean
      hasPreviewParagraphs: boolean
    }
  | {
      kind: 'needs_review'
      editableFields: CompletenessField[]
      messages: string[]
      issueKeys: string[]
      /** True when needs_review carried no actionable payload — treat as failure. */
      invalidEmpty: boolean
    }
  | {
      kind: 'invalid_result'
      reason: string
    }

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/**
 * Map a service attempt into an explicit UI outcome.
 * Every service return shape must resolve to one of: completed, needs_review, invalid_result.
 */
export function interpretGenerationAttemptResult(
  attempt: GenerationAttemptResult | null | undefined,
): GenerationUiOutcome {
  if (attempt == null) {
    return {
      kind: 'invalid_result',
      reason: 'Serwis generowania nie zwrócił wyniku.',
    }
  }

  // Legacy shape guard — older callers used `.kind` on the attempt itself.
  const legacyKind = (attempt as { kind?: string }).kind
  if (
    legacyKind === 'completed' ||
    legacyKind === 'needs_review' ||
    legacyKind === 'failed'
  ) {
    if (!('status' in attempt) || !(attempt as { status?: string }).status) {
      return {
        kind: 'invalid_result',
        reason: `Nieobsługiwany kształt wyniku generowania (kind=${legacyKind}).`,
      }
    }
  }

  if (attempt.status === 'needs_review') {
    const editableFields = attempt.reviewStatePatch?.editableFields ?? []
    const messages = uniqueNonEmpty([
      ...attempt.issues.map((issue) => issue.message),
      ...(attempt.reviewStatePatch?.contextualMessages ?? []),
      ...(attempt.reviewStatePatch?.issues ?? []).map((issue) => issue.message),
    ])
    const issueKeys = [
      ...new Set(
        [
          ...attempt.issues.flatMap((issue) => issue.registryKeys),
          ...editableFields.map((field) => field.registryKey),
        ].filter(Boolean),
      ),
    ]
    const invalidEmpty = editableFields.length === 0 && messages.length === 0
    return {
      kind: 'needs_review',
      editableFields,
      messages,
      issueKeys,
      invalidEmpty,
    }
  }

  if (attempt.status === 'completed') {
    const artifact = attempt.artifact
    if (!artifact) {
      return {
        kind: 'invalid_result',
        reason: 'Generowanie zakończyło się sukcesem, ale brakuje dokumentu.',
      }
    }
    const hasDocxBytes = Boolean(
      artifact.docxBytes && artifact.docxBytes.byteLength > 0,
    )
    const hasPreviewParagraphs = Array.isArray(artifact.paragraphs)
    if (!hasDocxBytes) {
      return {
        kind: 'invalid_result',
        reason: 'Wygenerowany dokument jest pusty.',
      }
    }
    return {
      kind: 'completed',
      artifact,
      generatedDocumentId: artifact.draftId ?? null,
      hasDocxBytes,
      hasPreviewParagraphs,
    }
  }

  return {
    kind: 'invalid_result',
    reason: `Nieznany status wyniku generowania: ${String(
      (attempt as { status?: string }).status,
    )}.`,
  }
}

export function needsReviewUserMessage(outcome: {
  messages: string[]
  invalidEmpty: boolean
}): string {
  if (outcome.invalidEmpty) {
    return 'Wystąpił wewnętrzny błąd generowania (pusty wynik przeglądu). Spróbuj ponownie lub skontaktuj się z pomocą.'
  }
  if (outcome.messages.length === 1) return outcome.messages[0]!
  if (outcome.messages.length > 1) {
    return outcome.messages.join('\n')
  }
  return 'Uzupełnij brakujące dane przed ponownym generowaniem.'
}
