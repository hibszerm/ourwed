/**
 * Deterministic insertion of wedding additional services into transformed blocks.
 * Package-deliverables strategy inserts new sibling paragraphs — never mutates anchor text.
 */

import {
  projectContractAdditionalServices,
  renderSeparateAdditionalServicesParagraphs,
  renderAdditionalServicesBulletList,
  serviceNamePresentInText,
  type ContractAdditionalService,
} from './contractAdditionalServices'
import {
  classifyAdditionalServicesPlacement,
  collectAdditionalServicesSectionBlockIds,
  isBlockBeforeSignature,
  type AdditionalServicesPlacement,
} from './additionalServicesPlacement'
import type { ContractParagraphInsertion } from './expandBlocksWithInsertions'
import { findSignatureStartIndex } from './packageDeliverablesDetection'
import { normalizeForMatch } from './quality/normalize'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'
import type { WeddingExtraService } from '@/types/package'

export type AdditionalServicesInsertionDiagnostics = {
  additionalServicesPlacementMode?:
    | 'existing_section'
    | 'package_deliverables'
    | 'package_scope'
    | 'before_payment'
    | 'safe_placement_not_found'
    | 'skipped'
  additionalServicesAnchorType?:
    | 'existing_section'
    | 'package_deliverables'
    | 'package_scope'
    | 'before_payment'
  additionalServicesTargetBlockId?: string
  additionalServicesAnchorBlockId?: string
  additionalServicesBoundaryBlockId?: string
  packageIntroductionBlockId?: string
  packageIntroductionBlockIndex?: number
  packageDeliverablesScanStartIndex?: number
  packageDeliverablesScanEndIndex?: number
  packageDeliverablesRejectedCandidates?: Array<{ blockId: string; reason: string }>
  additionalServicesAnchorRejectedReason?: string
  additionalServicesInsertedAsSeparateBlocks?: boolean
  additionalServicesPlacementConfidence?: number
  additionalServicesExpectedCount?: number
  additionalServicesInsertedCount?: number
  additionalServicesUsedFallback?: boolean
  additionalServicesPlacementRationale?: string
  additionalServicesSignatureBoundaryDetected?: boolean
  additionalServicesInsertedBeforeSignature?: boolean
  additionalServicesPlacementFailed?: boolean
}

function isProtectedPackageTableBlock(block: TransformDocumentBlock): boolean {
  return block.tableContext?.ownershipFamily === 'service_scope'
}

function filterServicesNotYetPresent(
  services: ContractAdditionalService[],
  texts: string[],
): ContractAdditionalService[] {
  const combined = texts.join('\n')
  return services.filter((s) => !serviceNamePresentInText(combined, s.name))
}

function appendBulletServices(existing: string, names: string[]): string {
  const trimmed = existing.trimEnd()
  const bullets = renderAdditionalServicesBulletList(names)
  if (!trimmed) return bullets
  if (/[:\-–•]\s*$/.test(trimmed) || /wybiera\s*:/i.test(trimmed)) {
    return `${trimmed}\n${bullets}`
  }
  return `${trimmed}\n\n${bullets}`
}

function applyExistingSectionInsertion(
  block: TransformedBlock,
  services: ContractAdditionalService[],
): string {
  const names = services.map((s) => s.name)
  const text = block.text
  if (/^[\s\-–•]/.test(text.trim()) || text.includes('\n–')) {
    return appendBulletServices(text, names)
  }
  return appendBulletServices(text, names)
}

function buildDiagnostics(
  placement: AdditionalServicesPlacement,
  services: ContractAdditionalService[],
  insertedCount: number,
  extra?: Partial<AdditionalServicesInsertionDiagnostics>,
): AdditionalServicesInsertionDiagnostics {
  const signatureDetected =
    placement.mode !== 'safe_placement_not_found' &&
    placement.targetBlockId != null
  return {
    additionalServicesPlacementMode:
      placement.mode === 'safe_placement_not_found'
        ? 'safe_placement_not_found'
        : placement.mode,
    additionalServicesAnchorType: placement.anchorType,
    additionalServicesTargetBlockId: placement.targetBlockId,
    additionalServicesAnchorBlockId: placement.targetBlockId,
    additionalServicesBoundaryBlockId:
      placement.mode === 'safe_placement_not_found'
        ? undefined
        : placement.boundaryBlockId,
    packageIntroductionBlockId:
      placement.mode === 'package_deliverables'
        ? placement.packageIntroductionBlockId
        : undefined,
    additionalServicesPlacementConfidence: placement.confidence,
    additionalServicesExpectedCount: services.length,
    additionalServicesInsertedCount: insertedCount,
    additionalServicesUsedFallback:
      placement.mode === 'package_scope' ||
      placement.mode === 'before_payment',
    additionalServicesPlacementRationale: placement.rationale,
    additionalServicesSignatureBoundaryDetected: signatureDetected,
    additionalServicesInsertedBeforeSignature: extra?.additionalServicesInsertedBeforeSignature,
    additionalServicesPlacementFailed: placement.mode === 'safe_placement_not_found',
    ...extra,
  }
}

export function insertAdditionalServicesIntoBlocks(input: {
  blocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  placement?: AdditionalServicesPlacement | null
}): {
  blocks: TransformedBlock[]
  placement: AdditionalServicesPlacement | null
  paragraphInsertions: ContractParagraphInsertion[]
  diagnostics: AdditionalServicesInsertionDiagnostics
  insertedNames: string[]
} {
  const services = input.dataset.additionalServices ?? []
  const emptyDiag: AdditionalServicesInsertionDiagnostics = {
    additionalServicesPlacementMode: 'skipped',
    additionalServicesExpectedCount: 0,
    additionalServicesInsertedCount: 0,
    additionalServicesUsedFallback: false,
  }
  if (services.length === 0) {
    return {
      blocks: input.blocks,
      placement: null,
      paragraphInsertions: [],
      diagnostics: emptyDiag,
      insertedNames: [],
    }
  }

  const placement =
    input.placement ?? classifyAdditionalServicesPlacement(input.sourceBlocks)

  if (placement.mode === 'safe_placement_not_found') {
    return {
      blocks: input.blocks,
      placement,
      paragraphInsertions: [],
      diagnostics: buildDiagnostics(placement, services, 0),
      insertedNames: [],
    }
  }

  const sectionIds = collectAdditionalServicesSectionBlockIds(
    input.sourceBlocks,
    placement,
  )
  const sectionTexts = input.blocks
    .filter((b) => sectionIds.includes(b.blockId))
    .map((b) => b.text)

  const toInsert = filterServicesNotYetPresent(services, sectionTexts)
  if (toInsert.length === 0) {
    return {
      blocks: input.blocks,
      placement,
      paragraphInsertions: [],
      diagnostics: buildDiagnostics(placement, services, 0),
      insertedNames: [],
    }
  }

  const targetId = placement.targetBlockId
  if (!targetId) {
    return {
      blocks: input.blocks,
      placement,
      paragraphInsertions: [],
      diagnostics: buildDiagnostics(placement, services, 0),
      insertedNames: [],
    }
  }

  if (!isBlockBeforeSignature(input.sourceBlocks, targetId)) {
    return {
      blocks: input.blocks,
      placement: {
        mode: 'safe_placement_not_found',
        anchorType: 'before_payment',
        confidence: 0,
        rationale: 'anchor_after_signature_rejected',
      },
      paragraphInsertions: [],
      diagnostics: buildDiagnostics(
        {
          mode: 'safe_placement_not_found',
          anchorType: 'before_payment',
          confidence: 0,
          rationale: 'anchor_after_signature_rejected',
        },
        services,
        0,
        { additionalServicesPlacementFailed: true },
      ),
      insertedNames: [],
    }
  }

  const sourceTarget = input.sourceBlocks.find((b) => b.blockId === targetId)
  if (sourceTarget && isProtectedPackageTableBlock(sourceTarget)) {
    return {
      blocks: input.blocks,
      placement,
      paragraphInsertions: [],
      diagnostics: buildDiagnostics(placement, services, 0, {
        additionalServicesPlacementRationale: 'protected_package_table_avoided',
      }),
      insertedNames: [],
    }
  }

  const names = toInsert.map((s) => s.name)
  let paragraphInsertions: ContractParagraphInsertion[] = []
  const blocks = input.blocks.map((b) => ({ ...b }))

  switch (placement.mode) {
    case 'package_deliverables': {
      const anchor = input.sourceBlocks.find((b) => b.blockId === targetId)
      if (!anchor) break
      paragraphInsertions = [
        {
          afterParagraphIndex: anchor.paragraphIndex,
          paragraphs: renderSeparateAdditionalServicesParagraphs(names),
        },
      ]
      break
    }
    case 'existing_section': {
      const target = blocks.find((b) => b.blockId === targetId)
      if (target) {
        target.text = applyExistingSectionInsertion(target, toInsert)
      }
      break
    }
    case 'package_scope':
    case 'before_payment': {
      const anchor = input.sourceBlocks.find((b) => b.blockId === targetId)
      if (!anchor) break
      const fallbackParagraphs = renderSeparateAdditionalServicesParagraphs(names)
      const isEmpty = normalizeForMatch(anchor.text).length < 3
      if (isEmpty) {
        paragraphInsertions = [
          { afterParagraphIndex: anchor.paragraphIndex, paragraphs: fallbackParagraphs },
        ]
      } else {
        paragraphInsertions = [
          {
            afterParagraphIndex: anchor.paragraphIndex,
            paragraphs: fallbackParagraphs,
          },
        ]
      }
      break
    }
    default:
      break
  }

  const signatureStart = findSignatureStartIndex(input.sourceBlocks)
  const targetIdx = input.sourceBlocks.findIndex((b) => b.blockId === targetId)
  const insertedBeforeSignature = targetIdx >= 0 && targetIdx < signatureStart

  return {
    blocks,
    placement,
    paragraphInsertions,
    diagnostics: buildDiagnostics(placement, services, toInsert.length, {
      additionalServicesInsertedBeforeSignature: insertedBeforeSignature,
      additionalServicesInsertedAsSeparateBlocks:
        placement.mode === 'package_deliverables' ||
        placement.mode === 'package_scope' ||
        placement.mode === 'before_payment',
    }),
    insertedNames: names,
  }
}

/** Build dataset additionalServices from raw wedding extras. */
export function buildDatasetAdditionalServices(
  extras: WeddingExtraService[],
): {
  additionalServices: ContractAdditionalService[]
  additionalServicesDisplayText: string
} {
  const additionalServices = projectContractAdditionalServices(extras)
  return {
    additionalServices,
    additionalServicesDisplayText: additionalServices.map((s) => s.name).join('\n'),
  }
}
