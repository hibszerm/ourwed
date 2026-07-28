/**
 * Null-safe OpenAI Responses API usage parsing for contract recovery.
 * Never throws; never includes document content.
 */

export type RecoveryProviderUsage = {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Read usage from Responses API (and light Chat Completions-shaped fallbacks).
 */
export function readRecoveryProviderUsage(
  response: unknown,
): RecoveryProviderUsage {
  const empty: RecoveryProviderUsage = {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
  }

  try {
    if (!isObject(response)) return empty
    const usage = isObject(response.usage) ? response.usage : null
    if (!usage) return empty

    const inputTokens =
      asFiniteNumber(usage.input_tokens) ??
      asFiniteNumber(usage.prompt_tokens) ??
      null
    const outputTokens =
      asFiniteNumber(usage.output_tokens) ??
      asFiniteNumber(usage.completion_tokens) ??
      null
    const totalTokens =
      asFiniteNumber(usage.total_tokens) ??
      (inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : null)

    const inputDetails = isObject(usage.input_tokens_details)
      ? usage.input_tokens_details
      : isObject(usage.prompt_tokens_details)
        ? usage.prompt_tokens_details
        : null
    const outputDetails = isObject(usage.output_tokens_details)
      ? usage.output_tokens_details
      : isObject(usage.completion_tokens_details)
        ? usage.completion_tokens_details
        : null

    const cachedInputTokens =
      asFiniteNumber(inputDetails?.cached_tokens) ??
      asFiniteNumber(usage.cached_input_tokens) ??
      asFiniteNumber(usage.cache_read_input_tokens) ??
      null

    const reasoningTokens =
      asFiniteNumber(outputDetails?.reasoning_tokens) ??
      asFiniteNumber(usage.reasoning_tokens) ??
      null

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      cachedInputTokens,
      reasoningTokens,
    }
  } catch {
    return empty
  }
}

export type RecoveryExtractionTelemetry = {
  nonNullFieldCount: number
  warningCount: number
  lowConfidenceFieldCount: number
}

/**
 * Count extraction metrics without reading quote text into logs.
 */
export function summarizeExtractionTelemetry(
  extraction: unknown,
): RecoveryExtractionTelemetry {
  let nonNullFieldCount = 0
  let warningCount = 0
  let lowConfidenceFieldCount = 0

  const walk = (node: unknown): void => {
    if (node == null) return
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === 'object' && 'text' in item) {
          const row = item as { text?: unknown; confidence?: unknown }
          if (typeof row.text === 'string' && row.text.trim()) {
            nonNullFieldCount += 1
            const c = asFiniteNumber(row.confidence)
            if (c != null && c > 0 && c < 0.7) lowConfidenceFieldCount += 1
          }
        } else {
          walk(item)
        }
      }
      return
    }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if ('value' in obj && 'confidence' in obj && 'evidence' in obj) {
      const value = obj.value
      if (value != null && value !== '') {
        nonNullFieldCount += 1
        const c = asFiniteNumber(obj.confidence)
        if (c != null && c > 0 && c < 0.7) lowConfidenceFieldCount += 1
      }
      if (Array.isArray(obj.warnings)) warningCount += obj.warnings.length
      return
    }
    if (Array.isArray(obj.documentWarnings)) {
      warningCount += obj.documentWarnings.length
    }
    if (Array.isArray(obj.additionalServices)) {
      for (const service of obj.additionalServices) {
        if (service && typeof service === 'object') {
          const s = service as { name?: unknown; confidence?: unknown; warnings?: unknown }
          if (typeof s.name === 'string' && s.name.trim()) {
            nonNullFieldCount += 1
            const c = asFiniteNumber(s.confidence)
            if (c != null && c > 0 && c < 0.7) lowConfidenceFieldCount += 1
          }
          if (Array.isArray(s.warnings)) warningCount += s.warnings.length
        }
      }
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'documentWarnings' || key === 'additionalServices') continue
      walk(value)
    }
  }

  try {
    walk(extraction)
  } catch {
    // never fail recovery on telemetry
  }

  return { nonNullFieldCount, warningCount, lowConfidenceFieldCount }
}

/** Safe log payload — no document text, quotes, or PII. */
export function buildRecoveryUsageLogPayload(input: {
  model: string
  usage: RecoveryProviderUsage
  documentTextLength: number
  serializedSchemaLength: number
  rawResponseCharacterLength: number
  requestPreparationDurationMs: number
  openAiDurationMs: number
  validationDurationMs: number
  totalDurationMs: number
  extraction: RecoveryExtractionTelemetry
  promptVersion: string
  responseVersion: string
  recoveryId?: string | null
}): Record<string, unknown> {
  return {
    model: input.model,
    input_tokens: input.usage.inputTokens,
    output_tokens: input.usage.outputTokens,
    total_tokens: input.usage.totalTokens,
    cached_input_tokens: input.usage.cachedInputTokens,
    reasoning_tokens: input.usage.reasoningTokens,
    document_text_length: input.documentTextLength,
    serialized_schema_length: input.serializedSchemaLength,
    raw_response_character_length: input.rawResponseCharacterLength,
    request_preparation_duration_ms: input.requestPreparationDurationMs,
    openai_duration_ms: input.openAiDurationMs,
    validation_duration_ms: input.validationDurationMs,
    total_edge_duration_ms: input.totalDurationMs,
    extracted_non_null_field_count: input.extraction.nonNullFieldCount,
    warning_count: input.extraction.warningCount,
    low_confidence_field_count: input.extraction.lowConfidenceFieldCount,
    prompt_version: input.promptVersion,
    response_version: input.responseVersion,
    recovery_id: input.recoveryId ?? null,
  }
}
