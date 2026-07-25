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
export {
  validateTemplateSlotBindings,
  finalizeSlotMapClassification,
  stripNonDetectedSlots,
  computeSlotCounters,
} from './templateReadiness'
export type { TemplateReadinessReport } from './templateReadiness'
export {
  canonicalRegistryKey,
  dedupeSlotsByCanonicalKey,
  classifySlotDetection,
  defaultRequirementForKey,
} from './slotClassification'
export type {
  TemplateSlotRequirement,
  TemplateSlotDetectionStatus,
  TemplateSlotCounters,
} from './types'
export {
  canonicalizeParagraphText,
  extractCanonicalParagraphText,
  buildParagraphRunModel,
} from './canonicalParagraph'
export type { ParagraphRunModel, ParagraphCharMapEntry } from './canonicalParagraph'
export { debugSlotLocation } from './slotRenderer'
export type { SlotLocation } from './slotRenderer'
export {
  detectContractCandidates,
  candidatesToTemplateSlots,
  hasVisiblePartyIdentityWithoutSlot,
  summarizeDetection,
} from './candidateDetection'
export type {
  ContractCandidate,
  CandidateEvidenceType,
} from './candidateDetection'
export {
  MONEY_PAIR_CONCEPTS,
  analyzeMoneyPairs,
  assertSafeMoneyPairsForGeneration,
  detectMoneyPairsInText,
} from './contractMoneyPairs'
export type { MoneyPairReport, MoneyPairConcept } from './contractMoneyPairs'
export {
  resolveContractExecutionValues,
  localCalendarIsoDate,
  assertCompanyCityLocativeForSlots,
  isSystemAutoResolvedContractKey,
  SYSTEM_AUTO_RESOLVED_CONTRACT_KEYS,
} from './contractExecutionContext'
export type { ContractExecutionSnapshot } from './contractExecutionContext'
export {
  updateTemplateSlotConfig,
  slotsNeedingConfiguration,
} from './updateTemplateSlotConfig'
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
