/**
 * Phase 3A eligibility — single-resource wedding finance only.
 * Exhaustive allowlist. Collections / other families → unsupported.
 */

import type { ResolvedTask, ResolvedTaskResult } from '../resolver/types'
import type { TaskOperation, TaskSubject } from '../taskSpec'
import {
  V4_PHASE3A_FINANCE_METRICS,
  type V4FinanceMetric,
} from './financeTypes'

const ALLOWED_OPS = new Set<TaskOperation>([
  'get_amount',
  'get',
  'inherit',
])

const ALLOWED_SUBJECTS = new Set<TaskSubject>([
  'contract_value',
  'paid',
  'remaining',
])

/** Subjects that look finance-ish but are out of Phase 3A scope. */
const OUT_OF_SCOPE_FINANCE_SUBJECTS = new Set<TaskSubject>([
  'payment',
  'deposit',
])

export function mapSubjectToFinanceMetric(
  subject: TaskSubject | null,
): V4FinanceMetric | null {
  if (!subject) return null
  if (subject === 'contract_value') return 'contract_value'
  if (subject === 'paid') return 'paid'
  if (subject === 'remaining') return 'remaining'
  return null
}

export function isPhase3AFinanceSubject(subject: TaskSubject | null): boolean {
  return Boolean(subject && ALLOWED_SUBJECTS.has(subject))
}

/**
 * Finance-shaped ResolvedTask (ops/subjects/collections), regardless of resource binding.
 * Used by capability canHandle so missing wedding → clarification, not silent skip.
 */
export function isPhase3AFinanceShapedTask(task: ResolvedTask): boolean {
  if (!ALLOWED_OPS.has(task.op)) return false
  if (task.collection) return false
  if (
    task.op === 'sum' ||
    task.op === 'rank' ||
    task.op === 'count' ||
    task.op === 'list'
  ) {
    return false
  }
  if (OUT_OF_SCOPE_FINANCE_SUBJECTS.has(task.subject as TaskSubject)) {
    return false
  }
  const metric = mapSubjectToFinanceMetric(task.subject)
  return Boolean(metric && V4_PHASE3A_FINANCE_METRICS.includes(metric))
}

/**
 * Returns a resolved task eligible for Phase 3A finance execution, or null.
 * Does not execute. Does not authorize ownership — executor + RLS do.
 */
export function selectPhase3AFinanceTask(
  resolution: ResolvedTaskResult | null | undefined,
):
  | { eligible: true; task: ResolvedTask; metric: V4FinanceMetric }
  | { eligible: false; reason: string } {
  if (!resolution) {
    return { eligible: false, reason: 'no_resolution' }
  }
  if (resolution.status === 'needs_clarification') {
    return { eligible: false, reason: 'needs_clarification' }
  }
  if (resolution.status === 'requires_discovery') {
    return { eligible: false, reason: 'requires_discovery' }
  }
  if (resolution.status === 'unsupported') {
    return { eligible: false, reason: 'unsupported' }
  }
  if (resolution.status === 'invalid_context') {
    return { eligible: false, reason: 'invalid_context' }
  }
  if (resolution.status !== 'resolved') {
    return { eligible: false, reason: 'not_resolved' }
  }

  const task = resolution
  if (!isPhase3AFinanceShapedTask(task)) {
    if (!ALLOWED_OPS.has(task.op)) {
      return { eligible: false, reason: `op_not_allowed:${task.op}` }
    }
    if (task.collection) {
      return { eligible: false, reason: 'collection_rejected' }
    }
    if (
      task.op === 'sum' ||
      task.op === 'rank' ||
      task.op === 'count' ||
      task.op === 'list'
    ) {
      return { eligible: false, reason: 'aggregate_rejected' }
    }
    if (OUT_OF_SCOPE_FINANCE_SUBJECTS.has(task.subject as TaskSubject)) {
      return { eligible: false, reason: `subject_out_of_scope:${task.subject}` }
    }
    return { eligible: false, reason: `subject_not_finance:${task.subject}` }
  }

  const metric = mapSubjectToFinanceMetric(task.subject)
  if (!metric || !V4_PHASE3A_FINANCE_METRICS.includes(metric)) {
    return { eligible: false, reason: `subject_not_finance:${task.subject}` }
  }

  if (!task.resource || task.resource.kind !== 'wedding') {
    return { eligible: false, reason: 'wedding_resource_required' }
  }
  if (!task.resource.id || !task.resource.id.trim()) {
    return { eligible: false, reason: 'missing_wedding_id' }
  }

  return { eligible: true, task, metric }
}
