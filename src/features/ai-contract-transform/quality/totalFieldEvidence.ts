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

export type PaymentAmountRole = 'total' | 'deposit' | 'remaining' | 'unknown'

export type SourcePaymentAmountEvidence = SourceTotalEvidence & {
  role: Exclude<PaymentAmountRole, 'unknown'>
}

const FINANCE_NEIGHBORHOOD =
  /wynagrodzen|honorarium|zadatek|zaliczk|rezerwacj|pozostał|cena|kwot|płatn|rozliczen|rat[ay]|fee|deposit|balance|brutto|netto|zł|wartość|wpłacono|do zapłaty|inwestycj|saldo/i

/** Deposit / remaining primary clauses — not the contract-total surface. */
const DEPOSIT_PRIMARY =
  /zadatek|zaliczk|rezerwacj|PLACEHOLDER_ZADATEK|wpłacono/i
const REMAINING_PRIMARY =
  /pozostał|PLACEHOLDER_RESTA|do zapłaty|saldo|dopłat/i

const TOTAL_PRIMARY = /wynagrodzen|honorarium|wartość|cena|inwestycj/i
const DEPOSIT_PRIMARY_TABLE =
  /zadatek|zaliczk|rezerwacj|wpłat\w*\s+potwierdz|wpłacono/i

function paymentContext(block: TransformDocumentBlock): string {
  return [
    block.text,
    block.tableContext?.rowLabelText ?? '',
    ...(block.tableContext?.neighboringCellTexts ?? []),
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Classify a PLN surface from the source structure. Table amount cells inherit
 * their semantic role from the row label and neighboring cells; bare digits do
 * not become totals merely because they contain "zł".
 */
export function classifyPaymentAmountRole(
  block: TransformDocumentBlock,
): PaymentAmountRole {
  const text = (block.text ?? '').trim()
  if (!text || countPlnAmounts(text) < 1) return 'unknown'
  // A prose paragraph can describe several obligations at once. Its first
  // amount is not structurally attributable to whichever payment label occurs
  // first, so leave it to the existing prose-specific repair path.
  if (block.kind !== 'tableCell' && countPlnAmounts(text) > 1) return 'unknown'
  const context = paymentContext(block)
  if (DEPOSIT_PRIMARY_TABLE.test(context)) return 'deposit'
  if (REMAINING_PRIMARY.test(context)) return 'remaining'
  if (TOTAL_PRIMARY.test(context)) return 'total'
  return 'unknown'
}

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
    const context = paymentContext(b)
    if (!text || !isFinanceNeighborhood(context)) continue
    if (countPlnAmounts(text) < 1) continue
    if (isUnrelatedFeeAmountBlock(context)) continue

    // A value-only table cell has no self-describing finance role. Its row
    // context must identify it as total; deposit and remaining cells are never
    // promoted to total evidence.
    if (b.kind === 'tableCell') {
      if (classifyPaymentAmountRole(b) !== 'total') continue
    }

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

/** Discover all structurally represented payment amount roles in the source. */
export function discoverFilledPaymentAmountEvidence(
  blocks: TransformDocumentBlock[],
): SourcePaymentAmountEvidence[] {
  const out: SourcePaymentAmountEvidence[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    const text = (block.text ?? '').trim()
    if (!text || countPlnAmounts(text) < 1) continue
    const role = classifyPaymentAmountRole(block)
    if (role === 'unknown' || isUnrelatedFeeAmountBlock(paymentContext(block))) {
      continue
    }
    const sourceAmount = extractPrimaryPlnAmount(text)
    if (!sourceAmount || isTrivialPlnAmountSurface(sourceAmount)) continue
    const key = `${block.blockId}:${role}:${sourceAmount}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      blockId: block.blockId,
      sourceText: text,
      sourceAmount,
      hasWords: /słownie/i.test(text),
      representation:
        block.kind === 'tableCell'
          ? 'table_cell'
          : /^[^.\n]{2,60}:\s*\d/.test(text)
            ? 'form_line'
            : 'prose',
      role,
    })
  }
  return out
}
