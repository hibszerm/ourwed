import { supabase } from '@/lib/supabase'
import { parseAreaAccess } from './areaAccessV3'
import type { CollaborationPermissionPreset, CollaborationPermissionPresetListItem, PermissionPresetInput } from './permissionPresetTypes'

const RPC_ERRORS = ['UNAVAILABLE', 'FORBIDDEN', 'CONFLICT', 'VALIDATION_ERROR'] as const
function mapError(error: { message: string }): Error {
  return new Error(RPC_ERRORS.find((code) => error.message.includes(code)) ?? 'unknown')
}

function parseListItem(value: unknown): CollaborationPermissionPresetListItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('unknown')
  const item = value as Record<string, unknown>
  if (typeof item.preset_id !== 'string' || (item.scope !== 'system' && item.scope !== 'user')
    || typeof item.name !== 'string' || (item.description !== null && typeof item.description !== 'string')
    || typeof item.version !== 'string' || !/^[1-9][0-9]*$/.test(item.version)
    || typeof item.updated_at !== 'string') throw new Error('unknown')
  return item as unknown as CollaborationPermissionPresetListItem
}

function parseDetail(value: unknown): CollaborationPermissionPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('unknown')
  const item = value as Record<string, unknown>
  const base = parseListItem(item)
  if (item.mapping_version !== '3' || typeof item.created_at !== 'string') throw new Error('unknown')
  return { ...base, mapping_version: '3', areas: parseAreaAccess(item.areas), created_at: item.created_at }
}

async function invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = args ? await supabase.rpc(name, args) : await supabase.rpc(name)
  if (error) throw mapError(error)
  return data as T
}

export const permissionPresetService = {
  async list(): Promise<CollaborationPermissionPresetListItem[]> {
    const data = await invoke<unknown>('list_collaboration_permission_presets_v3')
    if (!Array.isArray(data)) throw new Error('unknown')
    return data.map(parseListItem)
  },
  async get(presetId: string): Promise<CollaborationPermissionPreset> {
    return parseDetail(await invoke<unknown>('get_collaboration_permission_preset_v3', { p_preset_id: presetId }))
  },
  async create(input: PermissionPresetInput): Promise<CollaborationPermissionPreset> {
    return parseDetail(await invoke<unknown>('create_collaboration_permission_preset_v3', {
      p_name: input.name, p_description: input.description, p_areas: input.areas,
    }))
  },
  async update(presetId: string, expectedVersion: string, input: PermissionPresetInput) {
    if (!/^[1-9][0-9]*$/.test(expectedVersion)) throw new Error('VALIDATION_ERROR')
    return parseDetail(await invoke<unknown>('update_collaboration_permission_preset_v3', {
      p_preset_id: presetId, p_expected_version: expectedVersion, p_name: input.name,
      p_description: input.description, p_areas: input.areas,
    }))
  },
  async archive(presetId: string, expectedVersion: string) {
    if (!/^[1-9][0-9]*$/.test(expectedVersion)) throw new Error('VALIDATION_ERROR')
    const result = await invoke<unknown>('archive_collaboration_permission_preset_v3', {
      p_preset_id: presetId, p_expected_version: expectedVersion,
    })
    if (!result || typeof result !== 'object') throw new Error('unknown')
    const value = result as Record<string, unknown>
    if (value.archived !== true || typeof value.version !== 'string' || !/^[1-9][0-9]*$/.test(value.version)) throw new Error('unknown')
    return { archived: true as const, version: value.version }
  },
  async duplicate(sourcePresetId: string, name: string, description: string | null) {
    return parseDetail(await invoke<unknown>('duplicate_collaboration_permission_preset_v3', {
      p_preset_id: sourcePresetId, p_name: name, p_description: description,
    }))
  },
}

export function isPresetError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code
}

export function isPresetScope(value: unknown): value is 'system' | 'user' {
  return value === 'system' || value === 'user'
}
