/**
 * Capture and classify Supabase Edge Function invocation failures.
 * Does not log secrets / API keys / contract text.
 */

export type TransformEdgeErrorType =
  | 'function_not_found'
  | 'unauthorized'
  | 'missing_configuration'
  | 'provider_error'
  | 'invalid_request'
  | 'invalid_response'
  | 'network_error'
  | 'timeout'
  | 'unknown_error'

export type TransformEdgeErrorDetail = {
  mode: string
  functionName: string
  httpStatus?: number
  errorType: TransformEdgeErrorType
  message: string
  /** Edge/provider error.code when present (e.g. incomplete_response). */
  providerCode?: string
  /** Provider incomplete_details.reason when present. */
  incompleteReason?: string
  configuredMaxOutputTokens?: number
  attemptCount?: number
  responseStatus?: string
  retryable?: boolean
  /** Sanitized body excerpt — never includes Authorization headers. */
  rawResponse?: string
}

const SECRET_KEYS = /api[_-]?key|authorization|bearer|openai|secret|password|token/i

export function sanitizeRawResponse(raw: string, maxLen = 2000): string {
  let text = raw
  // Strip obvious secrets
  text = text.replace(
    /("?(?:apiKey|api_key|authorization|Authorization|Bearer)"?\s*[:=]\s*")[^"]*(")/gi,
    '$1[redacted]$2',
  )
  text = text.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
  if (SECRET_KEYS.test(text) && /sk-[A-Za-z0-9]{10,}/.test(text)) {
    text = text.replace(/sk-[A-Za-z0-9]{10,}/g, '[redacted]')
  }
  if (text.length > maxLen) return `${text.slice(0, maxLen)}…`
  return text
}

export function classifyTransformEdgeError(input: {
  httpStatus?: number
  message: string
  bodyCode?: string
  functionName?: string
}): TransformEdgeErrorType {
  const status = input.httpStatus
  const msg = (input.message || '').toLowerCase()
  const code = (input.bodyCode || '').toLowerCase()

  if (
    status === 404 ||
    code.includes('not_found') ||
    msg.includes('not found') ||
    msg.includes('function not found')
  ) {
    return 'function_not_found'
  }
  if (status === 401 || status === 403 || code === 'unauthorized' || msg.includes('unauthorized')) {
    return 'unauthorized'
  }
  if (
    code.includes('openai_api_key') ||
    code === 'missing_configuration' ||
    msg.includes('not configured') ||
    msg.includes('openai_api_key')
  ) {
    return 'missing_configuration'
  }
  if (
    code.includes('timeout') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    status === 504
  ) {
    return 'timeout'
  }
  if (
    code.includes('network') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed')
  ) {
    return 'network_error'
  }
  if (
    status === 400 ||
    code === 'invalid_request' ||
    code.includes('invalid_request')
  ) {
    return 'invalid_request'
  }
  if (
    code.includes('invalid_structured') ||
    code.includes('invalid_response') ||
    code.includes('missing_structured') ||
    msg.includes('invalid structured')
  ) {
    return 'invalid_response'
  }
  if (
    (status !== undefined && status >= 500) ||
    code.includes('provider') ||
    code === 'provider_api_error' ||
    code === 'request_failed'
  ) {
    return 'provider_error'
  }
  if (status !== undefined && status >= 400) {
    return 'provider_error'
  }
  return 'unknown_error'
}

type ParsedBody = {
  json?: Record<string, unknown>
  text?: string
  code?: string
  message?: string
}

export async function readFunctionsErrorContext(
  error: unknown,
  data: unknown,
): Promise<{
  httpStatus?: number
  body: ParsedBody
  supabaseMessage: string
}> {
  const supabaseMessage =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : error instanceof Error
        ? error.message
        : String(error ?? '')

  let httpStatus: number | undefined
  let body: ParsedBody = {}

  // Prefer Response on FunctionsHttpError.context
  const context =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: unknown }).context
      : undefined

  if (context && typeof context === 'object') {
    const response = context as {
      status?: number
      clone?: () => { text: () => Promise<string>; json: () => Promise<unknown> }
      text?: () => Promise<string>
      json?: () => Promise<unknown>
    }
    if (typeof response.status === 'number') httpStatus = response.status

    try {
      let text: string | undefined
      if (typeof response.clone === 'function') {
        text = await response.clone().text()
      } else if (typeof response.text === 'function') {
        text = await response.text()
      }
      if (text != null) {
        body.text = text
        try {
          const parsed = JSON.parse(text) as unknown
          if (parsed && typeof parsed === 'object') {
            body.json = parsed as Record<string, unknown>
          }
        } catch {
          // keep text
        }
      }
    } catch {
      // ignore body read failures
    }
  }

  // Some clients also put the parsed error body in `data`
  if (!body.json && data && typeof data === 'object') {
    body.json = data as Record<string, unknown>
  }

  if (body.json) {
    const errObj =
      body.json.error && typeof body.json.error === 'object'
        ? (body.json.error as Record<string, unknown>)
        : body.json
    if (typeof errObj.code === 'string') body.code = errObj.code
    if (typeof errObj.message === 'string') body.message = errObj.message
  }

  return { httpStatus, body, supabaseMessage }
}

function readIncompleteMeta(body: ParsedBody): {
  incompleteReason?: string
  configuredMaxOutputTokens?: number
  attemptCount?: number
  responseStatus?: string
  retryable?: boolean
} {
  const err =
    body.json?.error && typeof body.json.error === 'object'
      ? (body.json.error as Record<string, unknown>)
      : body.json
  const diagnostics =
    body.json?.diagnostics && typeof body.json.diagnostics === 'object'
      ? (body.json.diagnostics as Record<string, unknown>)
      : undefined

  const incompleteReason =
    (err && typeof err.reason === 'string' ? err.reason : undefined) ??
    (diagnostics && typeof diagnostics.incompleteReason === 'string'
      ? diagnostics.incompleteReason
      : undefined)

  const configuredMaxOutputTokens =
    (err && typeof err.configuredMaxOutputTokens === 'number'
      ? err.configuredMaxOutputTokens
      : undefined) ??
    (diagnostics && typeof diagnostics.configuredMaxOutputTokens === 'number'
      ? diagnostics.configuredMaxOutputTokens
      : undefined)

  const attemptCount =
    diagnostics && typeof diagnostics.attemptCount === 'number'
      ? diagnostics.attemptCount
      : undefined

  const responseStatus =
    diagnostics && typeof diagnostics.responseStatus === 'string'
      ? diagnostics.responseStatus
      : undefined

  const retryable =
    err && typeof err.retryable === 'boolean' ? err.retryable : undefined

  return {
    incompleteReason,
    configuredMaxOutputTokens,
    attemptCount,
    responseStatus,
    retryable,
  }
}

export async function buildTransformEdgeErrorDetail(input: {
  mode: string
  functionName: string
  error: unknown
  data?: unknown
  fallbackMessage?: string
}): Promise<TransformEdgeErrorDetail> {
  const { httpStatus, body, supabaseMessage } = await readFunctionsErrorContext(
    input.error,
    input.data,
  )

  const providerMessage =
    body.message ||
    (typeof body.json?.message === 'string' ? body.json.message : undefined) ||
    (body.text && !body.json ? body.text.trim().slice(0, 500) : undefined) ||
    input.fallbackMessage ||
    supabaseMessage ||
    'Wywołanie Edge Function nie powiodło się'

  const errorType = classifyTransformEdgeError({
    httpStatus,
    message: providerMessage || supabaseMessage,
    bodyCode: body.code,
    functionName: input.functionName,
  })

  const rawSource =
    body.text ??
    (body.json ? JSON.stringify(body.json) : undefined) ??
    (supabaseMessage || undefined)

  const meta = readIncompleteMeta(body)

  return {
    mode: input.mode,
    functionName: input.functionName,
    httpStatus,
    errorType,
    message: providerMessage,
    providerCode: body.code,
    incompleteReason: meta.incompleteReason,
    configuredMaxOutputTokens: meta.configuredMaxOutputTokens,
    attemptCount: meta.attemptCount,
    responseStatus: meta.responseStatus,
    retryable: meta.retryable,
    rawResponse: rawSource ? sanitizeRawResponse(rawSource) : undefined,
  }
}

export function edgeErrorFromThrown(input: {
  mode: string
  functionName: string
  error: unknown
}): TransformEdgeErrorDetail {
  const message =
    input.error instanceof Error
      ? input.error.message
      : String(input.error ?? 'unknown')
  const lower = message.toLowerCase()
  let errorType: TransformEdgeErrorType = 'unknown_error'
  if (lower.includes('timeout') || lower.includes('timed out')) errorType = 'timeout'
  else if (lower.includes('network') || lower.includes('fetch')) errorType = 'network_error'

  return {
    mode: input.mode,
    functionName: input.functionName,
    errorType,
    message,
    rawResponse: sanitizeRawResponse(message),
  }
}
