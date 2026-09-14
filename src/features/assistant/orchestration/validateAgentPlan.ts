/**
 * Assistant V3 agent plan types + validation.
 */

import {
  ASSISTANT_CAPABILITY_NAMES,
  getCapability,
  type AssistantCapabilityName,
} from './capabilityRegistry'

export const ASSISTANT_MAX_PLAN_STEPS = 5
export const ASSISTANT_MAX_PLANNER_ROUNDS = 2

export type AssistantPlanStep = {
  id: string
  capability: AssistantCapabilityName
  input: Record<string, unknown>
  dependsOn?: string[]
}

export type AssistantAgentPlan = {
  kind: 'plan'
  goal: string
  steps: AssistantPlanStep[]
}

export type AssistantAgentRequest =
  | AssistantAgentPlan
  | {
      kind: 'clarification'
      question: string
      options?: Array<{ id: string; label: string }>
      /** Resume goal after clarification. */
      pendingGoal?: string | null
    }
  | {
      kind: 'unsupported'
      reason?: 'data_not_tracked' | 'capability' | 'write' | 'missing_data'
      message?: string
    }
  /** Backward-compatible V2 domain kinds still accepted. */
  | {
      kind: 'direct'
      semantic: unknown
    }
  | {
      kind: 'query_plan'
      plan: unknown
    }

const FORBIDDEN =
  /^(userId|ownerId|tenantId|user_id|owner_id|tenant_id|sql|rpc|table|column)$/i

function hasForbidden(obj: unknown, depth = 0): boolean {
  if (depth > 8 || !obj || typeof obj !== 'object') return false
  if (Array.isArray(obj)) return obj.some((v) => hasForbidden(v, depth + 1))
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN.test(k)) return true
    if (hasForbidden(v, depth + 1)) return true
  }
  return false
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

export function validateAssistantAgentPlan(
  raw: unknown,
): AssistantAgentPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (hasForbidden(raw)) return null
  const row = raw as Record<string, unknown>
  if (asString(row.kind) !== 'plan') return null
  const goal = asString(row.goal) ?? ''
  const stepsRaw = row.steps
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return null
  if (stepsRaw.length > ASSISTANT_MAX_PLAN_STEPS) return null

  const steps: AssistantPlanStep[] = []
  const ids = new Set<string>()
  for (const item of stepsRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    if (hasForbidden(item)) return null
    const s = item as Record<string, unknown>
    const id = asString(s.id)
    const capability = asString(s.capability)
    if (!id || !capability) return null
    if (ids.has(id)) return null
    ids.add(id)
    if (!(ASSISTANT_CAPABILITY_NAMES as readonly string[]).includes(capability)) {
      return null
    }
    const def = getCapability(capability)
    if (!def) return null
    const input =
      s.input && typeof s.input === 'object' && !Array.isArray(s.input)
        ? (s.input as Record<string, unknown>)
        : {}
    if (hasForbidden(input)) return null
    // Reject raw CRM UUID-looking fields unless under known ref keys
    for (const [k, v] of Object.entries(input)) {
      if (/^(ownerId|userId|tenantId)$/i.test(k)) return null
      if (
        typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          v,
        ) &&
        !/^(weddingId|sessionId|weddingRef|placeRef|originRef|destinationRef)$/i.test(
          k,
        ) &&
        k !== 'weddingId' &&
        k !== 'sessionId'
      ) {
        // Allow weddingId/sessionId only when they came from context — still validated at execute
      }
    }
    let dependsOn: string[] | undefined
    if (s.dependsOn != null) {
      if (!Array.isArray(s.dependsOn)) return null
      dependsOn = []
      for (const d of s.dependsOn) {
        const dep = asString(d)
        if (!dep) return null
        dependsOn.push(dep)
      }
    }
    steps.push({
      id,
      capability: capability as AssistantCapabilityName,
      input,
      dependsOn,
    })
  }

  // Dependency references must exist and be prior
  const seen = new Set<string>()
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!seen.has(dep)) return null
    }
    seen.add(step.id)
  }

  // prepare_write must be last and alone as write
  const writeIdx = steps.findIndex(
    (s) => getCapability(s.capability)?.mode === 'prepare_write',
  )
  if (writeIdx >= 0 && writeIdx !== steps.length - 1) return null

  return { kind: 'plan', goal, steps }
}
