import type { SemanticExtrasTemplateMetadata } from './semanticExtrasPlacement'

/** Allowlisted source-template structure for the six approved contract files. */
const APPROVED_TEMPLATE_METADATA: Readonly<Record<string, SemanticExtrasTemplateMetadata>> = {
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

export async function resolveSemanticExtrasTemplateMetadata(
  sourceDocxBytes: ArrayBuffer,
): Promise<SemanticExtrasTemplateMetadata | null> {
  const digest = await crypto.subtle.digest('SHA-256', sourceDocxBytes)
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return APPROVED_TEMPLATE_METADATA[sha256] ?? null
}

export function getApprovedSemanticExtrasTemplateMetadataForTest(sha256: string): SemanticExtrasTemplateMetadata | null {
  return APPROVED_TEMPLATE_METADATA[sha256] ?? null
}
