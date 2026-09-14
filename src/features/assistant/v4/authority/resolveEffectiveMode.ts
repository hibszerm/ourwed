/**
 * PC1 — fail-closed mode precedence.
 *
 * effectiveMode = min(buildCapability, runtimeMode, PC1_BUILD_MAX)
 * Missing/invalid runtime → off (V3-safe). Never promotes authority.
 */

import {
  PC1_BUILD_MAX_MODE,
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

/** Vite shadow flag → build capability (PC1 max shadow). */
export function buildCapabilityMode(): AssistantV5Mode {
  const fromVite: AssistantV5Mode = isAssistantV5GoalShadowEnabled()
    ? 'shadow'
    : 'off'
  return minAssistantV5Mode(fromVite, PC1_BUILD_MAX_MODE)
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

/** PC1: never allows visible V5 ownership. */
export function modeAllowsV5Ownership(_mode: AssistantV5Mode): boolean {
  return false
}
