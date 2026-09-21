/**
 * CG3 — deterministic canonical payment amount repair.
 *
 * MODEL INTERPRETS. SYSTEM KNOWS.
 *
 * CG7.3 authorship boundary:
 * - Update amounts for concepts the SOURCE template already represents.
 * - Prefer in-place substitution (including synonym stems: rezerwacyjna, …).
 * - Do NOT invent new deposit/remaining obligations on total-only contracts.
 * - Do NOT append "Zadatek …" onto a block that already carries a payment split.
 */

import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { fingerprintText } from './normalize'
import {
  countPlnAmountSurfaces,
  replacePlnAmountNearMarker,
  replacePlnAmountSurface,
  textHasCanonicalPlnAmount,
} from './plnAmountSurface'
import {
  detectRepresentedConcepts,
  financeBlockHasExistingPaymentStructure,
} from './representationPolicy'
import { discoverFilledTotalEvidence } from './totalFieldEvidence'
import type { DeterministicRepair } from './types'

const FORBIDDEN_NEIGHBORHOOD =
  /rodo|gdpr|dane\s+osobowe|prywatno|prawa\s+autorsk|copyright|odpowiedzialn|odstapienie|rezygnacj|sila\s+wyzsza|force\s+majeure|spory|sąd|podpis|rekojmia|postanowienia\s+ko[nń]cowe/i

const FINANCE_NEIGHBORHOOD =
  /wynagrodzen|honorarium|zadatek|zaliczk|rezerwacyjn|pozostał|cena|kwot|płatn|płatno|rozliczen|rat[ay]|fee|deposit|balance|installment|settlement|brutto|netto|zł|wartość|wpłacono|do zapłaty/i

const DEPOSIT_MARKER =
  /zadatek|zaliczk|rezerwacyjn|PLACEHOLDER_ZADATEK|wpłacono/i
const REMAINING_MARKER =
  /pozostał|PLACEHOLDER_RESTA|do zapłaty|saldo/i

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
  if (countPlnAmountSurfaces(t) > 0) return false
  if (/PLACEHOLDER_(CENA|ZADATEK|RESTA)/i.test(t)) return false
  if (/zadatek|zaliczk|pozostał/i.test(t) && t.length > 40) return false
  if (/^§\s*\d+[a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ0-9\s./-]*\.?$/u.test(t)) return true
  if (/^(płatności|wynagrodzenie|rozliczenia|płatność)\.?$/i.test(t)) return true
  return false
}

function financeTargetRank(text: string): number {
  if (/PLACEHOLDER_(ZADATEK|RESTA|CENA)/i.test(text)) return 100
  if (isFinanceSectionHeading(text)) return 5
  if (DEPOSIT_MARKER.test(text)) return 90
  if (REMAINING_MARKER.test(text)) return 85
  if (countPlnAmountSurfaces(text) > 0) return 70
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

function documentHasCanonicalAmount(
  blocks: TransformedBlock[],
  formatted: string,
): boolean {
  return blocks.some((b) => textHasCanonicalPlnAmount(b.text, formatted))
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

function documentRepresentsDeposit(blocks: TransformedBlock[]): boolean {
  return blocks.some((b) => DEPOSIT_MARKER.test(b.text))
}

function documentRepresentsRemaining(blocks: TransformedBlock[]): boolean {
  return blocks.some((b) => REMAINING_MARKER.test(b.text))
}

function tryReplaceDepositInPlace(input: {
  blocks: TransformedBlock[]
  candidateIds: string[]
  depositFormatted: string
  repairs: DeterministicRepair[]
}): boolean {
  const { blocks, candidateIds, depositFormatted, repairs } = input
  for (const id of candidateIds) {
    const b = blocks.find((x) => x.blockId === id)
    if (!b || !DEPOSIT_MARKER.test(b.text)) continue
    // Skip pure cancellation/refund prose with no payment amount after marker.
    if (
      /zatrzyman|zwrot|rezygnacj|odstąpien/i.test(b.text) &&
      countPlnAmountSurfaces(b.text) === 0
    ) {
      continue
    }
    const next = replacePlnAmountNearMarker(
      b.text,
      DEPOSIT_MARKER,
      depositFormatted,
    )
    if (next && next !== b.text) {
      return updateBlock(
        blocks,
        id,
        next,
        repairs,
        'replace_canonical_deposit_in_place',
        'contract.depositAmount',
      )
    }
  }
  return false
}

function tryReplaceRemainingInPlace(input: {
  blocks: TransformedBlock[]
  candidateIds: string[]
  remainingFormatted: string
  repairs: DeterministicRepair[]
}): boolean {
  const { blocks, candidateIds, remainingFormatted, repairs } = input
  for (const id of candidateIds) {
    const b = blocks.find((x) => x.blockId === id)
    if (!b || !REMAINING_MARKER.test(b.text)) continue
    const next = replacePlnAmountNearMarker(
      b.text,
      REMAINING_MARKER,
      remainingFormatted,
    )
    if (next && next !== b.text) {
      return updateBlock(
        blocks,
        id,
        next,
        repairs,
        'replace_canonical_remaining_in_place',
        'contract.remainingAmount',
      )
    }
  }
  return false
}

function tryReplaceTotalInPlace(input: {
  blocks: TransformedBlock[]
  candidateIds: string[]
  totalFormatted: string
  repairs: DeterministicRepair[]
  /** Grounded total surfaces from SOURCE (CG7.6). */
  totalEvidenceBlockIds?: string[]
}): boolean {
  const { blocks, candidateIds, totalFormatted, repairs } = input
  const evidenceIds = new Set(input.totalEvidenceBlockIds ?? [])

  // Prefer grounded total evidence blocks; fall back to ranked finance candidates.
  const orderedIds = [
    ...[...evidenceIds].filter(
      (id) => candidateIds.includes(id) || blocks.some((b) => b.blockId === id),
    ),
    ...candidateIds.filter((id) => !evidenceIds.has(id)),
  ]

  const LEGACY_TOTAL_MARKER =
    /honorarium|wynagrodzen|wartość zlecenia|cena|PLACEHOLDER_CENA/i

  let any = false
  for (const id of orderedIds) {
    const b = blocks.find((x) => x.blockId === id)
    if (!b) continue
    if (textHasCanonicalPlnAmount(b.text, totalFormatted)) continue

    const grounded = evidenceIds.has(id)
    const legacy = LEGACY_TOTAL_MARKER.test(b.text)
    if (!grounded && !legacy) continue

    // Do not mutate deposit/remaining-only or unrelated fee blocks even if listed.
    if (
      !grounded &&
      /zadatek|zaliczk|rezerwacj|pozostał|saldo|PLACEHOLDER_(ZADATEK|RESTA)/i.test(
        b.text,
      ) &&
      !LEGACY_TOTAL_MARKER.test(
        b.text.split(/zadatek|zaliczk|rezerwacj|pozostał/i)[0] ?? '',
      )
    ) {
      continue
    }

    let next: string | null = null
    if (grounded || /słownie/i.test(b.text)) {
      next = replacePlnAmountSurface(b.text, totalFormatted)
    } else {
      const head =
        b.text.split(/zadatek|zaliczk|rezerwacyjn|pozostał/i)[0] ?? b.text
      if (!LEGACY_TOTAL_MARKER.test(head)) continue
      const replaced = replacePlnAmountNearMarker(
        head,
        LEGACY_TOTAL_MARKER,
        totalFormatted,
      )
      if (replaced && replaced !== head) {
        next = replaced + b.text.slice(head.length)
      }
    }

    if (!next || next === b.text) continue
    if (
      updateBlock(
        blocks,
        id,
        next,
        repairs,
        'replace_canonical_total_in_place',
        'contract.totalPrice',
      )
    ) {
      any = true
      // Continue so every grounded total surface is updated (TP07).
      if (!grounded) return true
    }
  }
  return any
}

function ensureDeposit(input: {
  blocks: TransformedBlock[]
  candidateIds: string[]
  depositFormatted: string
  repairs: DeterministicRepair[]
  /** When false, never invent deposit obligations. */
  mayAuthorInsert: boolean
}): boolean {
  const { blocks, candidateIds, depositFormatted, repairs, mayAuthorInsert } =
    input
  if (documentHasCanonicalAmount(blocks, depositFormatted)) return true

  // 0) In-place replace for existing deposit synonyms (rezerwacyjna / zadatek / …)
  if (tryReplaceDepositInPlace({ blocks, candidateIds, depositFormatted, repairs })) {
    return true
  }

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
    if (textHasCanonicalPlnAmount(b.text, depositFormatted)) continue
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

  // 3) Append ONLY when template already represents deposit but amount is missing
  // AND the chosen block does not already carry a multi-amount split.
  // Never invent deposit onto a total-only contract (mayAuthorInsert=false).
  if (!mayAuthorInsert) return false
  if (documentRepresentsDeposit(blocks)) return false
  const mutable = pickMutableFinanceTargets(blocks, candidateIds)
  const targetId = mutable.find((id) => {
    const t = blocks.find((b) => b.blockId === id)?.text ?? ''
    return !financeBlockHasExistingPaymentStructure(t)
  })
  if (!targetId) return false
  const b = blocks.find((x) => x.blockId === targetId)
  if (!b) return false
  if (financeBlockHasExistingPaymentStructure(b.text)) return false
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
  mayAuthorInsert: boolean
}): boolean {
  const {
    blocks,
    candidateIds,
    remainingFormatted,
    repairs,
    mayAuthorInsert,
  } = input
  if (documentHasCanonicalAmount(blocks, remainingFormatted)) return true

  if (
    tryReplaceRemainingInPlace({
      blocks,
      candidateIds,
      remainingFormatted,
      repairs,
    })
  ) {
    return true
  }

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
    if (textHasCanonicalPlnAmount(b.text, remainingFormatted)) continue
    let next = b.text
    if (/pozostał[aey]\s+kwot[ayę]\b(?!\s*[\d])/i.test(next)) {
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

  // 3) Append only when remaining is represented via empty clause path and
  // mayAuthorInsert — never invent onto total-only / deposit-only contracts.
  if (!mayAuthorInsert) return false
  if (documentRepresentsRemaining(blocks)) return false
  const mutable = pickMutableFinanceTargets(blocks, candidateIds)
  const depositish =
    mutable.find((id) => {
      const t = blocks.find((b) => b.blockId === id)?.text ?? ''
      return (
        /zadatek|zaliczk/i.test(t) && !financeBlockHasExistingPaymentStructure(t)
      )
    }) ??
    mutable.find((id) => {
      const t = blocks.find((b) => b.blockId === id)?.text ?? ''
      return (
        /płatn|wynagrodzen|cena|zł/i.test(t) &&
        !financeBlockHasExistingPaymentStructure(t)
      )
    })
  if (!depositish) return false
  const b = blocks.find((x) => x.blockId === depositish)
  if (!b) return false
  if (financeBlockHasExistingPaymentStructure(b.text)) return false
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
 * Ensure represented payment amounts match canonical dataset values.
 * Does not author new legal payment obligations for unrepresented concepts.
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
  const total = finances.contractValueFormatted?.trim()

  const blocks = input.blocks.map((b) => ({ ...b }))
  const rankedIds = pickFinanceBlockIds(blocks, input.sourceBlocks)
  const candidateIds = pickMutableFinanceTargets(blocks, rankedIds)
  if (candidateIds.length === 0) {
    return { blocks, repairs }
  }

  const sourceRep = detectRepresentedConcepts(input.sourceBlocks)
  const totalEvidence = discoverFilledTotalEvidence(input.sourceBlocks)
  // Authoring deposit/remaining onto a finance block is allowed ONLY when the
  // source template already represented that concept (empty clause / placeholder)
  // OR legacy CG3 fixtures that use PLACEHOLDER_* (handled above).
  // Total-only contracts: never invent split obligations.
  const mayAuthorDeposit =
    sourceRep.deposit ||
    input.sourceBlocks.some((b) => /PLACEHOLDER_ZADATEK/i.test(b.text))
  const mayAuthorRemaining =
    sourceRep.remaining ||
    input.sourceBlocks.some((b) => /PLACEHOLDER_RESTA/i.test(b.text))

  if (
    total &&
    !documentHasCanonicalAmount(blocks, total) &&
    sourceRep.totalPrice
  ) {
    tryReplaceTotalInPlace({
      blocks,
      candidateIds,
      totalFormatted: total,
      repairs,
      totalEvidenceBlockIds: totalEvidence.map((e) => e.blockId),
    })
  }

  if (deposit && !documentHasCanonicalAmount(blocks, deposit)) {
    if (sourceRep.deposit || mayAuthorDeposit) {
      ensureDeposit({
        blocks,
        candidateIds,
        depositFormatted: deposit,
        repairs,
        // Append path only for templates that already had a deposit slot but
        // lack amount — never for pure total-only (mayAuthorDeposit false).
        mayAuthorInsert: mayAuthorDeposit && !documentRepresentsDeposit(blocks),
      })
    }
  }
  if (remaining && !documentHasCanonicalAmount(blocks, remaining)) {
    if (sourceRep.remaining || mayAuthorRemaining) {
      const rankedAgain = pickFinanceBlockIds(blocks, input.sourceBlocks)
      const ids = pickMutableFinanceTargets(blocks, rankedAgain)
      ensureRemaining({
        blocks,
        candidateIds: ids.length > 0 ? ids : candidateIds,
        remainingFormatted: remaining,
        repairs,
        mayAuthorInsert:
          mayAuthorRemaining && !documentRepresentsRemaining(blocks),
      })
    }
  }

  return { blocks, repairs }
}
