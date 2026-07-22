/**
 * Persist QuestionnaireDraft as a reusable Form Engine template (definition only).
 *
 * Flow: Draft → validate → mapper → createFormDefinition
 * Does NOT create form_instances, submissions, or dashboard entries.
 */

import { createFormDefinition } from '@/lib/api/forms'
import { packageService } from '@/lib/api/packageService'
import type { FormDefinition } from '@/types/formEngine'
import type { QuestionOption } from '@/types/form'
import { slugify } from '@/types/package'
import { mapDraftToFormTemplate } from './questionnaireMapper'
import {
  QuestionnaireValidationError,
  validateQuestionnaireDraft,
} from './validateQuestionnaireDraft'
import type { DraftQuestion, QuestionnaireDraft } from './types'

async function resolveLinkedPackageId(
  draft: QuestionnaireDraft,
): Promise<string | null> {
  if (draft.linkedPackageId) return draft.linkedPackageId
  if (!draft.suggestedPackageLabel) return null

  try {
    const packages = await packageService.list({ activeOnly: true })
    const label = draft.suggestedPackageLabel.toLowerCase()
    const match = packages.find((p) => {
      const name = p.name.toLowerCase()
      if (draft.suggestedPackageKind === 'photo_video') {
        return /foto|photo/.test(name) && /video|wideo/.test(name)
      }
      if (draft.suggestedPackageKind === 'photo') {
        return /foto|photo/.test(name) && !/video|wideo/.test(name)
      }
      if (draft.suggestedPackageKind === 'video') {
        return /video|wideo|film/.test(name) && !/foto|photo/.test(name)
      }
      return name.includes(label)
    })
    return match?.id ?? null
  } catch {
    return null
  }
}

async function loadPackageOptions(): Promise<QuestionOption[]> {
  const packages = await packageService.list({ activeOnly: true })
  return packages.map((p) => ({ value: p.id, label: p.name }))
}

function withPackageOptions(
  questions: DraftQuestion[],
  options: QuestionOption[],
): DraftQuestion[] {
  return questions.map((q) =>
    q.fieldKey === 'packageId'
      ? { ...q, type: 'select', options, source: 'ourwed_configuration' }
      : q,
  )
}

export interface SaveQuestionnaireResult {
  form: FormDefinition
  draft: QuestionnaireDraft
}

/**
 * Saves the AI draft as a questionnaire template (FormDefinition).
 * Available later via "Generuj ankietę" — no instance is created here.
 */
export async function saveQuestionnaireDraft(
  draft: QuestionnaireDraft,
): Promise<SaveQuestionnaireResult> {
  const packageOptions = await loadPackageOptions()
  const questions = withPackageOptions(draft.questions, packageOptions)
  const normalized: QuestionnaireDraft = { ...draft, questions }

  validateQuestionnaireDraft(normalized, packageOptions)

  const enabled = questions.filter((q) => q.enabled)
  const template = mapDraftToFormTemplate(
    normalized,
    enabled,
    packageOptions.map((o) => ({ id: o.value, name: o.label })),
  )
  const linkedPackageId = await resolveLinkedPackageId(normalized)

  const schema = {
    ...template,
    questions: template.questions.map((q) =>
      q.id === 'q-package' || q.fieldKey === 'packageId'
        ? { ...q, options: [] } // always injected at runtime from Studio Packages
        : q,
    ),
    meta: {
      suggestedPackageKind: normalized.suggestedPackageKind,
      suggestedPackageLabel: normalized.suggestedPackageLabel,
      linkedPackageId,
      sourceCounts: normalized.counts,
      generatedAt: normalized.generatedAt,
      usesContractCatalogue: true,
    },
  }

  const form = await createFormDefinition({
    name: normalized.name.trim(),
    slug: `contract-${slugify(normalized.suggestedPackageLabel ?? 'questionnaire')}-${Date.now().toString(36)}`,
    description: [
      normalized.description,
      normalized.suggestedPackageLabel
        ? `Sugerowany pakiet: ${normalized.suggestedPackageLabel}.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
    category: 'contract',
    schema,
    isActive: true,
  })

  if (linkedPackageId) {
    try {
      await packageService.linkQuestionnaireForm(linkedPackageId, form.id)
    } catch {
      // Migration may be pending — template is still created.
    }
  }

  const savedDraft: QuestionnaireDraft = {
    ...normalized,
    linkedPackageId,
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
