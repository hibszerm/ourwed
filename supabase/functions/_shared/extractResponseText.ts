/**
 * Canonical Responses API text extraction.
 * Never assumes output[0] is the assistant message.
 */

export type ResponseTextExtractionResult = {
  text: string | null
  outputItemCount: number
  outputItemTypes: string[]
  messageItemCount: number
  outputTextItemCount: number
  extractedCharacterCount: number
  usedOutputTextConvenienceProperty: boolean
  refusalDetected: boolean
}

function itemType(item: unknown): string {
  if (!item || typeof item !== 'object') return 'unknown'
  const t = (item as Record<string, unknown>).type
  return typeof t === 'string' ? t : 'unknown'
}

function isAssistantMessage(item: Record<string, unknown>): boolean {
  const type = typeof item.type === 'string' ? item.type : ''
  // Responses API: message items; some SDKs use role=assistant
  if (type === 'message' || type === 'output_message') return true
  if (item.role === 'assistant') return true
  // Some payloads omit type but have content[] with output_text
  if (Array.isArray(item.content) && !type.startsWith('reasoning')) {
    const hasOutputText = item.content.some(
      (c) =>
        c &&
        typeof c === 'object' &&
        (c as Record<string, unknown>).type === 'output_text',
    )
    if (hasOutputText && type !== 'reasoning' && type !== 'function_call') {
      return true
    }
  }
  return false
}

function collectRefusal(item: Record<string, unknown>): boolean {
  if (item.type === 'refusal') return true
  const content = Array.isArray(item.content) ? item.content : []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const p = part as Record<string, unknown>
    if (p.type === 'refusal') return true
    if (typeof p.refusal === 'string' && p.refusal.trim()) return true
  }
  return false
}

/**
 * Extract structured output text from a Responses API body.
 * Prefer output_text; otherwise join all assistant message output_text parts in order.
 */
export function extractResponseText(
  response: unknown,
): ResponseTextExtractionResult {
  const empty: ResponseTextExtractionResult = {
    text: null,
    outputItemCount: 0,
    outputItemTypes: [],
    messageItemCount: 0,
    outputTextItemCount: 0,
    extractedCharacterCount: 0,
    usedOutputTextConvenienceProperty: false,
    refusalDetected: false,
  }

  if (!response || typeof response !== 'object') return empty
  const body = response as Record<string, unknown>
  const output = Array.isArray(body.output) ? body.output : []
  const outputItemTypes = output.map(itemType)
  let refusalDetected = false
  let messageItemCount = 0
  let outputTextItemCount = 0

  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (collectRefusal(row)) refusalDetected = true
    if (isAssistantMessage(row)) messageItemCount += 1
  }

  if (typeof body.output_text === 'string' && body.output_text.trim()) {
    const text = body.output_text
    return {
      text,
      outputItemCount: output.length,
      outputItemTypes,
      messageItemCount,
      outputTextItemCount: 1,
      extractedCharacterCount: text.length,
      usedOutputTextConvenienceProperty: true,
      refusalDetected,
    }
  }

  const fragments: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (!isAssistantMessage(row)) continue
    const content = Array.isArray(row.content) ? row.content : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const piece = part as Record<string, unknown>
      if (piece.type === 'refusal') {
        refusalDetected = true
        continue
      }
      if (piece.type === 'output_text' && typeof piece.text === 'string') {
        outputTextItemCount += 1
        fragments.push(piece.text)
      }
    }
  }

  const text = fragments.length > 0 ? fragments.join('') : null
  return {
    text,
    outputItemCount: output.length,
    outputItemTypes,
    messageItemCount,
    outputTextItemCount,
    extractedCharacterCount: text?.length ?? 0,
    usedOutputTextConvenienceProperty: false,
    refusalDetected,
  }
}

export type JsonParseDiagnostics = {
  extractedCharacterCount: number
  firstNonWhitespaceCharacter: string | null
  lastNonWhitespaceCharacter: string | null
  looksLikeMarkdownFence: boolean
  looksTruncated: boolean
  outputItemTypes: string[]
  recoveredFromMarkdownFence: boolean
}

export function buildJsonParseDiagnostics(
  raw: string,
  outputItemTypes: string[],
  recoveredFromMarkdownFence: boolean,
): JsonParseDiagnostics {
  const trimmed = raw.trim()
  return {
    extractedCharacterCount: raw.length,
    firstNonWhitespaceCharacter: trimmed[0] ?? null,
    lastNonWhitespaceCharacter:
      trimmed.length > 0 ? trimmed[trimmed.length - 1]! : null,
    looksLikeMarkdownFence: /^```/.test(trimmed),
    looksTruncated:
      trimmed.length > 0 &&
      !trimmed.endsWith('}') &&
      !trimmed.endsWith(']') &&
      !trimmed.endsWith('"'),
    outputItemTypes,
    recoveredFromMarkdownFence,
  }
}

/** Strip exactly one complete outer ``` / ```json fence when present. */
export function stripOuterMarkdownFence(raw: string): {
  text: string
  recoveredFromMarkdownFence: boolean
} {
  const trimmed = raw.trim()
  const match = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i.exec(trimmed)
  if (match?.[1] != null) {
    return { text: match[1].trim(), recoveredFromMarkdownFence: true }
  }
  return { text: trimmed, recoveredFromMarkdownFence: false }
}
