/**
 * Deterministic semantic placement for additional services in contract blocks.
 */

import {
  detectPackageDeliverablesAnchor,
  findPaymentStartIndex,
  findSignatureStartIndex,
  isSignatureBlock,
  isStopBoundaryBlock,
} from './packageDeliverablesDetection'
import { normalizeLabel } from './tableRowOwnership'
import type { TransformDocumentBlock } from './types'

export type AdditionalServicesAnchorType =
  | 'existing_section'
  | 'package_deliverables'
  | 'package_scope'
  | 'before_payment'

export type AdditionalServicesPlacement =
  | {
      mode: 'existing_section'
      anchorType: 'existing_section'
      targetBlockId: string
      confidence: number
      rationale?: string
      boundaryBlockId?: string
    }
  | {
      mode: 'package_deliverables'
      anchorType: 'package_deliverables'
      targetBlockId: string
      lastDeliverableBlockId: string
      packageIntroductionBlockId?: string
      confidence: number
      rationale?: string
      boundaryBlockId?: string
    }
  | {
      mode: 'package_scope'
      anchorType: 'package_scope'
      targetBlockId: string
      confidence: number
      rationale?: string
      boundaryBlockId?: string
    }
  | {
      mode: 'before_payment'
      anchorType: 'before_payment'
      targetBlockId: string
      confidence: number
      rationale?: string
      boundaryBlockId?: string
    }
  | {
      mode: 'safe_placement_not_found'
      anchorType: 'before_payment'
      targetBlockId?: string
      confidence: 0
      rationale: string
      boundaryBlockId?: string
    }

const EXISTING_SECTION_PATTERNS: Array<{ re: RegExp; score: number; label: string }> = [
  { re: /uslugi\s+dodatkowe/i, score: 1, label: 'Usługi dodatkowe' },
  { re: /dodatkowe\s+uslugi/i, score: 0.95, label: 'Dodatkowe usługi' },
  { re: /opcje\s+dodatkowe/i, score: 0.9, label: 'Opcje dodatkowe' },
  { re: /dodatkowe\s+elementy\s+zamowienia/i, score: 0.9, label: 'Dodatkowe elementy zamówienia' },
  { re: /rozszerzenie\s+zakresu/i, score: 0.85, label: 'Rozszerzenie zakresu' },
  { re: /pozostale\s+swiadczenia/i, score: 0.85, label: 'Pozostałe świadczenia' },
  { re: /dodatkowo\s+zamawiajacy\s+wybiera/i, score: 0.88, label: 'Dodatkowo Zamawiający wybiera' },
  { re: /zakres\s+dodatkowy/i, score: 0.85, label: 'Zakres dodatkowy' },
  { re: /inne\s+ustalenia\s+dotyczace\s+zakresu/i, score: 0.8, label: 'Inne ustalenia dotyczące zakresu' },
]

function norm(text: string): string {
  return normalizeLabel(text)
}

function scoreExistingSectionHeading(text: string): {
  score: number
  label: string
} | null {
  const n = norm(text)
  if (!n) return null
  let best: { score: number; label: string } | null = null
  for (const p of EXISTING_SECTION_PATTERNS) {
    if (p.re.test(n) && (!best || p.score > best.score)) {
      best = { score: p.score, label: p.label }
    }
  }
  return best
}

function isServiceScopeBlock(block: TransformDocumentBlock): boolean {
  return block.tableContext?.ownershipFamily === 'service_scope'
}

function findNarrowPackageScopeEndIndex(
  blocks: TransformDocumentBlock[],
  maxBeforeIndex: number,
): number {
  let last = -1
  for (let i = 0; i < maxBeforeIndex; i++) {
    const b = blocks[i]!
    if (isServiceScopeBlock(b)) {
      last = i
      continue
    }
    const n = norm(b.text)
    if (
      /material|dlugosc|w\s+cenie|zakres\s+uslug/i.test(n) &&
      b.kind === 'tableCell'
    ) {
      last = i
    }
    if (/pakiet\s+obejmuje|przedmiotem\s+umowy/i.test(n) && b.kind === 'paragraph') {
      last = i
    }
  }
  return last
}

function blockIndex(blocks: TransformDocumentBlock[], blockId: string): number {
  return blocks.findIndex((b) => b.blockId === blockId)
}

/**
 * Classify the best insertion target for additional services.
 * Priority: existing section → package deliverables → package scope → before payment.
 * Never places after signature blocks.
 */
export function classifyAdditionalServicesPlacement(
  blocks: TransformDocumentBlock[],
): AdditionalServicesPlacement {
  if (blocks.length === 0) {
    return {
      mode: 'safe_placement_not_found',
      anchorType: 'before_payment',
      confidence: 0,
      rationale: 'empty_document',
    }
  }

  const signatureStart = findSignatureStartIndex(blocks)
  const paymentStart = findPaymentStartIndex(blocks)
  const safeCeiling = Math.min(signatureStart, paymentStart)

  // A. Existing dedicated extras section (before signatures)
  let bestHeading: {
    blockIndex: number
    score: number
    label: string
  } | null = null

  for (let i = 0; i < safeCeiling; i++) {
    const hit = scoreExistingSectionHeading(blocks[i]!.text)
    if (!hit) continue
    if (!bestHeading || hit.score > bestHeading.score) {
      bestHeading = { blockIndex: i, score: hit.score, label: hit.label }
    }
  }

  if (bestHeading && bestHeading.score >= 0.75) {
    const sectionStart = bestHeading.blockIndex
    let targetIndex = sectionStart
    for (let j = sectionStart + 1; j < safeCeiling; j++) {
      const b = blocks[j]!
      if (isStopBoundaryBlock(b.text) || isSignatureBlock(b)) break
      const nextHeading = scoreExistingSectionHeading(b.text)
      if (nextHeading && nextHeading.score >= 0.75) break
      if (b.text.trim().length > 0) targetIndex = j
    }
    const boundary =
      targetIndex + 1 < blocks.length ? blocks[targetIndex + 1] : undefined
    return {
      mode: 'existing_section',
      anchorType: 'existing_section',
      targetBlockId: blocks[targetIndex]!.blockId,
      confidence: bestHeading.score,
      rationale: `existing_section:${bestHeading.label}`,
      boundaryBlockId: boundary?.blockId,
    }
  }

  // B. Package deliverables list
  const deliverables = detectPackageDeliverablesAnchor(blocks, safeCeiling)
  if (deliverables) {
    return {
      mode: 'package_deliverables',
      anchorType: 'package_deliverables',
      targetBlockId: deliverables.lastDeliverableBlockId,
      lastDeliverableBlockId: deliverables.lastDeliverableBlockId,
      packageIntroductionBlockId: deliverables.packageIntroductionBlockId,
      confidence: deliverables.confidence,
      rationale: deliverables.rationale,
      boundaryBlockId: deliverables.boundaryBlockId,
    }
  }

  // C. Narrow package/scope paragraph or table row (insert after, not inside table)
  const packageEnd = findNarrowPackageScopeEndIndex(blocks, safeCeiling)
  if (packageEnd >= 0) {
    let targetIndex = packageEnd
    if (isServiceScopeBlock(blocks[targetIndex]!)) {
      targetIndex = Math.min(targetIndex + 1, safeCeiling - 1)
    }
    if (targetIndex >= 0 && targetIndex < safeCeiling) {
      const boundary =
        targetIndex + 1 < blocks.length ? blocks[targetIndex + 1] : undefined
      return {
        mode: 'package_scope',
        anchorType: 'package_scope',
        targetBlockId: blocks[targetIndex]!.blockId,
        confidence: 0.75,
        rationale: 'after_narrow_package_scope',
        boundaryBlockId: boundary?.blockId,
      }
    }
  }

  // D. Before payment (still before signature, never on signature block)
  if (safeCeiling > 0) {
    let insertIndex = safeCeiling - 1
    while (insertIndex >= 0 && isSignatureBlock(blocks[insertIndex]!)) {
      insertIndex -= 1
    }
    if (insertIndex >= 0) {
      const boundary =
        safeCeiling < blocks.length ? blocks[safeCeiling] : undefined
      return {
        mode: 'before_payment',
        anchorType: 'before_payment',
        targetBlockId: blocks[insertIndex]!.blockId,
        confidence: 0.55,
        rationale: 'before_payment_or_signature',
        boundaryBlockId: boundary?.blockId,
      }
    }
  }

  // E. Safe failure
  return {
    mode: 'safe_placement_not_found',
    anchorType: 'before_payment',
    confidence: 0,
    rationale: 'no_safe_anchor_before_signature',
  }
}

/** Blocks belonging to an existing additional-services section (for dedup checks). */
export function collectAdditionalServicesSectionBlockIds(
  blocks: TransformDocumentBlock[],
  placement: AdditionalServicesPlacement,
): string[] {
  if (placement.mode !== 'existing_section') {
    return placement.targetBlockId ? [placement.targetBlockId] : []
  }
  const startIdx = blocks.findIndex((b) => b.blockId === placement.targetBlockId)
  if (startIdx < 0) return placement.targetBlockId ? [placement.targetBlockId] : []

  for (let i = startIdx; i >= 0; i--) {
    const hit = scoreExistingSectionHeading(blocks[i]!.text)
    if (hit && hit.score >= 0.75) {
      const ids: string[] = []
      for (let j = i; j < blocks.length; j++) {
        const b = blocks[j]!
        if (j > i && scoreExistingSectionHeading(b.text)?.score) break
        if (isStopBoundaryBlock(b.text) || isSignatureBlock(b)) break
        ids.push(b.blockId)
      }
      return ids
    }
  }
  return placement.targetBlockId ? [placement.targetBlockId] : []
}

export function isBlockBeforePayment(
  blocks: TransformDocumentBlock[],
  blockId: string,
): boolean {
  const paymentStart = findPaymentStartIndex(blocks)
  const idx = blockIndex(blocks, blockId)
  return idx >= 0 && idx < paymentStart
}

export function isBlockBeforeSignature(
  blocks: TransformDocumentBlock[],
  blockId: string,
): boolean {
  const signatureStart = findSignatureStartIndex(blocks)
  const idx = blockIndex(blocks, blockId)
  return idx >= 0 && idx < signatureStart
}

export function isBlockAfterSignature(
  blocks: TransformDocumentBlock[],
  blockId: string,
): boolean {
  const signatureStart = findSignatureStartIndex(blocks)
  if (signatureStart >= blocks.length) return false
  const idx = blockIndex(blocks, blockId)
  return idx >= signatureStart
}
