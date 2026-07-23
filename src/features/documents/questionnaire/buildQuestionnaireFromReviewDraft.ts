/**
 * Questionnaire Builder — review draft is the ONLY source of truth.
 *
 * Flow: Review draft (user edits) → Builder → FormTemplate
 *
 * Strict 1:1: each enabled couple row → exactly one Question.
 * No catalogue subset walks, no address-bundle expand, no id collapse.
 */

import { isCoupleFacingRegistryKey } from '@/features/documents/ai/canonicalVariableIds'
import type { FormTemplate, Question } from '@/types/form'
import {
  CONTRACT_QUESTION_IDS,
  getContractQuestionById,
  getPackageSelectQuestion,
  resolveContractQuestionId,
} from '@/lib/forms/contractQuestionCatalog'
import type { DraftQuestion, QuestionnaireDraft } from './types'
import { isQuestionnaireSource } from './types'

/** Package field definition with empty options — live inject at render only. */
export function getPackageQuestionDefinition(): Question {
  const q = getPackageSelectQuestion([])
  return { ...q, options: [] }
}

function isPackageSelector(
  q: Pick<DraftQuestion, 'id' | 'fieldKey' | 'registryKey'>,
): boolean {
  return (
    q.id === CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR ||
    q.fieldKey === 'packageId' ||
    q.registryKey === 'package.name'
  )
}

/**
 * Enabled review fields that become public questionnaire questions.
 * Studio / package-business columns are excluded.
 * Couple-facing keys are included even if AI tagged the source wrong.
 */
export function selectEnabledQuestionnaireQuestions(
  questions: DraftQuestion[],
): DraftQuestion[] {
  return questions
    .filter(isQuestionnaireEligible)
    .sort((a, b) => a.order - b.order)
}

function isQuestionnaireEligible(q: DraftQuestion): boolean {
  if (!q.enabled) return false
  if (isPackageSelector(q)) return true
  if (q.source === 'package') return false
  if (q.source === 'studio' || q.source === 'system') {
    return Boolean(q.registryKey && isCoupleFacingRegistryKey(q.registryKey))
  }
  if (isQuestionnaireSource(q.source)) return true
  if (q.registryKey && isCoupleFacingRegistryKey(q.registryKey)) return true
  return false
}

/**
 * Map one enabled draft row → one Form Engine Question.
 * Catalogue supplies type / fieldKey / required (HOW).
 * Draft supplies title and stable unique id (do not collapse).
 */
function toQuestion(q: DraftQuestion): Question {
  if (isPackageSelector(q)) {
    const pkg = getPackageQuestionDefinition()
    return {
      ...pkg,
      label: q.title?.trim() || pkg.label,
      description: q.description?.trim() || pkg.description,
      options: [],
    }
  }

  const contractId = resolveContractQuestionId({
    questionId: q.id,
    registryKey: q.registryKey,
    fieldKey: q.fieldKey,
  })
  const catalogue = contractId ? getContractQuestionById(contractId) : undefined

  if (catalogue?.fieldKey) {
    return {
      id: q.id,
      type: catalogue.type,
      label: q.title?.trim() || catalogue.label,
      description: q.description?.trim() || catalogue.description || undefined,
      placeholder: q.placeholder?.trim() || catalogue.placeholder || undefined,
      required: catalogue.required ?? q.required ?? false,
      fieldKey: catalogue.fieldKey,
      options: undefined,
    }
  }

  const options =
    q.type === 'select' || q.type === 'radio' || q.type === 'multiselect'
      ? q.options
      : undefined

  return {
    id: q.id,
    type: q.type,
    label: q.title?.trim() || 'Pytanie',
    description: q.description?.trim() || undefined,
    placeholder: q.placeholder?.trim() || undefined,
    required: q.required,
    fieldKey: q.fieldKey ?? undefined,
    options,
  }
}

/**
 * Build the Form Engine template from the final review draft only.
 * N enabled couple rows → N questions. No invented extras.
 */
export function buildQuestionnaireFromReviewDraft(
  draft: QuestionnaireDraft,
): FormTemplate {
  const enabled = selectEnabledQuestionnaireQuestions(draft.questions)
  const questions = enabled.map(toQuestion)

  return {
    id: `ai-review-${Date.now().toString(36)}`,
    type: 'contract_questionnaire',
    title: draft.name.trim() || 'Ankieta',
    description: draft.description?.trim() || '',
    questions,
    successTitle: 'Dziękujemy!',
    successDescription: 'Otrzymaliśmy Wasze odpowiedzi.',
    submitLabel: 'Wyślij',
  }
}
