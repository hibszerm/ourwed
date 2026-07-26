/**
 * Location contractDisplay — document-ready form only.
 * Never invent Polish declension.
 */

import { validateLocationGrammar } from '@/features/ai-contract-lab/phaseCLocationGrammar'

export type WeddingLocationForms = {
  name: string | null
  address: string | null
  /** Prepared legal phrasing for the document. */
  contractDisplay: string | null
}

/**
 * Resolve patch text for a location.
 * Prefers contractDisplay; never declines nominative automatically.
 */
export function resolveLocationContractDisplay(
  forms: WeddingLocationForms,
): string | null {
  if (forms.contractDisplay?.trim()) return forms.contractDisplay.trim()
  return null
}

/**
 * Build forms from snapshot-style fields.
 * `formattedValue` on location.* is treated as name unless a dedicated
 * contract_display companion field exists.
 */
export function locationFormsFromSnapshot(input: {
  name: string | null | undefined
  address?: string | null | undefined
  contractDisplay?: string | null | undefined
}): WeddingLocationForms {
  const name = input.name?.trim() || null
  const address = input.address?.trim() || null
  const contractDisplay = input.contractDisplay?.trim() || null
  // If name already looks like a prepared locative phrase with preposition, allow it
  const preparedFromName =
    name &&
    /^(w |we |na |przy |pod |do |od |z |ze |pod adresem)/i.test(name)
      ? name
      : null
  return {
    name,
    address,
    contractDisplay: contractDisplay ?? preparedFromName,
  }
}

export function evaluateLocationReplacement(input: {
  beforeContext: string
  forms: WeddingLocationForms
  /** Fallback raw canonical (name) — never used after preposition without display. */
  fallbackName: string | null
}): {
  ok: boolean
  displayValue: string | null
  reason: string | null
  requiresReview: boolean
} {
  const display = resolveLocationContractDisplay(input.forms)
  const grammar = validateLocationGrammar({
    beforeContext: input.beforeContext,
    replacementText: display ?? input.fallbackName ?? '',
    contractDisplay: display,
  })

  if (!grammar.ok) {
    return {
      ok: false,
      displayValue: null,
      reason: 'Missing contract-ready display value',
      requiresReview: true,
    }
  }

  if (display) {
    return {
      ok: true,
      displayValue: display,
      reason: null,
      requiresReview: false,
    }
  }

  // No preposition pressure — name is acceptable as plain display
  if (input.fallbackName?.trim()) {
    return {
      ok: true,
      displayValue: input.fallbackName.trim(),
      reason: null,
      requiresReview: false,
    }
  }

  return {
    ok: false,
    displayValue: null,
    reason: 'Missing contract-ready display value',
    requiresReview: true,
  }
}
