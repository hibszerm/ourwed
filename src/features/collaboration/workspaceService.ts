import { supabase } from '@/lib/supabase'
import type {
  WorkspaceCapability,
  WorkspaceOwnershipKind,
  WorkspaceScope,
  WorkspaceWedding,
  WorkspaceWeddingDisplayName,
} from './workspaceTypes'
import { collaborativeReadError } from './collaborativeReadError'

function parseCapabilities(value: unknown): WorkspaceCapability[] | null {
  if (!Array.isArray(value)) return null
  const result: WorkspaceCapability[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    if (typeof row.key !== 'string' || (row.level !== 'view' && row.level !== 'edit')) return null
    result.push({ key: row.key, level: row.level })
  }
  return result
}

export function parseWorkspaceWedding(value: unknown): WorkspaceWedding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const nullableString = (candidate: unknown) => candidate === null || typeof candidate === 'string'
  const capabilities = parseCapabilities(row.effective_capabilities)
  if (
    typeof row.wedding_id !== 'string'
    || (row.ownership_kind !== 'owned' && row.ownership_kind !== 'shared')
    || !nullableString(row.couple_first_name)
    || !nullableString(row.couple_second_name)
    || !nullableString(row.wedding_date)
    || !nullableString(row.owner_display_name)
    || !nullableString(row.membership_id)
    || !nullableString(row.access_version)
    || (row.permission_group_mapping_version !== null
      && row.permission_group_mapping_version !== '1'
      && row.permission_group_mapping_version !== '2'
      && row.permission_group_mapping_version !== '3')
    || !capabilities
  ) return null

  return {
    wedding_id: row.wedding_id,
    ownership_kind: row.ownership_kind as WorkspaceOwnershipKind,
    couple_first_name: row.couple_first_name as string | null,
    couple_second_name: row.couple_second_name as string | null,
    wedding_date: row.wedding_date as string | null,
    owner_display_name: row.owner_display_name as string | null,
    membership_id: row.membership_id as string | null,
    access_version: row.access_version as string | null,
    permission_group_mapping_version: row.permission_group_mapping_version as '1' | '2' | '3' | null,
    effective_capabilities: capabilities,
  }
}

export const workspaceService = {
  async listWeddings(args: {
    scope?: WorkspaceScope
    after?: { weddingDate: string | null; weddingId: string } | null
    limit?: number
  } = {}): Promise<WorkspaceWedding[]> {
    const { data, error } = await supabase.rpc('list_my_workspace_weddings', {
      p_after_wedding_date: args.after?.weddingDate ?? null,
      p_after_wedding_id: args.after?.weddingId ?? null,
      p_limit: args.limit ?? 50,
      p_scope: args.scope ?? 'all',
    })
    if (error) throw error
    if (!Array.isArray(data)) return []
    return data.map(parseWorkspaceWedding).filter((item): item is WorkspaceWedding => item !== null)
  },

  async getDisplayNames(weddingIds: readonly string[]): Promise<WorkspaceWeddingDisplayName[]> {
    if (weddingIds.length === 0) return []
    try {
      const { data, error } = await supabase.rpc('get_my_workspace_wedding_display_names', {
        p_wedding_ids: [...new Set(weddingIds)],
      })
      if (error) throw error
      if (!Array.isArray(data)) throw new Error('INVALID_RESPONSE')
      return data.map(parseWorkspaceWeddingDisplayName).filter(
        (item): item is WorkspaceWeddingDisplayName => item !== null,
      )
    } catch (error) {
      throw collaborativeReadError(error, true)
    }
  },

  async setMyDisplayNameOverride(input: {
    weddingId: string
    displayName: string
  }): Promise<WorkspaceWeddingDisplayName> {
    try {
      const { data, error } = await supabase.rpc('set_my_wedding_display_name_override', {
        p_wedding_id: input.weddingId,
        p_display_name: input.displayName,
      })
      if (error) throw error
      const result = parseSingleWorkspaceWeddingDisplayName(data)
      if (!result) throw new Error('INVALID_RESPONSE')
      return result
    } catch (error) {
      throw collaborativeReadError(error, true)
    }
  },

  async clearMyDisplayNameOverride(weddingId: string): Promise<WorkspaceWeddingDisplayName> {
    try {
      const { data, error } = await supabase.rpc('clear_my_wedding_display_name_override', {
        p_wedding_id: weddingId,
      })
      if (error) throw error
      const result = parseSingleWorkspaceWeddingDisplayName(data)
      if (!result) throw new Error('INVALID_RESPONSE')
      return result
    } catch (error) {
      throw collaborativeReadError(error, true)
    }
  },
}

function parseWorkspaceWeddingDisplayName(value: unknown): WorkspaceWeddingDisplayName | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.wedding_id !== 'string'
    || typeof row.owner_canonical_display_name !== 'string'
    || typeof row.effective_display_name !== 'string'
    || typeof row.has_personal_override !== 'boolean') return null
  return {
    wedding_id: row.wedding_id,
    owner_canonical_display_name: row.owner_canonical_display_name,
    effective_display_name: row.effective_display_name,
    has_personal_override: row.has_personal_override,
  }
}

function parseSingleWorkspaceWeddingDisplayName(value: unknown): WorkspaceWeddingDisplayName | null {
  if (!Array.isArray(value) || value.length !== 1) return null
  return parseWorkspaceWeddingDisplayName(value[0])
}
