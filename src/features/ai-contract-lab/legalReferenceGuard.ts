/**
 * Legal-reference guards — never map clause wording to monetary fields.
 */

export type LegalReferenceRole =
  | 'deposit_refund_multiplier'
  | 'deposit_forfeiture_clause'
  | 'amount_reference_without_literal_value'
  | 'legal_clause_reference'

const MONEY_LITERAL_RE =
  /\d{1,3}(?:[ \u00a0]?\d{3})*(?:[.,]\d{2})?\s*(?:zł|pln|zl)(?![a-ząćęłńóśźż])|\d+[.,]\d{2}\s*(?:zł|pln)?|\d{2,}\s*(?:zł|pln|zl)/i

const REFUND_MULTIPLIER_RE =
  /dwukrotn\w*\s+warto[sś]ci|zwrotu\s+zadatku\s+w\s+dwukrotn/i

const LEGAL_AMOUNT_REF_RE =
  /zwrotu\s+zadatku|pomniejszon[aą]\s+o\s+zadatek|pozostał[aą]\s+cz[eę][sś][cć]\s+wynagrodzenia|w\s+dwukrotn\w*\s+warto|warto[sś]ci\s+zadatku|zadatek(?!\s*\d)/i

const FORFEITURE_RE =
  /zadatek\s+przepada|zatrzyman\w*\s+zadat|forfeiture|zatrzymuje\s+zadatek/i

export function containsLiteralMoney(text: string): boolean {
  return MONEY_LITERAL_RE.test(text)
}

export function classifyLegalReference(input: {
  semanticRole: string
  sourceText: string
  anchorText: string
}): {
  isLegalReference: boolean
  legalRole: LegalReferenceRole | null
  numericValue: number | null
  reason: string | null
} {
  const hay = `${input.sourceText} ${input.anchorText}`

  if (REFUND_MULTIPLIER_RE.test(hay) || REFUND_MULTIPLIER_RE.test(input.sourceText)) {
    return {
      isLegalReference: true,
      legalRole: 'deposit_refund_multiplier',
      numericValue: 2,
      reason: 'Deposit refund multiplier clause — not a monetary amount',
    }
  }

  if (FORFEITURE_RE.test(hay)) {
    return {
      isLegalReference: true,
      legalRole: 'deposit_forfeiture_clause',
      numericValue: null,
      reason: 'Deposit forfeiture clause — not a monetary amount',
    }
  }

  // Monetary roles without literal money → legal / non-literal reference
  const monetaryRoles = new Set([
    'deposit_amount',
    'remaining_amount',
    'contract_value',
    'package_price',
    'package_overtime_rate',
    'extra_hour_price',
  ])
  if (monetaryRoles.has(input.semanticRole)) {
    if (!containsLiteralMoney(input.sourceText) && !containsLiteralMoney(hay.slice(0, 200))) {
      if (LEGAL_AMOUNT_REF_RE.test(hay) || !/\d/.test(input.sourceText)) {
        return {
          isLegalReference: true,
          legalRole: 'amount_reference_without_literal_value',
          numericValue: null,
          reason: 'No literal monetary amount in source span',
        }
      }
    }
  }

  // Explicit legal roles from Phase A
  if (
    input.semanticRole === 'deposit_refund_multiplier' ||
    input.semanticRole === 'deposit_forfeiture_clause' ||
    input.semanticRole === 'amount_reference_without_literal_value' ||
    input.semanticRole === 'legal_clause_reference'
  ) {
    return {
      isLegalReference: true,
      legalRole: input.semanticRole as LegalReferenceRole,
      numericValue: REFUND_MULTIPLIER_RE.test(hay) ? 2 : null,
      reason: 'Legal clause reference',
    }
  }

  return {
    isLegalReference: false,
    legalRole: null,
    numericValue: null,
    reason: null,
  }
}

/**
 * Guard: monetary canonical fields require a literal amount in the value span.
 */
export function monetaryRoleHasLiteralAmount(
  fieldKey: string | null,
  exactSourceText: string,
): boolean {
  if (!fieldKey) return true
  const monetary =
    fieldKey.includes('deposit') ||
    fieldKey.includes('remaining') ||
    fieldKey.includes('price') ||
    fieldKey.includes('contract_value') ||
    fieldKey.includes('amount') ||
    fieldKey.includes('overtime')
  if (!monetary) return true
  // deposit_due is temporal — not monetary
  if (fieldKey.includes('due') || fieldKey.includes('deadline')) return true
  return containsLiteralMoney(exactSourceText)
}
