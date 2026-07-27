/**
 * Review mutations on ContractOccurrenceGraph — sole write path for decisions.
 */

import { logMissingDecisionTarget } from '../mappingId'
import {
  assignReplacementStrategy,
  resolvedReplacementText,
} from './replacementStrategy'
import type {
  ContractFieldKey,
  ContractOccurrence,
  ContractOccurrenceGraph,
} from '../types'
import { canAutoApproveOccurrence } from '../validation/occurrenceDisplayStatus'

function isApproved(occurrence: ContractOccurrence): boolean {
  return (
    occurrence.validationStatus === 'valid' &&
    (occurrence.approvalStatus === 'approved' ||
      occurrence.approvalStatus === 'manually_mapped')
  )
}

function findOccurrence(
  graph: ContractOccurrenceGraph,
  occurrenceId: string,
): ContractOccurrence | undefined {
  return graph.occurrences.find((o) => o.id === occurrenceId)
}

function pairedMembers(
  graph: ContractOccurrenceGraph,
  target: ContractOccurrence,
): ContractOccurrence[] {
  if (!target.pairedFieldGroup) return [target]
  return graph.occurrences.filter(
    (o) => o.pairedFieldGroup === target.pairedFieldGroup,
  )
}

function updateOccurrences(
  graph: ContractOccurrenceGraph,
  ids: Set<string>,
  update: (o: ContractOccurrence) => ContractOccurrence,
): ContractOccurrenceGraph {
  return {
    ...graph,
    occurrences: graph.occurrences.map((o) => (ids.has(o.id) ? update(o) : o)),
  }
}

function canApproveOccurrence(occurrence: ContractOccurrence): boolean {
  if (occurrence.validationStatus === 'rejected') return false
  if (occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED') {
    return Boolean(occurrence.customReplacement?.trim())
  }
  return (
    occurrence.validationStatus === 'valid' ||
    occurrence.validationStatus === 'needs_review'
  )
}

export function approveOccurrence(input: {
  graph: ContractOccurrenceGraph
  occurrenceId: string
}): ContractOccurrenceGraph {
  const target = findOccurrence(input.graph, input.occurrenceId)
  if (!target || !canApproveOccurrence(target)) return input.graph

  const members = pairedMembers(input.graph, target)
  const ids = new Set(members.map((m) => m.id))
  return updateOccurrences(input.graph, ids, (o) => {
    if (o.validationStatus === 'rejected') return o
    return { ...o, approvalStatus: 'approved' as const }
  })
}

export function rejectOccurrence(input: {
  graph: ContractOccurrenceGraph
  occurrenceId: string
}): ContractOccurrenceGraph {
  const target = findOccurrence(input.graph, input.occurrenceId)
  if (!target || target.validationStatus === 'rejected') return input.graph

  const members = pairedMembers(input.graph, target)
  const ids = new Set(members.map((m) => m.id))
  return updateOccurrences(input.graph, ids, (o) => {
    if (o.validationStatus === 'rejected') return o
    return { ...o, approvalStatus: 'rejected_by_user' as const }
  })
}

export function restoreOccurrenceDecision(input: {
  graph: ContractOccurrenceGraph
  occurrenceId: string
}): ContractOccurrenceGraph {
  const target = findOccurrence(input.graph, input.occurrenceId)
  if (!target) return input.graph

  const members = pairedMembers(input.graph, target)
  const ids = new Set(members.map((m) => m.id))
  return updateOccurrences(input.graph, ids, (o) => {
    if (o.validationStatus !== 'valid' && o.validationStatus !== 'needs_review') {
      return o
    }
    return {
      ...o,
      approvalStatus: 'pending' as const,
      replacementStrategy: assignReplacementStrategy({
        fieldKey: o.fieldKey,
        validationStatus: o.validationStatus,
        approvalStatus: 'pending',
        occurrenceReplacementMode: o.diagnostics?.occurrenceReplacementMode as
          | 'direct_value'
          | 'location_name_inflected'
          | 'manual_review_required'
          | undefined,
        replacementValue: o.replacementValue,
        grammaticalForm: o.grammaticalForm,
      }),
    }
  })
}

export function ignoreOccurrence(input: {
  graph: ContractOccurrenceGraph
  occurrenceId: string
}): ContractOccurrenceGraph {
  const target = findOccurrence(input.graph, input.occurrenceId)
  if (!target) return input.graph

  return updateOccurrences(input.graph, new Set([target.id]), (o) => ({
    ...o,
    approvalStatus: 'ignored_immutable' as const,
    replacementStrategy: 'IGNORE_OCCURRENCE' as const,
  }))
}

export function setOccurrenceCustomReplacement(input: {
  graph: ContractOccurrenceGraph
  occurrenceId: string
  value: string
}): ContractOccurrenceGraph {
  const target = findOccurrence(input.graph, input.occurrenceId)
  if (!target) return input.graph

  return updateOccurrences(input.graph, new Set([target.id]), (o) => {
    const customReplacement = input.value.trim()
    const updated: ContractOccurrence = {
      ...o,
      customReplacement,
      validationStatus:
        o.validationStatus === 'needs_review' ? ('valid' as const) : o.validationStatus,
      replacementStrategy: 'CUSTOM_TEXT_REQUIRED',
    }
    return updated
  })
}

export function approveAllAutoOccurrences(
  graph: ContractOccurrenceGraph,
): ContractOccurrenceGraph {
  return graph.occurrences.reduce(
    (current, occurrence) => {
      if (!canAutoApproveOccurrence(occurrence)) return current
      return approveOccurrence({ graph: current, occurrenceId: occurrence.id })
    },
    graph,
  )
}

export function logMissingOccurrenceTarget(input: {
  experimentRunId: string
  occurrenceId: string
  action: string
}): void {
  logMissingDecisionTarget({
    experimentRunId: input.experimentRunId,
    mappingId: input.occurrenceId,
    action: input.action,
  })
}

export function occurrenceIsApproved(occurrence: ContractOccurrence): boolean {
  return isApproved(occurrence)
}

export function occurrenceExecutableReplacement(
  occurrence: ContractOccurrence,
): string {
  return resolvedReplacementText(occurrence)
}

export function approveOccurrenceByField(input: {
  graph: ContractOccurrenceGraph
  fieldKey: ContractFieldKey
  blockId: string
}): ContractOccurrenceGraph {
  const target = input.graph.occurrences.find(
    (o) => o.fieldKey === input.fieldKey && o.blockId === input.blockId,
  )
  if (!target) return input.graph
  return approveOccurrence({ graph: input.graph, occurrenceId: target.id })
}
