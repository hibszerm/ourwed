/**
 * V6-F1.4 — OpenAI chat.completions builder for TurnPlan / outcomes.
 * Domain tools remain available for diagnostics; live path uses turn_plan mode.
 */

import { V6_NATIVE_OPENAI_TOOLS, V6_OUTCOME_JSON_SCHEMA } from './nativeTools'
import { V6_TURN_PLAN_JSON_SCHEMA } from '../turnPlan/schema'

function isLunaStyleChatModel(model: string): boolean {
  return model.trim() === 'gpt-5.6-luna'
}

export type V6NativeChatRequestInput = {
  model: string
  messages: Array<Record<string, unknown>>
  maxOutputTokens?: number
  /**
   * turn_plan — strict TurnPlan json_schema (F1.4 default)
   * tools — legacy domain tools (F1.3)
   * outcome — final/clarify/unsupported schema
   */
  mode?: 'turn_plan' | 'tools' | 'outcome'
}

export function buildV6NativeToolsRequestBody(
  input: V6NativeChatRequestInput,
): Record<string, unknown> {
  const maxOutputTokens = input.maxOutputTokens ?? 1600
  const mode = input.mode ?? 'turn_plan'
  const base: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  }

  if (mode === 'turn_plan') {
    base.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'assistant_v6_turn_plan',
        strict: true,
        schema: V6_TURN_PLAN_JSON_SCHEMA,
      },
    }
  } else if (mode === 'outcome') {
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
