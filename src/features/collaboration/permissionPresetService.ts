import { supabase } from '@/lib/supabase'
import type {
  CollaborationPermissionPreset,
  CollaborationPermissionPresetListItem,
  CollaborationPermissionPresetScope,
  PermissionPresetInput,
} from './permissionPresetTypes'
import type { CustomCapabilityGrant } from './accessManagementTypes'

const RPC_ERRORS = ['UNAVAILABLE', 'FORBIDDEN', 'CONFLICT', 'VALIDATION_ERROR'] as const

function mapError(error: { message: string }): Error {
  const known = RPC_ERRORS.find((code) => error.message.includes(code))
  return new Error(known ?? 'unknown')
}

function parseGrant(value: unknown): CustomCapabilityGrant {
  if (!value || typeof value !== 'object') throw new Error('unknown')
  const grant = value as Record<string, unknown>
  if (typeof grant.capability_key !== 'string' || (grant.level !== 1 && grant.level !== 2)) {
    throw new Error('unknown')
  }
  return { capability_key: grant.capability_key as CustomCapabilityGrant['capability_key'], level: grant.level }
}

function parseListItem(value: unknown): CollaborationPermissionPresetListItem {
  if (!value || typeof value !== 'object') throw new Error('unknown')
  const item = value as Record<string, unknown>
  if (typeof item.preset_id !== 'string' || (item.scope !== 'system' && item.scope !== 'user')
    || typeof item.name !== 'string' || (item.description !== null && typeof item.description !== 'string')
    || typeof item.version !== 'string' || !/^[1-9][0-9]*$/.test(item.version)
    || typeof item.updated_at !== 'string') throw new Error('unknown')
  return item as unknown as CollaborationPermissionPresetListItem
}

function parseDetail(value: unknown): CollaborationPermissionPreset {
  if (!value || typeof value !== 'object') throw new Error('unknown')
  const item = value as Record<string, unknown>
  const listItem = parseListItem(item)
  if (item.permission_group_mapping_version !== '1' || !Array.isArray(item.grants)
    || typeof item.created_at !== 'string') throw new Error('unknown')
  const grants = item.grants.map(parseGrant)
  if (new Set(grants.map((grant) => grant.capability_key)).size !== grants.length) throw new Error('unknown')
  return { ...listItem, permission_group_mapping_version: '1', grants, created_at: item.created_at }
}

async function invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = args ? await supabase.rpc(name, args) : await supabase.rpc(name)
  if (error) throw mapError(error)
  return data as T
}

export const permissionPresetService = {
  async list(): Promise<CollaborationPermissionPresetListItem[]> {
    const data = await invoke<unknown>('list_collaboration_permission_presets')
    if (!Array.isArray(data)) throw new Error('unknown')
    return data.map(parseListItem)
  },

  async get(presetId: string): Promise<CollaborationPermissionPreset> {
    return parseDetail(await invoke<unknown>('get_collaboration_permission_preset', { p_preset_id: presetId }))
  },

  async create(input: PermissionPresetInput): Promise<CollaborationPermissionPreset> {
    return parseDetail(await invoke<unknown>('create_collaboration_permission_preset', {
      p_name: input.name, p_description: input.description, p_grants: input.grants,
    }))
  },

  async update(presetId: string, expectedVersion: string, input: PermissionPresetInput) {
    if (!/^[1-9][0-9]*$/.test(expectedVersion)) throw new Error('VALIDATION_ERROR')
    const result = await invoke<unknown>('update_collaboration_permission_preset', {
      p_preset_id: presetId, p_expected_version: expectedVersion, p_name: input.name,
      p_description: input.description, p_grants: input.grants,
    })
    if (!result || typeof result !== 'object') throw new Error('unknown')
    const value = result as Record<string, unknown>
    if (typeof value.changed !== 'boolean' || typeof value.version !== 'string'
      || !/^[1-9][0-9]*$/.test(value.version)) throw new Error('unknown')
    return { changed: value.changed, version: value.version, preset: parseDetail(value.preset) }
  },

  async archive(presetId: string, expectedVersion: string) {
    if (!/^[1-9][0-9]*$/.test(expectedVersion)) throw new Error('VALIDATION_ERROR')
    const result = await invoke<unknown>('archive_collaboration_permission_preset', {
      p_preset_id: presetId, p_expected_version: expectedVersion,
    })
    if (!result || typeof result !== 'object') throw new Error('unknown')
    const value = result as Record<string, unknown>
    if (value.archived !== true || typeof value.version !== 'string'
      || !/^[1-9][0-9]*$/.test(value.version)) throw new Error('unknown')
    return { archived: true as const, version: value.version }
  },

  async duplicate(sourcePresetId: string, name: string, description: string | null) {
    return parseDetail(await invoke<unknown>('duplicate_collaboration_permission_preset', {
      p_source_preset_id: sourcePresetId, p_name: name, p_description: description,
    }))
  },
}

export function isPresetError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code
}

export function isPresetScope(value: unknown): value is CollaborationPermissionPresetScope {
  return value === 'system' || value === 'user'
}
