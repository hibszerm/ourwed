import { supabase } from '@/lib/supabase'
import { parseSemanticMapResponse } from './semanticMapModelContract'
import type { SemanticMapProvider, SemanticMapProviderResult } from './semanticContractGenerationService'
import type { SemanticMapProviderRequest } from './semanticMapModelContract'
import { SemanticMapTransportError, type SemanticMapTransportFailure } from './semanticMapTransportTypes'

export const SEMANTIC_MAP_EDGE_FUNCTION = 'ai-contract-semantic-map'

type EdgeErrorEnvelope = { ok?: false; error?: { code?: unknown } }
type EdgeSuccessEnvelope = { ok: true; outputText: string }
type EdgeInvoker = (body: { request: SemanticMapProviderRequest }) => Promise<{ data: unknown; error: unknown | null }>

function failureForEdgeCode(code: string | undefined): SemanticMapTransportFailure {
  if (code === 'unauthorized') return 'AUTH_FAILURE'
  if (code === 'provider_configuration') return 'PROVIDER_CONFIGURATION_FAILURE'
  if (code === 'provider_timeout') return 'PROVIDER_TIMEOUT'
  if (code === 'provider_failure') return 'PROVIDER_FAILURE'
  if (code === 'invalid_request' || code === 'provider_protocol') return 'PROTOCOL_FAILURE'
  return 'TRANSPORT_FAILURE'
}

async function edgeErrorCode(error: unknown): Promise<string | undefined> {
  if (!error || typeof error !== 'object') return undefined
  const context = (error as { context?: unknown }).context
  if (context && typeof context === 'object' && 'json' in context && typeof (context as Response).json === 'function') {
    try {
      const envelope = await (context as Response).clone().json() as EdgeErrorEnvelope
      return typeof envelope.error?.code === 'string' ? envelope.error.code : undefined
    } catch { /* classify from the safe status/name below */ }
  }
  const status = (context as { status?: unknown } | null)?.status
  if (status === 401 || status === 403) return 'unauthorized'
  return undefined
}

function parseEdgeSuccess(data: unknown): SemanticMapProviderResult {
  if (!data || typeof data !== 'object' || (data as EdgeSuccessEnvelope).ok !== true
    || typeof (data as EdgeSuccessEnvelope).outputText !== 'string') {
    throw new SemanticMapTransportError('PROTOCOL_FAILURE', 'invalid_edge_envelope')
  }
  const parsed = parseSemanticMapResponse((data as EdgeSuccessEnvelope).outputText)
  if (!parsed.ok) throw new SemanticMapTransportError('PROTOCOL_FAILURE', `strict_parse_${parsed.code}`)
  return parsed
}

export function createSemanticMapProvider(invoke: EdgeInvoker): SemanticMapProvider {
  return async (request) => {
    let result: { data: unknown; error: unknown | null }
    try {
      result = await invoke({ request })
    } catch {
      throw new SemanticMapTransportError('TRANSPORT_FAILURE', 'edge_invoke_rejected')
    }
    if (result.error) {
      const code = await edgeErrorCode(result.error)
      const failure = failureForEdgeCode(code)
      throw new SemanticMapTransportError(failure, code ?? 'edge_invoke_error')
    }
    return parseEdgeSuccess(result.data)
  }
}

export const invokeSemanticMapProvider: SemanticMapProvider = createSemanticMapProvider(
  async (body) => {
    const { data, error } = await supabase.functions.invoke(SEMANTIC_MAP_EDGE_FUNCTION, { body })
    return { data, error }
  },
)
