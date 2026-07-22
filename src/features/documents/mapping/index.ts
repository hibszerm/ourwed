/**
 * Mapping Wizard feature barrel (Phase 2).
 * Isolated from frozen Template Management UI.
 */

export type {
  DetectedField,
  DocumentAnalysisResult,
  MappingWizardDraft,
  MappingWizardStepId,
  TemplateConfigStatus,
} from './types'

export { MAPPING_WIZARD_STEPS } from './types'
export { activeDocumentAnalyzer, mockDocumentAnalyzer } from './analysis'
export {
  activeDocumentTextExtractor,
  docxTextExtractor,
  activeDocumentStructureExtractor,
  docxStructureExtractor,
} from './extraction'
export type { DocumentStructure, DocumentBlock, DocumentInline } from './preview/documentNodes'
export { MappingWizardProvider, useMappingWizard } from './state/useMappingWizard'
export { MappingWizardLayout } from './components/MappingWizardLayout'
