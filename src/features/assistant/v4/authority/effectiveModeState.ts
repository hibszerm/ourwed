/**
 * PC1 — process-local effective mode for Host / clarification gate.
 * Defaults to build capability (Vite); Host overlays min(build, runtime).
 */

import type { AssistantV5Mode } from './types'
import {
  buildCapabilityMode,
  modeAllowsV5ShadowDiagnostics,
} from './resolveEffectiveMode'

let effectiveMode: AssistantV5Mode = buildCapabilityMode()

export function setEffectiveAssistantMode(mode: AssistantV5Mode): void {
  effectiveMode = mode
}

export function getEffectiveAssistantMode(): AssistantV5Mode {
  return effectiveMode
}

export function isV5ShadowDiagnosticsEnabled(): boolean {
  return modeAllowsV5ShadowDiagnostics(effectiveMode)
}

/** Test helper — restore Vite-derived default. */
export function resetEffectiveAssistantModeForTests(): void {
  effectiveMode = buildCapabilityMode()
}
