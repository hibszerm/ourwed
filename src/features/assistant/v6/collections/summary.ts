/**
 * V6-F1 — Model-visible collection summaries (no member UUID arrays).
 */

import type { ConversationCollection } from './store'

export type V6CollectionSummary = {
  handle: string
  active: boolean
  source: string
  totalCount: number
  ordering: ConversationCollection['ordering']
  parentHandle: string | null
  temporalSummary: string | null
  placeSummary: string | null
  excludePlaceSummary: string | null
  sliceSummary: string | null
  preview: ConversationCollection['preview']
  lineageDepth: number
}

function temporalSummary(
  def: ConversationCollection['semanticDefinition'],
): string | null {
  const t = def.relativeTemporal
  if (!t) return null
  if (t.kind === 'future_from_now') return 'future_from_now'
  if (t.kind === 'past_until_now') return 'past_until_now'
  if (t.kind === 'closed_calendar_year') return `year:${t.year}`
  if (t.kind === 'closed_calendar_month') {
    return `month:${t.year}-${t.month}`
  }
  if (t.kind === 'closed_range') return 'closed_range'
  return null
}

export function toCollectionSummary(
  col: ConversationCollection,
  activeHandle: string | null,
): V6CollectionSummary {
  const def = col.semanticDefinition
  return {
    handle: col.handle,
    active: col.handle === activeHandle,
    source: col.source,
    totalCount: col.totalCount,
    ordering: col.ordering,
    parentHandle: col.parentHandle,
    temporalSummary: temporalSummary(def),
    placeSummary:
      def.filters.map((f) => `${f.op}:${f.value}`).join('|') || null,
    excludePlaceSummary:
      def.excludePlaces.map((f) => `exclude:${f.value}`).join('|') || null,
    sliceSummary: def.slice
      ? `offset:${def.slice.offset ?? 0},limit:${def.slice.limit}`
      : null,
    preview: col.preview,
    lineageDepth: col.lineage.length,
  }
}

export function buildModelCollectionContext(input: {
  active: ConversationCollection | null
  recent: ConversationCollection[]
  max?: number
}): V6CollectionSummary[] {
  const max = input.max ?? 5
  const activeHandle = input.active?.handle ?? null
  const seen = new Set<string>()
  const out: V6CollectionSummary[] = []
  if (input.active) {
    out.push(toCollectionSummary(input.active, activeHandle))
    seen.add(input.active.handle)
  }
  for (const col of input.recent) {
    if (seen.has(col.handle)) continue
    out.push(toCollectionSummary(col, activeHandle))
    seen.add(col.handle)
    if (out.length >= max) break
  }
  return out
}
