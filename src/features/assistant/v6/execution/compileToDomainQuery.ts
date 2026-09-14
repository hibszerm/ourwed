/**
 * V6-F1 — Optional DomainQuery IR compile for closed-range searches.
 * Conversational identity remains ConversationCollection — never DomainQuery.
 */

import {
  emptyDomainQuery,
  type DomainQuery,
} from '../../v4/domainQuery/domainQuery'
import { resolveRelativeTemporal } from '../semantics/temporal'
import type { SearchAction, V6Sort } from '../semantics/types'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'

function sortToOrderBy(sort: V6Sort | null | undefined): DomainQuery['orderBy'] {
  if (!sort) return []
  if (sort.field === 'wedding.date') {
    return [{ field: 'wedding.date', direction: sort.direction }]
  }
  const field =
    sort.field === 'contract_value'
      ? ('wedding.contract_value' as const)
      : sort.field === 'paid_amount'
        ? ('wedding.paid_amount' as const)
        : ('wedding.remaining_amount' as const)
  return [{ field, direction: sort.direction }]
}

/**
 * Compile Search to DomainQuery only when temporal is closed (or absent)
 * and there is no place exclusion (DQ has no exclude op).
 * Open future / exclude → null (V6 applyOps path).
 */
export function tryCompileSearchToDomainQuery(
  search: SearchAction,
  todayKey: string = localCalendarDateKey(),
): DomainQuery | null {
  if (search.source !== 'wedding') return null
  if (search.excludePlace) return null

  let dateBinding: DomainQuery['dateBinding'] = null
  if (search.relativeTemporal) {
    const bound = resolveRelativeTemporal(search.relativeTemporal, todayKey)
    if (bound.kind === 'unresolved') return null
    if (bound.kind !== 'closed') return null
    dateBinding = {
      dimension: 'wedding.date',
      range: { from: bound.from, to: bound.to },
    }
  }

  const relations: DomainQuery['relations'] = []
  for (const f of search.filters ?? []) {
    relations.push({
      relation: 'place',
      field: 'place.name',
      op: f.op,
      value: f.value,
    })
    if (f.role && f.role !== 'any') {
      relations.push({
        relation: 'place',
        field: 'place.role',
        op: 'eq',
        value: f.role,
      })
    }
  }

  return emptyDomainQuery({
    aggregate: null,
    measure: null,
    relations,
    dateBinding,
    orderBy: sortToOrderBy(search.sort),
    limit: search.slice?.limit ?? null,
  })
}
