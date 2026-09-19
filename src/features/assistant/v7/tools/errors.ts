/**
 * V7 typed tool errors — safe for model self-correction; never raw stack/schema.
 */

export type V7ToolErrorCode =
  | 'SESSION_CLOSED'
  | 'UNKNOWN_HANDLE'
  | 'CROSS_SESSION'
  | 'CROSS_TENANT'
  | 'UNKNOWN_CONCEPT'
  | 'OPERATION_NOT_ALLOWED'
  | 'COMPARATOR_NOT_ALLOWED'
  | 'SORT_NOT_ALLOWED'
  | 'AGGREGATION_NOT_ALLOWED'
  | 'PROJECTION_NOT_ALLOWED'
  | 'PRIVACY_BLOCKED'
  | 'INVALID_DATE_BOUNDS'
  | 'LIMIT_INVALID'
  | 'ORDINAL_OUT_OF_RANGE'
  | 'UNSUPPORTED_RESOURCE_TYPE'
  | 'UNSUPPORTED_RELATION'
  | 'RESOURCE_MISMATCH'
  | 'CANDIDATE_CAP_EXCEEDED'
  | 'READ_ONLY_VIOLATION'
  | 'VALIDATION_ERROR'
  | 'IDENTITY_INJECTION_REJECTED'
  | 'TOOL_LOOP_EXCEEDED'

export type V7ToolError = {
  ok: false
  code: V7ToolErrorCode
  message: string
  concept?: string
  allowedComparators?: string[]
  allowedOperations?: string[]
  allowedAggregations?: string[]
}

export type V7ToolOk<T> = { ok: true } & T

export type V7ToolResult<T> = V7ToolOk<T> | V7ToolError

export function toolErr(
  code: V7ToolErrorCode,
  message: string,
  extra?: Partial<Omit<V7ToolError, 'ok' | 'code' | 'message'>>,
): V7ToolError {
  return { ok: false, code, message, ...extra }
}
