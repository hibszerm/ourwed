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
export type { SlotReplacementTrace, ApplySlotsResult } from './applyBoundSlots'
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
export {
  isTemplateUsableForGeneration,
  isTemplateGenerationReady,
} from './templateGenerationReadiness'
export type { GenerationReadinessOptions } from './templateGenerationReadiness'
export type {
  ContractTemplateStatus,
  TemplatePickerClassification,
  TemplatePickerDiagnosis,
} from './contractTemplatePicker'
export {
  logContractLoadedBindings,
  syncPhysicalBindingsFromSource,
} from './syncPhysicalBindingsFromSource'
export type { BindingSyncDiagnostic } from './syncPhysicalBindingsFromSource'
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
export { isSparseWeddingContractGenerationEnabled } from './sparseWeddingContractFlags'
export {
  buildFinalContractGenerationArtifact,
  createGenerationId,
  hashFinalBlocks,
  hashParagraphInsertions,
  refreshFinalDocxHash,
  paragraphsTextChanged,
  assertSaveArtifactConsistency,
  CONTRACT_ARTIFACT_VERSION_MISMATCH,
  ContractArtifactVersionMismatchError,
} from './finalContractGenerationArtifact'
export type { FinalContractGenerationArtifact } from './finalContractGenerationArtifact'
export { resolveContractSaveBytes } from './resolveContractSaveBytes'
export type { ResolveContractSaveBytesResult } from './resolveContractSaveBytes'
export {
  WeddingSparseContractGenerationService,
  resolveSparseTemplateSource,
} from './WeddingSparseContractGenerationService'
export type { SparseGenerationSource } from './WeddingSparseContractGenerationService'
export {
  uploadPackageContractTemplate,
  downloadPackageContractTemplateSource,
  clearPackageContractTemplate,
} from './packageContractTemplateUpload'
export type { PackageContractTemplateUploadResult } from './packageContractTemplateUpload'
export {
  printHtmlAsPdf,
  saveGeneratedContract,
} from './saveGeneratedContract'
export type {
  SaveGeneratedContractInput,
  SaveGeneratedContractResult,
} from './saveGeneratedContract'
export {
  ContractExportService,
  PDF_EXPORT_UNAVAILABLE_MESSAGE,
  assertRealDocx,
  createContractExportService,
} from './ContractExportService'
export type {
  PdfConversionAdapter,
  PersistedContractArtifact,
} from './ContractExportService'
export { createGotenbergPdfAdapter } from './gotenbergPdfAdapter'
export { isExperimentalPdfExportEnabled } from './experimentalPdfFlags'
export {
  ContractArtifactPersistenceService,
  GeneratedWeddingContractService,
  allocateNextGenerationVersion,
  createContractArtifactPersistenceService,
} from './ContractArtifactPersistenceService'
export type {
  PersistGeneratedWeddingContractInput,
  PersistGeneratedWeddingContractResult,
} from './ContractArtifactPersistenceService'
export {
  buildContractArtifactSnapshot,
  groupGeneratedWeddingContracts,
  nextGenerationVersion,
  sanitizeContractFileName,
} from './contractArtifactDomain'
export type {
  ContractArtifact,
  ContractArtifactSnapshot,
  ContractSourceDataSnapshot,
  GeneratedWeddingContract,
  GeneratedWeddingContractStatus,
} from './contractArtifactDomain'
export {
  buildAutomaticReadyConfiguration,
  computeAutomaticTemplateReadiness,
  finalizeAutomaticTemplateConfiguration,
  automaticStatusFromTemplate,
  toPersistedAutomaticMeta,
  migrateLegacyTemplateConfiguration,
  evaluateDocumentPreparationState,
  configurationFromMeta,
} from './automaticTemplateReadiness'
export type {
  AutomaticTemplateReadiness,
  AutomaticTemplateStatus,
  UserFacingTemplateIssue,
  AutomaticConfigurationFailure,
  AutomaticPreparationKind,
} from './automaticTemplateReadiness'
export {
  persistAutomaticTemplateConfiguration,
  persistLegacyTemplateMigration,
} from './persistAutomaticTemplateConfiguration'
export {
  ensureAutomaticTemplateConfiguration,
  semanticMapFromSlotMap,
} from './ensureAutomaticTemplateConfiguration'
export {
  PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS,
  PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS,
  PACKAGE_CONTRACT_CATEGORY_LABELS,
  PACKAGE_CONTRACT_REQUIRED_CATEGORIES,
  isPackageContractAllowedDynamicKey,
  isPackageContractImmutableKey,
  filterSlotsToPackageContractAllowlist,
  applyPackageContractAllowlistToSlotMap,
  evaluatePackageContractReadiness,
  categoryForPackageContractKey,
} from './packageContractAllowlist'
export type {
  PackageContractAllowedDynamicKey,
  PackageContractUserCategory,
  PackageContractReadiness,
} from './packageContractAllowlist'
export {
  evaluateClientPartyReadiness,
  isClientPartyIdentityKey,
  normalizeClientPartyKey,
  CLIENT_PARTY_IDENTITY_KEYS,
  CLIENT_PARTY_CAPABILITY_LABELS,
} from './clientPartyReadiness'
export type {
  ClientPartyReadinessResult,
  ClientPartyRole,
  ClientPartyCapability,
  ClientPartyPersonView,
} from './clientPartyReadiness'
export { buildClientPartyRightAnchors } from './clientPartyRolePhrases'
export {
  findClientPartyRoleAnchor,
  normalizeClientPartyRoleLabel,
  isProviderPartyRoleLabel,
} from './clientPartyRolePhrases'
export {
  assignPackageContractFromDocx,
  resolvePackageContractForWedding,
  packageContractMissingCategoryLabels,
} from './packageContractAssignment'
export type { PackageContractAssignmentResult } from './packageContractAssignment'
export {
  buildPackageContractHealthReport,
  detectDerivedFinancialClauses,
  detectMultiLocationSlot,
  detectPaymentNumberingIssues,
  packageContractHealthMark,
  assertPackageContractHealthConsistency,
} from './packageContractHealthAudit'
export type {
  PackageContractHealthCheck,
  PackageContractHealthReport,
  PackageContractHealthCode,
  PackageContractHealthStatus,
} from './packageContractHealthAudit'
export {
  evaluatePackageContractRequiredDataReadiness,
  assertPackageContractRequiredDataConsistency,
} from './packageContractRequiredDataReadiness'
export type {
  PackageContractRequiredDataReadiness,
  PackageContractBlockingIssue,
} from './packageContractRequiredDataReadiness'
export {
  buildPackageContractFinalReport,
  reconcilePackageContractPresentationFromPersisted,
  derivePackageContractReportKind,
  assertPackageContractFinalReportConsistency,
} from './packageContractFinalReport'
export type {
  PackageContractFinalReport,
  PackageContractReportKind,
} from './packageContractFinalReport'
export {
  normalizeClientPartyPhysicalBindings,
  classifySpanRelationship,
  describeSharedPhysicalSpanConflicts,
} from './normalizeClientPartyPhysicalBindings'
export type {
  ClientPartyBindingNormalizationResult,
  SpanConflictRelationship,
} from './normalizeClientPartyPhysicalBindings'
export {
  deriveClientPartyGenerationCapability,
  preflightClientPartyGeneration,
  composeCoupleFullNamesValue,
  selectClientPartyAuditParagraphs,
  logPackageContractGenerationClientPartyTrace,
} from './clientPartyGenerationCapability'
export type {
  ClientPartyGenerationCapability,
  ClientPartyPhysicalMode,
  ClientPartyGenerationPreflight,
} from './clientPartyGenerationCapability'
export {
  resolvePackageContractFromPackage,
} from './packageContractResolve'
export type { PackageContractResolution } from './packageContractResolve'
export {
  resolvePackageContractValue,
  resolvePackageContractDeposit,
  remainingAfterDeposit,
} from './packageContractCommercial'
export {
  collapseCompletenessFieldsByRegistryKey,
  groupSlotsIntoLogicalFields,
  normalizePhysicalBindings,
  normalizeSlotMap,
  physicalBindingId,
  slotsForSinglePassApply,
} from './logicalContractFields'
export type {
  LogicalContractField,
  PhysicalContractBinding,
} from './logicalContractFields'
export {
  buildPackageContractGenerationModel,
  assertPackageContractPersistedOnly,
  filterToPackageContractAllowlist,
  filterOverrideKeysToPackageAllowlist,
  findSharedPhysicalSpanConflicts,
  isPackageImmutableRegistryKey,
} from './packageContractGenerationModel'
export type {
  PackageContractGenerationModel,
  PackageContractGenerationSource,
} from './packageContractGenerationModel'
