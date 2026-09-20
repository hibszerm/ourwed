/**
 * CG3 — deterministic canonical payment amount repair.
 *
 * MODEL INTERPRETS. SYSTEM KNOWS.
 * After sparse AI rewrite, ensure deposit + remaining (when present in the
 * dataset) appear in a defensible financial/payment neighborhood.
 *
 * Does NOT author legal clauses. Prefer placeholder substitution and
 * in-place injection into existing payment wording.
 */

import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { fingerprintText, textContainsNormalized } from './normalize'
import type { DeterministicRepair } from './types'

const FORBIDDEN_NEIGHBORHOOD =
  /rodo|gdpr|dane\s+osobowe|prywatno|prawa\s+autorsk|copyright|odpowiedzialn|odstapienie|rezygnacj|sila\s+wyzsza|force\s+majeure|spory|sąd|podpis|rekojmia|postanowienia\s+ko[nń]cowe/i

const FINANCE_NEIGHBORHOOD =
  /wynagrodzen|zadatek|zaliczk|pozostał|cena|kwot|płatn|płatno|rozliczen|rat[ay]|fee|deposit|balance|installment|settlement|brutto|netto|zł/i

function isForbiddenBlock(text: string): boolean {
  return FORBIDDEN_NEIGHBORHOOD.test(text) && !FINANCE_NEIGHBORHOOD.test(text)
}

/**
 * Pure section heading establishing a finance/payment neighborhood without
 * carrying payment body content (e.g. "§6 Płatności").
 */
export function isFinanceSectionHeading(text: string): boolean {
  const t = text.replace(/\u00a0/g, ' ').trim()
  if (!t || t.length > 96) return false
  if (/\d[\d\s\u00a0]*\s*zł/i.test(t)) return false
  if (/PLACEHOLDER_(CENA|ZADATEK|RESTA)/i.test(t)) return false
  if (/zadatek|zaliczk|pozostał/i.test(t) && t.length > 40) return false
  // §N Title / §N Title.
  if (/^§\s*\d+[a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ0-9\s./-]*\.?$/u.test(t)) return true
  // Bare finance titles
  if (/^(płatności|wynagrodzenie|rozliczenia|płatność)\.?$/i.test(t)) return true
  return false
}

function financeTargetRank(text: string): number {
  if (/PLACEHOLDER_(ZADATEK|RESTA|CENA)/i.test(text)) return 100
  if (isFinanceSectionHeading(text)) return 5
  if (/zadatek|zaliczk/i.test(text)) return 90
  if (/pozostał/i.test(text)) return 85
  if (/\d[\d\s\u00a0]*\s*zł/i.test(text)) return 70
  if (isFinanceNeighborhood(text)) return 40
  return 0
}

function isFinanceNeighborhood(text: string): boolean {
  if (isForbiddenBlock(text)) return false
  return (
    FINANCE_NEIGHBORHOOD.test(text) ||
    /PLACEHOLDER_(CENA|ZADATEK|RESTA|SLOWNIE)/i.test(text)
  )
}

function amountDigits(formatted: string): string {
  return formatted.replace(/\s*zł(?:otych|ote|oty)?\s*$/i, '').trim()
}

/** Replace PLACEHOLDER_* money tokens without producing "… zł zł". */
function replaceMoneyPlaceholder(
  text: string,
  placeholder: string,
  formattedAmount: string,
): string {
  const digits = amountDigits(formattedAmount)
  const withCurrency = new RegExp(
    `${placeholder}\\s*zł(?:otych|ote|oty)?`,
    'gi',
  )
  if (withCurrency.test(text)) {
    return text.replace(withCurrency, formattedAmount)
  }
  if (text.includes(placeholder)) {
    return text.split(placeholder).join(digits)
  }
  return text
}

function pickFinanceBlockIds(
  blocks: TransformedBlock[],
  sourceBlocks: TransformDocumentBlock[],
): string[] {
  const byId = new Map(sourceBlocks.map((b) => [b.blockId, b]))
  const scored: Array<{ id: string; rank: number }> = []
  for (const b of blocks) {
    const src = byId.get(b.blockId)
    const text = b.text || src?.text || ''
    if (!text.trim()) continue
    if (isForbiddenBlock(text)) continue
    if (!isFinanceNeighborhood(text)) continue
    scored.push({ id: b.blockId, rank: financeTargetRank(text) })
  }
  scored.sort((a, b) => b.rank - a.rank)
  return scored.map((s) => s.id)
}

/** Prefer content/body finance targets; never mutate pure headings when a body exists. */
function pickMutableFinanceTargets(
  blocks: TransformedBlock[],
  candidateIds: string[],
): string[] {
  const body = candidateIds.filter((id) => {
    const t = blocks.find((b) => b.blockId === id)?.text ?? ''
    return !isFinanceSectionHeading(t)
  })
  return body.length > 0 ? body : []
}

function updateBlock(
  blocks: TransformedBlock[],
  blockId: string,
  nextText: string,
  repairs: DeterministicRepair[],
  repairCode: string,
  canonicalField: string,
): boolean {
  const idx = blocks.findIndex((b) => b.blockId === blockId)
  if (idx < 0) return false
  const prev = blocks[idx]!
  if (prev.text === nextText) return false
  repairs.push({
    repairCode,
    blockId,
    canonicalField,
    beforeFingerprint: fingerprintText(prev.text),
    afterFingerprint: fingerprintText(nextText),
  })
  blocks[idx] = { ...prev, text: nextText }
  return true
}

function ensureDeposit(input: {
  blocks: TransformedBlock[]
  candidateIds: string[]
  depositFormatted: string
  repairs: DeterministicRepair[]
}): boolean {
  const { blocks, candidateIds, depositFormatted, repairs } = input
  const joined = blocks.map((b) => b.text).join('\n')
  if (textContainsNormalized(joined, depositFormatted)) return true

  // 1) Explicit deposit placeholders
  for (const id of candidateIds) {
    const b = blocks.find((x) => x.blockId === id)
    if (!b) continue
    if (!/PLACEHOLDER_ZADATEK/i.test(b.text)) continue
    const next = replaceMoneyPlaceholder(
      b.text,
      'PLACEHOLDER_ZADATEK',
      depositFormatted,
    )
    if (
      updateBlock(
        blocks,
        id,
        next,
        repairs,
        'insert_canonical_deposit_placeholder',
        'contract.depositAmount',
      )
    ) {
      return true
    }
  }

  // 2) Existing "zadatek" wording without the canonical amount
  for (const id of candidateIds) {
    const b = blocks.find((x) => x.blockId === id)
    if (!b) continue
    if (!/zadatek|zaliczk/i.test(b.text)) continue
    if (textContainsNormalized(b.text, depositFormatted)) continue
    let next = b.text
    if (/zadatek\s+zł\b/i.test(next)) {
      next = next.replace(/zadatek\s+zł\b/i, `Zadatek ${depositFormatted}`)
    } else if (/zadatek\s+wynosi\b(?!\s*[\d])/i.test(next)) {
      next = next.replace(
        /(zadatek\s+wynosi)\b(?!\s*[\d])/i,
        `$1 ${depositFormatted}`,
      )
    } else if (/zadatek\b(?!\s*[\d])/i.test(next)) {
      next = next.replace(/(zadatek)\b(?!\s*[\d])/i, `$1 ${depositFormatted}`)
    } else {
      continue
    }
    if (
      updateBlock(
        blocks,
        id,
        next,
        repairs,
        'insert_canonical_deposit_into_clause',
        'contract.depositAmount',
      )
    ) {
      return true
    }
  }

  // 3) Append into best finance BODY block (never pure heading when body exists)
  const mutable = pickMutableFinanceTargets(blocks, candidateIds)
  const targetId = mutable[0]
  if (!targetId) return false
  const b = blocks.find((x) => x.blockId === targetId)
  if (!b) return false
  const suffix = /[.!?…]\s*$/.test(b.text.trim())
    ? ` Zadatek ${depositFormatted}.`
    : `. Zadatek ${depositFormatted}.`
  return updateBlock(
    blocks,
    targetId,
    `${b.text.trim()}${suffix}`,
    repairs,
    'insert_canonical_deposit_into_finance_block',
    'contract.depositAmount',
  )
}

function ensureRemaining(input: {
  blocks: TransformedBlock[]
  candidateIds: string[]
  remainingFormatted: string
  repairs: DeterministicRepair[]
}): boolean {
  const { blocks, candidateIds, remainingFormatted, repairs } = input
  const joined = blocks.map((b) => b.text).join('\n')
  if (textContainsNormalized(joined, remainingFormatted)) return true

  // 1) Explicit remaining placeholders
  for (const id of candidateIds) {
    const b = blocks.find((x) => x.blockId === id)
    if (!b) continue
    if (!/PLACEHOLDER_RESTA/i.test(b.text)) continue
    const next = replaceMoneyPlaceholder(
      b.text,
      'PLACEHOLDER_RESTA',
      remainingFormatted,
    )
    if (
      updateBlock(
        blocks,
        id,
        next,
        repairs,
        'insert_canonical_remaining_placeholder',
        'contract.remainingAmount',
      )
    ) {
      return true
    }
  }

  // 2) Existing "pozostała kwota" / "pozostałej kwoty" without amount
  for (const id of candidateIds) {
    const b = blocks.find((x) => x.blockId === id)
    if (!b) continue
    if (!/pozostał/i.test(b.text)) continue
    if (textContainsNormalized(b.text, remainingFormatted)) continue
    let next = b.text
    if (
      /pozostał[aey]\s+kwot[ayę]\b(?!\s*[\d])/i.test(next)
    ) {
      next = next.replace(
        /(pozostał[aey]\s+kwot[ayę])\b(?!\s*[\d])/i,
        `$1 ${remainingFormatted}`,
      )
    } else if (/pozostałej\s+kwoty\b(?!\s*[\d])/i.test(next)) {
      next = next.replace(
        /(pozostałej\s+kwoty)\b(?!\s*[\d])/i,
        `$1 ${remainingFormatted}`,
      )
    } else {
      continue
    }
    if (
      updateBlock(
        blocks,
        id,
        next,
        repairs,
        'insert_canonical_remaining_into_clause',
        'contract.remainingAmount',
      )
    ) {
      return true
    }
  }

  // 3) Append into payment/deposit BODY neighborhood (never pure heading)
  const mutable = pickMutableFinanceTargets(blocks, candidateIds)
  const depositish =
    mutable.find((id) => {
      const t = blocks.find((b) => b.blockId === id)?.text ?? ''
      return /zadatek|zaliczk/i.test(t)
    }) ??
    mutable.find((id) => {
      const t = blocks.find((b) => b.blockId === id)?.text ?? ''
      return /płatn|wynagrodzen|cena|zł/i.test(t)
    }) ??
    mutable[0]
  if (!depositish) return false
  const b = blocks.find((x) => x.blockId === depositish)
  if (!b) return false
  const suffix = /[.!?…]\s*$/.test(b.text.trim())
    ? ` Pozostała kwota ${remainingFormatted}.`
    : `. Pozostała kwota ${remainingFormatted}.`
  return updateBlock(
    blocks,
    depositish,
    `${b.text.trim()}${suffix}`,
    repairs,
    'insert_canonical_remaining_into_finance_block',
    'contract.remainingAmount',
  )
}

/**
 * Ensure dataset deposit + remaining amounts are present in finance/payment
 * neighborhoods when the dataset defines both.
 */
export function repairCanonicalPaymentAmounts(input: {
  blocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
}): { blocks: TransformedBlock[]; repairs: DeterministicRepair[] } {
  const repairs: DeterministicRepair[] = []
  const finances = input.dataset.finances
  const deposit = finances.depositFormatted?.trim()
  const remaining = finances.remainingFormatted?.trim()
  if (!deposit || !remaining) {
    return { blocks: input.blocks, repairs }
  }

  const blocks = input.blocks.map((b) => ({ ...b }))
  const rankedIds = pickFinanceBlockIds(blocks, input.sourceBlocks)
  const candidateIds = pickMutableFinanceTargets(blocks, rankedIds)
  // If only headings exist in the neighborhood, fail closed (Mode A will block).
  if (candidateIds.length === 0) {
    return { blocks, repairs }
  }

  const joined = () => blocks.map((b) => b.text).join('\n')
  if (!textContainsNormalized(joined(), deposit)) {
    ensureDeposit({ blocks, candidateIds, depositFormatted: deposit, repairs })
  }
  if (!textContainsNormalized(joined(), remaining)) {
    const rankedAgain = pickFinanceBlockIds(blocks, input.sourceBlocks)
    const ids = pickMutableFinanceTargets(blocks, rankedAgain)
    ensureRemaining({
      blocks,
      candidateIds: ids.length > 0 ? ids : candidateIds,
      remainingFormatted: remaining,
      repairs,
    })
  }

  return { blocks, repairs }
}
