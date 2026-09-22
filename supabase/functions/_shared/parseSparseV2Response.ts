/**
 * Parse sparse changedBlocks from Responses API text.
 * Model schema is sparse changedBlocks plus grounded semantic evidence; application responseVersion is injected.
 */

import {
  buildJsonParseDiagnostics,
  extractResponseText,
  stripOuterMarkdownFence,
  type JsonParseDiagnostics,
  type ResponseTextExtractionResult,
} from './extractResponseText.ts'

export const MODEL_SCHEMA_VERSION = 'sparse-changed-blocks-v1'

export type SparseChangedBlock = { blockId: string; text: string }
export type SparseDateEvidence = { sourceBlockId: string; dateConcept: 'wedding_date' | 'execution_date' }

/** Raw model result — no responseVersion. */
export type SparseChangedBlocksModelResult = {
  changedBlocks: SparseChangedBlock[]
  financeEvidence: Array<{ sourceBlockId: string; financeConcept: 'total' | 'deposit' | 'remaining' }> | null
  dateEvidence: SparseDateEvidence[] | null
}

export type SparseParseSuccess = {
  ok: true
  changedBlocks: SparseChangedBlock[]
  dateEvidence: SparseDateEvidence[]
  /** Trusted version injected by application code. */
  applicationResponseVersion: string
  modelSchemaVersion: typeof MODEL_SCHEMA_VERSION
  extraction: ResponseTextExtractionResult
  recoveredFromMarkdownFence: boolean
  /** Present only in development diagnostics for legacy payloads. */
  ignoredModelResponseVersion?: string | null
}

export type SparseParseFailure = {
  ok: false
  code:
    | 'structured_output_text_missing'
    | 'structured_output_json_invalid'
    | 'structured_output_schema_invalid'
    | 'structured_output_refusal'
    | 'incomplete_response'
  message: string
  retryable: boolean
  extraction: ResponseTextExtractionResult
  parseDiagnostics?: JsonParseDiagnostics
  recoveredFromMarkdownFence?: boolean
  incompleteReason?: string
  ignoredModelResponseVersion?: string | null
}

export type SparseParseResult = SparseParseSuccess | SparseParseFailure

/**
 * Validate raw model JSON. Allows optional legacy responseVersion (ignored).
 * Rejects any other additional properties.
 */
export function validateSparseChangedBlocksModelResult(
  parsed: unknown,
):
  | {
      ok: true
      changedBlocks: SparseChangedBlock[]
      dateEvidence: SparseDateEvidence[]
      ignoredModelResponseVersion: string | null
    }
  | { ok: false; message: string; ignoredModelResponseVersion?: string | null } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Root must be an object' }
  }
  const obj = parsed as Record<string, unknown>
  let ignoredModelResponseVersion: string | null = null

  for (const key of Object.keys(obj)) {
    if (key === 'changedBlocks' || key === 'financeEvidence' || key === 'dateEvidence') continue
    if (key === 'responseVersion') {
      // Legacy model field — ignore; never trust for application envelope
      ignoredModelResponseVersion =
        typeof obj.responseVersion === 'string' ? obj.responseVersion : null
      continue
    }
    return { ok: false, message: `Unexpected field: ${key}` }
  }

  if (!Array.isArray(obj.changedBlocks)) {
    return {
      ok: false,
      message: 'changedBlocks must be an array',
      ignoredModelResponseVersion,
    }
  }

  const changedBlocks: SparseChangedBlock[] = []
  for (const row of obj.changedBlocks) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { ok: false, message: 'Invalid changed block' }
    }
    const b = row as Record<string, unknown>
    for (const key of Object.keys(b)) {
      if (key !== 'blockId' && key !== 'text') {
        return { ok: false, message: `Unexpected block field: ${key}` }
      }
    }
    if (typeof b.blockId !== 'string' || typeof b.text !== 'string') {
      return { ok: false, message: 'blockId and text required' }
    }
    changedBlocks.push({ blockId: b.blockId, text: b.text })
  }

  if (!Object.prototype.hasOwnProperty.call(obj, 'financeEvidence')) {
    return { ok: false, message: 'Missing financeEvidence', ignoredModelResponseVersion }
  }
  if (obj.financeEvidence !== null && !Array.isArray(obj.financeEvidence)) {
    return { ok: false, message: 'financeEvidence must be an array or null', ignoredModelResponseVersion }
  }
  if (Array.isArray(obj.financeEvidence)) {
    for (const row of obj.financeEvidence) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return { ok: false, message: 'Invalid finance evidence', ignoredModelResponseVersion }
      const item = row as Record<string, unknown>
      if (Object.keys(item).some((key) => key !== 'sourceBlockId' && key !== 'financeConcept') || typeof item.sourceBlockId !== 'string' || !['total', 'deposit', 'remaining'].includes(String(item.financeConcept))) {
        return { ok: false, message: 'Invalid finance evidence fields', ignoredModelResponseVersion }
      }
    }
  }
  if (!Object.prototype.hasOwnProperty.call(obj, 'dateEvidence')) {
    return { ok: false, message: 'Missing dateEvidence', ignoredModelResponseVersion }
  }
  const dateEvidence: SparseDateEvidence[] = []
  if (obj.dateEvidence !== null) {
    if (!Array.isArray(obj.dateEvidence)) return { ok: false, message: 'dateEvidence must be an array or null', ignoredModelResponseVersion }
    for (const row of obj.dateEvidence) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return { ok: false, message: 'Invalid date evidence', ignoredModelResponseVersion }
      const item = row as Record<string, unknown>
      if (Object.keys(item).some((key) => key !== 'sourceBlockId' && key !== 'dateConcept') || typeof item.sourceBlockId !== 'string' || !['wedding_date', 'execution_date'].includes(String(item.dateConcept))) {
        return { ok: false, message: 'Invalid date evidence fields', ignoredModelResponseVersion }
      }
      dateEvidence.push({ sourceBlockId: item.sourceBlockId, dateConcept: item.dateConcept as SparseDateEvidence['dateConcept'] })
    }
  }

  return { ok: true, changedBlocks, dateEvidence, ignoredModelResponseVersion }
}

function readIncompleteReason(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const details = (body as Record<string, unknown>).incomplete_details
  if (details && typeof details === 'object') {
    const reason = (details as Record<string, unknown>).reason
    if (typeof reason === 'string' && reason.trim()) return reason.trim()
  }
  return undefined
}

export function parseSparseV2FromResponse(input: {
  body: unknown
  /** Trusted application response version to inject after model validation. */
  applicationResponseVersion: string
}): SparseParseResult {
  const extraction = extractResponseText(input.body)
  const status =
    input.body && typeof input.body === 'object'
      ? String((input.body as Record<string, unknown>).status ?? '')
      : ''

  if (status === 'incomplete') {
    return {
      ok: false,
      code: 'incomplete_response',
      message: 'Model returned an incomplete response',
      retryable: true,
      extraction,
      incompleteReason: readIncompleteReason(input.body),
    }
  }

  if (extraction.refusalDetected && !extraction.text) {
    return {
      ok: false,
      code: 'structured_output_refusal',
      message: 'Model refused the request',
      retryable: false,
      extraction,
    }
  }

  if (!extraction.text || !extraction.text.trim()) {
    return {
      ok: false,
      code: 'structured_output_text_missing',
      message: 'No structured output text',
      retryable: true,
      extraction,
    }
  }

  const stripped = stripOuterMarkdownFence(extraction.text)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped.text)
  } catch {
    return {
      ok: false,
      code: 'structured_output_json_invalid',
      message: 'Structured output JSON could not be parsed',
      retryable: true,
      extraction,
      recoveredFromMarkdownFence: stripped.recoveredFromMarkdownFence,
      parseDiagnostics: buildJsonParseDiagnostics(
        stripped.text,
        extraction.outputItemTypes,
        stripped.recoveredFromMarkdownFence,
      ),
    }
  }

  const schema = validateSparseChangedBlocksModelResult(parsed)
  if (!schema.ok) {
    return {
      ok: false,
      code: 'structured_output_schema_invalid',
      message: schema.message,
      retryable: false,
      extraction,
      recoveredFromMarkdownFence: stripped.recoveredFromMarkdownFence,
      ignoredModelResponseVersion: schema.ignoredModelResponseVersion ?? null,
    }
  }

  return {
    ok: true,
    changedBlocks: schema.changedBlocks,
    dateEvidence: schema.dateEvidence,
    applicationResponseVersion: input.applicationResponseVersion,
    modelSchemaVersion: MODEL_SCHEMA_VERSION,
    extraction,
    recoveredFromMarkdownFence: stripped.recoveredFromMarkdownFence,
    ignoredModelResponseVersion: schema.ignoredModelResponseVersion,
  }
}

/** Retry when completed response has missing text or invalid JSON (not schema/refusal). */
export function shouldRetryParseFailure(input: {
  attempt: number
  status: string
  parse: SparseParseResult
}): boolean {
  if (input.attempt !== 1) return false
  if (input.status !== 'completed') return false
  if (input.parse.ok) return false
  if (input.parse.extraction.refusalDetected) return false
  return (
    input.parse.code === 'structured_output_text_missing' ||
    input.parse.code === 'structured_output_json_invalid'
  )
}

export const PARSE_RETRY_HINT =
  'Return only the JSON object matching the supplied schema. Do not include markdown or explanatory text.'
