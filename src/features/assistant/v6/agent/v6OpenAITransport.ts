/**
 * V6-F1.3 — OpenAI chat.completions builder for native tools / outcomes.
 */

import { V6_NATIVE_OPENAI_TOOLS, V6_OUTCOME_JSON_SCHEMA } from './nativeTools'

function isLunaStyleChatModel(model: string): boolean {
  return model.trim() === 'gpt-5.6-luna'
}

export type V6NativeChatRequestInput = {
  model: string
  messages: Array<Record<string, unknown>>
  maxOutputTokens?: number
  /**
   * tools — domain tools, tool_choice auto (default)
   * outcome — no tools; strict final/clarify/unsupported schema
   */
  mode?: 'tools' | 'outcome'
}

export function buildV6NativeToolsRequestBody(
  input: V6NativeChatRequestInput,
): Record<string, unknown> {
  const maxOutputTokens = input.maxOutputTokens ?? 1200
  const mode = input.mode ?? 'tools'
  const base: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  }

  if (mode === 'outcome') {
    // Do NOT set tool_choice without tools — OpenAI rejects it.
    base.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'assistant_v6_outcome',
        strict: true,
        schema: V6_OUTCOME_JSON_SCHEMA,
      },
    }
  } else {
    base.tools = V6_NATIVE_OPENAI_TOOLS
    base.tool_choice = 'auto'
    base.parallel_tool_calls = false
  }

  if (isLunaStyleChatModel(input.model)) {
    base.max_completion_tokens = maxOutputTokens
    base.reasoning_effort = 'none'
    return base
  }
  base.temperature = 0
  base.max_tokens = maxOutputTokens
  return base
}
