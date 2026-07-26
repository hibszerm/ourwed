/**
 * Legal defined-term / party-reference guards + literal person-name check.
 */

export type LegalDefinedTermRole =
  | 'defined_party_term'
  | 'couple_defined_term'
  | 'client_defined_term'
  | 'contractor_defined_term'
  | 'legal_party_reference'

const DEFINED_TERM_RE =
  /^(par[aąęy]\s+młod[aąeyich]*|panna\s+młod[aąey]*|pan\s+młod[yego]*|klient(?:em|owi|a)?|zamawiając(?:y|ego|ym|ymi)?|wykonawc(?:a|ą|y|ę)?|kamerzyst(?:a|ą|y)?|fotograf(?:em|a|owi)?|operator(?:em|a)?|stron(?:y|ami|om)?|małżonkowie|narzeczeni|małżonków)$/i

const DEFINED_TERM_CONTAINS_RE =
  /^(par[aąęy]\s+młod|panna\s+młod|pan\s+młod)/i

const ROLE_NOUN_BLOCKLIST = new Set(
  [
    'para',
    'parą',
    'pary',
    'młoda',
    'młodą',
    'młodej',
    'młody',
    'młodego',
    'klient',
    'klientem',
    'klienta',
    'zamawiający',
    'zamawiającym',
    'zamawiającego',
    'wykonawca',
    'wykonawcą',
    'kamerzysta',
    'kamerzystą',
    'fotograf',
    'fotografem',
    'operator',
    'strony',
    'stronami',
    'małżonkowie',
    'narzeczeni',
  ].map((s) => s.toLowerCase()),
)

export function classifyDefinedTerm(sourceText: string): {
  isDefinedTerm: boolean
  role: LegalDefinedTermRole | null
  reason: string | null
} {
  const t = sourceText.trim().replace(/\s+/g, ' ')
  if (!t) {
    return { isDefinedTerm: false, role: null, reason: null }
  }

  if (DEFINED_TERM_RE.test(t) || DEFINED_TERM_CONTAINS_RE.test(t)) {
    const lower = t.toLowerCase()
    let role: LegalDefinedTermRole = 'legal_party_reference'
    if (/par|panna\s+młod|pan\s+młod|małżonk|narzecz/i.test(lower)) {
      role = 'couple_defined_term'
    } else if (/klient|zamawiaj/i.test(lower)) {
      role = 'client_defined_term'
    } else if (/wykonawc|kamerzyst|fotograf|operator/i.test(lower)) {
      role = 'contractor_defined_term'
    } else if (/stron/i.test(lower)) {
      role = 'defined_party_term'
    }
    return {
      isDefinedTerm: true,
      role,
      reason: 'Legal defined term, not personal data',
    }
  }

  return { isDefinedTerm: false, role: null, reason: null }
}

/**
 * Deterministic check: does this look like a literal person name?
 */
export function isLiteralPersonName(
  sourceText: string,
  _locale: 'pl-PL' = 'pl-PL',
): boolean {
  const t = sourceText.trim().replace(/\s+/g, ' ')
  if (!t) return false
  if (classifyDefinedTerm(t).isDefinedTerm) return false

  const tokens = t.split(/\s+/).filter(Boolean)
  if (tokens.length < 2 || tokens.length > 4) return false

  for (const tok of tokens) {
    const bare = tok.replace(/[.,;:!?]/g, '')
    if (ROLE_NOUN_BLOCKLIST.has(bare.toLowerCase())) return false
    // Must start with uppercase letter (Polish letters included)
    if (!/^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(bare)) return false
    // Reject pure lowercase role-like words
    if (bare.length < 2) return false
  }

  // At least one token should look like a surname-ish (length >= 3)
  if (!tokens.some((tok) => tok.replace(/[.,]/g, '').length >= 3)) return false

  return true
}

/** Person-name roles that require the literal-name guard. */
export const PERSON_NAME_ROLES = new Set([
  'bride_name',
  'groom_name',
  'client_name',
  'photographer_name',
  'videographer_name',
])
