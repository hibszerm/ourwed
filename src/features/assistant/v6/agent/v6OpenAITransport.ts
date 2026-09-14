/**
 * V6-F1.2 — OpenAI chat.completions request builder for native tools.
 * Independent of V5 GoalSpec response_format helper.
 */

import { V6_NATIVE_OPENAI_TOOLS } from './nativeTools'

function isLunaStyleChatModel(model: string): boolean {
  return model.trim() === 'gpt-5.6-luna'
}

export type V6NativeChatRequestInput = {
  model: string
  messages: Array<Record<string, unknown>>
  maxOutputTokens?: number
}

export function buildV6NativeToolsRequestBody(
  input: V6NativeChatRequestInput,
): Record<string, unknown> {
  const maxOutputTokens = input.maxOutputTokens ?? 1200
  const base: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    tools: V6_NATIVE_OPENAI_TOOLS,
    tool_choice: 'auto',
    parallel_tool_calls: false,
  }
  if (isLunaStyleChatModel(input.model)) {
    base.max_completion_tokens = maxOutputTokens
    // Luna + function tools on chat.completions requires reasoning_effort none.
    base.reasoning_effort = 'none'
    return base
  }
  base.temperature = 0
  base.max_tokens = maxOutputTokens
  return base
}
