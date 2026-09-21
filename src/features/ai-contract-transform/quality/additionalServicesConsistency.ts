/**
 * Post-reconstruction verification for wedding additional services.
 */

import {
  isBlockAfterSignature,
  isBlockBeforePayment,
} from '../additionalServicesPlacement'
import {
  serviceNamePresentInText,
  textLooksLikeServicePriceOrQuantity,
} from '../contractAdditionalServices'
import {
  detectPackageDeliverablesAnchor,
  findAtomicPaymentRegion,
  findPaymentStartIndex,
  findPostDeliverablesBoundaryIndex,
  findSignatureStartIndex,
  isOvertimeProvisionBlock,
} from '../packageDeliverablesDetection'
import type { ContractParagraphInsertion } from '../expandBlocksWithInsertions'
import { normalizeForMatch } from './normalize'
import type {
  AdditionalServicesExpectation,
  QualityIssue,
} from './types'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import type { AdditionalServicesInsertionDiagnostics } from '../insertAdditionalServices'

function countNormalizedOccurrences(text: string, name: string): number {
  const normName = normalizeForMatch(name)
  if (!normName) return 0
  const normText = normalizeForMatch(text)
  let count = 0
  let idx = 0
  while (idx < normText.length) {
    const found = normText.indexOf(normName, idx)
    if (found < 0) break
    count += 1
    idx = found + normName.length
  }
  return count
}

function blocksNearServiceName(
  blocks: TransformedBlock[],
  name: string,
): string[] {
  const normName = normalizeForMatch(name)
  const hits: string[] = []
  for (const b of blocks) {
    if (normalizeForMatch(b.text).includes(normName)) hits.push(b.text)
  }
  return hits
}

function firstBlockContaining(
  blocks: TransformedBlock[],
  name: string,
): number {
  for (let i = 0; i < blocks.length; i++) {
    if (serviceNamePresentInText(blocks[i]!.text, name)) return i
  }
  return -1
}

export function verifyAdditionalServicesConsistency(input: {
  transformedBlocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  expectation?: AdditionalServicesExpectation
  diagnostics?: AdditionalServicesInsertionDiagnostics
  blocksBeforeExpansion?: TransformedBlock[]
  paragraphInsertions?: ContractParagraphInsertion[]
}): QualityIssue[] {
  const expectation =
    input.expectation ?? input.dataset.additionalServicesExpectation
  if (!expectation || !expectation.shouldAppear) return []

  const issues: QualityIssue[] = []
  const diag = input.diagnostics
  const fullText = input.transformedBlocks.map((b) => b.text).join('\n')
  const expected = expectation.expectedNames

  if (diag?.additionalServicesPlacementFailed) {
    issues.push({
      code: 'ADDITIONAL_SERVICES_SAFE_PLACEMENT_NOT_FOUND',
      severity: 'blocking',
      canonicalField: 'contract.additionalServices',
      safeDescription:
        'No safe placement anchor found before signature blocks for additional services',
    })
    return issues
  }

  for (const name of expected) {
    if (!serviceNamePresentInText(fullText, name)) {
      issues.push({
        code: 'ADDITIONAL_SERVICE_MISSING',
        severity: 'review_required',
        canonicalField: 'contract.additionalServices',
        safeDescription: `Expected additional service "${name}" is missing from the contract`,
      })
    } else {
      const occurrences = countNormalizedOccurrences(fullText, name)
      if (occurrences > 1) {
        issues.push({
          code: 'ADDITIONAL_SERVICE_DUPLICATED',
          severity: 'review_required',
          canonicalField: 'contract.additionalServices',
          safeDescription: `Additional service "${name}" appears more than once`,
        })
      }
      const nearBlocks = blocksNearServiceName(input.transformedBlocks, name)
      for (const blockText of nearBlocks) {
        const line = blockText
          .split('\n')
          .find((l) => serviceNamePresentInText(l, name))
        if (line && textLooksLikeServicePriceOrQuantity(line)) {
          issues.push({
            code: line.match(/\d+\s*szt/i)
              ? 'ADDITIONAL_SERVICE_QUANTITY_RENDERED'
              : 'ADDITIONAL_SERVICE_PRICE_RENDERED',
            severity: 'blocking',
            canonicalField: 'contract.additionalServices',
            safeDescription: `Price or quantity rendered next to additional service "${name}"`,
          })
        }
      }
    }
  }

  const placementTarget = diag?.additionalServicesTargetBlockId
  const beforeExpansion = input.blocksBeforeExpansion ?? input.transformedBlocks

  // Anchor block must remain unchanged when using separate-block insertion
  if (
    diag?.additionalServicesAnchorType === 'package_deliverables' &&
    placementTarget
  ) {
    const sourceAnchor = input.sourceBlocks.find(
      (b) => b.blockId === placementTarget,
    )
    const currentAnchor = beforeExpansion.find(
      (b) => b.blockId === placementTarget,
    )
    if (
      sourceAnchor &&
      currentAnchor &&
      currentAnchor.text !== sourceAnchor.text
    ) {
      for (const name of expected) {
        if (serviceNamePresentInText(currentAnchor.text, name)) {
          issues.push({
            code: 'ADDITIONAL_SERVICES_INLINE_APPENDED',
            severity: 'blocking',
            canonicalField: 'contract.additionalServices',
            blockId: placementTarget,
            safeDescription: `Additional service "${name}" was appended inline to anchor paragraph`,
          })
        }
      }
      issues.push({
        code: 'ADDITIONAL_SERVICES_INLINE_APPENDED',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        blockId: placementTarget,
        safeDescription: 'Anchor paragraph text was mutated during additional-services insertion',
      })
    }
  }

  // Overtime paragraphs must not contain services and must stay unchanged
  for (const src of input.sourceBlocks) {
    if (!isOvertimeProvisionBlock(src.text)) continue
    const current = beforeExpansion.find((b) => b.blockId === src.blockId)
    if (current && current.text !== src.text) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_ATTACHED_TO_OVERTIME_CLAUSE',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        blockId: src.blockId,
        safeDescription: 'Overtime provision paragraph was modified',
      })
    }
    for (const name of expected) {
      if (serviceNamePresentInText(src.text, name)) continue
      const expanded = input.transformedBlocks.find((b) => b.blockId === src.blockId)
      if (expanded && serviceNamePresentInText(expanded.text, name)) {
        issues.push({
          code: 'ADDITIONAL_SERVICES_ATTACHED_TO_OVERTIME_CLAUSE',
          severity: 'blocking',
          canonicalField: 'contract.additionalServices',
          blockId: src.blockId,
          safeDescription: `Additional service "${name}" appears inside overtime provision`,
        })
      }
    }
  }

  if (placementTarget) {
    if (isBlockAfterSignature(input.sourceBlocks, placementTarget)) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_AFTER_SIGNATURE_BLOCK',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        blockId: placementTarget,
        safeDescription:
          'Additional services were placed after or inside a signature block',
      })
    }
    // Existing dedicated extras sections may sit after payment (still before
    // signatures). Only flag AFTER_PAYMENT for fallback anchors.
    if (
      diag?.additionalServicesAnchorType !== 'existing_section' &&
      !isBlockBeforePayment(input.sourceBlocks, placementTarget)
    ) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_AFTER_PAYMENT',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        blockId: placementTarget,
        safeDescription:
          'Additional services were placed after payment provisions',
      })
    }
  }

  const deliverables = detectPackageDeliverablesAnchor(input.sourceBlocks)
  if (deliverables && expected.length > 0) {
    const lastDeliverableOrder = input.transformedBlocks.findIndex(
      (b) => b.blockId === deliverables.lastDeliverableBlockId,
    )
    const introOrder = input.transformedBlocks.findIndex(
      (b) => b.blockId === deliverables.packageIntroductionBlockId,
    )
    const boundaryIdx = findPostDeliverablesBoundaryIndex(
      input.sourceBlocks,
      deliverables.lastDeliverableIndex,
    )
    for (const name of expected) {
      const serviceIdx = firstBlockContaining(input.transformedBlocks, name)
      if (serviceIdx < 0) continue
      if (introOrder >= 0 && serviceIdx <= introOrder) {
        issues.push({
          code: 'ADDITIONAL_SERVICES_BEFORE_PACKAGE_INTRO',
          severity: 'blocking',
          canonicalField: 'contract.additionalServices',
          safeDescription: `Additional service "${name}" appears before package introduction`,
        })
      }
      if (lastDeliverableOrder >= 0 && serviceIdx <= lastDeliverableOrder) {
        issues.push({
          code: 'ADDITIONAL_SERVICES_ANCHOR_NOT_AFTER_PACKAGE_INTRO',
          severity: 'blocking',
          canonicalField: 'contract.additionalServices',
          safeDescription: `Additional service "${name}" is not after the final package deliverable`,
        })
      }
      if (serviceIdx > boundaryIdx + (input.paragraphInsertions?.[0]?.paragraphs.length ?? 0)) {
        issues.push({
          code: 'ADDITIONAL_SERVICES_WRONG_SCOPE_POSITION',
          severity: 'blocking',
          canonicalField: 'contract.additionalServices',
          safeDescription: `Additional service "${name}" appears after unrelated post-package clause`,
        })
      }
    }
  }

  // No invented numbered sections
  for (const b of input.transformedBlocks) {
    if (/^§\s*\d+\s+usługi\s+dodatkowe/i.test(b.text.trim())) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_SECTION_NUMBERING_CHANGED',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        blockId: b.blockId,
        safeDescription:
          'A new numbered legal section was introduced for additional services',
      })
    }
    if (
      /^§\s*2\b/i.test(b.text.trim()) &&
      /usługi\s+dodatkowe/i.test(b.text)
    ) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_SECTION_NUMBERING_CHANGED',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        blockId: b.blockId,
        safeDescription:
          'Additional services created a new §2 section',
      })
    }
  }

  // Signature safety: any service block must be before signature start
  // Compare in the transformed coordinate system. Inserted extra paragraphs
  // shift signature indices, so the numeric source index is not valid after
  // expansion. Preserve identity by locating the source signature anchor in
  // the transformed blocks.
  const sourceSignatureStart = findSignatureStartIndex(input.sourceBlocks)
  const sourceSignatureId = input.sourceBlocks[sourceSignatureStart]?.blockId
  const signatureStart = sourceSignatureId
    ? input.transformedBlocks.findIndex((b) => b.blockId === sourceSignatureId)
    : -1
  for (const name of expected) {
    const serviceIdx = firstBlockContaining(input.transformedBlocks, name)
    if (serviceIdx >= 0 && signatureStart >= 0 && serviceIdx >= signatureStart) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_AFTER_SIGNATURE_BLOCK',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        safeDescription: `Additional service "${name}" appears after signature block`,
      })
    }
  }

  // Forbidden legal neighborhoods (I11): extras must not sit inside boilerplate clauses.
  const FORBIDDEN_NEIGHBORHOOD =
    /rodo|dane\s+osobowe|odstapienie|prawa\s+autorsk|odpowiedzialnosc|sila\s+wyzsza|spory|rekojmia|force\s+majeure/i
  for (const name of expected) {
    const serviceIdx = firstBlockContaining(input.transformedBlocks, name)
    if (serviceIdx < 0) continue
    const window = [
      input.transformedBlocks[serviceIdx - 1]?.text ?? '',
      input.transformedBlocks[serviceIdx]!.text,
      input.transformedBlocks[serviceIdx + 1]?.text ?? '',
    ]
      .map((t) => normalizeForMatch(t))
      .join('\n')
    // Allow when the hit is the dedicated extras heading itself.
    const onExtrasHeading =
      /uslugi\s+dodatkowe|dodatkowe\s+uslugi|opcje\s+dodatkowe|zakres\s+dodatkowy/.test(
        normalizeForMatch(input.transformedBlocks[serviceIdx]!.text),
      )
    // Allow extras body lines sitting under an extras heading even when the
    // following block is a later legal section (copyright/RODO).
    const underExtrasSection =
      onExtrasHeading ||
      (serviceIdx > 0 &&
        /uslugi\s+dodatkowe|dodatkowe\s+uslugi|opcje\s+dodatkowe|zakres\s+dodatkowy|brak wybranych|lista wybranych/i.test(
          normalizeForMatch(
            [
              input.transformedBlocks[serviceIdx - 2]?.text ?? '',
              input.transformedBlocks[serviceIdx - 1]?.text ?? '',
              input.transformedBlocks[serviceIdx]!.text,
            ].join('\n'),
          ),
        ))
    if (!underExtrasSection && FORBIDDEN_NEIGHBORHOOD.test(window)) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_IN_FORBIDDEN_LEGAL_SECTION',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        safeDescription: `Additional service "${name}" appears in or adjacent to unrelated legal boilerplate`,
      })
    }
  }

  // Compare extras position against the payment clause in the *transformed*
  // document (insertions shift indices; source paymentStart is not comparable).
  // Prefer package_deliverables / existing_section placements — only flag when
  // an extra truly lands at or after the payment region's first block AND is
  // not under an extras heading.
  const paymentStartSource = findPaymentStartIndex(input.sourceBlocks)
  const paymentSourceBlock =
    paymentStartSource < input.sourceBlocks.length
      ? input.sourceBlocks[paymentStartSource]
      : undefined
  const paymentStartTransformed = paymentSourceBlock
    ? input.transformedBlocks.findIndex(
        (b) => b.blockId === paymentSourceBlock.blockId,
      )
    : findPaymentStartIndex(
        input.transformedBlocks.map((b, i) => ({
          blockId: b.blockId,
          text: b.text,
          kind: 'paragraph' as const,
          paragraphIndex: i,
        })),
      )
  const paymentAtomic = findAtomicPaymentRegion(input.sourceBlocks)
  const paymentAtomicTransformed = paymentAtomic
    ? {
        start: input.transformedBlocks.findIndex(
          (b) => b.blockId === paymentAtomic.startBlockId,
        ),
        end: input.transformedBlocks.findIndex(
          (b) => b.blockId === paymentAtomic.endBlockId,
        ),
      }
    : null

  if (diag?.additionalServicesAnchorType !== 'existing_section') {
    for (const name of expected) {
      const serviceIdx = firstBlockContaining(input.transformedBlocks, name)
      if (serviceIdx < 0) continue

      // Never allow extras to split an atomic payment group
      if (
        paymentAtomicTransformed &&
        paymentAtomicTransformed.start >= 0 &&
        paymentAtomicTransformed.end >= 0 &&
        serviceIdx > paymentAtomicTransformed.start &&
        serviceIdx < paymentAtomicTransformed.end
      ) {
        issues.push({
          code: 'ADDITIONAL_SERVICES_SPLITS_PAYMENT_REGION',
          severity: 'blocking',
          canonicalField: 'contract.additionalServices',
          safeDescription: `Additional service "${name}" was inserted inside an atomic payment region`,
        })
        continue
      }

      // After payment is only illegal when placement is not package-adjacent
      // and the extra sits at/after the payment clause without a better commercial home.
      const packageAdjacent =
        diag?.additionalServicesAnchorType === 'package_deliverables' ||
        diag?.additionalServicesAnchorType === 'package_scope'
      if (
        !packageAdjacent &&
        paymentStartTransformed >= 0 &&
        serviceIdx >= paymentStartTransformed
      ) {
        issues.push({
          code: 'ADDITIONAL_SERVICES_AFTER_PAYMENT',
          severity: 'blocking',
          canonicalField: 'contract.additionalServices',
          safeDescription: `Additional service "${name}" appears after payment clause in a non-defensible region`,
        })
      }
    }
  }

  if (
    diag?.additionalServicesUsedFallback &&
    placementTarget &&
    isBlockAfterSignature(input.sourceBlocks, placementTarget)
  ) {
    issues.push({
      code: 'ADDITIONAL_SERVICES_FALLBACK_MISPLACED',
      severity: 'review_required',
      canonicalField: 'contract.additionalServices',
      blockId: placementTarget,
      safeDescription:
        'Fallback additional-services block was placed after signature sections',
    })
  }

  return issues
}

export function verifyNoAdditionalServicesSectionWhenEmpty(input: {
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
}): QualityIssue[] {
  const services = input.dataset.additionalServices ?? []
  if (services.length > 0) return []

  const issues: QualityIssue[] = []
  for (const b of input.transformedBlocks) {
    if (/usługi\s+dodatkowe|dodatkowe\s+usługi/i.test(b.text)) {
      if (/brak|nie\s+wybrano/i.test(b.text)) {
        issues.push({
          code: 'ADDITIONAL_SERVICES_EMPTY_SECTION',
          severity: 'review_required',
          canonicalField: 'contract.additionalServices',
          blockId: b.blockId,
          safeDescription:
            'Empty-state additional-services section was introduced',
        })
      }
    }
  }
  return issues
}
