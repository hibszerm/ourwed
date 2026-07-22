import type {
  DocumentExtractInput,
  DocumentTextExtractor,
} from './documentTextExtractor'
import { activeDocumentStructureExtractor } from './docxStructureExtractor'

/**
 * Plain-text extractor.
 * Uses the structure extractor so analyzer offsets match the preview model.
 */
export const docxTextExtractor: DocumentTextExtractor = {
  id: 'docx-plain',
  version: '2.0.0',

  async extract(input: DocumentExtractInput) {
    const structure = await activeDocumentStructureExtractor.extract(input)
    return structure.plainText
  },
}

/** Active extractor for Phase 2. */
export const activeDocumentTextExtractor: DocumentTextExtractor =
  docxTextExtractor
