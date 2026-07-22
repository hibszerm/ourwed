import type { DocumentExtractInput } from './documentTextExtractor'
import type { DocumentStructureExtractor } from './docxStructureExtractor'
import { docxStructureExtractor } from './docxStructureExtractor'
import { docStructureExtractor } from './docStructureExtractor'
import { pdfStructureExtractor } from './pdfStructureExtractor'
import type { DocumentStructure } from '../preview/documentNodes'
import {
  detectSourceKind,
  toArrayBuffer,
  type SourceDocumentKind,
} from './sourceKind'

export interface UnifiedExtractResult {
  kind: SourceDocumentKind
  structure: DocumentStructure
}

/**
 * Unified document extraction — DOCX / DOC / PDF → DocumentStructure + plainText.
 */
export async function extractDocumentStructure(
  input: DocumentExtractInput,
  fileName?: string | null,
): Promise<UnifiedExtractResult> {
  const bytes = await toArrayBuffer(input)
  const kind = detectSourceKind(fileName, bytes)

  let extractor: DocumentStructureExtractor
  switch (kind) {
    case 'pdf':
      extractor = pdfStructureExtractor
      break
    case 'doc':
      extractor = docStructureExtractor
      break
    case 'docx':
      extractor = docxStructureExtractor
      break
    default:
      throw new Error('Dodaj plik w formacie DOCX, DOC lub PDF.')
  }

  const structure = await extractor.extract(bytes)
  return { kind, structure }
}

/** Active unified structure extractor (routes by content / filename). */
export const activeDocumentStructureExtractor: DocumentStructureExtractor & {
  extractForFile: (
    input: DocumentExtractInput,
    fileName?: string | null,
  ) => Promise<DocumentStructure>
} = {
  id: 'unified-structure',
  version: '1.0.0',
  async extract(input) {
    const { structure } = await extractDocumentStructure(input)
    return structure
  },
  async extractForFile(input, fileName) {
    const { structure } = await extractDocumentStructure(input, fileName)
    return structure
  },
}
