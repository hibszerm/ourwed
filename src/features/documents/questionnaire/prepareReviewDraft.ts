/**
 * Expand an AI draft for the business review screen.
 * Titles always come from the Variable Registry (Polish).
 */

import {
  isCoupleFacingRegistryKey,
  isStudioFacingRegistryKey,
  registryPolishLabel,
} from '@/features/documents/ai/canonicalVariableIds'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import { findCatalogByRegistryKey } from './questionCatalog'
import { shouldAskClientsByDefault } from './askDefaults'
import { selectEnabledQuestionnaireQuestions } from './buildQuestionnaireFromReviewDraft'
import type {
  ClassifiedVariable,
  DraftQuestion,
  QuestionnaireDraft,
} from './types'
import { isQuestionnaireSource } from './types'

const SUGGESTION_CONFIDENCE_MAX = 0.72

export function isSuggestedConfidence(confidence: number | undefined): boolean {
  if (confidence == null) return false
  return confidence > 0 && confidence < SUGGESTION_CONFIDENCE_MAX
}

export function confidenceForQuestion(
  draft: QuestionnaireDraft,
  question: DraftQuestion,
): number | undefined {
  const byKey = draft.classification.find(
    (c) =>
      (question.registryKey && c.registryKey === question.registryKey) ||
      c.label === question.contractLabel,
  )
  return byKey?.confidence
}

/** Force Polish registry title; never keep AI / English labels. */
export function polishQuestionTitle(question: DraftQuestion): string {
  if (question.fieldKey === 'packageId' || question.registryKey === 'package.name') {
    return registryPolishLabel('package.name')
  }
  if (question.registryKey) {
    return registryPolishLabel(question.registryKey)
  }
  return question.title?.trim() || 'Informacja'
}

function studioQuestionFromClassification(
  item: ClassifiedVariable,
  order: number,
): DraftQuestion {
  const catalog = item.registryKey
    ? findCatalogByRegistryKey(item.registryKey)
    : null
  const title = item.registryKey
    ? registryPolishLabel(item.registryKey)
    : 'Informacja'

  if (catalog) {
    return {
      id: String(catalog.id),
      enabled: true,
      title,
      description: catalog.description ?? '',
      placeholder: catalog.placeholder ?? '',
      required: false,
      type: catalog.type,
      fieldKey: catalog.fieldKey,
      contractLabel: title,
      registryKey: item.registryKey,
      source: 'studio',
      reused: true,
      order,
    }
  }

  const def = item.registryKey ? getVariableDef(item.registryKey) : undefined
  return {
    id: `q-review-${item.fieldId}`,
    enabled: true,
    title,
    description: '',
    placeholder: '',
    required: false,
    type: 'text',
    fieldKey: null,
    contractLabel: title,
    registryKey: item.registryKey,
    source: item.source === 'system' ? 'studio' : item.source,
    reused: Boolean(def),
    order,
  }
}

function enforceSource(question: DraftQuestion): DraftQuestion {
  const key = question.registryKey
  if (key === 'package.name' || question.fieldKey === 'packageId') {
    return {
      ...question,
      source: 'ourwed_configuration',
      title: polishQuestionTitle(question),
      contractLabel: polishQuestionTitle(question),
    }
  }
  if (key && isStudioFacingRegistryKey(key)) {
    return {
      ...question,
      source: 'studio',
      title: polishQuestionTitle(question),
      contractLabel: polishQuestionTitle(question),
      enabled: true,
    }
  }
  if (key && isCoupleFacingRegistryKey(key)) {
    return {
      ...question,
      source: 'couple',
      title: polishQuestionTitle(question),
      contractLabel: polishQuestionTitle(question),
      enabled: shouldAskClientsByDefault({
        ...question,
        source: 'couple',
      }),
    }
  }
  return {
    ...question,
    title: polishQuestionTitle(question),
    contractLabel: polishQuestionTitle(question),
  }
}

/** Merge studio detections into questions so the review list is complete. */
export function prepareReviewDraft(draft: QuestionnaireDraft): QuestionnaireDraft {
  const usedRegistry = new Set(
    draft.questions
      .map((q) => q.registryKey)
      .filter((k): k is string => Boolean(k)),
  )
  const usedFieldKeys = new Set(
    draft.questions
      .map((q) => q.fieldKey)
      .filter((k): k is string => Boolean(k)),
  )
  const usedIds = new Set(draft.questions.map((q) => q.id))

  let order = draft.questions.reduce((m, q) => Math.max(m, q.order), 0) + 1
  const extras: DraftQuestion[] = []

  for (const item of draft.classification) {
    if (isQuestionnaireSource(item.source)) continue
    if (item.source !== 'studio' && item.source !== 'system') continue
    if (!item.registryKey) continue

    if (usedRegistry.has(item.registryKey)) continue
    const catalog = findCatalogByRegistryKey(item.registryKey)
    if (catalog?.fieldKey && usedFieldKeys.has(catalog.fieldKey)) continue
    if (catalog && usedIds.has(String(catalog.id))) continue

    const q = studioQuestionFromClassification(item, order++)
    if (usedIds.has(q.id)) continue
    usedIds.add(q.id)
    usedRegistry.add(item.registryKey)
    if (q.fieldKey) usedFieldKeys.add(q.fieldKey)
    extras.push(q)
  }

  const questions = [...draft.questions, ...extras]
    .map((q) => {
      const next = enforceSource(q)
      const conf = confidenceForQuestion(draft, next)
      if (isSuggestedConfidence(conf)) {
        return { ...next, enabled: false }
      }
      return next
    })
    .sort((a, b) => a.order - b.order)

  return {
    ...draft,
    questions,
    packageVariables: (draft.packageVariables ?? []).map((d) => ({
      ...d,
      enabled: isSuggestedConfidence(d.confidence) ? false : d.enabled,
    })),
    templateDefaults: [],
  }
}

/** Questions that become Form Engine questionnaire fields. */
export function questionnaireQuestionsForSave(
  questions: DraftQuestion[],
): DraftQuestion[] {
  return selectEnabledQuestionnaireQuestions(questions)
}

export type UiValueSource = 'couple' | 'studio'

export function toUiSource(source: DraftQuestion['source']): UiValueSource {
  if (source === 'studio' || source === 'system') return 'studio'
  return 'couple'
}

export function fromUiSource(
  ui: UiValueSource,
  question: DraftQuestion,
): DraftQuestion['source'] {
  if (ui === 'studio') return 'studio'
  if (
    question.fieldKey === 'packageId' ||
    question.registryKey === 'package.name' ||
    question.id === 'q-package'
  ) {
    return 'ourwed_configuration'
  }
  return 'couple'
}

export function packageKindDisplayLabel(
  kind: QuestionnaireDraft['suggestedPackageKind'],
  fallback: string | null,
): string | null {
  switch (kind) {
    case 'photo':
      return 'Fotografia'
    case 'video':
      return 'Video'
    case 'photo_video':
      return 'Fotografia + Video'
    default:
      return fallback
  }
}
