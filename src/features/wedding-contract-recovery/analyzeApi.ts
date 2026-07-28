import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ContractRecoveryError } from './errors'
import { parseContractRecoveryExtraction } from './schema/extractionSchema'
import type { ContractRecoveryExtraction } from './types'

interface EdgeSuccessBody {
  ok: true
  extraction: unknown
  aiProvider: string
  aiModel: string
  responseVersion: string
}

interface EdgeErrorBody {
  ok: false
  error: {
    code: string
    message: string
    retryable?: boolean
  }
}

export async function analyzeWeddingContractRecovery(input: {
  plainText: string
  fileName: string
  mimeType: string
  recoveryId: string
}): Promise<{
  extraction: ContractRecoveryExtraction
  aiProvider: string
  aiModel: string
  responseVersion: string
}> {
  const { data, error } = await supabase.functions.invoke('wedding-contract-recovery-analyze', {
    body: {
      plainText: input.plainText,
      fileName: input.fileName,
      mimeType: input.mimeType,
      recoveryId: input.recoveryId,
    },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as EdgeErrorBody | null
      const code = body?.error?.code
      if (code === 'CONTRACT_RECOVERY_AI_FAILED') {
        throw new ContractRecoveryError('CONTRACT_RECOVERY_AI_FAILED', body?.error?.message)
      }
      if (code === 'CONTRACT_RECOVERY_INVALID_AI_OUTPUT') {
        throw new ContractRecoveryError(
          'CONTRACT_RECOVERY_INVALID_AI_OUTPUT',
          body?.error?.message,
        )
      }
      if (code === 'CONTRACT_RECOVERY_UNAUTHORIZED') {
        throw new ContractRecoveryError('CONTRACT_RECOVERY_UNAUTHORIZED')
      }
    }
    throw new ContractRecoveryError('CONTRACT_RECOVERY_AI_FAILED')
  }

  const body = data as EdgeSuccessBody | EdgeErrorBody
  if (!body || typeof body !== 'object' || !('ok' in body)) {
    throw new ContractRecoveryError('CONTRACT_RECOVERY_INVALID_AI_OUTPUT')
  }
  if (!body.ok) {
    const code = body.error.code
    if (
      code === 'CONTRACT_RECOVERY_AI_FAILED' ||
      code === 'CONTRACT_RECOVERY_INVALID_AI_OUTPUT' ||
      code === 'CONTRACT_RECOVERY_UNAUTHORIZED'
    ) {
      throw new ContractRecoveryError(code, body.error.message)
    }
    throw new ContractRecoveryError('CONTRACT_RECOVERY_AI_FAILED', body.error.message)
  }

  const extraction = parseContractRecoveryExtraction(body.extraction)
  return {
    extraction,
    aiProvider: body.aiProvider,
    aiModel: body.aiModel,
    responseVersion: body.responseVersion,
  }
}
