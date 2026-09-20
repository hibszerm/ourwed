/**
 * OurWed Assistant V7 — Hybrid Direct Tool Agent.
 * Global authenticated visibility via VITE_ASSISTANT_V7_GLOBAL
 * (legacy alias: VITE_ASSISTANT_V7_OWNER_CANARY).
 * Sole customer-visible Assistant engine.
 */

export { V7ResourceSetStore } from './resourceSet/store'
export type {
  V7ResourceSetRecord,
  V7ResourceType,
  V7SessionBinding,
} from './resourceSet/types'

export {
  executeV7Tool,
  searchResources,
  refineResources,
  sortResources,
  aggregateResources,
  inspectResource,
  listRelatedResources,
  describeResourceSet,
  V7_TOOL_NAMES,
} from './tools/execute'
export type { V7ToolDeps, V7ToolContext } from './tools/execute'
export type { V7ToolResult, V7ToolError } from './tools/errors'

export {
  runV7Turn as runV7AgentLoop,
  V7_DEFAULT_MODEL,
  V7_MAX_TOOL_CALLS_PER_TURN,
} from './agent/loop'
export type { V7AgentSession, V7TurnResult } from './agent/loop'
export { V7_NATIVE_TOOLS } from './agent/nativeTools'

export {
  isV7GlobalFlagEnabled,
  isV7Enabled,
  isV7Visible,
  setV7GlobalFlagForTests,
} from './canary/v7Gate'

export {
  sanitizeV7UserText,
  containsV7InternalLeak,
} from './render/sanitize'
export { renderV7TurnResult } from './render/renderV7TurnResult'

export {
  runV7Turn,
  setV7SessionOpen,
  destroyV7Session,
  isV7SessionActive,
} from './host'
export type { V7TurnOutput } from './host'

export {
  projectV7PresentationTurn,
  projectProseOnlyPresentation,
  presentationContainsForbiddenLeak,
  executeAssistantAction,
  labelForAssistantAction,
  isValidPresentationPhone,
  isValidPresentationEmail,
  isValidPresentationAddress,
  isValidEntityId,
  appendImmediatePendingUser,
  completePendingUserWithPresentation,
  completePendingUserWithApiFailure,
  v7UserEntryId,
} from './presentation'
export type {
  PresentationStatus,
  PresentationRefKind,
  AssistantAction,
  AssistantReference,
  AssistantPresentationTurn,
  TranscriptEntry,
  ExecuteAssistantActionResult,
} from './presentation'

export {
  armV7LatencyAuditFromUrl,
  beginV7LatencyTrace,
  clearActiveV7LatencyTrace,
  getActiveV7LatencyTrace,
  isV7LatencyAuditEnabled,
} from './diagnostics/latencyTrace'
