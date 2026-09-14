import {
  ASSISTANT_TOOL_NAMES,
  FORBIDDEN_TOOL_IDENTITY_KEYS,
  type AssistantToolName,
} from '../types'

export function isAssistantToolName(value: string): value is AssistantToolName {
  return (ASSISTANT_TOOL_NAMES as readonly string[]).includes(value)
}

/** Reject unknown tools and any payload containing forbidden identity keys. */
export function validateToolCall(input: {
  name: string
  args: unknown
}):
  | { ok: true; name: AssistantToolName; args: Record<string, unknown> }
  | { ok: false; reason: string } {
  if (!isAssistantToolName(input.name)) {
    return { ok: false, reason: 'unknown_tool' }
  }
  if (input.args == null || typeof input.args !== 'object' || Array.isArray(input.args)) {
    return { ok: false, reason: 'invalid_args' }
  }
  const args = input.args as Record<string, unknown>
  for (const key of Object.keys(args)) {
    if (
      (FORBIDDEN_TOOL_IDENTITY_KEYS as readonly string[]).includes(key) ||
      /^(user|owner|tenant)_?id$/i.test(key)
    ) {
      return { ok: false, reason: 'forbidden_identity_field' }
    }
  }
  return { ok: true, name: input.name, args }
}

export function assertNoForbiddenKeysInObject(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true
  if (Array.isArray(value)) {
    return value.every((item) => assertNoForbiddenKeysInObject(item))
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_TOOL_IDENTITY_KEYS as readonly string[]).includes(key)) {
      return false
    }
    if (!assertNoForbiddenKeysInObject(nested)) return false
  }
  return true
}
