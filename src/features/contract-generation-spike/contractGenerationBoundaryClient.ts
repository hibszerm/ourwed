import { supabase } from '@/lib/supabase'
import { isMissingInputList, type ContractGenerationAnswer, type MissingInput } from './generationProtocol'
import type {
  ContractGenerationBoundaryResponse,
  ContractGenerationCandidateRequest,
  ContractGenerationContinueRequest,
  ContractGenerationRecoverRequest,
  ContractGenerationStartRequest,
} from './serverBoundary'

export const CONTRACT_GENERATION_BOUNDARY_FUNCTION = 'contract-generation-boundary'

type InvocationResult = { data: unknown; error: unknown | null }
type BoundaryInvoker = (body: Record<string, unknown>) => Promise<InvocationResult>

export class ContractGenerationBoundaryClientError extends Error {
  readonly code: 'unauthorized' | 'forbidden' | 'generation_safety' | 'temporary_failure'

  constructor(code: 'unauthorized' | 'forbidden' | 'generation_safety' | 'temporary_failure') {
    super(code)
    this.code = code
    this.name = 'ContractGenerationBoundaryClientError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundaryResponse(value: unknown): value is ContractGenerationBoundaryResponse {
  if (!isRecord(value) || typeof value.status !== 'string') return false
  if (value.status === 'awaiting_input') {
    return typeof value.sessionId === 'string' && isMissingInputList(value.missingInputs)
  }
  if (value.status === 'ready') {
    return typeof value.sessionId === 'string' && typeof value.candidateId === 'string'
      && typeof value.templateId === 'string' && typeof value.templateVersionId === 'string'
  }
  if (value.status === 'processing') return typeof value.sessionId === 'string'
  if (value.status === 'unresolved_conflict') return typeof value.sessionId === 'string' && typeof value.message === 'string'
  if (value.status === 'precondition') return value.code === 'setup_required'
  if (value.status === 'error') return value.code === 'unauthorized' || value.code === 'forbidden'
  if (value.status === 'stale') return value.code === 'authority_changed' || value.code === 'session_invalid'
  return value.status === 'failure' && (value.code === 'generation_safety' || value.code === 'temporary_failure')
}

function errorCode(error: unknown): ContractGenerationBoundaryClientError['code'] {
  if (!isRecord(error)) return 'temporary_failure'
  const context = error.context
  if (!isRecord(context)) return 'temporary_failure'
  if (context.status === 401) return 'unauthorized'
  if (context.status === 403) return 'forbidden'
  return 'temporary_failure'
}

export function createContractGenerationBoundaryClient(invoke: BoundaryInvoker) {
  async function call(action: string, request: Record<string, unknown>): Promise<ContractGenerationBoundaryResponse> {
    const { data, error } = await invoke({ version: 1, action, request })
    if (error) throw new ContractGenerationBoundaryClientError(errorCode(error))
    if (!isBoundaryResponse(data)) throw new ContractGenerationBoundaryClientError('generation_safety')
    return data
  }

  return {
    start(request: ContractGenerationStartRequest) {
      return call('start', request)
    },
    continue(request: ContractGenerationContinueRequest) {
      return call('continue', request)
    },
    recover(request: ContractGenerationRecoverRequest) {
      return call('recover', request)
    },
    async candidate(request: ContractGenerationCandidateRequest): Promise<ArrayBuffer> {
      const { data, error } = await invoke({ version: 1, action: 'candidate', request })
      if (error) throw new ContractGenerationBoundaryClientError(errorCode(error))
      if (data instanceof Blob) return data.arrayBuffer()
      if (data instanceof ArrayBuffer) return data
      throw new ContractGenerationBoundaryClientError('generation_safety')
    },
  }
}

const boundaryClient = createContractGenerationBoundaryClient(async (body) => {
  const { data, error } = await supabase.functions.invoke(CONTRACT_GENERATION_BOUNDARY_FUNCTION, { body })
  return { data, error }
})

export const startContractGeneration = boundaryClient.start
export const continueContractGeneration = boundaryClient.continue
export const recoverContractGeneration = boundaryClient.recover
export const downloadAcceptedContractCandidate = boundaryClient.candidate

export type { ContractGenerationAnswer, MissingInput }
