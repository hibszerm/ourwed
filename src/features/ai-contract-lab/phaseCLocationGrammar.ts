/**
 * Phase C — grammatical location / preposition validation.
 * Never guess Polish declension — require contractDisplay or REVIEW.
 */

const PREPOSITIONS = new Set([
  'w',
  'we',
  'na',
  'do',
  'od',
  'z',
  'ze',
  'pod',
  'przy',
  'koło',
  'obok',
  'dla',
  'u',
])

const STREETISH =
  /^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle|\d)/i

/**
 * True when replacement after a preposition looks like a raw nominative
 * address/building that needs a prepared contractDisplay form.
 */
export function validateLocationGrammar(input: {
  beforeContext: string
  replacementText: string
  /** Prepared document form — if present, grammar check passes. */
  contractDisplay?: string | null
}): { ok: boolean; reason: string | null; requiresContractDisplay: boolean } {
  if (input.contractDisplay?.trim()) {
    return { ok: true, reason: null, requiresContractDisplay: false }
  }

  const before = input.beforeContext.trim().toLowerCase()
  const tokens = before.split(/\s+/).filter(Boolean)
  const last = tokens[tokens.length - 1]?.replace(/[.,;:]$/, '') ?? ''
  const prep = PREPOSITIONS.has(last)

  if (!prep) {
    return { ok: true, reason: null, requiresContractDisplay: false }
  }

  const rep = input.replacementText.trim()
  // After "w"/"na"/… a bare nominative building or street is unsafe
  if (STREETISH.test(rep) || /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(rep)) {
    // Allow short locative-looking endings when clearly declined — we do NOT guess;
    // only pass if it already looks like a phrase starting with declined form hints
    // that were prepared. Without contractDisplay → REVIEW.
    return {
      ok: false,
      reason: 'contract display form required',
      requiresContractDisplay: true,
    }
  }

  return { ok: true, reason: null, requiresContractDisplay: false }
}

export type LocationContractForms = {
  name: string | null
  address: string | null
  /** Preferred patch text for the document. */
  contractDisplay: string | null
}

/** Prefer contractDisplay for document patches. */
export function resolveLocationDisplayValue(
  forms: LocationContractForms,
): string | null {
  if (forms.contractDisplay?.trim()) return forms.contractDisplay.trim()
  return null
}
