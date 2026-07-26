/**
 * Documents engine — Phase 0 domain types.
 * Foundation only: no generation, preview, or mapping UI.
 */

// ---------------------------------------------------------------------------
// Lifecycle / status enums
// ---------------------------------------------------------------------------

export type DocumentTemplateStatus =
  | 'draft'
  | 'ready'
  | 'incomplete'
  | 'needs_review'
  | 'archived'

/** Template category (stored as doc_type). UI: Contract / Annex / GDPR / Protocol / Other */
export type DocumentDocType =
  | 'contract'
  | 'annex'
  | 'gdpr'
  | 'delivery_protocol'
  | 'other'
  | 'invoice'

export type DocumentComponentKind =
  | 'header'
  | 'parties'
  | 'wedding_information'
  | 'package_items'
  | 'payment_summary'
  | 'copyright'
  | 'gdpr'
  | 'optional_clauses'
  | 'signature_block'
  | 'custom'

export type DocumentComponentStatus = 'draft' | 'ready' | 'archived'

export type DocumentBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'package_items'
  | 'optional_clause'
  | 'payment_summary'
  | 'signature'
  | 'page_break'

export type DocumentConditionScope = 'block' | 'component'

export type DocumentDraftStatus = 'editing' | 'ready_to_export'

export type DocumentExportFormat = 'docx' | 'pdf'

/** exported = file stored; finalized/signed/locked = terminal immutable */
export type DocumentLockStatus = 'exported' | 'finalized' | 'signed' | 'locked'

export type DocumentVariableSection =
  | 'bride'
  | 'groom'
  | 'wedding'
  | 'package'
  | 'payments'
  | 'locations'
  | 'studio'
  | 'additional'
  | 'template'

export type DocumentVariableValueType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
  | 'money'
  | 'money'

export type DocumentVariableDataSource =
  | 'wedding'
  | 'draft'
  | 'package_snapshot'
  | 'payments'
  | 'studio'
  | 'computed'

// ---------------------------------------------------------------------------
// Variable Registry
// ---------------------------------------------------------------------------

export interface DocumentVariableDef {
  key: string
  section: DocumentVariableSection
  labelPl: string
  /** Optional English label (registry labelEn). */
  labelEn?: string
  valueType: DocumentVariableValueType
  dataSource: DocumentVariableDataSource
  description?: string
  isSystem: boolean
  sortOrder: number
}

// ---------------------------------------------------------------------------
// Package snapshot (deep copy on the draft — never live catalog FKs)
// ---------------------------------------------------------------------------

export interface PackageSnapshotItem {
  key: string
  name: string
  description: string | null
  unitPrice: number
  enabled: boolean
  sortOrder: number
  /** Optional catalog item id at snapshot time (informational only). */
  sourceItemId?: string | null
}

export interface PackageSnapshot {
  packageId: string | null
  name: string
  currency: string
  items: PackageSnapshotItem[]
}

export interface DocumentDraftMoney {
  price: number
  deposit: number
  remaining: number
  discount: number
  currency: string
  totalPaid?: number
}

// ---------------------------------------------------------------------------
// Template / component / block models
// ---------------------------------------------------------------------------

export interface DocumentTemplateMeta {
  version: 1
  /** True when every required detected slot has a physical binding. */
  slotBindingsReady?: boolean
  /** Required registry keys still missing physical slots after analysis. */
  unresolvedSlotKeys?: string[]
  /** Human reasons for unresolved required keys. */
  unresolvedSlotReasons?: Array<{ key: string; reason: string }>
  /** Precise slot counters (not full registry size). */
  slotCounters?: {
    detectedSlotCount: number
    requiredSlotCount: number
    optionalSlotCount: number
    boundRequiredSlotCount: number
    unresolvedRequiredSlotCount: number
    ambiguousSlotCount: number
    falsePositiveCount: number
    detectedAutomatically?: number
    needsConfirmationCount?: number
    safeBindingsCount?: number
    unsafeBindingsCount?: number
    itemsRequiringReviewCount?: number
    unresolvedRequiredConceptsCount?: number
  }
  analysisWarnings?: string[]
  analysisStatus?: 'complete' | 'needs_review'
  /**
   * Persisted readiness snapshot for list/picker — never recompute on read.
   * Written at upload analysis / reanalysis / config save.
   */
  generationReady?: boolean
  safeBindingCount?: number
  unsafeBindingCount?: number
  unresolvedCount?: number
  requiredMissingCount?: number
  emptyPlaceholderCount?: number
  lastAnalyzedAt?: string
  analysisVersion?: string
  readinessVersion?: string
  lifecycleStatus?: string
  /** Couple-facing slots confirmed at review (questionnaire). */
  coupleVariables?: Array<{
    id: string
    registryKey: string | null
    label: string
    enabled: boolean
    physicallyBound?: boolean
    requirement?: 'required' | 'optional'
    detectionStatus?: string
  }>
  /** Studio settings slots used by this contract (never questionnaire). */
  studioVariables?: Array<{
    id: string
    registryKey: string | null
    label: string
    enabled: boolean
    physicallyBound?: boolean
    requirement?: 'required' | 'optional'
    detectionStatus?: string
  }>
  /**
   * Package slots referenced by the contract (presence only).
   * Values always come from Studio → Packages at generation time.
   */
  packageVariables?: Array<{
    id: string
    registryKey: string
    label: string
    enabled: boolean
    physicallyBound?: boolean
    requirement?: 'required' | 'optional'
    detectionStatus?: string
  }>
  /**
   * @deprecated Never store business values on the template.
   * Kept empty for backward compatibility with older rows.
   */
  defaults?: Array<{
    id: string
    registryKey: string
    label: string
    value: string
    enabled: boolean
    valueType?: string
  }>
  /**
   * AI Contract Lab / wedding-variable field configuration.
   * Explicit user decisions for which detected fields change between bookings.
   * Stored as opaque JSON — parsed by templateFieldConfiguration helpers.
   */
  fieldConfiguration?: Record<string, unknown>
  /** Compact readiness snapshot for field configuration (list/detail). */
  fieldConfigurationStatus?:
    | 'unconfigured'
    | 'incomplete'
    | 'ready'
    | 'requires_review'
  fieldConfigurationSummary?: {
    variableCount: number
    fixedCount: number
    ignoredCount: number
    reviewCount: number
    updatedAt?: string
  }
  /**
   * Primary product readiness — independent of technical field-config labels.
   * Written after automatic analysis / legacy migration.
   */
  automaticReadinessStatus?:
    | 'analyzing'
    | 'ready'
    | 'attention'
    | 'error'
    | 'archived'
  /** Concrete human issues resolved during generation (never technical codes alone). */
  automaticAttentionIssues?: Array<{
    code: string
    message: string
  }>
  /** Optional associated package catalog id for ranking. */
  associatedPackageId?: string | null
  /** True when this template is the active package-owned contract. */
  packageContractMode?: boolean
  /** Keys detected but filtered as immutable package content. */
  packageContractFilteredKeys?: string[]
  /** User-facing readiness snapshot for package contracts. */
  packageContractReadiness?: {
    ready: boolean
    presentCategories?: string[]
    missingRequiredCategories?: string[]
    userMessage?: string | null
  }
  /** Analysis-time shared span conflicts (multiple keys on one physical span). */
  packageContractSharedSpanConflicts?: Array<{
    paragraphIndex: number
    startOffset: number
    endOffset: number
    registryKeys: string[]
  }>
  /**
   * Upload-time package contract health report (bindings, derived finance,
   * multi-location, payment numbering). Warnings do not block generation.
   */
  packageContractHealthReport?: {
    generatedAt: string
    warningCount: number
    criticalCount: number
    generationAllowed: boolean
    checks: Array<{
      id: string
      code: string
      status: 'ok' | 'warning' | 'critical'
      title: string
      message?: string
      recommendation?: string
      paragraphIndex?: number | null
      evidence?: string | null
    }>
  }
  /** User-facing template type: Foto / Video / Foto + Video / Inny */
  templateServiceType?: 'foto' | 'video' | 'foto_video' | 'other'
}

export interface DocumentTemplate {
  id: string
  userId: string
  name: string
  description: string | null
  docType: DocumentDocType
  category: string | null
  status: DocumentTemplateStatus
  isDefault: boolean
  currentVersionId: string | null
  /** When AI analysis completed (simple import flow). */
  aiAnalyzedAt: string | null
  /** Questionnaire FormDefinition created from this contract. */
  questionnaireFormId: string | null
  /**
   * Review output: couple / studio / package slots (no business values).
   * Generation merges: couple + studio settings + selected package + template.
   */
  meta: DocumentTemplateMeta
  createdAt: string
  updatedAt: string
}

export interface DocumentTemplateVersion {
  id: string
  templateId: string
  versionNumber: number
  sourceDocxPath: string | null
  sourceFileName: string | null
  /** Fillable DOCX with {{registry_id}} placeholders (template-first). */
  templateDocxPath: string | null
  /** Confirmed variable slots (parsed via parseSlotMap). */
  slotMap: Record<string, unknown>
  definitionChecksum: string | null
  locale: string
  notes: string | null
  createdBy: string | null
  createdAt: string
}

/** List/picker enrichment — lightweight; no slot_map / binary / full analysis. */
export interface DocumentTemplateSummary extends DocumentTemplate {
  currentVersionNumber: number | null
  componentCount: number
  blockCount: number
  variableCount: number
  /** How many times this template was used to generate a wedding document. */
  usageCount: number
  sourceFileName: string | null
  sourceDocxPath: string | null
  /** Derived from persisted meta — list must not recompute readiness. */
  generationReady: boolean
  detectedFieldCount: number
  safeBindingCount: number
  unresolvedCount: number
  /** True when persisted analysis/readiness version lags the app. */
  summaryStale?: boolean
  sourceFormat?: 'docx' | 'pdf'
}

export interface DocumentComponent {
  id: string
  userId: string
  kind: DocumentComponentKind
  name: string
  description: string | null
  status: DocumentComponentStatus
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentComponentVersion {
  id: string
  componentId: string
  versionNumber: number
  /** Fingerprint for safe DOCX rematch across template updates. */
  matchFingerprint: string | null
  definitionChecksum: string | null
  locale: string
  notes: string | null
  createdBy: string | null
  createdAt: string
}

export interface DocumentTemplateComponentLink {
  id: string
  templateVersionId: string
  componentVersionId: string
  sortOrder: number
  instanceKey: string | null
  overrides: Record<string, unknown>
  createdAt: string
}

/** Signature party payload (first-class; e-sign attaches later). */
export interface SignaturePartyPayload {
  role: 'studio' | 'bride' | 'groom' | 'custom'
  label: string
  nameVariableKey?: string
  includeDateLine?: boolean
}

export type DocumentBlockPayload = Record<string, unknown> & {
  parties?: SignaturePartyPayload[]
  text?: string
  variableKeys?: string[]
  clauseKey?: string
  clauseId?: string
}

export interface DocumentBlock {
  id: string
  componentVersionId: string
  blockType: DocumentBlockType
  sortOrder: number
  payload: DocumentBlockPayload
  createdAt: string
  updatedAt: string
}

export interface DocumentBlockCondition {
  id: string
  blockId: string
  scope: DocumentConditionScope
  /** e.g. { op: 'item_enabled', itemKey: 'drone' } */
  rule: Record<string, unknown>
  createdAt: string
}

export interface DocumentClauseDef {
  id: string
  userId: string
  key: string
  title: string
  body: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Draft + export lifecycle
// ---------------------------------------------------------------------------

export interface WeddingDocumentDraft {
  id: string
  weddingId: string
  templateId: string
  templateVersionId: string
  title: string
  /** Overrides keyed by Variable Registry keys — draft only. */
  fieldValues: Record<string, string>
  packageSnapshot: PackageSnapshot
  enabledClauseIds: string[]
  money: DocumentDraftMoney
  notes: string | null
  status: DocumentDraftStatus
  createdAt: string
  updatedAt: string
}

export interface WeddingDocument {
  id: string
  weddingId: string
  templateId: string | null
  templateVersionId: string | null
  draftId: string | null
  versionNumber: number
  format: DocumentExportFormat
  filePath: string
  fileName: string
  snapshotJson: Record<string, unknown>
  lockStatus: DocumentLockStatus
  lockedAt: string | null
  createdAt: string
}

/** Document lifecycle steps (engine contract — UI comes in later phases). */
export type DocumentLifecycleStep =
  | 'choose_template'
  | 'create_draft'
  | 'review_edit'
  | 'export'
  | 'store_version'
  | 'finalize_or_sign'
  | 'new_version_after_lock'

export const DOCUMENT_LIFECYCLE_ORDER: DocumentLifecycleStep[] = [
  'choose_template',
  'create_draft',
  'review_edit',
  'export',
  'store_version',
  'finalize_or_sign',
  'new_version_after_lock',
]

export function isDocumentLocked(lockStatus: DocumentLockStatus): boolean {
  return (
    lockStatus === 'finalized' ||
    lockStatus === 'signed' ||
    lockStatus === 'locked'
  )
}

export function emptyPackageSnapshot(
  partial?: Partial<PackageSnapshot>,
): PackageSnapshot {
  return {
    packageId: null,
    name: '',
    currency: 'PLN',
    items: [],
    ...partial,
  }
}

export function emptyDraftMoney(
  partial?: Partial<DocumentDraftMoney>,
): DocumentDraftMoney {
  return {
    price: 0,
    deposit: 0,
    remaining: 0,
    discount: 0,
    currency: 'PLN',
    ...partial,
  }
}
