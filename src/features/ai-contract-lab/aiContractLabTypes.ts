/**
 * AI Contract Lab — shared types (client + validation).
 * OpenAI never returns a DOCX; only a replacement plan.
 */

export type LabStep =
  | 'wedding'
  | 'upload'
  | 'analysis'
  | 'semantic'
  | 'configure'
  | 'missing'
  | 'plan'
  | 'structure'
  | 'audit'
  | 'generate'
  | 'compare'
  | 'download'

export const LAB_STEPS: Array<{ id: LabStep; label: string }> = [
  { id: 'wedding', label: 'Wesele testowe' },
  { id: 'upload', label: 'Wzór DOCX' },
  { id: 'analysis', label: 'Analiza AI' },
  { id: 'semantic', label: 'Mapa semantyczna' },
  { id: 'configure', label: 'Konfiguracja pól' },
  { id: 'missing', label: 'Brakujące dane' },
  { id: 'plan', label: 'Plan zmian' },
  { id: 'structure', label: 'Kontrola zmiennych' },
  { id: 'audit', label: 'Kontrola dokumentu' },
  { id: 'generate', label: 'Generowanie' },
  { id: 'compare', label: 'Porównanie' },
  { id: 'download', label: 'Pobranie' },
]

export type ContractCanonicalCategory =
  | 'client'
  | 'wedding'
  | 'company'
  | 'package'
  | 'extras'
  | 'payments'
  | 'location'

export type ContractCanonicalDataType =
  | 'text'
  | 'date'
  | 'money'
  | 'duration'
  | 'address'
  | 'phone'
  | 'email'
  | 'number'
  | 'boolean'

export type ContractCanonicalField = {
  key: string
  label: string
  category: ContractCanonicalCategory
  value: string | number | boolean | null
  formattedValue: string | null
  dataType: ContractCanonicalDataType
  source: string
}

export type ContractDataSnapshot = {
  weddingId: string
  generatedAt: string
  fields: ContractCanonicalField[]
  availableCount: number
  unavailableCount: number
}

export type DocumentTextAnchor = {
  anchorId: string
  container: 'body' | 'table' | 'header' | 'footer'
  paragraphIndex: number
  runStart: number
  runEnd: number
  text: string
  contextBefore: string
  contextAfter: string
  /** Lab-only DOCX run evidence. Never sent to Phase A. */
  runSegments?: Array<{
    runIndex: number
    start: number
    end: number
    text: string
    bold?: boolean
    italic?: boolean
  }>
  listMarker?: boolean
}

export type DocxLabSourceMeta = {
  fileName: string
  sizeBytes: number
  sourceHash: string
  paragraphCount: number
  nonEmptyParagraphCount: number
  tableCount: number
  hasHeader: boolean
  hasFooter: boolean
}

export type AiContractAnalysisResult = {
  analysisVersion: string
  documentSummary: {
    documentType: string
    language: string
    detectedPartyRoles: string[]
    detectedBusinessContext: string
  }
  replacements: Array<{
    replacementId: string
    anchorId: string
    originalText: string
    canonicalFieldKey: string
    proposedValue: string
    semanticRole: string
    reason: string
    confidence: number
    requiresUserReview: boolean
    prefixContext?: string | null
    suffixContext?: string | null
  }>
  missingFields: Array<{
    missingId: string
    label: string
    semanticRole: string
    expectedDataType: string
    affectedAnchorIds: string[]
    reason: string
    suggestedCanonicalFieldKey: string | null
    /** Preferred canonical key when known. */
    fieldKey?: string | null
    /** Concrete document target — required for true manual_missing. */
    targetEvidence?: {
      anchorId: string
      exactText?: string | null
      prefixContext?: string | null
      suffixContext?: string | null
      semanticLabel: string
    } | null
  }>
  ambiguities: Array<{
    ambiguityId: string
    anchorId: string
    originalText: string
    candidateFieldKeys: string[]
    reason: string
  }>
  ignoredWeddingFields: Array<{
    canonicalFieldKey: string
    reason: string
  }>
  warnings: Array<{
    code: string
    message: string
    anchorIds: string[]
  }>
}

export type DocumentValueClassification =
  | 'replacement'
  | 'manual_missing'
  | 'ambiguous_mapping'
  | 'document_only_value'
  | 'ignored'

export type ReplacementDecision =
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'unchanged'

export type LabReplacementRow = {
  replacementId: string
  anchorId: string
  /** Exact contiguous substring from the original anchor (patch source). */
  originalText: string
  canonicalFieldKey: string | null
  proposedValue: string
  semanticRole: string
  reason: string
  confidence: number
  confidenceLabel: 'Wysoka' | 'Średnia' | 'Niska'
  /** Display / patch provenance — `manual` for session-only missing values. */
  source: string
  decision: ReplacementDecision
  manualValue: string | null
  /** Set for proposals created from AI missing fields. */
  missingId: string | null
  requiresUserReview: boolean
  /** Short document context for review UI. */
  contextSnippet: string | null
  /** Source-span resolution against the real anchor. */
  spanStatus: 'exact' | 'normalized_exact' | 'ambiguous' | 'not_found' | 'resolved_manual'
  spanMessage: string | null
  /** AI-proposed source text before resolution (may contain ellipses). */
  aiProposedSourceText: string | null
  spanCandidates: Array<{ exactSourceText: string; start: number; end: number }>
  spanStart: number | null
  spanEnd: number | null
  prefixContext?: string | null
  suffixContext?: string | null
  /** Multiple semantic meanings intentionally sharing one physical patch. */
  semanticBindings?: string[]
  /** Replacement rows deterministically merged into this physical row. */
  mergedReplacementIds?: string[]
  /** Non-winning resolver candidates kept for diagnostics only. */
  resolverDiagnostics?: Array<{
    exactSourceText: string
    start: number
    end: number
    reason: string
  }>
}

export type ApprovedContractPatch = {
  patchId: string
  anchorId: string
  paragraphIndex: number
  expectedOriginalText: string
  replacementText: string
  canonicalFieldKey: string | null
  source:
    | 'wedding'
    | 'company'
    | 'package'
    | 'extra'
    | 'payment'
    | 'manual'
  approvedByUser: boolean
  spanStart: number
  spanEnd: number
}

export type ContractIntegrityReport = {
  passed: boolean
  approvedChangeCount: number
  actualTextChangeCount: number
  unauthorizedTextChanges: Array<{
    paragraphIndex: number
    before: string
    after: string
  }>
  structuralChanges: Array<{ code: string; message: string }>
  formattingChanges: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  legalTextUnchanged: boolean
}

/** Session-only manual value for an AI-detected missing document field. */
export type ManualMissingFieldValue = {
  missingId: string
  value: string
  affectedAnchorIds: string[]
  semanticRole: string
  expectedDataType: string
  /** Human label for forms only — never used as an identifier. */
  label: string
}

/** Reviewable proposal created from a resolved manual missing value. */
export type ManualReplacementProposal = {
  replacementId: string
  missingId: string
  anchorId: string
  originalText: string
  proposedValue: string
  semanticRole: string
  source: 'manual'
  requiresUserReview: true
  contextSnippet: string
}

/** @deprecated Prefer ManualMissingFieldValue — kept as alias for older call sites. */
export type LabManualValue = ManualMissingFieldValue

/** Phase A — document semantic understanding (no wedding mapping). */
export type DocumentSemanticValueSpan = {
  sourceText: string
  prefixContext?: string | null
  suffixContext?: string | null
}

export type DocumentSemanticAnchor = {
  anchorId: string
  semanticRole: string
  confidence: number
  documentLabel?: string | null
  valueSpan: DocumentSemanticValueSpan
  reason?: string | null
}

export type DocumentSemanticMap = {
  analysisVersion: string
  documentSummary: {
    documentType: string
    language: string
    detectedPartyRoles: string[]
    detectedBusinessContext: string
  }
  semanticAnchors: DocumentSemanticAnchor[]
  /** Soft-failed Phase A rows — reviewable, not patchable until resolved. */
  unresolved?: Array<{
    providerIndex: number
    anchorId: string | null
    status: string
    semanticRole: string | null
  }>
  warnings: Array<{
    code: string
    message: string
    anchorIds: string[]
  }>
}

/** Deterministic Phase B status for Semantic Map. */
export type SemanticStatus =
  | 'UNCHANGED'
  | 'REPLACEMENT'
  | 'REVIEW'
  | 'DERIVED'
  | 'AMBIGUOUS'
  | 'IGNORED'
  | 'DOCUMENT_ONLY'

/** Phase B quality counters shown on the Semantic Map. */
export type SemanticQualityMetrics = {
  semanticRolesDetected: number
  automaticMappings: number
  reviewMappings: number
  derivedMappings: number
  unchangedMappings: number
  replacementMappings: number
  ambiguousMappings: number
  ignoredMappings: number
  unresolvedRows: number
}

export type SemanticValueKindUi =
  | 'text'
  | 'money'
  | 'absolute_date'
  | 'relative_duration'
  | 'time'
  | 'phone'
  | 'legal_reference'
  | 'defined_term'
  | 'package_item'
  | 'duration'
  | 'location'
  | 'other'

export type ConfidenceBreakdown = {
  semanticConfidence: number
  spanConfidence: number
  bindingConfidence: number
  patchConfidence: number
  reasons: string[]
}

export type PatchPreviewUi = {
  oldValue: string
  newValue: string
  beforePhrase: string
  afterPhrase: string
  valid: boolean
}

/** Phase B mapping row for the Semantic Map UI. */
export type SemanticMappingRow = {
  anchorId: string
  semanticRole: string
  semanticLabel: string
  confidence: number
  confidenceBand: 'auto' | 'review' | 'ignore'
  documentLabel: string | null
  sourceText: string
  /** Exact document value after span resolve (or raw sourceText). */
  documentValue: string
  canonicalValue: string | null
  derivedValue: string | null
  /** Absolute preview for relative rules (informational only). */
  previewValue: string | null
  mappedFieldKey: string | null
  mappedDisplay: string | null
  status: SemanticStatus
  replacementStatus:
    | 'replacement'
    | 'unchanged'
    | 'missing_value'
    | 'span_unresolved'
    | 'unmapped'
    | 'ignored'
  reason: string | null
  /** Groups multi-item package contents under one section. */
  groupId?: string | null
  valueKind: SemanticValueKindUi
  exactPatchSpan: string | null
  canonicalRule: string | null
  patchable: boolean
  temporalKind: 'absolute_date' | 'relative_duration' | 'time_of_day' | null
  semanticConfidence: number
  patchConfidence: number
  confidenceReasons: string[]
  patchPreview: PatchPreviewUi | null
}

/** Money value used by package / additional-service structures. */
export type LabMoneyValue = {
  amount: number
  currency: string
  raw?: string
}

/** Variable additional service detected or configured for a wedding. */
export type AdditionalService = {
  id: string
  name: string
  description?: string
  quantity?: number
  unitPrice?: LabMoneyValue
  totalPrice?: LabMoneyValue
}

/**
 * Replacement Plan V2 — separates wedding-variable work from template invariants.
 * Invariant fields belong in unchangedTemplateFields, never in blockers.
 */
export type ReplacementPlanV2 = {
  detectedRows: SemanticMappingRow[]
  executableReplacements: LabReplacementRow[]
  reviewItems: Array<{
    code: string
    message: string
    anchorIds?: string[]
  }>
  missingWeddingData: Array<{
    fieldKey: string
    label: string
    reason: string
  }>
  unresolvedVariableDetections: Array<{
    anchorId: string | null
    semanticRole: string | null
    status: string
  }>
  unchangedTemplateFields: Array<{
    semanticRole: string
    sourceText: string
    reason: string
  }>
  blockers: Array<{
    code: string
    message: string
  }>
  generationDecision: {
    allowed: boolean
    reasonCodes: string[]
  }
}

