/**
 * Maps QuestionnaireDraft → FormTemplate using built-in "Dane do umowy" definitions.
 * Enabled question set may differ; definitions (id / type / fieldKey) must not.
 */

import type { FormTemplate, Question } from '@/types/form'
import {
  buildContractQuestionnaireSubset,
  getContractQuestionById,
} from '@/lib/forms/contractQuestionCatalog'
import type { DraftQuestion, QuestionnaireDraft } from './types'

/**
 * Prefer catalogue subset. Custom (non-catalogue) questions are appended rarely.
 */
export function mapDraftToFormTemplate(
  draft: QuestionnaireDraft,
  enabled: DraftQuestion[] = draft.questions.filter((q) => q.enabled),
  packages: { id: string; name: string }[] = [],
): FormTemplate {
  const catalogueIds = enabled
    .filter((q) => q.reused || Boolean(getContractQuestionById(q.id)))
    .map((q) => q.id)

  const base = buildContractQuestionnaireSubset(catalogueIds, packages, {
    title: draft.name,
    description: draft.description,
  })

  const custom: Question[] = enabled
    .filter((q) => !getContractQuestionById(q.id))
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      id: q.id,
      type: q.type,
      label: q.title,
      description: q.description || undefined,
      placeholder: q.placeholder || undefined,
      required: q.required,
      fieldKey: q.fieldKey ?? undefined,
      // Never persist package options on custom selects — package must be q-package.
      options:
        q.type === 'select' || q.type === 'radio' || q.type === 'multiselect'
          ? q.fieldKey === 'packageId'
            ? undefined
            : q.options
          : undefined,
    }))

  if (custom.length === 0) return base

  return {
    ...base,
    questions: [
      ...base.questions,
      {
        id: 'q-section-additional-ai',
        type: 'section_title',
        label: 'Dodatkowe pytania',
      },
      ...custom,
    ],
  }
}
