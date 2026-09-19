/**
 * Phase 2H.2 — presentation-local collection item derivation.
 * Sorts by structured ISO date evidence; never invents actions/routes.
 */

import type {
  AssistantAction,
  AssistantReference,
} from '../../v7/presentation/types'

export type CollectionItemKind = 'wedding' | 'session'

export type AssistantCollectionItem = {
  id: string
  kind: CollectionItemKind
  date: string | undefined
  title: string
  typeLabel: 'Ślub' | 'Sesja'
  action: AssistantAction | null
  reference: AssistantReference
}

function openActionFor(ref: AssistantReference): AssistantAction | null {
  for (const a of ref.actions) {
    if (a.type === 'open_wedding' || a.type === 'open_session') return a
  }
  return null
}

function typeLabelFor(kind: CollectionItemKind): 'Ślub' | 'Sesja' {
  return kind === 'session' ? 'Sesja' : 'Ślub'
}

function sortKey(date: string | undefined): string {
  // Missing dates sort last; ISO YYYY-MM-DD sorts lexicographically ascending.
  return date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date : '9999-99-99'
}

/**
 * Build chronologically sorted collection rows from trusted references.
 * Only wedding/session refs are included. Stable for equal dates (input order).
 */
export function deriveCollectionItems(
  references: AssistantReference[],
): AssistantCollectionItem[] {
  const indexed: Array<AssistantCollectionItem & { _i: number }> = []
  for (let i = 0; i < references.length; i += 1) {
    const ref = references[i]!
    if (ref.kind !== 'wedding' && ref.kind !== 'session') continue
    indexed.push({
      id: ref.id,
      kind: ref.kind,
      date: ref.detail,
      title: ref.label?.trim() || '—',
      typeLabel: typeLabelFor(ref.kind),
      action: openActionFor(ref),
      reference: ref,
      _i: i,
    })
  }
  indexed.sort((a, b) => {
    const byDate = sortKey(a.date).localeCompare(sortKey(b.date))
    if (byDate !== 0) return byDate
    return a._i - b._i
  })
  return indexed.map(({ _i: _, ...item }) => item)
}
