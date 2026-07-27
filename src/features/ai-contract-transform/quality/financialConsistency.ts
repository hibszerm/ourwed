/**
 * Deterministic financial consistency checks (dataset + document).
 */

import { polishContractMoneyWords } from '../polishContractMoneyWords'
import type { ContractTransformationDataset, TransformedBlock } from '../types'
import {
  normalizeMoneyDigits,
  textContainsNormalized,
} from './normalize'
import type { QualityIssue } from './types'

function parsePln(formatted?: string): number | null {
  if (!formatted) return null
  const digits = formatted.replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

/** Extract the "(słownie: …)" clause nearest to a formatted PLN amount. */
function extractMoneyWordsNearAmount(
  text: string,
  formattedAmount: string,
): string | null {
  const amountDigits = normalizeMoneyDigits(formattedAmount)
  if (!amountDigits) return null
  const amountRe = new RegExp(
    amountDigits.split('').join('[\\s\\u00a0]*') +
      '\\s*zł(?:otych|ote|oty)?[\\s\\S]{0,100}?\\(\\s*słownie:\\s*([^).]+)\\)',
    'i',
  )
  const m = text.replace(/\u00a0/g, ' ').match(amountRe)
  return m?.[0] ?? null
}

export function verifyFinancialConsistency(input: {
  dataset: ContractTransformationDataset
  transformedBlocks: TransformedBlock[]
}): {
  issues: QualityIssue[]
  summary: {
    status: 'pass' | 'review_required' | 'fail'
    totalPriceMatches: boolean
    moneyWordsMatch: boolean
    depositMatches: boolean | null
    remainingMatches: boolean | null
    paymentStructureMatches: boolean | null
    issues: QualityIssue[]
  }
} {
  const issues: QualityIssue[] = []
  const text = input.transformedBlocks.map((b) => b.text).join('\n')
  const f = input.dataset.finances

  const total = parsePln(f.contractValueFormatted)
  const expectedWords =
    total != null ? polishContractMoneyWords(total) : f.contractValueWords
  const totalPriceMatches = textContainsNormalized(
    text,
    f.contractValueFormatted,
  )
  if (!totalPriceMatches) {
    issues.push({
      code: 'expected_dataset_value_missing',
      severity: 'blocking',
      canonicalField: 'contract.totalPrice',
      safeDescription: 'Contract total price from dataset is missing',
    })
  }

  const moneyWordsMatch =
    textContainsNormalized(text, expectedWords) ||
    textContainsNormalized(text, f.contractValueWords)
  if (!moneyWordsMatch && /słownie/i.test(text)) {
    issues.push({
      code: 'money_words_mismatch',
      severity: 'blocking',
      canonicalField: 'contract.totalPriceWords',
      safeDescription: 'Polish money words do not match the deterministic total',
    })
  } else if (
    moneyWordsMatch &&
    total != null &&
    f.contractValueWords &&
    normalizeMoneyDigits(f.contractValueFormatted) === String(total)
  ) {
    // also flag if document has wrong words that don't match formatter
    const wrongJeden = /jeden\s+tysiąc/i.test(text) && total === 1000
    if (wrongJeden) {
      issues.push({
        code: 'money_words_mismatch',
        severity: 'blocking',
        canonicalField: 'contract.totalPriceWords',
        safeDescription: 'Money words use incorrect "jeden tysiąc" form',
      })
    }
  }

  let depositMatches: boolean | null = null
  let remainingMatches: boolean | null = null
  let paymentStructureMatches: boolean | null = null

  const deposit = parsePln(f.depositFormatted)
  const remaining = parsePln(f.remainingFormatted)

  if (deposit != null && remaining != null && total != null) {
    if (deposit + remaining !== total) {
      issues.push({
        code: 'payment_arithmetic_mismatch',
        severity: 'blocking',
        canonicalField: 'contract.paymentStructure',
        safeDescription: 'deposit + remaining does not equal total in dataset',
      })
    }

    depositMatches = textContainsNormalized(text, f.depositFormatted!)
    remainingMatches = textContainsNormalized(text, f.remainingFormatted!)

    if (!depositMatches) {
      issues.push({
        code: 'deposit_missing',
        severity: 'blocking',
        canonicalField: 'contract.depositAmount',
        safeDescription: 'Dataset deposit amount is missing from the contract',
      })
    }
    if (!remainingMatches) {
      issues.push({
        code: 'remaining_payment_missing',
        severity: 'blocking',
        canonicalField: 'contract.remainingAmount',
        safeDescription: 'Dataset remaining amount is missing from the contract',
      })
    }

    // Each amount must own its own words — never reuse total words for deposit/remaining
    if (f.depositWords && f.depositFormatted) {
      const depositClause = extractMoneyWordsNearAmount(text, f.depositFormatted)
      if (
        depositClause &&
        !textContainsNormalized(depositClause, f.depositWords) &&
        textContainsNormalized(depositClause, expectedWords)
      ) {
        issues.push({
          code: 'money_words_mismatch',
          severity: 'blocking',
          canonicalField: 'contract.depositAmount',
          safeDescription:
            'Deposit amount is paired with total-contract money words',
        })
      } else if (
        depositClause &&
        f.depositWords &&
        !textContainsNormalized(depositClause, f.depositWords)
      ) {
        issues.push({
          code: 'money_words_mismatch',
          severity: 'blocking',
          canonicalField: 'contract.depositAmount',
          safeDescription: 'Deposit Polish money words do not match deposit amount',
        })
      }
    }

    if (f.remainingWords && f.remainingFormatted) {
      const remainingClause = extractMoneyWordsNearAmount(
        text,
        f.remainingFormatted,
      )
      if (
        remainingClause &&
        !textContainsNormalized(remainingClause, f.remainingWords) &&
        textContainsNormalized(remainingClause, expectedWords)
      ) {
        issues.push({
          code: 'money_words_mismatch',
          severity: 'blocking',
          canonicalField: 'contract.remainingAmount',
          safeDescription:
            'Remaining amount is paired with total-contract money words',
        })
      } else if (
        remainingClause &&
        !textContainsNormalized(remainingClause, f.remainingWords)
      ) {
        issues.push({
          code: 'money_words_mismatch',
          severity: 'blocking',
          canonicalField: 'contract.remainingAmount',
          safeDescription:
            'Remaining Polish money words do not match remaining amount',
        })
      }
    }

    const oneTime = /płatne\s+jednorazowo|jednorazowo/i.test(text)
    paymentStructureMatches = !oneTime && Boolean(depositMatches && remainingMatches)
    if (oneTime) {
      issues.push({
        code: 'payment_structure_mismatch',
        severity: 'blocking',
        canonicalField: 'contract.paymentStructure',
        safeDescription:
          'Contract says one-time payment but dataset defines deposit + remaining',
      })
    }
  }

  // Price changed vs service table — caller may pass packageScopeUnchanged
  const status = issues.some((i) => i.severity === 'blocking')
    ? 'fail'
    : issues.some((i) => i.severity === 'review_required')
      ? 'review_required'
      : 'pass'

  return {
    issues,
    summary: {
      status,
      totalPriceMatches,
      moneyWordsMatch: moneyWordsMatch && !issues.some((i) => i.code === 'money_words_mismatch'),
      depositMatches,
      remainingMatches,
      paymentStructureMatches,
      issues,
    },
  }
}

export function verifyPackageScopeConsistency(input: {
  sourceBlocks: Array<{ blockId: string; text: string; tableContext?: { ownershipFamily?: string } }>
  transformedBlocks: Array<{ blockId: string; text: string }>
  hasExplicitScope: boolean
  priceChanged: boolean
}): QualityIssue[] {
  const issues: QualityIssue[] = []
  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b.text]))
  let scopeChanged = false
  for (const src of input.sourceBlocks) {
    if (src.tableContext?.ownershipFamily !== 'service_scope') continue
    const next = byId.get(src.blockId)
    if (next != null && next !== src.text) {
      scopeChanged = true
      break
    }
  }

  if (input.hasExplicitScope && !scopeChanged && input.priceChanged) {
    issues.push({
      code: 'package_scope_mismatch',
      severity: 'blocking',
      canonicalField: 'package.serviceScope',
      safeDescription:
        'Explicit package scope was supplied but the service table was not updated',
    })
  } else if (!input.hasExplicitScope && input.priceChanged && !scopeChanged) {
    issues.push({
      code: 'price_changed_without_explicit_service_scope',
      severity: 'review_required',
      canonicalField: 'package.serviceScope',
      safeDescription:
        'Total price changed while service/package table stayed unchanged',
    })
  }
  return issues
}
