/**
 * Aggregate structured-output size metrics — no document text or PII.
 */

import { STRUCTURED_MAPPING_JSON_SCHEMA } from './schema.ts'

/** ~4 characters per token for Latin/JSON (approximation, not model tokenizer). */
export function approximateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

export function measureLargestPropertyGroups(
  parsed: unknown,
): Record<string, number> {
  if (!parsed || typeof parsed !== 'object') return {}
  const root = parsed as Record<string, unknown>
  const groups: Record<string, number> = {}

  for (const key of ['fields', 'immutableFindings', 'warnings', 'unsupportedValues']) {
    const arr = root[key]
    if (!Array.isArray(arr)) continue
    let chars = 0
    for (const item of arr) {
      try {
        chars += JSON.stringify(item).length
      } catch {
        chars += 0
      }
    }
    groups[key] = chars
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([, a], [, b]) => b - a),
  )
}

export function buildOutputMetrics(input: {
  runId: string
  maxOutputTokens: number
  parsed?: unknown
  responseText?: string
  blockCount: number
}): Record<string, unknown> {
  const schemaJson = JSON.stringify(STRUCTURED_MAPPING_JSON_SCHEMA)
  const schemaCharacterCount = schemaJson.length
  const approximateSchemaTokens = approximateTokenCount(schemaJson)

  const fields = input.parsed &&
      typeof input.parsed === 'object' &&
      Array.isArray((input.parsed as Record<string, unknown>).fields)
    ? ((input.parsed as Record<string, unknown>).fields as unknown[])
    : []

  const fieldKeys = new Set<string>()
  for (const f of fields) {
    if (f && typeof f === 'object' && typeof (f as Record<string, unknown>).fieldKey === 'string') {
      fieldKeys.add((f as Record<string, unknown>).fieldKey as string)
    }
  }

  const responseCharacterCount = input.responseText?.length ?? 0
  const approximateResponseTokens = approximateTokenCount(input.responseText ?? '')

  return {
    runId: input.runId,
    schemaCharacterCount,
    approximateSchemaTokens,
    maxOutputTokens: input.maxOutputTokens,
    logicalFieldCount: fieldKeys.size,
    occurrenceCount: fields.length,
    responseCharacterCount,
    approximateResponseTokens,
    largestPropertyGroups: input.parsed
      ? measureLargestPropertyGroups(input.parsed)
      : {},
    blockCount: input.blockCount,
    tokenEstimateMethod: 'chars_div_4',
  }
}
