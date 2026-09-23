import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type ProviderTransportStage =
  | 'BEFORE_FETCH'
  | 'FETCH_PENDING'
  | 'RESPONSE_RECEIVED'
  | 'BODY_READ_PENDING'
  | 'BODY_READ_COMPLETE'
  | 'FAILED_BEFORE_RESPONSE'
  | 'FAILED_DURING_BODY_READ'

export type ProviderTransportDiagnostics = {
  stage: ProviderTransportStage
  didFetchReturnResponse: boolean
  httpStatus: number | null
  responseHeadersReceived: boolean
  bodyReadStarted: boolean
  bodyReadCompleted: boolean
  failureStage: 'before_response' | 'during_body_read' | null
  endpointHost: string | null
  errorName: string | null
  errorMessage: string | null
  errorCode: string | number | null
  causeName: string | null
  causeMessage: string | null
  causeCode: string | number | null
  errno: string | number | null
  syscall: string | null
  hostname: string | null
}

export type CapturedProviderResponse =
  | { ok: true; httpStatus: number; bodyText: string; diagnostics: ProviderTransportDiagnostics }
  | { ok: false; httpStatus: number | null; bodyText: null; diagnostics: ProviderTransportDiagnostics }

type ErrorLike = {
  name?: unknown
  message?: unknown
  code?: unknown
  cause?: unknown
  errno?: unknown
  syscall?: unknown
  hostname?: unknown
}

function recordOf(value: unknown): ErrorLike | null {
  return value !== null && typeof value === 'object' ? value as ErrorLike : null
}

function scalar(value: unknown, sensitiveValues: readonly string[]): string | number | null {
  if (typeof value === 'string') return sanitize(value, sensitiveValues)
  return typeof value === 'number' ? value : null
}

function sanitize(value: unknown, sensitiveValues: readonly string[]): string | null {
  if (typeof value !== 'string') return null
  let result = value
  for (const secret of sensitiveValues) {
    if (secret) result = result.split(secret).join('[REDACTED]')
  }
  return result
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|rk|sess)-[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED_CREDENTIAL]')
    .replace(/((?:authorization|api[-_ ]?key|token|secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
}

function errorFields(error: unknown, sensitiveValues: readonly string[]) {
  const top = recordOf(error)
  const cause = recordOf(top?.cause)
  return {
    errorName: sanitize(top?.name, sensitiveValues),
    errorMessage: sanitize(top?.message, sensitiveValues),
    errorCode: scalar(top?.code, sensitiveValues),
    causeName: sanitize(cause?.name, sensitiveValues),
    causeMessage: sanitize(cause?.message, sensitiveValues),
    causeCode: scalar(cause?.code, sensitiveValues),
    errno: scalar(top?.errno ?? cause?.errno, sensitiveValues),
    syscall: sanitize(top?.syscall ?? cause?.syscall, sensitiveValues),
    hostname: sanitize(top?.hostname ?? cause?.hostname, sensitiveValues),
  }
}

/**
 * Validation-only fetch/body capture. It never persists the URL path, request,
 * request headers, or credentials; only sanitized stage diagnostics are saved.
 */
export async function captureProviderResponseWithDiagnostics(input: {
  directory: string
  goldenId: string
  endpoint: string
  init: RequestInit
  fetcher?: typeof fetch
  sensitiveValues?: readonly string[]
}): Promise<CapturedProviderResponse> {
  const fetcher = input.fetcher ?? fetch
  const sensitiveValues = input.sensitiveValues ?? []
  let endpointHost: string | null = null
  try { endpointHost = new URL(input.endpoint).hostname } catch { /* host remains unavailable */ }

  const base: ProviderTransportDiagnostics = {
    stage: 'BEFORE_FETCH',
    didFetchReturnResponse: false,
    httpStatus: null,
    responseHeadersReceived: false,
    bodyReadStarted: false,
    bodyReadCompleted: false,
    failureStage: null,
    endpointHost,
    errorName: null,
    errorMessage: null,
    errorCode: null,
    causeName: null,
    causeMessage: null,
    causeCode: null,
    errno: null,
    syscall: null,
    hostname: null,
  }

  const persist = (diagnostics: ProviderTransportDiagnostics) => {
    mkdirSync(input.directory, { recursive: true })
    writeFileSync(
      join(input.directory, `${input.goldenId}-transport-diagnostics.json`),
      JSON.stringify(diagnostics, null, 2) + '\n',
      { encoding: 'utf8', flag: 'wx' },
    )
  }

  base.stage = 'FETCH_PENDING'
  let response: Response
  try {
    response = await fetcher(input.endpoint, input.init)
  } catch (error) {
    Object.assign(base, errorFields(error, sensitiveValues), {
      stage: 'FAILED_BEFORE_RESPONSE',
      failureStage: 'before_response',
    })
    persist(base)
    return { ok: false, httpStatus: null, bodyText: null, diagnostics: base }
  }

  base.stage = 'RESPONSE_RECEIVED'
  base.didFetchReturnResponse = true
  base.responseHeadersReceived = true
  base.httpStatus = response.status
  base.stage = 'BODY_READ_PENDING'
  base.bodyReadStarted = true
  try {
    const bodyText = await response.text()
    base.stage = 'BODY_READ_COMPLETE'
    base.bodyReadCompleted = true
    persist(base)
    return { ok: true, httpStatus: response.status, bodyText, diagnostics: base }
  } catch (error) {
    Object.assign(base, errorFields(error, sensitiveValues), {
      stage: 'FAILED_DURING_BODY_READ',
      failureStage: 'during_body_read',
    })
    persist(base)
    return { ok: false, httpStatus: response.status, bodyText: null, diagnostics: base }
  }
}
