/**
 * V6-CANARY-1 — Map verified V6 turn results to existing AssistantResponse shapes.
 * Deterministic presentation only — no LLM rewrite, no second answer architecture.
 */

import type { AssistantResponse } from '../../types'
import {
  ASSISTANT_API_FAILURE,
  ASSISTANT_PLAN_BLOCKED,
  ASSISTANT_UNSUPPORTED,
} from '../../copy'
import { v6CollectionStore } from '../collections/store'
import type { V6Observation } from '../observations/adapt'
import type { V6ShadowTurnResult } from '../agent/loop'
import { polishWeddingCountNounShort } from './polishWeddingCountNoun'

function formatPln(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: currency || 'PLN',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount)} ${currency || 'PLN'}`
  }
}

function moneyField(
  measure: string,
): 'contractValue' | 'paidAmount' | 'remainingAmount' {
  if (measure === 'paid_amount') return 'paidAmount'
  if (measure === 'remaining_amount') return 'remainingAmount'
  return 'contractValue'
}

function measureTitle(measure: string): string {
  if (measure === 'paid_amount') return 'Łącznie wpłacono'
  if (measure === 'remaining_amount') return 'Pozostało do zapłaty'
  if (measure === 'contract_value') return 'Wartość umów'
  return 'Kwota'
}

/**
 * Single sanitization boundary for user-visible Assistant copy.
 * Internal capability/schema/verifier details stay in diagnostics only.
 * Safe Polish product sentences (incl. write-disabled) may pass through.
 */
export function sanitizeUserFacingReason(
  reason: string | null | undefined,
): string | null {
  const raw = reason?.trim()
  if (!raw) return null

  // Engineering / schema / wire vocabulary — never user-visible.
  if (
    /prepare_action|turnplan|tool_calls|tool_call|faithful|not_faithful|uncertain|unsupported_capability|capability_unsupported|verification_|planner|verifier|snapshotmemberids|ownerid|service_role|conceptkey|conceptfilters|inspect_resource|list_related|inspect_concepts|aggregate_collection|search_collection|transform_collection|restore_collection|collectionhandle|adapterid|zod|input_handle|input_from_step|search\.|ops\[|steps\[|transform\.|aggregate\.|relationkey|writes_not_enabled/i.test(
      raw,
    )
  ) {
    return null
  }

  // Parse / completeness machine tokens (e.g. step_output_total_remaining_aggregation_required).
  if (/^step[_/]/i.test(raw)) return null
  if (
    /_(required|missing|invalid|unresolved|exceeded|unsupported)(\b|:|$)/i.test(
      raw,
    )
  ) {
    return null
  }
  // Pure snake_case identifier with no Polish letters / spaces → internal code.
  if (
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(raw) &&
    !/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(raw)
  ) {
    return null
  }

  // Path-like capability details (e.g. search.conceptFilters[0]:eq).
  if (/^[a-zA-Z_][\w.]*(\[\d+\])?(:[\w.]+)+$/.test(raw)) {
    return null
  }
  if (/conceptFilters|unsupported_concept_cmp|bad_concept/i.test(raw)) {
    return null
  }

  // UUID / raw handle leakage.
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw)
  ) {
    return null
  }

  return raw
}

export function renderV6Observation(observation: V6Observation): AssistantResponse {
  if (observation.kind === 'count_result') {
    const n = observation.value
    const unitLabel = polishWeddingCountNounShort(n)
    return {
      kind: 'scalar',
      metric: 'count',
      value: n,
      unitLabel,
      titleLabel: 'Liczba ślubów',
      rangeLabel: null,
    }
  }

  if (observation.kind === 'money_aggregate') {
    const field = moneyField(observation.measure)
    return {
      kind: 'money',
      metric: 'sum',
      field,
      value: observation.value,
      currency: observation.currency || 'PLN',
      titleLabel: measureTitle(observation.measure),
      subtitle: formatPln(observation.value, observation.currency || 'PLN'),
      unitLabel: 'ślubów',
      rangeLabel: null,
    }
  }

  if (observation.kind === 'wedding_place_detail') {
    const context = observation.weddingDisplayName
      ? ` · ${observation.weddingDisplayName}`
      : ''
    if (!observation.filled || !observation.value) {
      return {
        kind: 'text',
        message: `${observation.titleLabel}${context}: brak uzupełnionego wpisu.`,
      }
    }
    return {
      kind: 'text',
      message: `${observation.titleLabel}${context}\n${observation.value}`,
    }
  }

  if (observation.kind === 'resource_detail') {
    const heading = observation.weddingDisplayName
      ? observation.weddingDisplayName
      : 'Szczegóły ślubu'
    const lines = observation.values.map((item) => {
      if (!item.filled || item.value == null) return `${item.label}: brak danych`
      const value =
        item.displayText ??
        (typeof item.value === 'boolean'
          ? item.value
            ? 'tak'
            : 'nie'
          : String(item.value))
      return `${item.label}: ${value}`
    })
    return {
      kind: 'text',
      message: `${heading}\n${lines.join('\n')}`,
    }
  }

  if (observation.kind === 'related_list') {
    const context = observation.weddingDisplayName
      ? ` · ${observation.weddingDisplayName}`
      : ''
    if (observation.items.length === 0) {
      return {
        kind: 'text',
        message: `${observation.relationLabel}${context}: brak pozycji.`,
      }
    }
    const lines = observation.items.map((item, index) => {
      const details = [item.subtitle, item.meta].filter(Boolean).join(' · ')
      return `${index + 1}. ${item.title}${details ? ` — ${details}` : ''}`
    })
    const suffix = observation.truncated
      ? `\nPokazano ${observation.items.length} z ${observation.totalCount}.`
      : ''
    return {
      kind: 'text',
      message: `${observation.relationLabel}${context}\n${lines.join('\n')}${suffix}`,
    }
  }

  if (observation.kind === 'collection_result') {
    const col = v6CollectionStore.get(observation.handle)
    const ids = col?.snapshotMemberIds ?? []
    const items = observation.preview.map((p, i) => ({
      id: ids[p.ordinal - 1] ?? ids[i] ?? `v6-${observation.handle}-${p.ordinal}`,
      kind: 'wedding' as const,
      displayName: p.displayName,
      date: p.date,
      meta: null as string | null,
    }))
    return {
      kind: 'collection',
      resource: 'weddings',
      titleLabel: 'Śluby',
      rangeLabel: null,
      resultCount: observation.totalCount,
      shownCount: items.length,
      items,
      truncated: items.length < observation.totalCount,
    }
  }

  if (observation.kind === 'clarification') {
    return {
      kind: 'clarification',
      question: observation.reason || 'Doprecyzuj proszę zapytanie.',
      options: [],
    }
  }

  if (observation.kind === 'unsupported') {
    return {
      kind: 'unsupported',
      message: sanitizeUserFacingReason(observation.reason) || ASSISTANT_UNSUPPORTED,
    }
  }

  return {
    kind: 'error',
    message:
      sanitizeUserFacingReason(observation.detail) || ASSISTANT_API_FAILURE,
  }
}

/**
 * Convert a completed V6 shadow/owner turn into the Host-visible response.
 */
export function renderV6TurnResult(result: V6ShadowTurnResult): AssistantResponse {
  const obs = result.execution?.completeness
  if (obs && obs.ok && obs.authorizingObservation) {
    return renderV6Observation(obs.authorizingObservation)
  }

  const resp = result.response
  if (!resp) {
    return { kind: 'error', message: ASSISTANT_API_FAILURE }
  }

  if (resp.status === 'final') {
    // Execution missing but planner claimed final — fail closed.
    return {
      kind: 'error',
      message: ASSISTANT_API_FAILURE,
    }
  }

  if (resp.status === 'clarify') {
    return {
      kind: 'clarification',
      question: resp.reason || 'Doprecyzuj proszę zapytanie.',
      options: (resp.candidates ?? []).map((c) => ({
        id: c.id,
        label: c.label,
      })),
    }
  }

  if (resp.status === 'unsupported') {
    return {
      kind: 'unsupported',
      message: sanitizeUserFacingReason(resp.reason) || ASSISTANT_UNSUPPORTED,
    }
  }

  if (resp.status === 'error') {
    // Verifier/capability blocks surface as unsupported when semantically blocked.
    if (
      resp.code === 'VERIFICATION_NOT_FAITHFUL' ||
      resp.code === 'VERIFICATION_UNCERTAIN' ||
      resp.code === 'CAPABILITY_UNSUPPORTED'
    ) {
      return {
        kind: 'unsupported',
        message: ASSISTANT_PLAN_BLOCKED,
      }
    }
    return {
      kind: 'error',
      message: sanitizeUserFacingReason(resp.message) || ASSISTANT_API_FAILURE,
    }
  }

  return { kind: 'error', message: ASSISTANT_API_FAILURE }
}
