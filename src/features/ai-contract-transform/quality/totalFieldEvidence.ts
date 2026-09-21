/**
 * CG7.6 — grounded represented-total surfaces.
 *
 * Structural discovery (not a Polish synonym router): finance-neighborhood
 * blocks whose primary PLN amount is the contract total assertion.
 */

import type { TransformDocumentBlock } from '../types'
import {
  countPlnAmountSurfaces,
  extractPrimaryPlnAmount,
  isTrivialPlnAmountSurface,
} from './plnAmountSurface'

export type SourceTotalEvidence = {
  blockId: string
  sourceText: string
  /** Exact source PLN surface (e.g. "6 900 zł" or "8 400,00 zł"). */
  sourceAmount: string
  hasWords: boolean
  representation: 'table_cell' | 'prose' | 'form_line'
}

const FINANCE_NEIGHBORHOOD =
  /wynagrodzen|honorarium|zadatek|zaliczk|rezerwacj|pozostał|cena|kwot|płatn|rozliczen|rat[ay]|fee|deposit|balance|brutto|netto|zł|wartość|wpłacono|do zapłaty|inwestycj|saldo/i

/** Deposit / remaining primary clauses — not the contract-total surface. */
const DEPOSIT_PRIMARY =
  /zadatek|zaliczk|rezerwacj|PLACEHOLDER_ZADATEK|wpłacono/i
const REMAINING_PRIMARY =
  /pozostał|PLACEHOLDER_RESTA|do zapłaty|saldo/i

/** Unrelated commercial fees that must not be treated as contract total. */
const UNRELATED_FEE =
  /godzin|dojazd|travel|album|operator|kar[ay]|odstąpien|rezygnacj|sprzęt|equipment|dron|pendrive|instax|odbitk|kilometr/i

function countPlnAmounts(text: string): number {
  return countPlnAmountSurfaces(text)
}

function isFinanceNeighborhood(text: string): boolean {
  return FINANCE_NEIGHBORHOOD.test(text)
}

/**
 * True when the block's primary commercial role is an unrelated fee,
 * even if it sits near payment language.
 */
export function isUnrelatedFeeAmountBlock(text: string): boolean {
  const t = text.trim()
  if (!t || countPlnAmounts(t) === 0) return false
  // Explicit fee framing in the leading clause
  if (UNRELATED_FEE.test(t.slice(0, 120))) return true
  // "Nie wchodzi do wartości" / overtime riders
  if (
    /nie\s+wchodzi\s+do\s+warto[sś]ci|ponad\s+limit|każda\s+dodatkowa\s+godzina/i.test(
      t,
    )
  ) {
    return true
  }
  return false
}

/**
 * Discover grounded contract-total surfaces in the SOURCE template.
 * Prefer słownie-paired amounts; never claim deposit/remaining/fee blocks as total.
 */
export function discoverFilledTotalEvidence(
  blocks: TransformDocumentBlock[],
): SourceTotalEvidence[] {
  const out: SourceTotalEvidence[] = []
  const seen = new Set<string>()

  for (const b of blocks) {
    const text = (b.text ?? '').trim()
    if (!text || !isFinanceNeighborhood(text)) continue
    if (countPlnAmounts(text) < 1) continue
    if (isUnrelatedFeeAmountBlock(text)) continue

    const hasWords = /słownie/i.test(text)
    const depositPrimary =
      DEPOSIT_PRIMARY.test(text) && !hasWords && countPlnAmounts(text) === 1
    const remainingPrimary =
      REMAINING_PRIMARY.test(text) && !hasWords && countPlnAmounts(text) === 1

    // Deposit+remaining combined block without total assertion — skip for total.
    if (
      DEPOSIT_PRIMARY.test(text) &&
      REMAINING_PRIMARY.test(text) &&
      !hasWords
    ) {
      continue
    }
    if (depositPrimary || remainingPrimary) continue

    // Strong signal: amount + words (classic total presentation).
    // Medium: single PLN amount that is neither deposit nor remaining nor fee.
    const singleClean =
      countPlnAmounts(text) === 1 &&
      !DEPOSIT_PRIMARY.test(text) &&
      !REMAINING_PRIMARY.test(text)

    if (!hasWords && !singleClean) continue

    const sourceAmount = extractPrimaryPlnAmount(text)
    if (!sourceAmount || isTrivialPlnAmountSurface(sourceAmount)) continue

    const key = `${b.blockId}::${sourceAmount}`
    if (seen.has(key)) continue
    seen.add(key)

    const representation: SourceTotalEvidence['representation'] =
      b.kind === 'tableCell'
        ? 'table_cell'
        : /^[^.\n]{2,60}:\s*\d/.test(text)
          ? 'form_line'
          : 'prose'

    out.push({
      blockId: b.blockId,
      sourceText: text,
      sourceAmount,
      hasWords,
      representation,
    })
  }

  return out
}
