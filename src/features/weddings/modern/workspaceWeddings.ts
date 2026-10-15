import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { matchesModernWeddingSearch } from '@/features/weddings/modern/modernWeddingsModel'
import type { WorkspaceWedding } from '@/features/collaboration/workspaceTypes'
import type { Wedding } from '@/types/wedding'

export type WorkspaceWeddingDisplayItem =
  | {
      ownershipKind: 'owned'
      id: string
      date: string | null
      wedding: Wedding
    }
  | {
      ownershipKind: 'shared'
      id: string
      date: string | null
      coupleFirstName: string | null
      coupleSecondName: string | null
      ownerDisplayName: string | null
    }

export type WorkspaceScopeFilter = 'all' | 'mine' | 'shared'

export const WORKSPACE_SCOPE_QUERY_PARAM = 'scope'

export function workspaceVisibleQueryKey(userId: string | undefined) {
  return ['workspace', 'sluby', userId ?? null] as const
}

export function parseWorkspaceScope(value: string | null): WorkspaceScopeFilter {
  if (value === 'mine' || value === 'shared') return value
  return 'all'
}

export function getWorkspaceWeddingDate(
  item: WorkspaceWeddingDisplayItem,
): string | null {
  return item.date
}

export function matchesWorkspaceWeddingYear(
  item: WorkspaceWeddingDisplayItem,
  year: number,
): boolean {
  return item.date?.slice(0, 4) === String(year)
}

/** Keep a search-year selection only while the current scope contains that year. */
export function resolveWorkspaceSearchYear(
  selectedYear: number | null,
  scopedRows: readonly WorkspaceWeddingDisplayItem[],
): number | null {
  if (selectedYear == null) return null
  return scopedRows.some((item) => matchesWorkspaceWeddingYear(item, selectedYear))
    ? selectedYear
    : null
}

export function getWorkspaceWeddingName(item: WorkspaceWeddingDisplayItem): string {
  if (item.ownershipKind === 'owned') return getWeddingDisplayName(item.wedding)
  const first = item.coupleFirstName?.trim() ?? ''
  const second = item.coupleSecondName?.trim() ?? ''
  return [first, second].filter(Boolean).join(' i ') || 'Bez tytułu'
}

export function matchesWorkspaceWeddingSearch(
  item: WorkspaceWeddingDisplayItem,
  query: string,
): boolean {
  if (item.ownershipKind === 'owned') {
    return matchesModernWeddingSearch(item.wedding, query)
  }
  const normalized = query.trim().toLocaleLowerCase('pl-PL')
  if (!normalized) return true
  const authorizedText = [
    item.coupleFirstName,
    item.coupleSecondName,
    item.date,
  ].filter(Boolean).join(' ').toLocaleLowerCase('pl-PL')
  return authorizedText.includes(normalized)
}

/**
 * Build the canonical visible list from H1's actor-authorized row universe.
 * Owner enrichment is joined only for rows H1 classified as owned. Shared rows
 * retain the narrow H1 DTO and never receive owner-list fields.
 */
export function composeWorkspaceWeddingRows(
  workspaceRows: readonly WorkspaceWedding[],
  ownerRows: readonly Wedding[],
): WorkspaceWeddingDisplayItem[] {
  const ownersById = new Map(ownerRows.map((wedding) => [wedding.id, wedding]))
  const workspaceOwnedIds = new Set<string>()
  const seenIds = new Set<string>()
  const result: WorkspaceWeddingDisplayItem[] = []

  for (const row of workspaceRows) {
    if (seenIds.has(row.wedding_id)) {
      throw new Error('Workspace data could not be reconciled.')
    }
    seenIds.add(row.wedding_id)

    if (row.ownership_kind === 'shared') {
      result.push({
        ownershipKind: 'shared',
        id: row.wedding_id,
        date: row.wedding_date,
        coupleFirstName: row.couple_first_name,
        coupleSecondName: row.couple_second_name,
        ownerDisplayName: row.owner_display_name,
      })
      continue
    }

    const wedding = ownersById.get(row.wedding_id)
    if (!wedding) throw new Error('Workspace data could not be reconciled.')
    workspaceOwnedIds.add(row.wedding_id)
    result.push({
      ownershipKind: 'owned',
      id: wedding.id,
      date: wedding.date || null,
      wedding,
    })
  }

  // H1 intentionally lists active workspace rows. Preserve the existing
  // owner-only archived/cancelled toggle without adding them to shared scope.
  for (const wedding of ownerRows) {
    if (workspaceOwnedIds.has(wedding.id) || seenIds.has(wedding.id)) continue
    if (wedding.status !== 'archived' && wedding.status !== 'cancelled') continue
    seenIds.add(wedding.id)
    result.push({
      ownershipKind: 'owned',
      id: wedding.id,
      date: wedding.date || null,
      wedding,
    })
  }

  return result.sort((a, b) => {
    const dateOrder = (a.date ?? '\uffff').localeCompare(b.date ?? '\uffff')
    return dateOrder || a.id.localeCompare(b.id)
  })
}

export function filterWorkspaceWeddingRows(
  rows: readonly WorkspaceWeddingDisplayItem[],
  scope: WorkspaceScopeFilter,
): WorkspaceWeddingDisplayItem[] {
  if (scope === 'mine') return rows.filter((row) => row.ownershipKind === 'owned')
  if (scope === 'shared') return rows.filter((row) => row.ownershipKind === 'shared')
  return [...rows]
}
