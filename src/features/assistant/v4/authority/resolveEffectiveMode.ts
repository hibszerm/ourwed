/**
 * IC1 — fail-closed mode precedence.
 *
 * effectiveMode = min(buildCapability, runtimeMode)
 * Missing/invalid runtime → off (V3-safe). Never promotes above build max.
 */

import {
  IC1_BUILD_MAX_MODE,
  type AssistantV5Mode,
} from './types'
import { isAssistantV5GoalShadowEnabled } from '../flag'

const MODE_RANK: Record<AssistantV5Mode, number> = {
  off: 0,
  shadow: 1,
  canary: 2,
  authority_read_query: 3,
}

export function parseAssistantV5Mode(raw: unknown): AssistantV5Mode | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  if (v === 'off') return 'off'
  if (v === 'shadow') return 'shadow'
  if (v === 'canary') return 'canary'
  if (v === 'authority_read_query' || v === 'authority-read-query') {
    return 'authority_read_query'
  }
  return null
}

export function minAssistantV5Mode(
  a: AssistantV5Mode,
  b: AssistantV5Mode,
): AssistantV5Mode {
  return MODE_RANK[a] <= MODE_RANK[b] ? a : b
}

/**
 * Vite V5 flag → build capability up to IC1 max (canary).
 * Flag OFF → off. Never reaches authority_read_query in IC1.
 */
export function buildCapabilityMode(): AssistantV5Mode {
  const fromVite: AssistantV5Mode = isAssistantV5GoalShadowEnabled()
    ? 'canary'
    : 'off'
  return minAssistantV5Mode(fromVite, IC1_BUILD_MAX_MODE)
}

/**
 * Resolve effective mode.
 * @param runtimeMode null/undefined = unavailable → treat as off
 */
export function resolveEffectiveAssistantMode(input: {
  runtimeMode: AssistantV5Mode | null | undefined
}): AssistantV5Mode {
  const runtime = input.runtimeMode ?? 'off'
  return minAssistantV5Mode(buildCapabilityMode(), runtime)
}

export function modeAllowsV5ShadowDiagnostics(mode: AssistantV5Mode): boolean {
  return MODE_RANK[mode] >= MODE_RANK.shadow
}

/** IC1: visible ownership only in canary (or future authority_read_query). */
export function modeAllowsV5Ownership(mode: AssistantV5Mode): boolean {
  return mode === 'canary' || mode === 'authority_read_query'
}
