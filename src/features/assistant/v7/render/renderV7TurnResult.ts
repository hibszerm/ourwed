/**
 * V7-CANARY — Map V7 turn result → AssistantResponse.
 * Model-generated Polish text is sanitized; no tool/concept/handle leaks.
 */

import type { AssistantResponse } from '../../types'
import { ASSISTANT_API_FAILURE } from '../../copy'
import type { V7TurnResult } from '../agent/loop'
import { sanitizeV7UserText } from './sanitize'

export function renderV7TurnResult(result: V7TurnResult): AssistantResponse {
  if (!result.ok || result.stoppedReason === 'provider_error') {
    return { kind: 'error', message: ASSISTANT_API_FAILURE }
  }
  const text = sanitizeV7UserText(result.userText)
  if (!text) {
    return { kind: 'error', message: ASSISTANT_API_FAILURE }
  }
  return { kind: 'text', message: text }
}
