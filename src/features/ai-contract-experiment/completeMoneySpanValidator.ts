/**
 * Complete formatted money span validation.
 */

export type CompleteMoneySpanValidation = {
  valid: boolean
  reason?: string
}

const BANK_ACCOUNT = /\b(?:PL\s*)?\d{2}(?:\s?\d{4}){4,6}\b/i
const PERCENT = /^\s*\d+\s*%\s*$/

const COMPLETE_MONEY =
  /^(?:\d{1,3}(?:\s\d{3})*|\d+)(?:[,.]\d{2})?\s*(?:zł|PLN)\s*$/i

const MONEY_IN_TEXT =
  /(?:\d{1,3}(?:\s\d{3})*|\d+)(?:[,.]\d{2})?\s*(?:zł|PLN)/gi

export function validateCompleteMoneySpan(input: {
  exactValue: string
  blockText: string
  start: number
  end: number
}): CompleteMoneySpanValidation {
  const v = input.exactValue.trim()
  if (!v) return { valid: false, reason: 'empty_money' }
  if (PERCENT.test(v)) return { valid: false, reason: 'percentage_not_money' }
  if (BANK_ACCOUNT.test(v)) return { valid: false, reason: 'bank_account_not_money' }
  if (!COMPLETE_MONEY.test(v)) {
    if (v.length > 30) return { valid: false, reason: 'non_minimal_money_span' }
    return { valid: false, reason: 'incomplete_money_span' }
  }

  const completeTokens = extractCompleteMoneyTokens(input.blockText)
  const normalized = v.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  const isComplete = completeTokens.some(
    (t) => t.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() === normalized,
  )
  if (!isComplete) {
    return { valid: false, reason: 'partial_money_span' }
  }

  const before = input.blockText[input.start - 1]
  const after = input.blockText[input.end]
  if (before && /\d/.test(before)) {
    return { valid: false, reason: 'partial_money_span' }
  }
  if (after && /\d/.test(after) && !/[\s,.)]/.test(after)) {
    return { valid: false, reason: 'partial_money_span' }
  }

  return { valid: true }
}

export function extractCompleteMoneyTokens(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(MONEY_IN_TEXT)) {
    const token = m[0]!.trim()
    const start = m.index ?? 0
    const before = text[start - 1]
    if (before && /\d/.test(before)) continue
    const after = text[start + token.length]
    if (after && /\d/.test(after) && !/[\s,.)]/.test(after)) continue
    if (BANK_ACCOUNT.test(token)) continue
    out.push(token)
  }
  return [...new Set(out)]
}

const MONEY_WORDS =
  /(?:zero|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć|jedenaście|dwanaście|trzynaście|czternaście|piętnaście|szesnaście|siedemnaście|osiemnaście|dziewiętnaście|dwadzieścia|trzydzieści|czterdzieści|pięćdziesiąt|sześćdziesiąt|siedemdziesiąt|osiemdziesiąt|dziewięćdziesiąt|sto|dwieście|trzysta|czterysta|pięćset|sześćset|siedemset|osiemset|dziewięćset|tysiąc|tysięcy|milion)(?:\s+(?:zero|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć|jedenaście|dwanaście|trzynaście|czternaście|piętnaście|szesnaście|siedemnaście|osiemnaście|dziewiętnaście|dwadzieścia|trzydzieści|czterdzieści|pięćdziesiąt|sześćdziesiąt|siedemdziesiąt|osiemdziesiąt|dziewięćdziesiąt|sto|dwieście|trzysta|czterysta|pięćset|sześćset|siedemset|osiemset|dziewięćset|tysiąc|tysięcy))*\s+złot(?:ych|e|y)/gi

export function extractMoneyWordsTokens(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(MONEY_WORDS)) {
    const token = m[0]!.trim()
    if (!/\(słownie:/i.test(token) && !/brutto/i.test(token)) {
      out.push(token)
    }
  }
  return [...new Set(out)]
}

export function validateMoneyWordsSpan(exactValue: string): CompleteMoneySpanValidation {
  const v = exactValue.trim()
  if (!v) return { valid: false, reason: 'empty_money_words' }
  if (/\d/.test(v)) return { valid: false, reason: 'numeric_in_words_span' }
  if (/\(słownie:|brutto\)/i.test(v)) {
    return { valid: false, reason: 'non_minimal_words_span' }
  }
  if (!/złot/i.test(v)) return { valid: false, reason: 'missing_currency_words' }
  if (v.length > 120) return { valid: false, reason: 'non_minimal_words_span' }
  return { valid: true }
}
