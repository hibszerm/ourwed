/**
 * Shared A4 contract-generation readiness + review payload helpers.
 * Single source of truth: validateContractGeneration / evaluateWeddingContractReadiness.
 */

import type { CompletenessField } from '@/features/documents/template/buildContractCompleteness'
import type { GenerationAttemptResult } from '@/features/documents/template/generationAttemptResult'
import type { CompanyDetails } from '@/types/company'
import type { Wedding } from '@/types/wedding'
import {
  validateContractGeneration,
  type ContractGenerationValidation,
} from '@/lib/utils/validateContractGeneration'

/** Authoritative may-generate check for UI and services. */
export function mayGenerateContract(
  wedding: Wedding,
  company?: CompanyDetails | null,
): ContractGenerationValidation {
  return validateContractGeneration(wedding, company)
}

const CLIENT_ITEM_TO_REGISTRY: Record<string, string> = {
  'Imię i nazwisko klienta': 'couple_full_names',
  'Adres klienta': 'client_address',
  'Telefon klienta': 'client_phone',
  'Data ślubu': 'wedding_date',
  'Miejsce przyjęcia': 'reception_location',
  'Miejsce ceremonii': 'ceremony_location',
  'Przygotowania Panny Młodej': 'bride_preparation_location',
  'Przygotowania Pana Młodego': 'groom_preparation_location',
}

function editableFieldsFromValidation(
  validation: ContractGenerationValidation,
): CompletenessField[] {
  const fields: CompletenessField[] = []
  for (const group of validation.missingGroups) {
    if (group.id === 'travel') continue
    for (const label of group.items) {
      const registryKey =
        CLIENT_ITEM_TO_REGISTRY[label] ??
        label
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_ąćęłńóśźż]/gi, '')
      fields.push({
        slotId: registryKey,
        registryKey,
        label,
        group: group.id === 'package' || group.id === 'payments' ? 'package' : 'wedding',
        value: '',
        missing: true,
        source: 'missing',
        sourceLabel: 'Brak',
      })
    }
  }
  return fields
}

/**
 * Service-layer refusal when mayGenerateContract fails.
 * No correlationId — pipeline must not start (no AI call).
 */
export function generationBlockedByReadiness(
  validation: ContractGenerationValidation,
): Extract<GenerationAttemptResult, { status: 'needs_review' }> {
  const messages = validation.missingGroups.flatMap((g) =>
    g.items.map((item) => `Brakuje: ${item}`),
  )
  if (messages.length === 0) {
    messages.push('Uzupełnij dane do umowy przed wygenerowaniem.')
  }
  const editableFields = editableFieldsFromValidation(validation)
  return {
    status: 'needs_review',
    issues: editableFields.map((f) => ({
      id: f.registryKey,
      message: `Brakuje: ${f.label}`,
      registryKeys: [f.registryKey],
    })),
    reviewStatePatch: {
      editableFields,
      contextualMessages: messages,
      issues: editableFields.map((f) => ({
        id: f.registryKey,
        message: `Brakuje: ${f.label}`,
        registryKeys: [f.registryKey],
      })),
    },
    correlationId: null,
  }
}
