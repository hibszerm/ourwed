/**
 * Reuses exact "Dane do umowy" question definitions (same id / type / fieldKey).
 */

import { registryPolishLabel } from '@/features/documents/ai/canonicalVariableIds'
import type { DetectedField } from '@/features/documents/mapping/types'
import type { QuestionOption } from '@/types/form'
import {
  CONTRACT_QUESTION_IDS,
  getContractQuestionById,
  getPackageSelectQuestion,
} from '@/lib/forms/contractQuestionCatalog'
import type { ClassifiedVariable, DraftQuestion } from './types'
import { isQuestionnaireSource } from './types'
import {
  findCatalogByLabel,
  findCatalogByRegistryKey,
  inferQuestionType,
  matchContractQuestionId,
  type CatalogQuestion,
} from './questionCatalog'

function enrichTitle(
  catalog: CatalogQuestion | null,
  classified: ClassifiedVariable,
  _field: DetectedField | undefined,
): string {
  if (classified.registryKey) {
    return registryPolishLabel(classified.registryKey)
  }
  if (catalog?.fieldKey === 'packageId') {
    return registryPolishLabel('package.name')
  }
  if (catalog?.label) return catalog.label
  return 'Informacja'
}

function pushQuestion(
  questions: DraftQuestion[],
  usedIds: Set<string>,
  question: DraftQuestion,
): void {
  if (usedIds.has(question.id)) return
  if (question.fieldKey) {
    const dup = questions.find((q) => q.fieldKey === question.fieldKey)
    if (dup) return
  }
  usedIds.add(question.id)
  questions.push(question)
}

function packageOptionsToCatalog(
  _packageOptions: QuestionOption[],
): { id: string; name: string }[] {
  // Never bake Studio package lists into the draft — options stay empty.
  return []
}

/** Draft wrapper around the single built-in Package selector (no options). */
function packageDraftQuestion(
  packageOptions: QuestionOption[],
  order: number,
  contractLabel?: string,
): DraftQuestion {
  const pkg = getPackageSelectQuestion(packageOptionsToCatalog(packageOptions))
  return {
    id: pkg.id,
    enabled: true,
    title: pkg.label,
    description: pkg.description ?? '',
    placeholder: pkg.placeholder ?? '',
    required: pkg.required ?? true,
    type: 'select',
    fieldKey: 'packageId',
    contractLabel: contractLabel ?? pkg.label,
    registryKey: 'package.name',
    source: 'ourwed_configuration',
    reused: true,
    order,
    options: [],
  }
}

/**
 * Build draft questions by cloning built-in catalogue entries whenever possible.
 */
export function generateQuestionsFromClassification(
  classification: ClassifiedVariable[],
  fields: DetectedField[],
  packageOptions: QuestionOption[] = [],
): DraftQuestion[] {
  const fieldById = new Map(fields.map((f) => [f.id, f]))
  const usedIds = new Set<string>()
  const questions: DraftQuestion[] = []
  let order = 0

  for (const item of classification) {
    if (!isQuestionnaireSource(item.source)) continue

    const field = fieldById.get(item.fieldId)
    const catalogId =
      matchContractQuestionId({
        registryKey: item.registryKey,
        label: item.label,
      }) ??
      findCatalogByRegistryKey(item.registryKey ?? '')?.id ??
      findCatalogByLabel(item.label)?.id

    if (catalogId) {
      const catalog =
        findCatalogByRegistryKey(item.registryKey ?? '') ??
        findCatalogByLabel(item.label) ??
        (() => {
          const q = getContractQuestionById(catalogId)
          if (!q?.fieldKey) return null
          return {
            id: catalogId,
            type: q.type,
            label: q.label,
            description: q.description,
            required: q.required,
            placeholder: q.placeholder,
            fieldKey: q.fieldKey,
            registryKeys: [] as string[],
          }
        })()

      if (!catalog) continue

      const isPackage = catalog.fieldKey === 'packageId'
      if (isPackage) {
        pushQuestion(
          questions,
          usedIds,
          packageDraftQuestion(packageOptions, order++, item.label),
        )
        continue
      }

      pushQuestion(questions, usedIds, {
        // Exact built-in id — never invent q-q-package etc.
        id: catalog.id,
        enabled: true,
        title: enrichTitle(catalog, item, field),
        description: catalog.description ?? '',
        placeholder: catalog.placeholder ?? '',
        required: catalog.required ?? false,
        type: catalog.type,
        fieldKey: catalog.fieldKey,
        contractLabel: item.label,
        registryKey: item.registryKey,
        source: item.source,
        reused: true,
        order: order++,
      })
      continue
    }

    // No catalogue match — only then create a new definition.
    const title = enrichTitle(null, item, field)
    // Never create a free-text / custom package field.
    if (
      item.source === 'ourwed_configuration' ||
      /pakiet|package|ofert/.test(`${item.label} ${title}`.toLowerCase())
    ) {
      pushQuestion(
        questions,
        usedIds,
        packageDraftQuestion(packageOptions, order++, item.label),
      )
      continue
    }

    pushQuestion(questions, usedIds, {
      id: `q-custom-${item.fieldId}`,
      enabled: true,
      title,
      description: '',
      placeholder: '',
      required: true,
      type: inferQuestionType(item.registryKey, title),
      fieldKey: null,
      contractLabel: item.label,
      registryKey: item.registryKey,
      source: item.source,
      reused: false,
      order: order++,
    })
  }

  return questions
}

/** Ensure package uses the built-in PACKAGE_SELECTOR definition. */
export function ensurePackageSelectQuestion(
  questions: DraftQuestion[],
  packageOptions: QuestionOption[],
): DraftQuestion[] {
  const packageId = CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR
  const hasPackage = questions.some(
    (q) => q.id === packageId || q.fieldKey === 'packageId',
  )

  if (hasPackage) {
    return questions.map((q) =>
      q.id === packageId || q.fieldKey === 'packageId'
        ? {
            ...packageDraftQuestion(packageOptions, q.order, q.contractLabel),
            enabled: q.enabled,
          }
        : q,
    )
  }

  const packageQuestion = packageDraftQuestion(packageOptions, 1)
  const reordered = questions.map((q) => ({
    ...q,
    order: q.order >= 1 ? q.order + 1 : q.order,
  }))

  return [...reordered, packageQuestion].sort((a, b) => a.order - b.order)
}
