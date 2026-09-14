/**
 * PC1 — DomainQueryObservation → AssistantResponse (deterministic, no LLM).
 * Facts only from observation; no finance recomputation.
 */

import type { AssistantResponse } from '../../types'
import type { DomainQueryObservation } from '../domainQuery/observations'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'

function moneyField(
  measure: SemanticFieldId | null,
): 'contractValue' | 'paidAmount' | 'remainingAmount' {
  if (measure === 'wedding.paid_amount') return 'paidAmount'
  if (measure === 'wedding.remaining_amount') return 'remainingAmount'
  return 'contractValue'
}

function measureTitle(measure: SemanticFieldId | null): string {
  if (measure === 'wedding.paid_amount') return 'Łącznie wpłacono'
  if (measure === 'wedding.remaining_amount') return 'Pozostało do zapłaty'
  if (measure === 'wedding.contract_value') return 'Wartość umów'
  return 'Kwota'
}

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

/**
 * Renders typed DomainQuery observations into existing AssistantResponse shapes.
 * Does not mutate conversation / active DomainQuery identity.
 */
export function renderDomainQueryObservation(
  observation: DomainQueryObservation,
): AssistantResponse {
  const agg = observation.aggregate
  const currency = observation.currency || 'PLN'

  if (agg === 'count') {
    const n = observation.totalCount
    const unitLabel = n === 1 ? 'ślub' : n >= 2 && n <= 4 ? 'śluby' : 'ślubów'
    return {
      kind: 'scalar',
      metric: 'count',
      value: n,
      unitLabel,
      titleLabel: 'Liczba ślubów',
      rangeLabel: null,
    }
  }

  if (agg === 'sum') {
    const value = observation.amount
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return {
        kind: 'error',
        message: 'Brak kwoty w wyniku zapytania.',
      }
    }
    const field = moneyField(observation.measure)
    return {
      kind: 'money',
      metric: 'sum',
      field,
      value,
      currency,
      titleLabel: measureTitle(observation.measure),
      subtitle: formatPln(value, currency),
      count: observation.totalCount,
      unitLabel: 'ślubów',
      rangeLabel: null,
    }
  }

  // list / null aggregate
  const items = (observation.items ?? []).map((it) => ({
    id: it.resource.id,
    kind: 'wedding' as const,
    displayName: it.displayName,
    date: it.date,
    meta: null as string | null,
  }))

  if (observation.returnedCount === 0 || items.length === 0) {
    return {
      kind: 'collection',
      resource: 'weddings',
      titleLabel: 'Śluby',
      rangeLabel: null,
      resultCount: observation.totalCount,
      shownCount: 0,
      items: [],
      truncated: false,
    }
  }

  return {
    kind: 'collection',
    resource: 'weddings',
    titleLabel: 'Śluby',
    rangeLabel: null,
    resultCount: observation.totalCount,
    shownCount: items.length,
    items,
    truncated: observation.truncated,
  }
}
