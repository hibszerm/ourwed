import { documentStorage } from '@/lib/api/documents/storage'
import { requireStudioUserId } from '@/lib/api/ownership'
import { weddingService } from '@/lib/api/weddingService'
import { hashBytes } from '@/features/documents/ai/hash'
import { createBrowserSafeId } from '@/lib/utils/createBrowserSafeId'
import { ContractRecoveryError } from './errors'
import { weddingContractRecoveryRepository } from './repository'
import {
  assertValidSourceContractFile,
  sanitizeStoredFileName,
} from './validateSourceFile'

/** Store an external document with its wedding without creating or running a recovery. */
export async function storeSourceContractOnly(weddingId: string, file: File) {
  const validation = assertValidSourceContractFile(file)
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) throw new ContractRecoveryError('CONTRACT_RECOVERY_NOT_FOUND')

  const contentHash = await hashBytes(await file.arrayBuffer())
  const userId = await requireStudioUserId()
  const existing = await weddingContractRecoveryRepository.findSourceContractByContentHash(
    weddingId,
    contentHash,
  )
  if (existing) throw new ContractRecoveryError('CONTRACT_RECOVERY_DUPLICATE_SOURCE')

  const sourceContractId = createBrowserSafeId()
  const storedFileName = sanitizeStoredFileName(file.name, validation.extension)
  const filePath = documentStorage.paths.sourceContract(
    userId,
    weddingId,
    sourceContractId,
    storedFileName,
  )

  await documentStorage.upload(filePath, file, validation.mimeType)
  return weddingContractRecoveryRepository.createSourceContract({
    id: sourceContractId,
    weddingId,
    filePath,
    originalFileName: file.name,
    storedFileName,
    mimeType: validation.mimeType,
    fileSize: file.size,
    contentHash,
  })
}
