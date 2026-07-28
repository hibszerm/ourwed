import { documentStorage } from '@/lib/api/documents/storage'
import { weddingService } from '@/lib/api/weddingService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { persistWeddingContractAnswerFields } from '@/lib/forms/persistWeddingContractAnswers'
import { hashBytes } from '@/features/documents/ai/hash'
import { requireStudioUserId } from '@/lib/api/ownership'
import { analyzeWeddingContractRecovery } from './analyzeApi'
import { buildRecoveryProposal, applyDecisionsToProposal, APPLYABLE_FIELD_KEYS } from './buildComparisonProposal'
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

  const sourceContractId = crypto.randomUUID()
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

  const recovery = await weddingContractRecoveryRepository.createRecovery({
    weddingId,
    sourceContractId: sourceContract.id,
    extractionVersion: WEDDING_CONTRACT_RECOVERY_VERSION,
    promptVersion: WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
    weddingUpdatedAtSnapshot: weddingUpdatedAt,
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

  const recovery = await weddingContractRecoveryRepository.createRecovery({
    weddingId: sourceContract.weddingId,
    sourceContractId,
    extractionVersion: WEDDING_CONTRACT_RECOVERY_VERSION,
    promptVersion: WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
    weddingUpdatedAtSnapshot: weddingUpdatedAt,
    supersededById: previous?.id ?? null,
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
  const recovery = await weddingContractRecoveryRepository.getRecovery(input.recoveryId)
  if (!recovery) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')
  if (recovery.status === 'applied') {
    throw new ContractRecoveryError('CONTRACT_RECOVERY_ALREADY_APPLIED')
  }
  if (recovery.status !== 'ready_for_review') {
    throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')
  }

  const wedding = await weddingService.getById(input.weddingId)
  if (!wedding) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  if (
    recovery.weddingUpdatedAtSnapshot &&
    (await weddingContractRecoveryRepository.getWeddingUpdatedAt(input.weddingId)) !==
      recovery.weddingUpdatedAtSnapshot
  ) {
    throw new ContractRecoveryError('CONTRACT_RECOVERY_WEDDING_CHANGED')
  }

  const proposal = applyDecisionsToProposal(
    recovery.comparisonProposal!,
    input.decisions,
    input.includePackageSnapshot,
  )

  await weddingContractRecoveryRepository.updateRecovery(input.recoveryId, {
    status: 'applying',
  })

  const appliedFieldKeys: string[] = []
  const skippedFieldKeys: string[] = []
  const auditRows: Array<{
    fieldKey: string
    action: string
    previousValue: unknown
    approvedValue: unknown
  }> = []

  const weddingPatch = { ...wedding }
  const locationUpdates: Array<{ role: 'ceremony' | 'reception' | 'bride_preparation' | 'groom_preparation'; text: string }> = []

  for (const field of proposal.fields) {
    if (!APPLYABLE_FIELD_KEYS.has(field.fieldKey)) continue
    if (field.selectedAction !== 'use_extracted') {
      skippedFieldKeys.push(field.fieldKey)
      auditRows.push({
        fieldKey: field.fieldKey,
        action: field.selectedAction,
        previousValue: field.currentValue,
        approvedValue: null,
      })
      continue
    }

    const value = field.normalizedExtractedValue
    auditRows.push({
      fieldKey: field.fieldKey,
      action: 'use_extracted',
      previousValue: field.currentValue,
      approvedValue: value,
    })
    appliedFieldKeys.push(field.fieldKey)

    switch (field.fieldKey) {
      case 'partner1.fullName':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1: String(value ?? ''),
        }
        break
      case 'partner1.firstName':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1FirstName: String(value ?? ''),
        }
        break
      case 'partner1.lastName':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1LastName: String(value ?? ''),
        }
        break
      case 'partner2.fullName':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner2: String(value ?? ''),
        }
        break
      case 'partner2.firstName':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner2FirstName: String(value ?? ''),
        }
        break
      case 'partner2.lastName':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner2LastName: String(value ?? ''),
        }
        break
      case 'partner1.email':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1Email: String(value ?? ''),
          email: String(value ?? ''),
        }
        break
      case 'partner1.phone':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1Phone: String(value ?? ''),
          phone: String(value ?? ''),
        }
        break
      case 'partner1.addressLine':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1Address: String(value ?? ''),
        }
        break
      case 'partner1.postalCode':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1PostalCode: String(value ?? ''),
        }
        break
      case 'partner1.city':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner1City: String(value ?? ''),
          city: String(value ?? ''),
        }
        break
      case 'partner2.email':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner2Email: String(value ?? ''),
        }
        break
      case 'partner2.phone':
        weddingPatch.couple = {
          ...weddingPatch.couple,
          partner2Phone: String(value ?? ''),
        }
        break
      case 'wedding.date':
        weddingPatch.date = String(value ?? '')
        break
      case 'wedding.ceremonyTime':
        weddingPatch.ceremonyTime = String(value ?? '')
        break
      case 'location.ceremony':
        weddingPatch.ceremonyLocation = String(value ?? '')
        locationUpdates.push({ role: 'ceremony', text: String(value ?? '') })
        break
      case 'location.reception':
        weddingPatch.receptionLocation = String(value ?? '')
        locationUpdates.push({ role: 'reception', text: String(value ?? '') })
        break
      case 'location.bridePreparation':
        weddingPatch.bridePreparationLocation = String(value ?? '')
        locationUpdates.push({ role: 'bride_preparation', text: String(value ?? '') })
        break
      case 'location.groomPreparation':
        weddingPatch.groomPreparationLocation = String(value ?? '')
        locationUpdates.push({ role: 'groom_preparation', text: String(value ?? '') })
        break
      case 'finances.contractValue':
        weddingPatch.price = Number(value ?? 0)
        break
      case 'finances.depositAmount':
        weddingPatch.depositAmount = Number(value ?? 0)
        break
      case 'finances.currency':
        weddingPatch.currency = String(value ?? 'PLN')
        break
      case 'finances.finalPaymentDueDate':
        weddingPatch.finalPaymentDueDate = String(value ?? '')
        break
      case 'package.name':
        weddingPatch.packageName = String(value ?? '')
        break
      default:
        break
    }
  }

  try {
    await weddingService.update(weddingPatch)
    await persistWeddingContractAnswerFields(weddingPatch)

    if (locationUpdates.length > 0) {
      const locMap = {
        ceremony: weddingPatch.ceremonyLocation,
        reception: weddingPatch.receptionLocation,
        bridePreparation: weddingPatch.bridePreparationLocation,
        groomPreparation: weddingPatch.groomPreparationLocation,
      }
      await weddingPlaceService.syncCoreFromText(wedding.id, locMap)
    }

    let packageSnapshotId: string | null = null
    if (
      proposal.packageSnapshotProposal &&
      proposal.packageSnapshotProposal.selectedAction === 'use_extracted'
    ) {
      const snap = await weddingContractRecoveryRepository.createPackageSnapshot({
        weddingId: wedding.id,
        sourceContractId: input.sourceContractId,
        recoveryId: input.recoveryId,
        name: proposal.packageSnapshotProposal.name,
        originalDescription: proposal.packageSnapshotProposal.originalDescription,
        includedItems: proposal.packageSnapshotProposal.includedItems,
        coverageHours: proposal.packageSnapshotProposal.coverageHours,
        deliveryDeadlineText: proposal.packageSnapshotProposal.deliveryDeadlineText,
        metadata: {
          source: 'contract_recovery',
          coverageTimeRange: proposal.packageSnapshotProposal.coverageTimeRange,
          recoveryVersion: proposal.version,
        },
      })
      packageSnapshotId = snap.id

      const items = proposal.packageSnapshotProposal.includedItems.map((title, index) => ({
        sourceItemId: null,
        title,
        description: null,
        sortOrder: index,
        enabled: true,
      }))
      await weddingService.update({
        ...weddingPatch,
        packageItems: items,
        coverageHours: proposal.packageSnapshotProposal.coverageHours,
      })
    }

    await weddingContractRecoveryRepository.insertDecisions(input.recoveryId, auditRows)

    const appliedAt = new Date().toISOString()
    await weddingContractRecoveryRepository.updateRecovery(input.recoveryId, {
      status: 'applied',
      appliedAt,
      comparisonProposal: proposal,
    })
    await weddingContractRecoveryRepository.updateSourceContract(input.sourceContractId, {
      status: 'applied',
    })

    return {
      appliedFieldKeys,
      packageSnapshotId,
      skippedFieldKeys,
    }
  } catch (err) {
    await weddingContractRecoveryRepository.updateRecovery(input.recoveryId, {
      status: 'ready_for_review',
    })
    throw err
  }
}

export async function uploadAnalyzeAndPrepare(
  weddingId: string,
  file: File,
): Promise<WeddingContractRecovery> {
  const { recovery } = await uploadAndStartRecovery(weddingId, file)
  return runRecoveryAnalysis(recovery.id)
}
