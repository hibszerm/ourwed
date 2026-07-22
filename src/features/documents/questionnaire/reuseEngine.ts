/**
 * Reuses exact "Dane do umowy" question definitions (same id / type / fieldKey).
 */

import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import { informationTitle } from '@/features/documents/mapping/information/informationModel'
import type { DetectedField } from '@/features/documents/mapping/types'
import type { QuestionOption } from '@/types/form'
import { getContractQuestionById } from '@/lib/forms/contractQuestionCatalog'
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
  field: DetectedField | undefined,
): string {
  if (catalog) {
    if (
      catalog.fieldKey.startsWith('partner1.') ||
      catalog.fieldKey.startsWith('partner2.')
    ) {
      const role = catalog.fieldKey.startsWith('partner1.')
        ? 'Panna młoda'
        : 'Pan młody'
      if (catalog.label.length < 12) {
        return `${role} — ${catalog.label}`
      }
    }
    return catalog.label
  }
  if (field) return informationTitle(field)
  const def = classified.registryKey
    ? getVariableDef(classified.registryKey)
    : undefined
  return classified.label || def?.labelPl || 'Pytanie'
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
        source: isPackage ? 'ourwed_configuration' : item.source,
        reused: true,
        order: order++,
        options: isPackage ? packageOptions : undefined,
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
      const pkg = getContractQuestionById('q-package')
      if (pkg?.fieldKey) {
        pushQuestion(questions, usedIds, {
          id: 'q-package',
          enabled: true,
          title: pkg.label,
          description: pkg.description ?? '',
          placeholder: '',
          required: pkg.required ?? true,
          type: 'select',
          fieldKey: 'packageId',
          contractLabel: item.label,
          registryKey: 'package.name',
          source: 'ourwed_configuration',
          reused: true,
          order: order++,
          options: packageOptions,
        })
      }
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
  const pkgDef = getContractQuestionById('q-package')
  if (!pkgDef?.fieldKey) return questions

  if (questions.some((q) => q.id === 'q-package' || q.fieldKey === 'packageId')) {
    return questions.map((q) =>
      q.id === 'q-package' || q.fieldKey === 'packageId'
        ? {
            ...q,
            id: 'q-package',
            type: 'select' as const,
            fieldKey: 'packageId',
            title: pkgDef.label,
            required: pkgDef.required ?? true,
            source: 'ourwed_configuration' as const,
            reused: true,
            options: packageOptions.length > 0 ? packageOptions : q.options,
            description: pkgDef.description ?? '',
          }
        : q,
    )
  }

  const packageQuestion: DraftQuestion = {
    id: 'q-package',
    enabled: true,
    title: pkgDef.label,
    description: pkgDef.description ?? '',
    placeholder: '',
    required: pkgDef.required ?? true,
    type: 'select',
    fieldKey: 'packageId',
    contractLabel: 'Pakiet',
    registryKey: 'package.name',
    source: 'ourwed_configuration',
    reused: true,
    order: 1,
    options: packageOptions,
  }

  const reordered = questions.map((q) => ({
    ...q,
    order: q.order >= 1 ? q.order + 1 : q.order,
  }))

  return [...reordered, packageQuestion].sort((a, b) => a.order - b.order)
}
