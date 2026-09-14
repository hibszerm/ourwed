/**
 * IC1 — process-local effective mode + server canary eligibility for Host.
 * Defaults: build capability (Vite); canaryEligible false until Edge attests.
 */

import type { AssistantV5Mode } from './types'
import {
  buildCapabilityMode,
  modeAllowsV5Ownership,
  modeAllowsV5ShadowDiagnostics,
} from './resolveEffectiveMode'

let effectiveMode: AssistantV5Mode = buildCapabilityMode()
let canaryEligible = false

export function setEffectiveAssistantMode(mode: AssistantV5Mode): void {
  effectiveMode = mode
}

export function getEffectiveAssistantMode(): AssistantV5Mode {
  return effectiveMode
}

/** Server-attested only — Host must never set true from localStorage / query. */
export function setCanaryEligibleFromRuntime(eligible: boolean): void {
  canaryEligible = Boolean(eligible)
}

export function getCanaryEligible(): boolean {
  return canaryEligible
}

export function isV5ShadowDiagnosticsEnabled(): boolean {
  return modeAllowsV5ShadowDiagnostics(effectiveMode)
}

/** True when Host may attempt visible V5 ownership for this session. */
export function isV5OwnershipPathEnabled(): boolean {
  return modeAllowsV5Ownership(effectiveMode) && canaryEligible
}

/** Test helper — restore Vite-derived default. */
export function resetEffectiveAssistantModeForTests(): void {
  effectiveMode = buildCapabilityMode()
  canaryEligible = false
}
