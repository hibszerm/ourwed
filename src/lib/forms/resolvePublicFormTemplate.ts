/**
 * Prefer the form definition schema when it is a real FormTemplate.
 *
 * Package / extras selectors come from buildContractQuestionnaireTemplate
 * using the public-safe options snapshot (or live fallback packages).
 */

import type { FormTemplate, Question } from '@/types/form'
import type { FormSchema } from '@/types/formEngine'
import type {
  AdditionalServiceOptionSnapshot,
  ContractQuestionnaireConfig,
  PackageOptionSnapshot,
} from '@/types/contractQuestionnaire'
import {
  buildContractQuestionnaireTemplate,
  CONTRACT_QUESTIONNAIRE_TEMPLATE,
} from '@/lib/forms/contractQuestionnaireTemplate'
import { CONTRACT_QUESTION_IDS } from '@/lib/forms/contractQuestionCatalog'
import { normalizePackageOptions } from '@/lib/forms/contractQuestionnaireSnapshot'

const LOG_PREFIX = '[resolvePublicFormTemplate]'

function debugLog(...args: unknown[]): void {
  try {
    if (import.meta.env?.DEV) {
      console.info(LOG_PREFIX, ...args)
    }
  } catch {
    // Node acceptance tests may lack Vite import.meta.env
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
  return normalizePackageOptions(raw).map((p) => ({ id: p.id, name: p.name }))
}

/** Any question that should be replaced by the built-in package selector. */
export function isPackageQuestion(q: Question): boolean {
  if (q.id === CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR) return true
  if (q.id === 'q-q-package') return true
  if (q.fieldKey === 'packageId' || q.fieldKey === 'selectedPackageIds') {
    return true
  }
  if (typeof q.label === 'string' && /^pakiet$/i.test(q.label.trim())) {
    return true
  }
  return false
}

export function isExtrasQuestion(q: Question): boolean {
  return (
    q.id === 'q-extras' ||
    q.id === 'sys_extras' ||
    q.id === 'q-section-extras' ||
    q.fieldKey === 'selectedAdditionalServiceIds'
  )
}

export interface ResolvePublicFormOptions {
  packages?: PackageOptionSnapshot[] | unknown
  additionalServices?: AdditionalServiceOptionSnapshot[] | unknown
  config?: ContractQuestionnaireConfig | null
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

  const builtin = buildContractQuestionnaireTemplate({ packages })
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
    type: 'multiselect',
    label: 'Pakiet',
    required: true,
    fieldKey: 'selectedPackageIds',
    presentation: 'cards',
    options: packages.map((p) => ({ value: p.id, label: p.name })),
  }
}

function injectCatalogQuestions(
  template: FormTemplate,
  packages: PackageOptionSnapshot[],
  additionalServices: AdditionalServiceOptionSnapshot[],
  config: ContractQuestionnaireConfig | null | undefined,
): FormTemplate {
  const builtin = buildContractQuestionnaireTemplate({
    packages,
    additionalServices,
    config,
  })
  const livePackage = builtin.questions.find(isPackageQuestion)
  // Match by fieldKey / isExtrasQuestion — block ids are `sys_extras`, not `q-extras`.
  const liveExtrasSection = builtin.questions.filter(isExtrasQuestion)
  const liveLocations = builtin.questions.filter(
    (q) =>
      q.fieldKey === 'bridePreparationLocation' ||
      q.fieldKey === 'groomPreparationLocation' ||
      q.fieldKey === 'ceremonyLocation' ||
      q.fieldKey === 'receptionLocation' ||
      q.id === 'q-section-locations',
  )
  const liveCustom = builtin.questions.filter(
    (q) =>
      q.id === 'q-section-custom' ||
      (typeof q.fieldKey === 'string' && q.fieldKey.startsWith('custom.')),
  )

  const withoutCatalog = template.questions.filter(
    (q) =>
      !isPackageQuestion(q) &&
      !isExtrasQuestion(q) &&
      q.fieldKey !== 'preparationLocation' &&
      q.fieldKey !== 'bridePreparationLocation' &&
      q.fieldKey !== 'groomPreparationLocation' &&
      q.fieldKey !== 'ceremonyLocation' &&
      q.fieldKey !== 'receptionLocation' &&
      q.id !== 'q-section-locations' &&
      q.id !== 'q-prep' &&
      q.id !== 'q-bride-prep' &&
      q.id !== 'q-groom-prep' &&
      q.id !== 'q-ceremony' &&
      q.id !== 'q-reception' &&
      q.id !== 'q-section-custom' &&
      !(typeof q.fieldKey === 'string' && q.fieldKey.startsWith('custom.')),
  )

  const weddingDateIdx = withoutCatalog.findIndex(
    (q) =>
      q.id === CONTRACT_QUESTION_IDS.WEDDING_DATE ||
      q.fieldKey === 'weddingDate',
  )

  const insertAfter = weddingDateIdx >= 0 ? weddingDateIdx + 1 : 0
  const head = withoutCatalog.slice(0, insertAfter)
  const tail = withoutCatalog.slice(insertAfter)

  const notesIdx = tail.findIndex(
    (q) => q.id === 'q-section-notes' || q.fieldKey === 'additionalNotes',
  )
  const beforeNotes = notesIdx >= 0 ? tail.slice(0, notesIdx) : tail
  const notesAndAfter = notesIdx >= 0 ? tail.slice(notesIdx) : []

  const middle: Question[] = []
  if (livePackage && config?.showPackages !== false) {
    middle.push(livePackage)
  }
  if (config?.showAdditionalServices !== false) {
    middle.push(...liveExtrasSection)
  }
  middle.push(...liveLocations)
  middle.push(...liveCustom)

  const questions = [...head, ...middle, ...beforeNotes, ...notesAndAfter]

  debugLog('injectCatalogQuestions() after', {
    packageOptions: livePackage?.options?.length ?? 0,
    extras: liveExtrasSection.length,
    questionIds: questions.map((q) => q.id),
  })

  return {
    ...template,
    title: builtin.title || template.title,
    description: builtin.description || template.description,
    submitLabel: builtin.submitLabel || template.submitLabel,
    successTitle: builtin.successTitle || template.successTitle,
    successDescription:
      builtin.successDescription || template.successDescription,
    questions,
  }
}

export function resolvePublicFormTemplate(
  schema: FormSchema | null | undefined,
  packagesInput: unknown,
  options?: ResolvePublicFormOptions,
): FormTemplate {
  const packages = normalizePackageOptions(
    options?.packages ?? packagesInput,
  )
  const additionalServices = normalizePackageOptions(
    options?.additionalServices ?? [],
  ) as AdditionalServiceOptionSnapshot[]
  const config = options?.config ?? null

  debugLog('resolvePublicFormTemplate()', {
    packagesLength: packages.length,
    extrasLength: additionalServices.length,
    schemaIsTemplate: isFormTemplate(schema),
    hasBlocks: Boolean(config?.blocks?.length),
  })

  // Studio questionnaire config is the source of truth for newly sent forms.
  // Prefer blocks over a stale forms.schema (which may still mark address as text).
  if (config?.blocks && config.blocks.length > 0) {
    return coerceContractAddressFields(
      buildContractQuestionnaireTemplate({
        packages,
        additionalServices,
        config,
      }),
    )
  }

  if (isFormTemplate(schema)) {
    return coerceContractAddressFields(
      injectCatalogQuestions(
        schema,
        packages,
        additionalServices,
        config,
      ),
    )
  }
  if (packages.length > 0 || additionalServices.length > 0 || config) {
    return coerceContractAddressFields(
      buildContractQuestionnaireTemplate({
        packages,
        additionalServices,
        config,
      }),
    )
  }
  debugLog('fallback → CONTRACT_QUESTIONNAIRE_TEMPLATE (empty packages)')
  return coerceContractAddressFields(CONTRACT_QUESTIONNAIRE_TEMPLATE)
}

/** Ensure contract address always uses AddressField (type location). */
function coerceContractAddressFields(template: FormTemplate): FormTemplate {
  return {
    ...template,
    questions: template.questions.map((q) => {
      if (
        q.fieldKey === 'partner1.address' ||
        q.fieldKey === 'partner2.address' ||
        q.id === 'q-p1-address' ||
        q.id === 'q-p2-address' ||
        q.id === 'sys_p1_address' ||
        q.id === 'sys_p2_address'
      ) {
        return {
          ...q,
          type: 'location',
          label:
            q.label === 'Ulica i numer domu' ? 'Adres do umowy' : q.label,
          placeholder: q.placeholder || 'Wpisz adres…',
        }
      }
      return q
    }),
  }
}
