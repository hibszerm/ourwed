import { supabase } from '@/lib/supabase'
import type {
  WorkspaceCapability,
  WorkspaceOwnershipKind,
  WorkspaceScope,
  WorkspaceWedding,
} from './workspaceTypes'

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

function parseWorkspaceWedding(value: unknown): WorkspaceWedding | null {
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
      && row.permission_group_mapping_version !== '2')
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
    permission_group_mapping_version: row.permission_group_mapping_version as '1' | '2' | null,
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
}
