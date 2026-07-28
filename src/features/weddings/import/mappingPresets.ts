import { normalizeHeaderKey } from './normalizeHeader'
import type { ColumnMapping } from './types'

const STORAGE_PREFIX = 'ourwed:wedding-import-mapping:'

export function loadSavedColumnMappings(input: {
  userId: string
  headers: string[]
}): ColumnMapping[] | null {
  if (typeof localStorage === 'undefined') return null
  const signature = normalizeHeaderKey(input.headers.join('|'))
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${input.userId}:${signature}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ColumnMapping[]
  } catch {
    return null
  }
}

export function saveColumnMappings(input: {
  userId: string
  headers: string[]
  mappings: ColumnMapping[]
}): void {
  if (typeof localStorage === 'undefined') return
  const signature = normalizeHeaderKey(input.headers.join('|'))
  localStorage.setItem(
    `${STORAGE_PREFIX}${input.userId}:${signature}`,
    JSON.stringify(
      input.mappings.map((m) => ({ ...m, suggestedBy: 'saved_mapping' as const })),
    ),
  )
}
