/**
 * Parse sparse changedBlocks from Responses API text.
 * Model schema is changedBlocks-only; application responseVersion is injected.
 */

import {
  buildJsonParseDiagnostics,
  extractResponseText,
  stripOuterMarkdownFence,
  type JsonParseDiagnostics,
  type ResponseTextExtractionResult,
} from './extractResponseText'

export const MODEL_SCHEMA_VERSION = 'sparse-changed-blocks-v1'

export type SparseChangedBlock = { blockId: string; text: string }

/** Raw model result — no responseVersion. */
export type SparseChangedBlocksModelResult = {
  changedBlocks: SparseChangedBlock[]
}

export type SparseParseSuccess = {
  ok: true
  changedBlocks: SparseChangedBlock[]
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
      ignoredModelResponseVersion: string | null
    }
  | { ok: false; message: string; ignoredModelResponseVersion?: string | null } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Root must be an object' }
  }
  const obj = parsed as Record<string, unknown>
  let ignoredModelResponseVersion: string | null = null

  for (const key of Object.keys(obj)) {
    if (key === 'changedBlocks') continue
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

  return { ok: true, changedBlocks, ignoredModelResponseVersion }
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
