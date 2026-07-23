export type {
  TemplateSlot,
  TemplateSlotMap,
  TemplateSlotSourceHint,
  ContractSlotOperation,
  TemplateSlotRange,
  OmissionMode,
} from './types'
export { emptySlotMap, parseSlotMap, isSlotPhysicallyBound } from './types'
export {
  buildSlotsFromAnalysis,
  inferExampleText,
} from './buildSlotsFromAnalysis'
export {
  bindSlotsFromAnalysis,
  bindSlotsToDocument,
  SLOT_PATTERNS,
} from './slotBinder'
export {
  renderSlotValue,
  applySlotToParagraphText,
  locateSlotInParagraph,
} from './slotRenderer'
export { applyBoundSlotsToParagraphs } from './applyBoundSlots'
export { validateTemplateSlotBindings } from './templateReadiness'
export type { TemplateReadinessReport } from './templateReadiness'
export {
  classifyTemplatesForGeneration,
  splitRecommended,
} from './contractTemplatePicker'
export type {
  ContractTemplateStatus,
  TemplatePickerClassification,
  TemplatePickerDiagnosis,
} from './contractTemplatePicker'
export { reanalyzeTemplate } from './reanalyzeTemplate'
export type { ReanalyzeTemplateResult } from './reanalyzeTemplate'
export { extractDocxParagraphsIncludingEmpty } from './extractDocxParagraphs'
export {
  insertPlaceholdersInDocx,
  valuesForSlots,
} from './insertPlaceholders'
export { fillTemplateDocx } from './fillTemplateDocx'
export { saveTemplateSlots } from './saveTemplateSlots'
export type { SaveTemplateSlotsResult } from './saveTemplateSlots'
/** @deprecated Prefer transformContract — deterministic slot fill on original DOCX. */
export { generateContractFromTemplate } from './generateContractFromTemplate'
export type {
  GenerateContractFromTemplateInput,
  GenerateContractFromTemplateResult,
} from './generateContractFromTemplate'
export { transformContract } from './ContractTransformationService'
export type {
  TransformContractInput,
  TransformContractResult,
} from './ContractTransformationService'
export {
  verifyContractTransformation,
  formatQualityReport,
} from './contractQualityCheck'
export type {
  QualityCheckResult,
  ParagraphFailureReport,
  UnexpectedEdit,
  VariableReplacementHit,
  UnboundVariableHit,
} from './contractQualityCheck'
export {
  buildContractCompletenessReport,
  weddingValuesFromWedding,
} from './buildContractCompleteness'
export type {
  CompletenessField,
  CompletenessGroup,
  CompletenessGroupId,
  ContractCompletenessReport,
} from './buildContractCompleteness'
export {
  lookupResolvedValue,
  resolveContractVariables,
  sourceLabel,
} from './resolveContractVariables'
export type {
  ResolvedVariableMeta,
  VariableDataSource,
} from './resolveContractVariables'
export {
  applyDocxParagraphEdits,
  extractDocxParagraphs,
  paragraphsToPrintHtml,
} from './docxParagraphEditor'
export type { DocxParagraph } from './docxParagraphEditor'
export {
  printHtmlAsPdf,
  saveGeneratedContract,
} from './saveGeneratedContract'
export type {
  SaveGeneratedContractInput,
  SaveGeneratedContractResult,
} from './saveGeneratedContract'
