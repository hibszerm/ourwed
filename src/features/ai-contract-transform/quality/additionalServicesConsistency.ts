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
    if (!isBlockBeforePayment(input.sourceBlocks, placementTarget)) {
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
  const signatureStart = findSignatureStartIndex(input.sourceBlocks)
  for (const name of expected) {
    const serviceIdx = firstBlockContaining(input.transformedBlocks, name)
    if (serviceIdx >= 0 && serviceIdx >= signatureStart) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_AFTER_SIGNATURE_BLOCK',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        safeDescription: `Additional service "${name}" appears after signature block`,
      })
    }
  }

  const paymentStart = findPaymentStartIndex(input.sourceBlocks)
  for (const name of expected) {
    const serviceIdx = firstBlockContaining(input.transformedBlocks, name)
    if (serviceIdx >= 0 && serviceIdx >= paymentStart) {
      issues.push({
        code: 'ADDITIONAL_SERVICES_AFTER_PAYMENT',
        severity: 'blocking',
        canonicalField: 'contract.additionalServices',
        safeDescription: `Additional service "${name}" appears after payment clause`,
      })
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
