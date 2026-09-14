/**
 * V6-F1 — Typed tool failure contract. Never weaker success.
 */

export type V6ToolFailureCode =
  | 'VALIDATION_ERROR'
  | 'UNSUPPORTED_CAPABILITY'
  | 'REFERENCE_RESOLUTION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'EXECUTION_ERROR'
  | 'STALE_COLLECTION'
  | 'OBSERVATION_ERROR'

export type V6ToolFailure = {
  ok: false
  code: V6ToolFailureCode
  detail: string
}

export type V6ToolSuccess<T> = {
  ok: true
  data: T
}

export type V6ToolResult<T> = V6ToolSuccess<T> | V6ToolFailure

export function toolFail(
  code: V6ToolFailureCode,
  detail: string,
): V6ToolFailure {
  return { ok: false, code, detail }
}
