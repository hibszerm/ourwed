/**
 * Prefer the form definition schema when it is a real FormTemplate.
 *
 * Package select ALWAYS comes from buildContractQuestionnaireTemplate —
 * the exact same question object Dane do umowy uses at runtime.
 * Never trust baked-in / AI / cached options.
 *
 * AI schemas may use wrong ids (q-q-package) or omit the field entirely.
 * Before render we strip every package-like question and insert a clone
 * of the built-in q-package with live Studio Packages.
 */

import type { FormTemplate, Question } from '@/types/form'
import type { FormSchema } from '@/types/formEngine'
import {
  buildContractQuestionnaireTemplate,
  CONTRACT_QUESTIONNAIRE_TEMPLATE,
} from '@/lib/forms/contractQuestionnaireTemplate'
import { CONTRACT_QUESTION_IDS } from '@/lib/forms/contractQuestionCatalog'

const LOG_PREFIX = '[resolvePublicFormTemplate]'

function debugLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.info(LOG_PREFIX, ...args)
  }
}

function isFormTemplate(value: unknown): value is FormTemplate {
  if (!value || typeof value !== 'object') return false
  const t = value as FormTemplate
  return (
    typeof t.title === 'string' &&
    Array.isArray(t.questions) &&
    t.questions.length > 0
  )
}

/** Normalize RPC / client package lists to { id, name }. */
export function normalizeStudioPackages(
  raw: unknown,
): Array<{ id: string; name: string }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ id: string; name: string }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? row.value ?? '').trim()
    const name = String(row.name ?? row.label ?? '').trim()
    if (!id || !name) continue
    out.push({ id, name })
  }
  return out
}

/** Any question that should be replaced by the built-in package selector. */
export function isPackageQuestion(q: Question): boolean {
  if (q.id === CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR) return true
  if (q.id === 'q-q-package') return true
  if (q.fieldKey === 'packageId') return true
  if (typeof q.label === 'string' && /^pakiet$/i.test(q.label.trim())) {
    return true
  }
  return false
}

/**
 * Live package field — identical to the one inside
 * buildContractQuestionnaireTemplate (Dane do umowy).
 */
export function getLivePackageQuestion(
  packages: Array<{ id: string; name: string }>,
): Question {
  debugLog('getLivePackageQuestion()', {
    packagesLength: packages.length,
    packages: packages.map((p) => ({ id: p.id, name: p.name })),
  })

  const builtin = buildContractQuestionnaireTemplate(packages)
  const pkg = builtin.questions.find(
    (q) => q.id === CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR,
  )
  if (pkg) {
    const cloned = { ...pkg, options: pkg.options ? [...pkg.options] : [] }
    debugLog('getLivePackageQuestion() cloned from Dane', {
      id: cloned.id,
      type: cloned.type,
      fieldKey: cloned.fieldKey,
      optionsLength: cloned.options?.length ?? 0,
    })
    return cloned
  }
  return {
    id: CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR,
    type: 'select',
    label: 'Pakiet',
    required: true,
    fieldKey: 'packageId',
    options: packages.map((p) => ({ value: p.id, label: p.name })),
  }
}

/**
 * Remove every package-like field, then insert a cloned Dane q-package
 * with live options (after wedding date when present).
 */
function injectLivePackageQuestion(
  template: FormTemplate,
  packages: Array<{ id: string; name: string }>,
): FormTemplate {
  const livePackage = getLivePackageQuestion(packages)
  const detected = template.questions.filter(isPackageQuestion)

  debugLog('injectLivePackageQuestion() before', {
    title: template.title,
    questionCount: template.questions.length,
    detectedPackageFields: detected.map((q) => ({
      id: q.id,
      type: q.type,
      fieldKey: q.fieldKey,
      optionsLength: q.options?.length ?? 0,
    })),
  })

  const withoutPackage = template.questions.filter((q) => !isPackageQuestion(q))

  const weddingDateIdx = withoutPackage.findIndex(
    (q) =>
      q.id === CONTRACT_QUESTION_IDS.WEDDING_DATE ||
      q.fieldKey === 'weddingDate',
  )

  let questions: Question[]
  if (weddingDateIdx >= 0) {
    questions = [
      ...withoutPackage.slice(0, weddingDateIdx + 1),
      livePackage,
      ...withoutPackage.slice(weddingDateIdx + 1),
    ]
  } else {
    const sectionIdx = withoutPackage.findIndex(
      (q) => q.type === 'section_title',
    )
    if (sectionIdx >= 0) {
      questions = [
        ...withoutPackage.slice(0, sectionIdx + 1),
        livePackage,
        ...withoutPackage.slice(sectionIdx + 1),
      ]
    } else {
      questions = [livePackage, ...withoutPackage]
    }
  }

  const finalPkg = questions.find(isPackageQuestion)
  debugLog('injectLivePackageQuestion() after', {
    finalPackage: finalPkg
      ? {
          id: finalPkg.id,
          type: finalPkg.type,
          fieldKey: finalPkg.fieldKey,
          optionsLength: finalPkg.options?.length ?? 0,
          optionLabels: (finalPkg.options ?? []).map((o) => o.label),
        }
      : null,
    questionIds: questions.map((q) => q.id),
  })

  return { ...template, questions }
}

export function resolvePublicFormTemplate(
  schema: FormSchema | null | undefined,
  packagesInput: unknown,
): FormTemplate {
  const packages = normalizeStudioPackages(packagesInput)

  debugLog('resolvePublicFormTemplate()', {
    packagesLength: packages.length,
    schemaIsTemplate: isFormTemplate(schema),
    schemaTitle:
      schema && typeof schema === 'object' && 'title' in schema
        ? String((schema as { title?: unknown }).title ?? '')
        : null,
  })

  if (isFormTemplate(schema)) {
    return injectLivePackageQuestion(schema, packages)
  }
  if (packages.length > 0) {
    debugLog('fallback → buildContractQuestionnaireTemplate (Dane)')
    return buildContractQuestionnaireTemplate(packages)
  }
  debugLog('fallback → CONTRACT_QUESTIONNAIRE_TEMPLATE (empty packages)')
  return CONTRACT_QUESTIONNAIRE_TEMPLATE
}
