/**
 * Persist QuestionnaireDraft as a reusable Form Engine template (definition only).
 *
 * Review draft → Questionnaire Builder → FormDefinition
 * Never rebuilds fields from the original AI response.
 * Document templates are never bound to a Studio Package.
 */

import { createFormDefinition } from '@/lib/api/forms'
import { documentTemplateService } from '@/lib/api/documents'
import { packageService } from '@/lib/api/packageService'
import type { DocumentTemplateMeta } from '@/types/documents'
import type { FormDefinition } from '@/types/formEngine'
import { slugify } from '@/types/package'
import {
  buildQuestionnaireFromReviewDraft,
  selectEnabledQuestionnaireQuestions,
} from './buildQuestionnaireFromReviewDraft'
import {
  QuestionnaireValidationError,
  validateQuestionnaireDraft,
} from './validateQuestionnaireDraft'
import type { QuestionnaireDraft } from './types'
import {
  isCoupleFacingRegistryKey,
  isStudioFacingRegistryKey,
} from '@/features/documents/ai/canonicalVariableIds'

export interface SaveQuestionnaireResult {
  form: FormDefinition
  draft: QuestionnaireDraft
}

function isPackageQuestion(q: {
  id: string
  fieldKey: string | null
  registryKey: string | null
}): boolean {
  return (
    q.fieldKey === 'packageId' ||
    q.id === 'q-package' ||
    q.registryKey === 'package.name'
  )
}

function isStudioQuestion(q: {
  source: string
  registryKey: string | null
}): boolean {
  if (q.registryKey && isCoupleFacingRegistryKey(q.registryKey)) return false
  if (q.source === 'studio' || q.source === 'system') return true
  if (q.registryKey) return isStudioFacingRegistryKey(q.registryKey)
  return false
}

/**
 * Saves the review draft as a questionnaire template (FormDefinition).
 * Available later via "Generuj ankietę" — no instance is created here.
 */
export async function saveQuestionnaireDraft(
  draft: QuestionnaireDraft,
  options?: { documentTemplateId?: string },
): Promise<SaveQuestionnaireResult> {
  // Strip any cached package options; force package rows onto q-package.
  const sanitizedQuestions = draft.questions.map((q) => {
    if (!isPackageQuestion(q)) return q
    return {
      ...q,
      id: 'q-package',
      type: 'select' as const,
      fieldKey: 'packageId',
      registryKey: 'package.name',
      source: 'ourwed_configuration' as const,
      options: [],
    }
  })
  const sanitized: QuestionnaireDraft = {
    ...draft,
    linkedPackageId: null,
    questions: sanitizedQuestions,
  }

  const forQuestionnaire = selectEnabledQuestionnaireQuestions(
    sanitized.questions,
  )
  if (forQuestionnaire.length === 0) {
    throw new QuestionnaireValidationError(
      'Włącz co najmniej jedno pytanie dla pary, aby zapisać ankietę.',
    )
  }

  // Live check only — never bake package options into the template.
  const studioPackages = await packageService.list({ activeOnly: true })
  validateQuestionnaireDraft(sanitized, studioPackages.map((p) => ({
    value: p.id,
    label: p.name,
  })))

  const template = buildQuestionnaireFromReviewDraft(sanitized)

  const informationPlan = sanitized.questions.map((q) => ({
    id: q.id,
    title: q.title,
    registryKey: q.registryKey,
    fieldKey: q.fieldKey,
    source:
      q.source === 'studio' || q.source === 'system'
        ? 'studio'
        : q.source === 'package'
          ? 'package'
          : 'couple',
    enabled: q.enabled,
  }))

  const coupleVariables = forQuestionnaire.map((q) => ({
    id: q.id,
    registryKey: q.registryKey,
    label: q.title,
    enabled: true,
  }))

  // Studio / package sections are read-only presence — all detected rows count.
  const studioVariables = sanitized.questions
    .filter(isStudioQuestion)
    .map((q) => ({
      id: q.id,
      registryKey: q.registryKey,
      label: q.title,
      enabled: true,
    }))

  const packageVariables = (sanitized.packageVariables ?? []).map((d) => ({
    id: d.id,
    registryKey: d.registryKey,
    label: d.label,
    enabled: true,
  }))

  const templateMeta: DocumentTemplateMeta = {
    version: 1,
    coupleVariables,
    studioVariables,
    packageVariables,
    defaults: [],
  }

  // Persist definition only — package options always empty (live inject on open).
  const schema = {
    ...template,
    meta: {
      suggestedPackageKind: sanitized.suggestedPackageKind,
      suggestedPackageLabel: sanitized.suggestedPackageLabel,
      linkedPackageId: null,
      sourceCounts: sanitized.counts,
      generatedAt: sanitized.generatedAt,
      usesContractCatalogue: true,
      sourceDocumentTemplateId: options?.documentTemplateId ?? null,
      informationPlan,
      packageVariables,
      builtFromReviewDraft: true,
      oneToOneFromReviewDraft: true,
    },
  }

  const form = await createFormDefinition({
    name: sanitized.name.trim(),
    slug: `contract-${slugify(sanitized.suggestedPackageLabel ?? 'questionnaire')}-${Date.now().toString(36)}`,
    description: [
      sanitized.description,
      sanitized.suggestedPackageLabel
        ? `Wykryty rodzaj pakietu: ${sanitized.suggestedPackageLabel}.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
    category: 'contract',
    schema,
    isActive: true,
  })

  if (options?.documentTemplateId) {
    await documentTemplateService.update(options.documentTemplateId, {
      questionnaireFormId: form.id,
      aiAnalyzedAt: new Date().toISOString(),
      status: 'ready',
      meta: templateMeta,
    })
  }

  const savedDraft: QuestionnaireDraft = {
    ...sanitized,
    linkedPackageId: null,
    savedFormId: form.id,
    savedInstanceId: null,
    savedFormUrl: null,
  }

  return {
    form,
    draft: savedDraft,
  }
}

export { QuestionnaireValidationError }
/** @deprecated Use saveQuestionnaireDraft */
export const persistQuestionnaireDraft = saveQuestionnaireDraft
