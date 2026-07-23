/**
 * AI matching layer over the built-in "Dane do umowy" catalogue.
 * Labels / question types for system variables come from SystemVariableRegistry.
 */

import type { QuestionType } from '@/types/form'
import {
  CONTRACT_QUESTION_IDS,
  FIELD_KEY_TO_CONTRACT_QUESTION_ID,
  REGISTRY_KEY_TO_CONTRACT_QUESTION_ID,
  getContractQuestionById,
  normalizeQuestionLabel,
  resolveContractQuestionId,
  type ContractQuestionId,
} from '@/lib/forms/contractQuestionCatalog'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { SystemQuestionType } from '@/lib/variables/registry'

export interface CatalogQuestion {
  id: ContractQuestionId | string
  type: QuestionType
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  fieldKey: string
  registryKeys: string[]
}

function mapSystemQuestionType(type?: SystemQuestionType): QuestionType {
  switch (type) {
    case 'email':
      return 'email'
    case 'phone':
      return 'phone'
    case 'date':
      return 'date'
    case 'select':
      return 'select'
    case 'location':
      return 'location'
    case 'textarea':
      return 'textarea'
    case 'checkbox':
      return 'checkbox'
    default:
      return 'text'
  }
}

/** Registry-backed questionnaire metadata — no duplicated label maps. */
export function questionnaireMetaFromRegistry(registryKey: string): {
  label: string
  type: QuestionType
  description?: string
} | null {
  const def = SystemVariableRegistry.get(registryKey)
  if (!def?.questionnaireAvailable) return null
  return {
    label: def.label,
    type: mapSystemQuestionType(def.questionType),
    description: def.description,
  }
}

/** @deprecated Prefer REGISTRY_KEY_TO_CONTRACT_QUESTION_ID — kept for callers. */
export const REGISTRY_TO_FIELD_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(REGISTRY_KEY_TO_CONTRACT_QUESTION_ID).map(([reg, qid]) => {
    const q = getContractQuestionById(qid)
    return [reg, q?.fieldKey ?? '']
  }),
)

const REGISTRY_KEYS_BY_QUESTION: Record<string, string[]> = {}
for (const [reg, qid] of Object.entries(REGISTRY_KEY_TO_CONTRACT_QUESTION_ID)) {
  const list = REGISTRY_KEYS_BY_QUESTION[qid] ?? []
  list.push(reg)
  REGISTRY_KEYS_BY_QUESTION[qid] = list
}

export function buildReusableQuestionCatalog(): CatalogQuestion[] {
  return Object.values(CONTRACT_QUESTION_IDS).map((id) => {
    const q = getContractQuestionById(id)!
    return {
      id,
      type: q.type,
      label: q.label,
      description: q.description,
      required: q.required,
      placeholder: q.placeholder,
      fieldKey: q.fieldKey!,
      registryKeys: REGISTRY_KEYS_BY_QUESTION[id] ?? [],
    }
  })
}

export function findCatalogByRegistryKey(
  registryKey: string,
): CatalogQuestion | null {
  const id = REGISTRY_KEY_TO_CONTRACT_QUESTION_ID[registryKey]
  if (!id) {
    const fieldKey = REGISTRY_TO_FIELD_KEY[registryKey]
    if (fieldKey) return findCatalogByFieldKey(fieldKey)
    return null
  }
  return buildReusableQuestionCatalog().find((c) => c.id === id) ?? null
}

export function findCatalogByFieldKey(fieldKey: string): CatalogQuestion | null {
  const id = FIELD_KEY_TO_CONTRACT_QUESTION_ID[fieldKey]
  if (!id) return null
  return buildReusableQuestionCatalog().find((c) => c.id === id) ?? null
}

export function findCatalogByLabel(label: string): CatalogQuestion | null {
  const normalized = normalizeLabel(label)
  if (!normalized) return null

  // Prefer specific matches over short labels like "Imię".
  const catalog = buildReusableQuestionCatalog()
  const exact = catalog.find((c) => normalizeLabel(c.label) === normalized)
  if (exact && normalizeLabel(exact.label).length > 4) return exact

  if (/pakiet|package|ofert/.test(normalized)) {
    return findCatalogByFieldKey('packageId')
  }
  if (/data slubu|wedding date|data/.test(normalized) && /slub|wedding|date/.test(normalized)) {
    return findCatalogByFieldKey('weddingDate')
  }
  if (/email|e-mail/.test(normalized)) {
    return findCatalogByFieldKey('partner1.email')
  }
  if (/ceremon/.test(normalized)) {
    return findCatalogByFieldKey('ceremonyLocation')
  }
  if (/przyjec|reception/.test(normalized)) {
    return findCatalogByFieldKey('receptionLocation')
  }
  if (/przygotow|prepar/.test(normalized)) {
    return findCatalogByFieldKey('preparationLocation')
  }
  if (/uwag|notatk|notes/.test(normalized)) {
    return findCatalogByFieldKey('additionalNotes')
  }

  return exact ?? null
}

export function normalizeLabel(value: string): string {
  return normalizeQuestionLabel(value)
}

export function matchContractQuestionId(input: {
  registryKey?: string | null
  fieldKey?: string | null
  label?: string | null
}): string | null {
  const fromKeys = resolveContractQuestionId({
    registryKey: input.registryKey,
    fieldKey: input.fieldKey,
  })
  if (fromKeys) return fromKeys
  if (input.label) {
    return findCatalogByLabel(input.label)?.id ?? null
  }
  return null
}

/** Infer type only for truly new (non-catalogue) questions. */
export function inferQuestionType(
  registryKey: string | null,
  label: string,
): QuestionType {
  if (registryKey) {
    const fromRegistry = questionnaireMetaFromRegistry(registryKey)
    if (fromRegistry) return fromRegistry.type
  }
  const matched = matchContractQuestionId({ registryKey, label })
  if (matched) {
    const q = getContractQuestionById(matched)
    if (q) return q.type
  }
  const key = (registryKey ?? '').toLowerCase()
  const text = label.toLowerCase()
  if (key.includes('package') || /pakiet|package|ofert/.test(text)) {
    return 'select'
  }
  if (key.includes('date') || /\bdata\b/.test(text)) return 'date'
  if (key.includes('email') || /e-?mail/.test(text)) return 'email'
  if (key.includes('phone') || /telefon|phone/.test(text)) return 'phone'
  if (
    key.includes('location') ||
    /ceremon|przyjęc|przygotow|miejsce|lokaliz/.test(text)
  ) {
    return 'location'
  }
  if (/zgoda|consent|rodo|gdpr|akcept/.test(text)) return 'checkbox'
  if (/uwag|notatk|opis/.test(text)) return 'textarea'
  return 'text'
}
