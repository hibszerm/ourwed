/** Insert exact CRM extra names at a validated SOURCE paragraph boundary. */
import { projectContractAdditionalServices, renderSeparateAdditionalServicesParagraphs, type ContractAdditionalService } from './contractAdditionalServices'
import { resolveSemanticExtrasPlacement, type SemanticExtrasPlacement } from './semanticExtrasPlacement'
import type { ContractParagraphInsertion } from './expandBlocksWithInsertions'
import type { ContractTransformationDataset, TransformDocumentBlock, TransformedBlock } from './types'
import type { WeddingExtraService } from '@/types/package'

export type AdditionalServicesInsertionDiagnostics = {
  additionalServicesPlacementMode?: 'semantic_boundary' | 'structural_fallback' | 'skipped'
  additionalServicesAnchorType?: 'semantic_boundary' | 'structural_fallback' | 'existing_section' | 'package_deliverables' | 'package_scope' | 'before_payment'
  additionalServicesTargetBlockId?: string
  additionalServicesAnchorBlockId?: string
  additionalServicesPlacementRationale?: string
  additionalServicesExpectedCount?: number
  additionalServicesInsertedCount?: number
  additionalServicesUsedFallback?: boolean
  additionalServicesPlacementFailed?: boolean
  additionalServicesInsertedAsSeparateBlocks?: boolean
}

export function insertAdditionalServicesIntoBlocks(input: {
  blocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  placement?: SemanticExtrasPlacement | null
}): {
  blocks: TransformedBlock[]
  placement: ReturnType<typeof resolveSemanticExtrasPlacement> | null
  paragraphInsertions: ContractParagraphInsertion[]
  diagnostics: AdditionalServicesInsertionDiagnostics
  insertedNames: string[]
} {
  const services = input.dataset.additionalServices ?? []
  if (!services.length) return {
    blocks: input.blocks,
    placement: null,
    paragraphInsertions: [],
    diagnostics: { additionalServicesPlacementMode: 'skipped', additionalServicesExpectedCount: 0, additionalServicesInsertedCount: 0, additionalServicesUsedFallback: false },
    insertedNames: [],
  }
  const placement = resolveSemanticExtrasPlacement(input.sourceBlocks, input.placement)
  const names = services.map((service) => service.name)
  if (names.some((name) => !name.trim() || /\d[\d\s]*\s*zł|\bPLN\b/i.test(name))) {
    throw new Error('ADDITIONAL_SERVICES_UNSAFE_CRM_NAME')
  }
  const paragraphs = renderSeparateAdditionalServicesParagraphs(names)
  if (paragraphs.length !== names.length + 1) throw new Error('ADDITIONAL_SERVICES_INCOMPLETE')
  const paragraphInsertions: ContractParagraphInsertion[] = [{
    afterParagraphIndex: placement.side === 'after' ? placement.paragraphIndex : -1,
    ...(placement.side === 'before' ? { beforeParagraphIndex: placement.paragraphIndex } : {}),
    paragraphs,
    listNumbering: 'detach',
    presentation: 'plain',
  }]
  return {
    blocks: input.blocks,
    placement,
    paragraphInsertions,
    diagnostics: {
      additionalServicesPlacementMode: placement.mode === 'model' ? 'semantic_boundary' : 'structural_fallback',
      additionalServicesAnchorType: placement.mode === 'model' ? 'semantic_boundary' : 'structural_fallback',
      additionalServicesTargetBlockId: placement.sourceBlockId,
      additionalServicesAnchorBlockId: placement.sourceBlockId,
      additionalServicesPlacementRationale: placement.side,
      additionalServicesExpectedCount: names.length,
      additionalServicesInsertedCount: names.length,
      additionalServicesUsedFallback: placement.mode === 'structural_fallback',
      additionalServicesInsertedAsSeparateBlocks: true,
    },
    insertedNames: names,
  }
}

/** Name-only projection: no CRM price or quantity enters the insertion path. */
export function buildDatasetAdditionalServices(extras: WeddingExtraService[]): {
  additionalServices: ContractAdditionalService[]
  additionalServicesDisplayText: string
} {
  const additionalServices = projectContractAdditionalServices(extras)
  return { additionalServices, additionalServicesDisplayText: additionalServices.map((service) => service.name).join('\n') }
}
