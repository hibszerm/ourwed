import type {
  DocumentBlock,
  DocumentBlockCondition,
  DocumentBlockPayload,
  DocumentBlockType,
  DocumentClauseDef,
  DocumentComponent,
  DocumentComponentKind,
  DocumentComponentStatus,
  DocumentComponentVersion,
  DocumentConditionScope,
  DocumentDocType,
  DocumentDraftMoney,
  DocumentDraftStatus,
  DocumentExportFormat,
  DocumentLockStatus,
  DocumentTemplate,
  DocumentTemplateComponentLink,
  DocumentTemplateMeta,
  DocumentTemplateStatus,
  DocumentTemplateVersion,
  DocumentVariableDataSource,
  DocumentVariableDef,
  DocumentVariableSection,
  DocumentVariableValueType,
  PackageSnapshot,
  PackageSnapshotItem,
  WeddingDocument,
  WeddingDocumentDraft,
} from '@/types/documents'
import {
  emptyDraftMoney,
  emptyPackageSnapshot,
} from '@/types/documents'

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface TemplateRow {
  id: string
  user_id: string
  name: string
  description: string | null
  doc_type: DocumentDocType
  category: string | null
  status: DocumentTemplateStatus
  is_default: boolean
  current_version_id: string | null
  ai_analyzed_at?: string | null
  questionnaire_form_id?: string | null
  meta?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface TemplateVersionRow {
  id: string
  template_id: string
  version_number: number
  source_docx_path: string | null
  source_file_name: string | null
  template_docx_path?: string | null
  slot_map?: Record<string, unknown> | null
  definition_checksum: string | null
  locale: string
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface ComponentRow {
  id: string
  user_id: string
  kind: DocumentComponentKind
  name: string
  description: string | null
  status: DocumentComponentStatus
  current_version_id: string | null
  created_at: string
  updated_at: string
}

export interface ComponentVersionRow {
  id: string
  component_id: string
  version_number: number
  match_fingerprint: string | null
  definition_checksum: string | null
  locale: string
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface CompositionLinkRow {
  id: string
  template_version_id: string
  component_version_id: string
  sort_order: number
  instance_key: string | null
  overrides: Record<string, unknown>
  created_at: string
}

export interface BlockRow {
  id: string
  component_version_id: string
  block_type: DocumentBlockType
  sort_order: number
  payload: DocumentBlockPayload
  created_at: string
  updated_at: string
}

export interface BlockConditionRow {
  id: string
  block_id: string
  scope: DocumentConditionScope
  rule: Record<string, unknown>
  created_at: string
}

export interface ClauseRow {
  id: string
  user_id: string
  key: string
  title: string
  body: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface VariableRow {
  key: string
  section: DocumentVariableSection
  label_pl: string
  value_type: DocumentVariableValueType
  data_source: DocumentVariableDataSource
  description: string | null
  is_system: boolean
  sort_order: number
}

export interface DraftRow {
  id: string
  wedding_id: string
  template_id: string
  template_version_id: string
  title: string
  field_values: Record<string, string>
  package_snapshot: PackageSnapshot | Record<string, unknown>
  enabled_clause_ids: string[] | null
  money: DocumentDraftMoney | Record<string, unknown>
  notes: string | null
  status: DocumentDraftStatus
  created_at: string
  updated_at: string
}

export interface ExportRow {
  id: string
  wedding_id: string
  template_id: string | null
  template_version_id: string | null
  draft_id: string | null
  version_number: number
  format: DocumentExportFormat
  file_path: string
  file_name: string
  snapshot_json: Record<string, unknown>
  lock_status: DocumentLockStatus
  locked_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapTemplateMeta(raw: unknown): DocumentTemplateMeta {
  if (!raw || typeof raw !== 'object') {
    return { version: 1 }
  }
  const obj = raw as Record<string, unknown>
  return {
    version: 1,
    slotBindingsReady:
      typeof obj.slotBindingsReady === 'boolean'
        ? obj.slotBindingsReady
        : undefined,
    unresolvedSlotKeys: Array.isArray(obj.unresolvedSlotKeys)
      ? obj.unresolvedSlotKeys.filter(
          (k): k is string => typeof k === 'string' && Boolean(k.trim()),
        )
      : undefined,
    coupleVariables: Array.isArray(obj.coupleVariables)
      ? (obj.coupleVariables as DocumentTemplateMeta['coupleVariables'])
      : undefined,
    studioVariables: Array.isArray(obj.studioVariables)
      ? (obj.studioVariables as DocumentTemplateMeta['studioVariables'])
      : undefined,
    packageVariables: Array.isArray(obj.packageVariables)
      ? (obj.packageVariables as DocumentTemplateMeta['packageVariables'])
      : undefined,
    defaults: Array.isArray(obj.defaults)
      ? (obj.defaults as DocumentTemplateMeta['defaults'])
      : undefined,
  }
}

export function mapTemplate(row: TemplateRow): DocumentTemplate {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    docType: row.doc_type,
    category: row.category,
    status: row.status,
    isDefault: Boolean(row.is_default),
    currentVersionId: row.current_version_id,
    aiAnalyzedAt: row.ai_analyzed_at ?? null,
    questionnaireFormId: row.questionnaire_form_id ?? null,
    meta: mapTemplateMeta(row.meta),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapTemplateVersion(row: TemplateVersionRow): DocumentTemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNumber: row.version_number,
    sourceDocxPath: row.source_docx_path,
    sourceFileName: row.source_file_name ?? null,
    templateDocxPath: row.template_docx_path ?? null,
    slotMap:
      row.slot_map && typeof row.slot_map === 'object'
        ? row.slot_map
        : { version: 1, slots: [], unmappedDynamics: [] },
    definitionChecksum: row.definition_checksum,
    locale: row.locale,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export function mapComponent(row: ComponentRow): DocumentComponent {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    status: row.status,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapComponentVersion(row: ComponentVersionRow): DocumentComponentVersion {
  return {
    id: row.id,
    componentId: row.component_id,
    versionNumber: row.version_number,
    matchFingerprint: row.match_fingerprint,
    definitionChecksum: row.definition_checksum,
    locale: row.locale,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export function mapCompositionLink(
  row: CompositionLinkRow,
): DocumentTemplateComponentLink {
  return {
    id: row.id,
    templateVersionId: row.template_version_id,
    componentVersionId: row.component_version_id,
    sortOrder: row.sort_order,
    instanceKey: row.instance_key,
    overrides: row.overrides ?? {},
    createdAt: row.created_at,
  }
}

export function mapBlock(row: BlockRow): DocumentBlock {
  return {
    id: row.id,
    componentVersionId: row.component_version_id,
    blockType: row.block_type,
    sortOrder: row.sort_order,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapBlockCondition(row: BlockConditionRow): DocumentBlockCondition {
  return {
    id: row.id,
    blockId: row.block_id,
    scope: row.scope,
    rule: row.rule ?? {},
    createdAt: row.created_at,
  }
}

export function mapClause(row: ClauseRow): DocumentClauseDef {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    title: row.title,
    body: row.body,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapVariable(row: VariableRow): DocumentVariableDef {
  return {
    key: row.key,
    section: row.section,
    labelPl: row.label_pl,
    valueType: row.value_type,
    dataSource: row.data_source,
    description: row.description ?? undefined,
    isSystem: row.is_system,
    sortOrder: row.sort_order,
  }
}

function asPackageSnapshot(raw: unknown): PackageSnapshot {
  if (!raw || typeof raw !== 'object') return emptyPackageSnapshot()
  const o = raw as Record<string, unknown>
  const itemsRaw = Array.isArray(o.items) ? o.items : []
  const items: PackageSnapshotItem[] = itemsRaw.map((item, index) => {
    const i = (item ?? {}) as Record<string, unknown>
    return {
      key: String(i.key ?? `item_${index}`),
      name: String(i.name ?? ''),
      description: i.description == null ? null : String(i.description),
      unitPrice: Number(i.unitPrice ?? i.unit_price ?? 0) || 0,
      enabled: Boolean(i.enabled ?? true),
      sortOrder: Number(i.sortOrder ?? i.sort_order ?? index) || index,
      sourceItemId:
        i.sourceItemId == null && i.source_item_id == null
          ? null
          : String(i.sourceItemId ?? i.source_item_id),
    }
  })
  return {
    packageId:
      o.packageId == null && o.package_id == null
        ? null
        : String(o.packageId ?? o.package_id),
    name: String(o.name ?? ''),
    currency: String(o.currency ?? 'PLN'),
    items,
  }
}

function asDraftMoney(raw: unknown): DocumentDraftMoney {
  if (!raw || typeof raw !== 'object') return emptyDraftMoney()
  const o = raw as Record<string, unknown>
  return emptyDraftMoney({
    price: Number(o.price ?? 0) || 0,
    deposit: Number(o.deposit ?? 0) || 0,
    remaining: Number(o.remaining ?? 0) || 0,
    discount: Number(o.discount ?? 0) || 0,
    currency: String(o.currency ?? 'PLN'),
    totalPaid:
      o.totalPaid == null && o.total_paid == null
        ? undefined
        : Number(o.totalPaid ?? o.total_paid) || 0,
  })
}

export function mapDraft(row: DraftRow): WeddingDocumentDraft {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    title: row.title,
    fieldValues: row.field_values ?? {},
    packageSnapshot: asPackageSnapshot(row.package_snapshot),
    enabledClauseIds: row.enabled_clause_ids ?? [],
    money: asDraftMoney(row.money),
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapExport(row: ExportRow): WeddingDocument {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    draftId: row.draft_id,
    versionNumber: row.version_number,
    format: row.format,
    filePath: row.file_path,
    fileName: row.file_name,
    snapshotJson: row.snapshot_json ?? {},
    lockStatus: row.lock_status,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
  }
}
