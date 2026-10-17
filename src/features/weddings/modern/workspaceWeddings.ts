import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { matchesModernWeddingSearch } from '@/features/weddings/modern/modernWeddingsModel'
import type { WorkspaceWedding, WorkspaceWeddingDisplayName } from '@/features/collaboration/workspaceTypes'
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
      ownerCanonicalDisplayName: string
      effectiveDisplayName: string
      hasPersonalDisplayNameOverride: boolean
    }

export type WorkspaceScopeFilter = 'all' | 'mine' | 'shared'

export const WORKSPACE_SCOPE_QUERY_PARAM = 'scope'

export function getPrimaryWorkspaceYears(
  seasonYears: readonly number[],
  referenceYear: number,
): number[] {
  return seasonYears.filter((year) => year >= referenceYear)
}

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

/** Keep the selected year while it exists in the safe canonical catalog. */
export function resolveWorkspaceSelectedYear(
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
  return item.effectiveDisplayName
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
    item.effectiveDisplayName,
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
  displayNames: readonly WorkspaceWeddingDisplayName[],
): WorkspaceWeddingDisplayItem[] {
  const ownersById = new Map(ownerRows.map((wedding) => [wedding.id, wedding]))
  const displayNamesById = new Map(displayNames.map((displayName) => [displayName.wedding_id, displayName]))
  const workspaceOwnedIds = new Set<string>()
  const seenIds = new Set<string>()
  const rowsById = new Map<string, WorkspaceWedding>()
  const result: WorkspaceWeddingDisplayItem[] = []

  for (const row of workspaceRows) {
    const previous = rowsById.get(row.wedding_id)
    if (previous) {
      if (previous.ownership_kind !== row.ownership_kind) {
        throw new Error('Workspace data could not be reconciled.')
      }
      continue
    }
    rowsById.set(row.wedding_id, row)
    seenIds.add(row.wedding_id)

    if (row.ownership_kind === 'shared') {
      const displayName = displayNamesById.get(row.wedding_id)
      // The display-name resolver is the current authorization check for the
      // shared title. Missing rows can indicate revoked identity access.
      if (!displayName) continue
      result.push({
        ownershipKind: 'shared',
        id: row.wedding_id,
        date: row.wedding_date,
        coupleFirstName: row.couple_first_name,
        coupleSecondName: row.couple_second_name,
        ownerDisplayName: row.owner_display_name,
        ownerCanonicalDisplayName: displayName.owner_canonical_display_name,
        effectiveDisplayName: displayName.effective_display_name,
        hasPersonalDisplayNameOverride: displayName.has_personal_override,
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

export function filterWorkspaceWeddingRowsForList(
  rows: readonly WorkspaceWeddingDisplayItem[],
  options: {
    scope: WorkspaceScopeFilter
    year: number | null
    query: string
  },
): WorkspaceWeddingDisplayItem[] {
  return filterWorkspaceWeddingRows(rows, options.scope).filter((row) => {
    if (options.year != null && !matchesWorkspaceWeddingYear(row, options.year)) return false
    return matchesWorkspaceWeddingSearch(row, options.query)
  })
}
