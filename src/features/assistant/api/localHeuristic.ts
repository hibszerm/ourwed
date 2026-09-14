/**
 * DEV-only local orchestrator for Zapytaj OurWed.
 * Parses → AssistantSemanticRequest → common executeAssistantSemanticRequest.
 * Never a security boundary — RLS/owned services still apply.
 */

import { parseAssistantSemanticRequest, refineSemanticRequestFromUtterance } from './intentParse'
import {
  executeAssistantSemanticRequest,
  type AssistantSessionContext,
} from './executeSemantic'
import type { AssistantResponse, PageContextHint } from '../types'

export async function runLocalAssistantOrchestrator(input: {
  userText: string
  pageContext?: PageContextHint | null
  sessionContext?: AssistantSessionContext | null
  /** When set, skip parse and execute this semantic request (choice continuation). */
  semanticRequest?: import('../types').AssistantSemanticRequest | null
}): Promise<AssistantResponse> {
  const parsed =
    input.semanticRequest ?? parseAssistantSemanticRequest(input.userText)
  const request = input.semanticRequest
    ? parsed
    : refineSemanticRequestFromUtterance(parsed, input.userText)

  return executeAssistantSemanticRequest({
    request,
    pageContext: input.pageContext,
    sessionContext: input.sessionContext,
    sourceText: input.userText,
  })
}

/** @deprecated Use runLocalAssistantOrchestrator */
export const runLocalAssistantHeuristic = runLocalAssistantOrchestrator
