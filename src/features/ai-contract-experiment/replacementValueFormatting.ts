/**
 * Build replacement values preserving source formatting conventions.
 */

import type {
  ContractFieldKey,
  ContractGenerationInput,
  PhysicalOccurrenceReplacementMode,
  ValidatedAiMapping,
} from './types'
import { deriveLocationReplacementCapability } from './locationReplacementCapability'

function formatDateLikeSource(sourceExact: string, replacementDate: string): string {
  const trimmed = (replacementDate ?? '').trim()
  const base = trimmed.replace(/\s*r\.?\s*$/i, '').trim()
  if (!base || base.length < 6 || !/\d/.test(base)) return ''
  if (/\s*r\.?\s*$/i.test(sourceExact)) return `${base} r.`
  return base
}

function formatMoneyLikeSource(sourceExact: string, replacementFormatted: string): string {
  const usesNbsp = sourceExact.includes('\u00a0')
  let out = replacementFormatted.replace(/\u00a0/g, ' ')
  if (usesNbsp) out = out.replace(/ /g, '\u00a0')
  const sourceHasPln = /PLN/i.test(sourceExact)
  const sourceHasZl = /zł/i.test(sourceExact)
  if (sourceHasPln && !/PLN/i.test(out)) {
    out = out.replace(/zł/i, 'PLN')
  } else if (sourceHasZl && !/zł/i.test(out)) {
    out = out.replace(/PLN/i, 'zł')
  }
  return out
}

function coupleNames(input: ContractGenerationInput): string {
  return input.clients.map((c) => c.fullName).join(' i ')
}

export function formatReplacementValue(input: {
  fieldKey: ContractFieldKey
  sourceExact: string
  generationInput: ContractGenerationInput
}): string {
  const { fieldKey, sourceExact, generationInput } = input

  switch (fieldKey) {
    case 'couple_full_names':
      return coupleNames(generationInput)
    case 'client_address':
      return generationInput.clients[0]?.address ?? ''
    case 'client_phone':
      return generationInput.clients[0]?.phone ?? ''
    case 'contract_execution_date':
      return formatDateLikeSource(
        sourceExact,
        generationInput.currentDate,
      )
    case 'wedding_date':
      return formatDateLikeSource(sourceExact, generationInput.weddingDate)
    case 'preparation_location':
      return generationInput.locations.preparation ?? ''
    case 'ceremony_location':
      return generationInput.locations.ceremony ?? ''
    case 'reception_location':
      return generationInput.locations.reception ?? ''
    case 'contract_value_formatted':
    case 'agreed_deposit_formatted':
    case 'remaining_after_deposit_formatted': {
      const raw =
        fieldKey === 'contract_value_formatted'
          ? generationInput.finances.contractValueFormatted
          : fieldKey === 'agreed_deposit_formatted'
            ? generationInput.finances.depositAmountFormatted
            : generationInput.finances.remainingAmountFormatted
      return formatMoneyLikeSource(sourceExact, raw)
    }
    case 'contract_value_words':
      return generationInput.finances.contractValueWords
    case 'agreed_deposit_words':
      return generationInput.finances.depositAmountWords
    case 'remaining_after_deposit_words':
      return generationInput.finances.remainingAmountWords
    case 'deposit_due_date':
      return formatDateLikeSource(
        sourceExact,
        generationInput.finances.payments.find((p) => p.type === 'deposit')
          ?.dueDate ?? '',
      )
    case 'payment_due_date':
      return formatDateLikeSource(
        sourceExact,
        generationInput.finances.payments[0]?.dueDate ?? '',
      )
    case 'final_payment_due_date':
      return formatDateLikeSource(
        sourceExact,
        generationInput.finances.payments[
          generationInput.finances.payments.length - 1
        ]?.dueDate ?? '',
      )
    default:
      return ''
  }
}

export function formatReplacementValueForOccurrence(input: {
  mapping: Pick<
    ValidatedAiMapping,
    | 'fieldKey'
    | 'resolvedExactValue'
    | 'sourceText'
    | 'occurrenceReplacementMode'
    | 'customReplacementValue'
  >
  generationInput: ContractGenerationInput
}): string {
  if (input.mapping.customReplacementValue?.trim()) {
    return input.mapping.customReplacementValue.trim()
  }

  const sourceExact = input.mapping.resolvedExactValue || input.mapping.sourceText
  const mode = input.mapping.occurrenceReplacementMode ?? 'direct_value'

  if (
    mode === 'location_name_inflected' &&
    (input.mapping.fieldKey === 'reception_location' ||
      input.mapping.fieldKey === 'ceremony_location' ||
      input.mapping.fieldKey === 'preparation_location')
  ) {
    const cap = deriveLocationReplacementCapability(
      input.generationInput,
      input.mapping.fieldKey,
    )
    if (cap.venueName) return cap.venueName
    return ''
  }

  if (mode === 'manual_review_required') return ''

  return formatReplacementValue({
    fieldKey: input.mapping.fieldKey,
    sourceExact,
    generationInput: input.generationInput,
  })
}

export function occurrenceReplacementModeLabel(
  mode?: PhysicalOccurrenceReplacementMode,
): string {
  switch (mode) {
    case 'direct_value':
      return 'Bezpośrednia zamiana'
    case 'location_name_inflected':
      return 'Nazwa miejsca (odmiana)'
    case 'manual_review_required':
      return 'Wymaga sprawdzenia'
    default:
      return 'Bezpośrednia zamiana'
  }
}

export function buildResolvedValuesFromBindings(
  bindings: Array<{ id: string; replacementValue: string }>,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const b of bindings) {
    resolved[b.id] = b.replacementValue
  }
  return resolved
}
