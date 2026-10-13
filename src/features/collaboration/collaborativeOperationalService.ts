import { supabase } from '@/lib/supabase'
import {
  COLLABORATIVE_PLACE_ROLES,
  isCollaborativePlaceRole,
  isValidOperationalClock,
  type CollaborationVersion,
  type CollaborativeOperationalTimeCommandResult,
  type CollaborativeOperationalTimeSource,
  type CollaborativeWeddingOperationalEditPlace,
  type CollaborativeWeddingOperationalEditState,
  type CollaborativeWeddingPlaceCommandResult,
  type UpdateCollaborativeOperationalTimeInput,
  type UpdateCollaborativeWeddingPlaceInput,
} from './collaborativeWeddingTypes'

export type CollaborationCommandErrorCode =
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'

const ROLE_SET = new Set<string>(COLLABORATIVE_PLACE_ROLES)
const EDIT_STATE_ROOT_KEYS = ['places', 'wedding_id']
const EDIT_PLACE_KEYS = [
  'address_version',
  'effective_operational_time',
  'formatted_address',
  'operational_time_override',
  'role',
  'time_source',
  'time_version',
]

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function validVersion(value: unknown): value is CollaborationVersion {
  return value === null || (typeof value === 'string' && /^[1-9][0-9]*$/.test(value))
}

function mapEditPlace(value: unknown): CollaborativeWeddingOperationalEditPlace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const source = row.time_source
  if (
    !exactKeys(row, EDIT_PLACE_KEYS)
    || !isCollaborativePlaceRole(row.role)
    || typeof row.formatted_address !== 'string'
    || !validVersion(row.address_version)
    || !validVersion(row.time_version)
    || (row.operational_time_override !== null && typeof row.operational_time_override !== 'string')
    || (row.effective_operational_time !== null && !isValidOperationalClock(row.effective_operational_time))
    || (source !== 'override' && source !== 'ceremony_fallback' && source !== 'none')
  ) return null

  return {
    role: row.role,
    formatted_address: row.formatted_address,
    address_version: row.address_version,
    operational_time_override: row.operational_time_override as string | null,
    effective_operational_time: row.effective_operational_time as string | null,
    time_source: source as CollaborativeOperationalTimeSource,
    time_version: row.time_version,
  }
}

function mapEditState(value: unknown): CollaborativeWeddingOperationalEditState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SERVER_ERROR')
  const row = value as Record<string, unknown>
  if (!exactKeys(row, EDIT_STATE_ROOT_KEYS) || typeof row.wedding_id !== 'string' || !Array.isArray(row.places)) {
    throw new Error('SERVER_ERROR')
  }
  const places = row.places.map(mapEditPlace)
  if (places.length !== 4 || places.some((place) => place === null)) throw new Error('SERVER_ERROR')
  const mapped = places as CollaborativeWeddingOperationalEditPlace[]
  if (new Set(mapped.map((place) => place.role)).size !== 4 || mapped.some((place) => !ROLE_SET.has(place.role))) {
    throw new Error('SERVER_ERROR')
  }
  return { wedding_id: row.wedding_id, places: mapped }
}

function domainError(message: string): Error {
  for (const code of ['VALIDATION_ERROR', 'CONFLICT', 'UNAVAILABLE'] as const) {
    if (message.includes(code)) return new Error(code)
  }
  return new Error('SERVER_ERROR')
}

function mapPlaceCommand(value: unknown): CollaborativeWeddingPlaceCommandResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SERVER_ERROR')
  const row = value as Record<string, unknown>
  if (
    !exactKeys(row, ['wedding_id', 'role', 'formatted_address', 'address_version', 'changed'])
    || typeof row.wedding_id !== 'string'
    || !isCollaborativePlaceRole(row.role)
    || typeof row.formatted_address !== 'string'
    || typeof row.address_version !== 'string'
    || !/^[1-9][0-9]*$/.test(row.address_version)
    || typeof row.changed !== 'boolean'
  ) throw new Error('SERVER_ERROR')
  return row as unknown as CollaborativeWeddingPlaceCommandResult
}

function mapTimeCommand(value: unknown): CollaborativeOperationalTimeCommandResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SERVER_ERROR')
  const row = value as Record<string, unknown>
  if (
    !exactKeys(row, [
      'wedding_id', 'role', 'operational_time_override', 'effective_operational_time',
      'time_source', 'time_version', 'changed',
    ])
    || typeof row.wedding_id !== 'string'
    || !isCollaborativePlaceRole(row.role)
    || (row.operational_time_override !== null && typeof row.operational_time_override !== 'string')
    || (row.effective_operational_time !== null && !isValidOperationalClock(row.effective_operational_time))
    || !validVersion(row.time_version)
    || (row.time_source !== 'override' && row.time_source !== 'ceremony_fallback' && row.time_source !== 'none')
    || typeof row.changed !== 'boolean'
  ) throw new Error('SERVER_ERROR')
  return row as unknown as CollaborativeOperationalTimeCommandResult
}

export function validateCollaborativeAddress(raw: string): string | null {
  const value = raw.trim()
  if ([...value].length > 500 || [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })) return null
  return value
}

export function validateCollaborativeClock(value: string): boolean {
  return isValidOperationalClock(value)
}

export function isCollaborationError(error: unknown, code: CollaborationCommandErrorCode): boolean {
  return error instanceof Error && error.message === code
}

export const collaborativeOperationalService = {
  async getEditState(weddingId: string): Promise<CollaborativeWeddingOperationalEditState> {
    const { data, error } = await supabase.rpc('get_collaborative_wedding_operational_edit_state', {
      p_wedding_id: weddingId,
    })
    if (error) throw domainError(error.message)
    return mapEditState(data)
  },

  async updatePlace(input: UpdateCollaborativeWeddingPlaceInput): Promise<CollaborativeWeddingPlaceCommandResult> {
    const { data, error } = await supabase.rpc('update_collaborative_wedding_place', {
      p_wedding_id: input.weddingId,
      p_role: input.role,
      p_formatted_address: input.formattedAddress,
      p_expected_version: input.expectedVersion,
    })
    if (error) throw domainError(error.message)
    return mapPlaceCommand(data)
  },

  async updateTime(input: UpdateCollaborativeOperationalTimeInput): Promise<CollaborativeOperationalTimeCommandResult> {
    const { data, error } = await supabase.rpc('update_collaborative_operational_time', {
      p_wedding_id: input.weddingId,
      p_role: input.role,
      p_operational_time: input.operationalTime,
      p_expected_version: input.expectedVersion,
    })
    if (error) throw domainError(error.message)
    return mapTimeCommand(data)
  },
}
