/**
 * Documents engine — Phase 0 domain types.
 * Foundation only: no generation, preview, or mapping UI.
 */

// ---------------------------------------------------------------------------
// Lifecycle / status enums
// ---------------------------------------------------------------------------

export type DocumentTemplateStatus = 'draft' | 'ready' | 'archived'

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

export type DocumentVariableValueType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
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
  createdAt: string
  updatedAt: string
}

export interface DocumentTemplateVersion {
  id: string
  templateId: string
  versionNumber: number
  sourceDocxPath: string | null
  sourceFileName: string | null
  definitionChecksum: string | null
  locale: string
  notes: string | null
  createdBy: string | null
  createdAt: string
}

/** List/detail enrichment for Template Management (Phase 1). */
export interface DocumentTemplateSummary extends DocumentTemplate {
  currentVersionNumber: number | null
  componentCount: number
  blockCount: number
  variableCount: number
  sourceFileName: string | null
  sourceDocxPath: string | null
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
