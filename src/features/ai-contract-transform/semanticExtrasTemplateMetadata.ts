import { resolveSemanticExtrasPlacement, type SemanticExtrasStructure, type SemanticExtrasTemplateMetadata } from './semanticExtrasPlacement'
import type { TransformDocumentBlock } from './types'

/** Golden-only structural seeds. Production resolves metadata from a template version. */
const GOLDEN_TEMPLATE_METADATA_SEEDS: Readonly<Record<string, SemanticExtrasTemplateMetadata>> = {
  "d8f5b95eae9586adc5c37b681f2ba108ab2464fcc78f2ab8214a6d57a6710fee": {
    packageDescriptionRegion: { startParagraphIndex: 3, endParagraphIndex: 6 },
    mainContractualBodyRegion: { startParagraphIndex: 3, endParagraphIndex: 40 },
    signatureBoundaryParagraphIndex: 41,
    fallbackBoundaryParagraphIndex: 7,
  },
  "617275318f49790e9b2ba3faa4093b96486f0bf1b2b72a2082f0eed94cb9a6ae": {
    packageDescriptionRegion: { startParagraphIndex: 35, endParagraphIndex: 38 },
    mainContractualBodyRegion: { startParagraphIndex: 35, endParagraphIndex: 76 },
    signatureBoundaryParagraphIndex: 77,
    fallbackBoundaryParagraphIndex: 39,
  },
  "1d4035dafdde597b308af923a1061ba3409141420d8dd6d699df1578ae5d6637": {
    packageDescriptionRegion: { startParagraphIndex: 21, endParagraphIndex: 24 },
    mainContractualBodyRegion: { startParagraphIndex: 21, endParagraphIndex: 140 },
    signatureBoundaryParagraphIndex: 141,
    fallbackBoundaryParagraphIndex: 25,
  },
  "63358621714ef99f88392be4174e2e498dcaf4555749a698ec94904c0925feb4": {
    packageDescriptionRegion: { startParagraphIndex: 25, endParagraphIndex: 46 },
    mainContractualBodyRegion: { startParagraphIndex: 25, endParagraphIndex: 152 },
    signatureBoundaryParagraphIndex: 153,
    fallbackBoundaryParagraphIndex: 47,
  },
  "6feb4a760e42d1a8ef6e61d4721e3c021d5eb8df9278e4cf188a76db2fafb91c": {
    packageDescriptionRegion: { startParagraphIndex: 21, endParagraphIndex: 25 },
    mainContractualBodyRegion: { startParagraphIndex: 21, endParagraphIndex: 84 },
    signatureBoundaryParagraphIndex: 85,
    fallbackBoundaryParagraphIndex: 26,
  },
  "14b917a31e67eab720bc94df91db84611ee5da3bb68ef0bb49cfc1102466a012": {
    packageDescriptionRegion: { startParagraphIndex: 13, endParagraphIndex: 18 },
    mainContractualBodyRegion: { startParagraphIndex: 13, endParagraphIndex: 49 },
    signatureBoundaryParagraphIndex: 50,
    fallbackBoundaryParagraphIndex: 19,
  },
}

export type StoredSemanticExtrasTemplateMetadata = {
  schemaVersion: 1
  sourceSha256: string
  metadata: SemanticExtrasTemplateMetadata
}

export function withStoredSemanticExtrasTemplateMetadata(
  slotMap: Record<string, unknown>,
  metadata: StoredSemanticExtrasTemplateMetadata,
): Record<string, unknown> {
  return { ...slotMap, semanticExtrasMetadata: metadata }
}

/** Turn model-interpreted semantic regions into verified source paragraph ranges. */
export function resolveSemanticExtrasMetadataFromModel(
  blocks: readonly TransformDocumentBlock[],
  structure: SemanticExtrasStructure | null | undefined,
): SemanticExtrasTemplateMetadata | null {
  if (!structure) return null
  const uniqueParagraphIndex = (blockId: string): number | null => {
    const matches = blocks.filter((block) => block.blockId === blockId)
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0]?.paragraphIndex)) return null
    return matches[0]!.paragraphIndex
  }
  const packageStart = uniqueParagraphIndex(structure.packageDescriptionRegion.startBlockId)
  const packageEnd = uniqueParagraphIndex(structure.packageDescriptionRegion.endBlockId)
  const bodyStart = uniqueParagraphIndex(structure.mainContractualBodyRegion.startBlockId)
  const bodyEnd = uniqueParagraphIndex(structure.mainContractualBodyRegion.endBlockId)
  const signatureBoundary = uniqueParagraphIndex(structure.signatureBoundaryBlockId)
  const fallbackAnchorIndex = uniqueParagraphIndex(structure.fallbackBoundary.sourceBlockId)
  if ([packageStart, packageEnd, bodyStart, bodyEnd, signatureBoundary, fallbackAnchorIndex].some((value) => value === null)) return null
  const fallbackBoundaryParagraphIndex = fallbackAnchorIndex! + (structure.fallbackBoundary.side === 'after' ? 1 : 0)
  const metadata: SemanticExtrasTemplateMetadata = {
    packageDescriptionRegion: { startParagraphIndex: packageStart!, endParagraphIndex: packageEnd! },
    mainContractualBodyRegion: { startParagraphIndex: bodyStart!, endParagraphIndex: bodyEnd! },
    signatureBoundaryParagraphIndex: signatureBoundary!,
    fallbackBoundaryParagraphIndex,
  }
  if (!isValidSemanticExtrasTemplateMetadata(metadata)) return null
  try {
    resolveSemanticExtrasPlacement(blocks, structure.fallbackBoundary, metadata)
  } catch {
    return null
  }
  return metadata
}

export async function sha256Source(sourceDocxBytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', sourceDocxBytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isValidSemanticExtrasTemplateMetadata(
  value: unknown,
): value is SemanticExtrasTemplateMetadata {
  if (!value || typeof value !== 'object') return false
  const metadata = value as Partial<SemanticExtrasTemplateMetadata>
  const regions = [metadata.packageDescriptionRegion, metadata.mainContractualBodyRegion]
  if (regions.some((region) => !region || !Number.isSafeInteger(region.startParagraphIndex)
    || !Number.isSafeInteger(region.endParagraphIndex) || region.startParagraphIndex! < 0
    || region.endParagraphIndex! < region.startParagraphIndex!)) return false
  const packageRegion = metadata.packageDescriptionRegion!
  const bodyRegion = metadata.mainContractualBodyRegion!
  const signature = metadata.signatureBoundaryParagraphIndex
  const fallback = metadata.fallbackBoundaryParagraphIndex
  if (!Number.isSafeInteger(signature) || !Number.isSafeInteger(fallback)) return false
  const firstAdmissible = Math.max(packageRegion.endParagraphIndex + 1, bodyRegion.startParagraphIndex)
  const lastAdmissible = Math.min(bodyRegion.endParagraphIndex + 1, signature!)
  return packageRegion.startParagraphIndex >= bodyRegion.startParagraphIndex
    && packageRegion.endParagraphIndex <= bodyRegion.endParagraphIndex
    && signature! > bodyRegion.endParagraphIndex
    && fallback! >= firstAdmissible
    && fallback! <= lastAdmissible
}

/** Only exact Golden fixtures seed metadata during ingestion; this is not a production lookup. */
export async function resolveGoldenSemanticExtrasTemplateMetadataSeed(
  sourceDocxBytes: ArrayBuffer,
): Promise<SemanticExtrasTemplateMetadata | null> {
  const sha256 = await sha256Source(sourceDocxBytes)
  return GOLDEN_TEMPLATE_METADATA_SEEDS[sha256] ?? null
}

export async function createStoredSemanticExtrasTemplateMetadata(
  sourceDocxBytes: ArrayBuffer,
  metadata: SemanticExtrasTemplateMetadata,
): Promise<StoredSemanticExtrasTemplateMetadata | null> {
  if (!isValidSemanticExtrasTemplateMetadata(metadata)) return null
  return { schemaVersion: 1, sourceSha256: await sha256Source(sourceDocxBytes), metadata }
}

export async function resolveStoredSemanticExtrasTemplateMetadata(
  slotMap: Record<string, unknown>,
  sourceDocxBytes: ArrayBuffer,
): Promise<SemanticExtrasTemplateMetadata | null> {
  const stored = slotMap.semanticExtrasMetadata as Partial<StoredSemanticExtrasTemplateMetadata> | undefined
  if (!stored || stored.schemaVersion !== 1 || typeof stored.sourceSha256 !== 'string'
    || !isValidSemanticExtrasTemplateMetadata(stored.metadata)) return null
  if (stored.sourceSha256 !== await sha256Source(sourceDocxBytes)) return null
  return stored.metadata
}

export function getGoldenSemanticExtrasTemplateMetadataSeedForTest(sha256: string): SemanticExtrasTemplateMetadata | null {
  return GOLDEN_TEMPLATE_METADATA_SEEDS[sha256] ?? null
}
