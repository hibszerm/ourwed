import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { requireStudioUserId } from '@/lib/api/ownership'
import type {
  WeddingContractPackageSnapshot,
  WeddingContractRecovery,
  WeddingSourceContract,
} from './types'
import type { ContractRecoveryErrorCode } from './errors'
import type { ContractRecoveryExtraction, RecoveryProposal } from './types'
import {
  adaptPackageSnapshotRow,
  adaptStoredExtraction,
  adaptStoredProposal,
} from './adapters'

interface SourceContractRow {
  id: string
  user_id: string
  wedding_id: string
  file_path: string
  original_file_name: string
  stored_file_name: string
  mime_type: string
  file_size: number
  content_hash: string | null
  page_count: number | null
  extraction_method: string | null
  text_availability: string | null
  status: string
  created_at: string
  updated_at: string
}

interface RecoveryRow {
  id: string
  user_id: string
  wedding_id: string
  source_contract_id: string
  status: string
  extraction_version: string
  prompt_version: string
  response_version: string | null
  ai_provider: string | null
  ai_model: string | null
  validated_extraction: unknown
  normalized_extraction: unknown
  comparison_proposal: unknown
  warnings: unknown
  failure_code: string | null
  failure_message: string | null
  wedding_updated_at_snapshot: string | null
  superseded_by_id: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

interface PackageSnapshotRow {
  id: string
  user_id: string
  wedding_id: string
  source_contract_id: string
  recovery_id: string
  name: string | null
  original_description: string | null
  included_items: unknown
  coverage_hours: number | string | null
  delivery_deadline_text: string | null
  metadata: unknown
  created_at: string
  updated_at: string
}

function mapSourceContract(row: SourceContractRow): WeddingSourceContract {
  return {
    id: row.id,
    userId: row.user_id,
    weddingId: row.wedding_id,
    filePath: row.file_path,
    originalFileName: row.original_file_name,
    storedFileName: row.stored_file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    contentHash: row.content_hash,
    pageCount: row.page_count,
    extractionMethod: row.extraction_method,
    textAvailability: row.text_availability as WeddingSourceContract['textAvailability'],
    status: row.status as WeddingSourceContract['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRecovery(row: RecoveryRow): WeddingContractRecovery {
  return {
    id: row.id,
    userId: row.user_id,
    weddingId: row.wedding_id,
    sourceContractId: row.source_contract_id,
    status: row.status as WeddingContractRecovery['status'],
    extractionVersion: row.extraction_version,
    promptVersion: row.prompt_version,
    responseVersion: row.response_version,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    validatedExtraction: adaptStoredExtraction(
      row.validated_extraction as ContractRecoveryExtraction | null,
    ),
    normalizedExtraction: adaptStoredExtraction(
      row.normalized_extraction as ContractRecoveryExtraction | null,
    ),
    comparisonProposal: adaptStoredProposal(
      row.comparison_proposal as RecoveryProposal | null,
    ),
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    failureCode: row.failure_code as ContractRecoveryErrorCode | null,
    failureMessage: row.failure_message,
    weddingUpdatedAtSnapshot: row.wedding_updated_at_snapshot,
    supersededById: row.superseded_by_id,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPackageSnapshot(row: PackageSnapshotRow): WeddingContractPackageSnapshot {
  return adaptPackageSnapshotRow({
    id: row.id,
    userId: row.user_id,
    weddingId: row.wedding_id,
    sourceContractId: row.source_contract_id,
    recoveryId: row.recovery_id,
    name: row.name,
    originalDescription: row.original_description,
    includedItems: Array.isArray(row.included_items)
      ? (row.included_items as string[])
      : [],
    coverageHours:
      row.coverage_hours == null ? null : Number(row.coverage_hours),
    deliveryDeadlineText: row.delivery_deadline_text,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export const weddingContractRecoveryRepository = {
  async getWeddingUpdatedAt(weddingId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('weddings')
      .select('updated_at')
      .eq('id', weddingId)
      .maybeSingle()
    throwOnError(error)
    return data?.updated_at ?? null
  },

  async createSourceContract(input: {
    id: string
    weddingId: string
    filePath: string
    originalFileName: string
    storedFileName: string
    mimeType: string
    fileSize: number
    contentHash: string
  }): Promise<WeddingSourceContract> {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('wedding_source_contracts')
      .insert({
        id: input.id,
        user_id: userId,
        wedding_id: input.weddingId,
        file_path: input.filePath,
        original_file_name: input.originalFileName,
        stored_file_name: input.storedFileName,
        mime_type: input.mimeType,
        file_size: input.fileSize,
        content_hash: input.contentHash,
        status: 'uploaded',
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapSourceContract(data as SourceContractRow)
  },

  async updateSourceContract(
    id: string,
    patch: Partial<{
      status: string
      pageCount: number | null
      extractionMethod: string | null
      textAvailability: string | null
    }>,
  ): Promise<void> {
    const { error } = await supabase
      .from('wedding_source_contracts')
      .update({
        status: patch.status,
        page_count: patch.pageCount,
        extraction_method: patch.extractionMethod,
        text_availability: patch.textAvailability,
      })
      .eq('id', id)
    throwOnError(error)
  },

  async listSourceContractsByWedding(
    weddingId: string,
  ): Promise<WeddingSourceContract[]> {
    const { data, error } = await supabase
      .from('wedding_source_contracts')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('created_at', { ascending: false })
    throwOnError(error)
    return (data as SourceContractRow[]).map(mapSourceContract)
  },

  async getSourceContract(id: string): Promise<WeddingSourceContract | null> {
    const { data, error } = await supabase
      .from('wedding_source_contracts')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    throwOnError(error)
    return data ? mapSourceContract(data as SourceContractRow) : null
  },

  async createRecovery(input: {
    weddingId: string
    sourceContractId: string
    extractionVersion: string
    promptVersion: string
    weddingUpdatedAtSnapshot: string | null
    supersededById?: string | null
  }): Promise<WeddingContractRecovery> {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('wedding_contract_recoveries')
      .insert({
        user_id: userId,
        wedding_id: input.weddingId,
        source_contract_id: input.sourceContractId,
        status: 'uploaded',
        extraction_version: input.extractionVersion,
        prompt_version: input.promptVersion,
        wedding_updated_at_snapshot: input.weddingUpdatedAtSnapshot,
        superseded_by_id: input.supersededById ?? null,
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapRecovery(data as RecoveryRow)
  },

  async updateRecovery(
    id: string,
    patch: Partial<{
      status: string
      responseVersion: string | null
      aiProvider: string | null
      aiModel: string | null
      validatedExtraction: unknown
      normalizedExtraction: unknown
      comparisonProposal: unknown
      warnings: string[]
      failureCode: string | null
      failureMessage: string | null
      appliedAt: string | null
      supersededById: string | null
    }>,
  ): Promise<void> {
    const { error } = await supabase
      .from('wedding_contract_recoveries')
      .update({
        status: patch.status,
        response_version: patch.responseVersion,
        ai_provider: patch.aiProvider,
        ai_model: patch.aiModel,
        validated_extraction: patch.validatedExtraction,
        normalized_extraction: patch.normalizedExtraction,
        comparison_proposal: patch.comparisonProposal,
        warnings: patch.warnings,
        failure_code: patch.failureCode,
        failure_message: patch.failureMessage,
        applied_at: patch.appliedAt,
        superseded_by_id: patch.supersededById,
      })
      .eq('id', id)
    throwOnError(error)
  },

  async getRecovery(id: string): Promise<WeddingContractRecovery | null> {
    const { data, error } = await supabase
      .from('wedding_contract_recoveries')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    throwOnError(error)
    return data ? mapRecovery(data as RecoveryRow) : null
  },

  async getLatestRecoveryForSourceContract(
    sourceContractId: string,
  ): Promise<WeddingContractRecovery | null> {
    const { data, error } = await supabase
      .from('wedding_contract_recoveries')
      .select('*')
      .eq('source_contract_id', sourceContractId)
      .is('superseded_by_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    throwOnError(error)
    return data ? mapRecovery(data as RecoveryRow) : null
  },

  async createPackageSnapshot(input: {
    weddingId: string
    sourceContractId: string
    recoveryId: string
    name: string | null
    originalDescription: string | null
    includedItems: string[]
    coverageHours: number | null
    deliveryDeadlineText: string | null
    metadata?: Record<string, unknown>
  }): Promise<WeddingContractPackageSnapshot> {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('wedding_contract_package_snapshots')
      .insert({
        user_id: userId,
        wedding_id: input.weddingId,
        source_contract_id: input.sourceContractId,
        recovery_id: input.recoveryId,
        name: input.name,
        original_description: input.originalDescription,
        included_items: input.includedItems,
        coverage_hours: input.coverageHours,
        delivery_deadline_text: input.deliveryDeadlineText,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapPackageSnapshot(data as PackageSnapshotRow)
  },

  async listPackageSnapshotsByWedding(
    weddingId: string,
  ): Promise<WeddingContractPackageSnapshot[]> {
    const { data, error } = await supabase
      .from('wedding_contract_package_snapshots')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('created_at', { ascending: false })
    throwOnError(error)
    return (data as PackageSnapshotRow[]).map(mapPackageSnapshot)
  },

  async insertDecisions(
    recoveryId: string,
    decisions: Array<{
      fieldKey: string
      action: string
      previousValue: unknown
      approvedValue: unknown
    }>,
  ): Promise<void> {
    const userId = await requireStudioUserId()
    if (decisions.length === 0) return
    const { error } = await supabase.from('wedding_contract_recovery_decisions').insert(
      decisions.map((d) => ({
        user_id: userId,
        recovery_id: recoveryId,
        field_key: d.fieldKey,
        action: d.action,
        previous_value: d.previousValue,
        approved_value: d.approvedValue,
      })),
    )
    throwOnError(error)
  },
}
