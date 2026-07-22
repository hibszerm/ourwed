/**
 * Documents API — Phase 0 service contracts.
 * CRUD + lifecycle metadata only. No DOCX/PDF generation or preview.
 */

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
  DocumentTemplate,
  DocumentTemplateComponentLink,
  DocumentTemplateStatus,
  DocumentTemplateSummary,
  DocumentTemplateVersion,
  DocumentVariableDef,
  PackageSnapshot,
  WeddingDocument,
  WeddingDocumentDraft,
} from '@/types/documents'

export interface CreateTemplateInput {
  name: string
  description?: string | null
  docType?: DocumentDocType
  category?: string | null
  isDefault?: boolean
}

export interface UpdateTemplateInput {
  name?: string
  description?: string | null
  docType?: DocumentDocType
  category?: string | null
  status?: DocumentTemplateStatus
  currentVersionId?: string | null
  isDefault?: boolean
}

export interface CreateTemplateVersionInput {
  templateId: string
  sourceDocxPath?: string | null
  sourceFileName?: string | null
  definitionChecksum?: string | null
  locale?: string
  notes?: string | null
  setAsCurrent?: boolean
}

export interface UploadTemplateInput {
  name: string
  description?: string | null
  docType: DocumentDocType
  file: File
  setAsDefault?: boolean
}

export interface CreateComponentInput {
  kind: DocumentComponentKind
  name: string
  description?: string | null
}

export interface UpdateComponentInput {
  name?: string
  description?: string | null
  status?: DocumentComponentStatus
  currentVersionId?: string | null
}

export interface CreateComponentVersionInput {
  componentId: string
  matchFingerprint?: string | null
  definitionChecksum?: string | null
  locale?: string
  notes?: string | null
}

export interface ComposeTemplateInput {
  templateVersionId: string
  componentVersionId: string
  sortOrder: number
  instanceKey?: string | null
  overrides?: Record<string, unknown>
}

export interface CreateBlockInput {
  componentVersionId: string
  blockType: DocumentBlockType
  sortOrder: number
  payload?: DocumentBlockPayload
}

export interface CreateBlockConditionInput {
  blockId: string
  scope?: DocumentConditionScope
  rule: Record<string, unknown>
}

export interface CreateClauseInput {
  key: string
  title: string
  body?: string
  sortOrder?: number
}

export interface CreateDraftInput {
  weddingId: string
  templateId: string
  templateVersionId: string
  title: string
  fieldValues?: Record<string, string>
  packageSnapshot: PackageSnapshot
  enabledClauseIds?: string[]
  money: DocumentDraftMoney
  notes?: string | null
}

export interface UpdateDraftInput {
  title?: string
  fieldValues?: Record<string, string>
  packageSnapshot?: PackageSnapshot
  enabledClauseIds?: string[]
  money?: DocumentDraftMoney
  notes?: string | null
  status?: DocumentDraftStatus
}

export interface CreateExportRecordInput {
  weddingId: string
  templateId: string | null
  templateVersionId: string | null
  draftId: string | null
  versionNumber: number
  format: DocumentExportFormat
  filePath: string
  fileName: string
  snapshotJson: Record<string, unknown>
}

export interface DocumentTemplateService {
  list(): Promise<DocumentTemplate[]>
  listSummaries(): Promise<DocumentTemplateSummary[]>
  get(id: string): Promise<DocumentTemplate | null>
  getSummary(id: string): Promise<DocumentTemplateSummary | null>
  create(input: CreateTemplateInput): Promise<DocumentTemplate>
  update(id: string, input: UpdateTemplateInput): Promise<DocumentTemplate>
  archive(id: string): Promise<DocumentTemplate>
  restore(id: string): Promise<DocumentTemplate>
  remove(id: string): Promise<void>
  duplicate(id: string): Promise<DocumentTemplateSummary>
  setDefault(id: string): Promise<DocumentTemplate>
  clearDefault(id: string): Promise<DocumentTemplate>
  uploadTemplate(input: UploadTemplateInput): Promise<DocumentTemplateSummary>
  uploadNewVersion(
    templateId: string,
    file: File,
    options?: { notes?: string | null; setAsCurrent?: boolean },
  ): Promise<DocumentTemplateVersion>
  listVersions(templateId: string): Promise<DocumentTemplateVersion[]>
  createVersion(input: CreateTemplateVersionInput): Promise<DocumentTemplateVersion>
  getVersion(id: string): Promise<DocumentTemplateVersion | null>
  setCurrentVersion(
    templateId: string,
    versionId: string,
  ): Promise<DocumentTemplate>
  duplicateVersion(versionId: string): Promise<DocumentTemplateVersion>
}

export interface DocumentComponentService {
  list(): Promise<DocumentComponent[]>
  get(id: string): Promise<DocumentComponent | null>
  create(input: CreateComponentInput): Promise<DocumentComponent>
  update(id: string, input: UpdateComponentInput): Promise<DocumentComponent>
  listVersions(componentId: string): Promise<DocumentComponentVersion[]>
  createVersion(input: CreateComponentVersionInput): Promise<DocumentComponentVersion>
  getVersion(id: string): Promise<DocumentComponentVersion | null>
  listComposition(
    templateVersionId: string,
  ): Promise<DocumentTemplateComponentLink[]>
  setComposition(
    templateVersionId: string,
    links: Omit<ComposeTemplateInput, 'templateVersionId'>[],
  ): Promise<DocumentTemplateComponentLink[]>
  listBlocks(componentVersionId: string): Promise<DocumentBlock[]>
  createBlock(input: CreateBlockInput): Promise<DocumentBlock>
  listConditions(blockId: string): Promise<DocumentBlockCondition[]>
  createCondition(input: CreateBlockConditionInput): Promise<DocumentBlockCondition>
}

export interface DocumentClauseService {
  list(): Promise<DocumentClauseDef[]>
  create(input: CreateClauseInput): Promise<DocumentClauseDef>
  update(
    id: string,
    input: Partial<Pick<DocumentClauseDef, 'title' | 'body' | 'isActive' | 'sortOrder'>>,
  ): Promise<DocumentClauseDef>
  remove(id: string): Promise<void>
}

export interface DocumentVariableRegistryService {
  list(): Promise<DocumentVariableDef[]>
  get(key: string): Promise<DocumentVariableDef | null>
}

export interface DocumentDraftService {
  listForWedding(weddingId: string): Promise<WeddingDocumentDraft[]>
  get(id: string): Promise<WeddingDocumentDraft | null>
  create(input: CreateDraftInput): Promise<WeddingDocumentDraft>
  update(id: string, input: UpdateDraftInput): Promise<WeddingDocumentDraft>
  remove(id: string): Promise<void>
}

export interface DocumentExportService {
  listForWedding(weddingId: string): Promise<WeddingDocument[]>
  get(id: string): Promise<WeddingDocument | null>
  /** Records an already-produced file. Does not generate DOCX/PDF. */
  recordExport(input: CreateExportRecordInput): Promise<WeddingDocument>
  finalize(id: string): Promise<WeddingDocument>
  markSigned(id: string): Promise<WeddingDocument>
  lock(id: string): Promise<WeddingDocument>
}

export interface DocumentStoragePaths {
  templateSource(userId: string, templateId: string, versionNumber: number): string
  draftAsset(userId: string, weddingId: string, draftId: string, fileName: string): string
  exportFile(
    userId: string,
    weddingId: string,
    documentId: string,
    format: DocumentExportFormat,
  ): string
}

export interface DocumentStorageService {
  paths: DocumentStoragePaths
  upload(path: string, file: Blob | File, contentType?: string): Promise<void>
  download(path: string): Promise<ArrayBuffer>
  remove(path: string): Promise<void>
  signedUrl(path: string, expiresInSeconds?: number): Promise<string>
}
