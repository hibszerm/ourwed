/**
 * Prefer the form definition schema when it is a real FormTemplate.
 * Package select ALWAYS loads options from Studio Packages (same path as
 * built-in "Dane do umowy") — never trust baked-in empty options.
 */

import type { FormTemplate } from '@/types/form'
import type { FormSchema } from '@/types/formEngine'
import {
  buildContractQuestionnaireTemplate,
  CONTRACT_QUESTIONNAIRE_TEMPLATE,
} from '@/lib/forms/contractQuestionnaireTemplate'
import { CONTRACT_QUESTION_IDS } from '@/lib/forms/contractQuestionCatalog'

function isFormTemplate(value: unknown): value is FormTemplate {
  if (!value || typeof value !== 'object') return false
  const t = value as FormTemplate
  return (
    typeof t.title === 'string' &&
    Array.isArray(t.questions) &&
    t.questions.length > 0
  )
}

function injectStudioPackageOptions(
  template: FormTemplate,
  packages: { id: string; name: string }[],
): FormTemplate {
  const packageOptions = packages.map((p) => ({
    value: p.id,
    label: p.name,
  }))

  return {
    ...template,
    questions: template.questions.map((q) => {
      const isPackageSelector =
        q.id === CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR ||
        q.fieldKey === 'packageId'
      if (!isPackageSelector) return q
      return {
        ...q,
        id: CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR,
        type: 'select' as const,
        fieldKey: 'packageId',
        options: packageOptions,
      }
    }),
  }
}

export function resolvePublicFormTemplate(
  schema: FormSchema | null | undefined,
  packages: { id: string; name: string }[],
): FormTemplate {
  if (isFormTemplate(schema)) {
    return injectStudioPackageOptions(schema, packages)
  }
  if (packages.length > 0) {
    return buildContractQuestionnaireTemplate(packages)
  }
  return CONTRACT_QUESTIONNAIRE_TEMPLATE
}
