/**
 * Persist in-flight contract generation runs (payment schedule gate).
 */

import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { assertWeddingOwned, requireStudioUserId } from '@/lib/api/ownership'
import { documentStorage } from '@/lib/api/documents/storage'
import type {
  DetectedPaymentSchedule,
  FriendlyQualitySummary,
} from '@/features/documents/template/payment-schedule'

export type ContractGenerationRunStatus =
  | 'processing'
  | 'manual_input_required'
  | 'ready'
  | 'failed'

export type ContractGenerationRun = {
  id: string
  weddingId: string
  draftId: string | null
  templateId: string
  templateVersionId: string
  generationStatus: ContractGenerationRunStatus
  detectedPaymentSchedule: DetectedPaymentSchedule | null
  manualPaymentSchedule: DetectedPaymentSchedule | null
  intermediateDocxPath: string | null
  finalDocxStoragePath: string | null
  finalPdfStoragePath: string | null
  qualitySummary: FriendlyQualitySummary | null
  resolvedValues: Record<string, string>
  totalContractAmount: number | null
  previewGeneratedAt: string | null
  expiresAt: string
  createdAt: string
  updatedAt: string
}

type RunRow = {
  id: string
  wedding_id: string
  draft_id: string | null
  template_id: string
  template_version_id: string
  generation_status: ContractGenerationRunStatus
  detected_payment_schedule_json: DetectedPaymentSchedule | null
  manual_payment_schedule_json: DetectedPaymentSchedule | null
  intermediate_docx_path: string | null
  final_docx_storage_path: string | null
  final_pdf_storage_path: string | null
  quality_summary_json: FriendlyQualitySummary | null
  resolved_values_json: Record<string, string>
  total_contract_amount: number | null
  preview_generated_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

function mapRun(row: RunRow): ContractGenerationRun {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    draftId: row.draft_id,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    generationStatus: row.generation_status,
    detectedPaymentSchedule: row.detected_payment_schedule_json,
    manualPaymentSchedule: row.manual_payment_schedule_json,
    intermediateDocxPath: row.intermediate_docx_path,
    finalDocxStoragePath: row.final_docx_storage_path,
    finalPdfStoragePath: row.final_pdf_storage_path,
    qualitySummary: row.quality_summary_json,
    resolvedValues: row.resolved_values_json ?? {},
    totalContractAmount: row.total_contract_amount,
    previewGeneratedAt: row.preview_generated_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const contractGenerationRunService = {
  async create(input: {
    weddingId: string
    draftId: string
    templateId: string
    templateVersionId: string
    status: ContractGenerationRunStatus
    detectedSchedule?: DetectedPaymentSchedule | null
    resolvedValues: Record<string, string>
    totalContractAmount: number
    intermediateDocxBytes?: ArrayBuffer | null
  }): Promise<ContractGenerationRun> {
    await assertWeddingOwned(input.weddingId)
    const userId = await requireStudioUserId()

    const { data, error } = await supabase
      .from('wedding_contract_generation_runs')
      .insert({
        wedding_id: input.weddingId,
        draft_id: input.draftId,
        template_id: input.templateId,
        template_version_id: input.templateVersionId,
        generation_status: input.status,
        detected_payment_schedule_json: input.detectedSchedule ?? null,
        resolved_values_json: input.resolvedValues,
        total_contract_amount: input.totalContractAmount,
      })
      .select('*')
      .single()
    throwOnError(error)
    const run = mapRun(data as RunRow)

    if (input.intermediateDocxBytes && input.intermediateDocxBytes.byteLength > 0) {
      const path = documentStorage.paths.draftAsset(
        userId,
        input.weddingId,
        input.draftId,
        `generation-run-${run.id}.docx`,
      )
      await documentStorage.upload(
        path,
        new Blob([input.intermediateDocxBytes], { type: DOCX_TYPE }),
        DOCX_TYPE,
      )
      const { data: updated, error: updErr } = await supabase
        .from('wedding_contract_generation_runs')
        .update({ intermediate_docx_path: path })
        .eq('id', run.id)
        .select('*')
        .single()
      throwOnError(updErr)
      return mapRun(updated as RunRow)
    }

    return run
  },

  async get(runId: string): Promise<ContractGenerationRun | null> {
    const { data, error } = await supabase
      .from('wedding_contract_generation_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle()
    throwOnError(error)
    if (!data) return null
    const run = mapRun(data as RunRow)
    await assertWeddingOwned(run.weddingId)
    if (new Date(run.expiresAt).getTime() < Date.now()) {
      throw new Error('Sesja generowania wygasła. Wygeneruj umowę ponownie.')
    }
    return run
  },

  async update(
    runId: string,
    patch: {
      status?: ContractGenerationRunStatus
      manualSchedule?: DetectedPaymentSchedule | null
      detectedSchedule?: DetectedPaymentSchedule | null
      qualitySummary?: FriendlyQualitySummary | null
      finalDocxPath?: string | null
      finalPdfPath?: string | null
      intermediateDocxPath?: string | null
      resolvedValues?: Record<string, string>
      previewGeneratedAt?: string | null
    },
  ): Promise<ContractGenerationRun> {
    const existing = await this.get(runId)
    if (!existing) throw new Error('Nie znaleziono sesji generowania.')
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.generation_status = patch.status
    if (patch.manualSchedule !== undefined) {
      row.manual_payment_schedule_json = patch.manualSchedule
    }
    if (patch.detectedSchedule !== undefined) {
      row.detected_payment_schedule_json = patch.detectedSchedule
    }
    if (patch.qualitySummary !== undefined) {
      row.quality_summary_json = patch.qualitySummary
    }
    if (patch.finalDocxPath !== undefined) {
      row.final_docx_storage_path = patch.finalDocxPath
    }
    if (patch.finalPdfPath !== undefined) {
      row.final_pdf_storage_path = patch.finalPdfPath
    }
    if (patch.intermediateDocxPath !== undefined) {
      row.intermediate_docx_path = patch.intermediateDocxPath
    }
    if (patch.resolvedValues !== undefined) {
      row.resolved_values_json = patch.resolvedValues
    }
    if (patch.previewGeneratedAt !== undefined) {
      row.preview_generated_at = patch.previewGeneratedAt
    }
    const { data, error } = await supabase
      .from('wedding_contract_generation_runs')
      .update(row)
      .eq('id', runId)
      .select('*')
      .single()
    throwOnError(error)
    return mapRun(data as RunRow)
  },

  async downloadIntermediateDocx(runId: string): Promise<ArrayBuffer> {
    const run = await this.get(runId)
    if (!run?.intermediateDocxPath) {
      throw new Error('Brak pośredniego dokumentu DOCX.')
    }
    return documentStorage.download(run.intermediateDocxPath)
  },

  async signedUrlForPath(path: string, expiresIn = 3600): Promise<string> {
    return documentStorage.signedUrl(path, expiresIn)
  },
}
