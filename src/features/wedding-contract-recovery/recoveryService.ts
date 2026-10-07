import { documentStorage } from '@/lib/api/documents/storage'
import { supabase } from '@/lib/supabase'
import { weddingService } from '@/lib/api/weddingService'
import { createBrowserSafeId } from '@/lib/utils/createBrowserSafeId'
import { hashBytes } from '@/features/documents/ai/hash'
import { requireStudioUserId } from '@/lib/api/ownership'
import { analyzeWeddingContractRecovery } from './analyzeApi'
import { buildRecoveryProposal } from './buildComparisonProposal'
import {
  WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
  WEDDING_CONTRACT_RECOVERY_VERSION,
} from './constants'
import { ContractRecoveryError } from './errors'
import {
  extractSourceContractText,
} from './extractSourceContractText'
import { assertTextAvailable } from './textAvailability'
import { normalizeContractRecoveryExtraction } from './normalizeExtraction'
import { weddingContractRecoveryRepository } from './repository'
import {
  assertValidSourceContractFile,
  sanitizeStoredFileName,
} from './validateSourceFile'
import type {
  RecoveryApplyInput,
  RecoveryApplyResult,
  WeddingContractRecovery,
  WeddingSourceContract,
} from './types'

export async function uploadAndStartRecovery(
  weddingId: string,
  file: File,
): Promise<{ sourceContract: WeddingSourceContract; recovery: WeddingContractRecovery }> {
  const validation = assertValidSourceContractFile(file)
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  const bytes = await file.arrayBuffer()
  const contentHash = await hashBytes(bytes)
  const userId = await requireStudioUserId()
  const existingSource = await weddingContractRecoveryRepository.findSourceContractByContentHash(
    weddingId,
    contentHash,
  )
  if (existingSource) throw new ContractRecoveryError('CONTRACT_RECOVERY_DUPLICATE_SOURCE')

  const sourceContractId = createBrowserSafeId()
  const storedFileName = sanitizeStoredFileName(file.name, validation.extension)
  const filePath = documentStorage.paths.sourceContract(
    userId,
    weddingId,
    sourceContractId,
    storedFileName,
  )

  await documentStorage.upload(filePath, file, validation.mimeType)

  const sourceContract = await weddingContractRecoveryRepository.createSourceContract({
    id: sourceContractId,
    weddingId,
    filePath,
    originalFileName: file.name,
    storedFileName,
    mimeType: validation.mimeType,
    fileSize: file.size,
    contentHash,
  })

  const weddingUpdatedAt = await weddingContractRecoveryRepository.getWeddingUpdatedAt(weddingId)
  const relatedStateSnapshot = await weddingContractRecoveryRepository.getRelatedStateSnapshot(weddingId)

  const recovery = await weddingContractRecoveryRepository.createRecovery({
    weddingId,
    sourceContractId: sourceContract.id,
    extractionVersion: WEDDING_CONTRACT_RECOVERY_VERSION,
    promptVersion: WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
    weddingUpdatedAtSnapshot: weddingUpdatedAt,
    relatedStateSnapshot,
  })

  return { sourceContract, recovery }
}

export async function runRecoveryAnalysis(
  recoveryId: string,
): Promise<WeddingContractRecovery> {
  const recovery = await weddingContractRecoveryRepository.getRecovery(recoveryId)
  if (!recovery) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  const sourceContract = await weddingContractRecoveryRepository.getSourceContract(
    recovery.sourceContractId,
  )
  if (!sourceContract) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  const wedding = await weddingService.getById(recovery.weddingId)
  if (!wedding) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  try {
    await weddingContractRecoveryRepository.updateRecovery(recoveryId, {
      status: 'extracting_text',
    })
    await weddingContractRecoveryRepository.updateSourceContract(sourceContract.id, {
      status: 'extracting',
    })

    const bytes = await documentStorage.download(sourceContract.filePath)
    const extracted = await extractSourceContractText({
      bytes,
      fileName: sourceContract.originalFileName,
      mimeType: sourceContract.mimeType,
    })
    assertTextAvailable(extracted)

    await weddingContractRecoveryRepository.updateSourceContract(sourceContract.id, {
      status: 'analyzing',
      extractionMethod: extracted.extractionMethod,
      textAvailability: extracted.availability,
      pageCount: extracted.pageCount ?? null,
    })

    await weddingContractRecoveryRepository.updateRecovery(recoveryId, {
      status: 'analyzing',
    })

    const aiResult = await analyzeWeddingContractRecovery({
      plainText: extracted.plainText,
      fileName: sourceContract.originalFileName,
      mimeType: sourceContract.mimeType,
      recoveryId,
    })

    const normalized = normalizeContractRecoveryExtraction(aiResult.extraction)
    const proposal = buildRecoveryProposal(wedding, normalized)

    await weddingContractRecoveryRepository.updateRecovery(recoveryId, {
      status: 'ready_for_review',
      responseVersion: aiResult.responseVersion,
      aiProvider: aiResult.aiProvider,
      aiModel: aiResult.aiModel,
      validatedExtraction: aiResult.extraction,
      normalizedExtraction: normalized,
      comparisonProposal: proposal,
      warnings: normalized.documentWarnings,
      failureCode: null,
      failureMessage: null,
    })
    await weddingContractRecoveryRepository.updateSourceContract(sourceContract.id, {
      status: 'ready_for_review',
    })

    const updated = await weddingContractRecoveryRepository.getRecovery(recoveryId)
    if (!updated) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')
    return updated
  } catch (err) {
    const code =
      err instanceof ContractRecoveryError
        ? err.code
        : 'CONTRACT_RECOVERY_AI_FAILED'
    const message =
      err instanceof ContractRecoveryError ? err.message : 'Analiza nie powiodła się.'

    await weddingContractRecoveryRepository.updateRecovery(recoveryId, {
      status: 'failed',
      failureCode: code,
      failureMessage: message,
    })
    await weddingContractRecoveryRepository.updateSourceContract(sourceContract.id, {
      status: 'failed',
    })
    throw err
  }
}

export async function reanalyzeSourceContract(
  sourceContractId: string,
): Promise<WeddingContractRecovery> {
  const sourceContract =
    await weddingContractRecoveryRepository.getSourceContract(sourceContractId)
  if (!sourceContract) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  const wedding = await weddingService.getById(sourceContract.weddingId)
  if (!wedding) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  const previous =
    await weddingContractRecoveryRepository.getLatestRecoveryForSourceContract(
      sourceContractId,
    )

  const weddingUpdatedAt = await weddingContractRecoveryRepository.getWeddingUpdatedAt(
    sourceContract.weddingId,
  )
  const relatedStateSnapshot = await weddingContractRecoveryRepository.getRelatedStateSnapshot(sourceContract.weddingId)

  const recovery = await weddingContractRecoveryRepository.createRecovery({
    weddingId: sourceContract.weddingId,
    sourceContractId,
    extractionVersion: WEDDING_CONTRACT_RECOVERY_VERSION,
    promptVersion: WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
    weddingUpdatedAtSnapshot: weddingUpdatedAt,
    relatedStateSnapshot,
  })

  if (previous) {
    await weddingContractRecoveryRepository.updateRecovery(previous.id, {
      supersededById: recovery.id,
    })
  }

  return runRecoveryAnalysis(recovery.id)
}

export async function applyWeddingContractRecoveryProposal(
  input: RecoveryApplyInput,
): Promise<RecoveryApplyResult> {
  const { data, error } = await supabase.rpc(
    'apply_wedding_contract_recovery',
    {
      p_recovery_id: input.recoveryId,
      p_source_contract_id: input.sourceContractId,
      p_wedding_id: input.weddingId,
      p_expected_wedding_updated_at: input.expectedWeddingUpdatedAt,
      p_decisions: input.decisions,
      p_include_package: input.includePackageSnapshot,
      p_selected_extra_indexes: input.selectedExtraIndexes ?? [],
      p_selected_note_indexes: input.selectedNoteIndexes ?? [],
    },
  )
  if (error) {
    const message = String(error.message ?? '')
    if (message.includes('CONTRACT_RECOVERY_WEDDING_CHANGED')) {
      throw new ContractRecoveryError('CONTRACT_RECOVERY_WEDDING_CHANGED')
    }
    if (message.includes('CONTRACT_RECOVERY_ALREADY_APPLIED')) {
      throw new ContractRecoveryError('CONTRACT_RECOVERY_ALREADY_APPLIED')
    }
    if (message.includes('CONTRACT_RECOVERY_UNAUTHORIZED')) {
      throw new ContractRecoveryError('CONTRACT_RECOVERY_UNAUTHORIZED')
    }
    if (message.includes('CONTRACT_RECOVERY_INVALID_DECISIONS')) {
      throw new ContractRecoveryError('CONTRACT_RECOVERY_INVALID_DECISIONS')
    }
    const diagnosticCategory =
      error.code === '42804'
        ? 'rpc_type_mismatch'
        : error.code === '23514'
          ? 'rpc_constraint'
          : 'rpc_database_error'
    throw new ContractRecoveryError(
      'CONTRACT_RECOVERY_APPLY_FAILED',
      undefined,
      diagnosticCategory,
    )
  }
  const result = (data ?? {}) as {
    appliedFieldKeys?: unknown
    skippedFieldKeys?: unknown
    packageSnapshotId?: unknown
  }
  return {
    appliedFieldKeys: Array.isArray(result.appliedFieldKeys)
      ? result.appliedFieldKeys.filter((key): key is string => typeof key === 'string')
      : [],
    skippedFieldKeys: Array.isArray(result.skippedFieldKeys)
      ? result.skippedFieldKeys.filter((key): key is string => typeof key === 'string')
      : [],
    packageSnapshotId:
      typeof result.packageSnapshotId === 'string' ? result.packageSnapshotId : null,
  }
}

export async function uploadAnalyzeAndPrepare(
  weddingId: string,
  file: File,
): Promise<WeddingContractRecovery> {
  const { recovery } = await uploadAndStartRecovery(weddingId, file)
  return runRecoveryAnalysis(recovery.id)
}
