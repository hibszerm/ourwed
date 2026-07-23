/**
 * @deprecated LEGACY — Mapping Wizard is not part of the product workflow.
 *
 * Official contract path (reproduction system):
 * Upload DOCX → AI detects variables → saveTemplateSlots → Generate Contract modal
 * (template picker → completeness → DOCX fill → editor → PDF/DOCX).
 *
 * Extraction helpers below are still used by SimpleContractImportFlow.
 * MappingWizardLayout / Provider must not be mounted in routes.
 */

export type {
  DetectedField,
  DocumentAnalysisResult,
  MappingWizardDraft,
  MappingWizardStepId,
  TemplateConfigStatus,
} from './types'

export { MAPPING_WIZARD_STEPS } from './types'
/** @deprecated Prefer `@/features/documents/ai` */
export { activeDocumentAnalyzer, mockDocumentAnalyzer } from './analysis'
export {
  activeDocumentTextExtractor,
  docxTextExtractor,
  activeDocumentStructureExtractor,
  docxStructureExtractor,
  extractDocumentStructure,
  pdfStructureExtractor,
  docStructureExtractor,
} from './extraction'
export type { DocumentStructure, DocumentBlock, DocumentInline } from './preview/documentNodes'
/** @deprecated Do not mount in product routes. */
export { MappingWizardProvider, useMappingWizard } from './state/useMappingWizard'
/** @deprecated Do not mount in product routes. */
export { MappingWizardLayout } from './components/MappingWizardLayout'
