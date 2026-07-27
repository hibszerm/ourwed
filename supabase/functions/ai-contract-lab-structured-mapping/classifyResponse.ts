import type { AiMappingApiErrorCode } from './validate.ts'

export type OpenAiResponseClassification =
  | 'completed'
  | 'refused'
  | 'incomplete_response'
  | 'missing_structured_output'
  | 'invalid_structured_output'
  | 'request_failed'

export type OpenAiResponseInspection = {
  responseStatus: string | null
  incompleteReason: string | null
  outputItemTypes: string[]
  contentItemTypes: string[]
  hasExplicitRefusal: boolean
  hasOutputText: boolean
  hasParsedStructuredOutput: boolean
  structuredOutputValidationSucceeded: boolean
  finalClassification: OpenAiResponseClassification
}

export type ClassificationDiagnosticLog = {
  runId: string
  responseId: string | null
  model: string
  responseStatus: string | null
  incompleteReason: string | null
  outputItemTypes: string[]
  contentItemTypes: string[]
  hasExplicitRefusal: boolean
  hasOutputText: boolean
  hasParsedStructuredOutput: boolean
  structuredOutputValidationSucceeded: boolean
  finalClassification: OpenAiResponseClassification
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

export function collectOutputItemTypes(body: unknown): string[] {
  const response = asRecord(body)
  if (!response) return []
  const output = Array.isArray(response.output) ? response.output : []
  return output
    .map((item) => {
      const row = asRecord(item)
      return typeof row?.type === 'string' ? row.type : 'unknown'
    })
    .filter(Boolean)
}

export function collectContentItemTypes(body: unknown): string[] {
  const response = asRecord(body)
  if (!response) return []
  const output = Array.isArray(response.output) ? response.output : []
  const types: string[] = []
  for (const item of output) {
    const row = asRecord(item)
    const content = Array.isArray(row?.content) ? row.content : []
    for (const part of content) {
      const piece = asRecord(part)
      if (typeof piece?.type === 'string') types.push(piece.type)
    }
  }
  return types
}

export function hasExplicitRefusalContent(body: unknown): boolean {
  const response = asRecord(body)
  if (!response) return false

  const output = Array.isArray(response.output) ? response.output : []
  for (const item of output) {
    const row = asRecord(item)
    if (row?.type === 'refusal') return true
    const content = Array.isArray(row?.content) ? row.content : []
    for (const part of content) {
      const piece = asRecord(part)
      if (piece?.type === 'refusal') return true
    }
  }
  return false
}

export function readResponseStatus(body: unknown): string | null {
  const response = asRecord(body)
  const status = response?.status
  return typeof status === 'string' ? status : null
}

export function readIncompleteReason(body: unknown): string | null {
  const response = asRecord(body)
  const incompleteDetails = asRecord(response?.incomplete_details)
  const reason = incompleteDetails?.reason
  return typeof reason === 'string' ? reason : null
}

export function extractOutputText(body: unknown): string | null {
  const response = asRecord(body)
  if (!response) return null
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text
  }
  const output = Array.isArray(response.output) ? response.output : []
  for (const item of output) {
    const row = asRecord(item)
    if (row?.type === 'reasoning') continue
    const content = Array.isArray(row?.content) ? row.content : []
    for (const part of content) {
      const piece = asRecord(part)
      if (piece?.type === 'refusal') continue
      const text = piece?.text
      if (typeof text === 'string' && text.trim()) return text
    }
  }
  return null
}

export function inspectOpenAiResponse(input: {
  body: unknown
  parsed?: unknown
  structuredOutputValidationSucceeded?: boolean
}): OpenAiResponseInspection {
  const responseStatus = readResponseStatus(input.body)
  const incompleteReason = readIncompleteReason(input.body)
  const outputItemTypes = collectOutputItemTypes(input.body)
  const contentItemTypes = collectContentItemTypes(input.body)
  const hasExplicitRefusal = hasExplicitRefusalContent(input.body)
  const outputText = extractOutputText(input.body)
  const hasOutputText = Boolean(outputText?.trim())
  const hasParsedStructuredOutput =
    input.parsed !== undefined && input.parsed !== null
  const structuredOutputValidationSucceeded =
    input.structuredOutputValidationSucceeded ?? false

  let finalClassification: OpenAiResponseClassification = 'request_failed'

  if (hasExplicitRefusal) {
    finalClassification = 'refused'
  } else if (responseStatus === 'incomplete') {
    finalClassification = 'incomplete_response'
  } else if (responseStatus === 'failed') {
    finalClassification = 'request_failed'
  } else if (!hasOutputText) {
    finalClassification = 'missing_structured_output'
  } else if (input.parsed === undefined) {
    finalClassification = 'completed'
  } else if (!structuredOutputValidationSucceeded) {
    finalClassification = 'invalid_structured_output'
  } else {
    finalClassification = 'completed'
  }

  return {
    responseStatus,
    incompleteReason,
    outputItemTypes,
    contentItemTypes,
    hasExplicitRefusal,
    hasOutputText,
    hasParsedStructuredOutput,
    structuredOutputValidationSucceeded,
    finalClassification,
  }
}

export function classifyTransportFailure(
  body: unknown,
): OpenAiResponseClassification {
  if (hasExplicitRefusalContent(body)) return 'refused'
  if (readResponseStatus(body) === 'incomplete') return 'incomplete_response'
  if (readResponseStatus(body) === 'failed') return 'request_failed'
  if (!extractOutputText(body)) return 'missing_structured_output'
  return 'request_failed'
}

export function classificationToApiError(
  classification: OpenAiResponseClassification,
): {
  code: AiMappingApiErrorCode
  message: string
  retryable: boolean
} {
  switch (classification) {
    case 'refused':
      return {
        code: 'refused',
        message: 'Model odmówił analizy dokumentu.',
        retryable: false,
      }
    case 'incomplete_response':
      return {
        code: 'incomplete_response',
        message:
          'Analiza OpenAI zakończyła się przed wygenerowaniem pełnej odpowiedzi.',
        retryable: true,
      }
    case 'missing_structured_output':
      return {
        code: 'missing_structured_output',
        message: 'OpenAI nie zwróciło strukturyzowanej odpowiedzi.',
        retryable: true,
      }
    case 'invalid_structured_output':
      return {
        code: 'invalid_structured_output',
        message: 'Odpowiedź OpenAI nie przeszła walidacji struktury.',
        retryable: false,
      }
    case 'completed':
      return {
        code: 'request_failed',
        message: 'Nieoczekiwany stan odpowiedzi OpenAI.',
        retryable: false,
      }
    case 'request_failed':
    default:
      return {
        code: 'request_failed',
        message:
          'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
        retryable: true,
      }
  }
}

export function buildClassificationDiagnosticLog(input: {
  runId: string
  responseId: string | null
  model: string
  inspection: OpenAiResponseInspection
}): ClassificationDiagnosticLog {
  return {
    runId: input.runId,
    responseId: input.responseId,
    model: input.model,
    responseStatus: input.inspection.responseStatus,
    incompleteReason: input.inspection.incompleteReason,
    outputItemTypes: input.inspection.outputItemTypes,
    contentItemTypes: input.inspection.contentItemTypes,
    hasExplicitRefusal: input.inspection.hasExplicitRefusal,
    hasOutputText: input.inspection.hasOutputText,
    hasParsedStructuredOutput: input.inspection.hasParsedStructuredOutput,
    structuredOutputValidationSucceeded:
      input.inspection.structuredOutputValidationSucceeded,
    finalClassification: input.inspection.finalClassification,
  }
}
