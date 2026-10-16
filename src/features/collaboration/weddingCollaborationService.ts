import { supabase } from '@/lib/supabase'
import { collaborationService } from '@/features/collaboration/collaborationService'
import type { CollaborationAccessMode, CollaborationAreaAccess, CollaborationAreaLevel } from './areaAccessV3'
import { parseAreaAccess } from './areaAccessV3'
import type { CollaborationRoleKeyV1 } from './roleCatalog.v1'
import type { CollaborationAccessManagementDto } from './accessManagementTypes'

export type WeddingInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'superseded'

export interface WeddingInvitationPreview {
  invitation_id: string
  status: WeddingInvitationStatus
  reason: string | null
  couple_first_name: string | null
  couple_second_name: string | null
  wedding_date: string | null
  package_label: string | null
  inviter_display_name: string
  contract_value: number | null
  currency: string
  proposed_share_amount: number | null
  membership_status?: 'active' | 'revoked' | 'left' | null
  created_at: string
  expires_at: string
  accepted_at?: string | null
  declined_at?: string | null
  cancelled_at?: string | null
  expired_at?: string | null
  superseded_at?: string | null
}

export interface WeddingCollaborationInvitationState extends WeddingInvitationPreview {
  collaborator_display_name: string
  membership_id: string | null
  membership_status: 'active' | 'revoked' | 'left' | null
}

export interface WeddingCollaborationMembership {
  membership_id: string
  status: 'active'
  collaborator_display_name: string
  accepted_share_amount: number | null
  currency: string
  accepted_at: string
}

export interface WeddingCollaborationState {
  wedding_id: string
  invitations: WeddingCollaborationInvitationState[]
  active_memberships: WeddingCollaborationMembership[]
}

export interface AccessConfigurationInput {
  roleKey: CollaborationRoleKeyV1
  customRoleLabel: string | null
  accessMode: CollaborationAccessMode
  customAreas: CollaborationAreaAccess
}

function parseAccessManagementDto(value: unknown): CollaborationAccessManagementDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('unknown')
  const row = value as Record<string, unknown>
  if (typeof row.wedding_id !== 'string' || (row.status !== 'active' && row.status !== 'pending')
    || typeof row.role_key !== 'string' || (row.custom_role_label !== null && typeof row.custom_role_label !== 'string')
    || (row.access_mode !== 'viewer' && row.access_mode !== 'editor' && row.access_mode !== 'custom')
    || row.mapping_version !== '3'
    || (row.access_version !== undefined && (typeof row.access_version !== 'string' || !/^[1-9][0-9]*$/.test(row.access_version)))
    || (row.configuration_revision !== undefined && (typeof row.configuration_revision !== 'string' || !/^[1-9][0-9]*$/.test(row.configuration_revision)))) {
    throw new Error('unknown')
  }
  const configured = parseAreaAccess(row.configured_areas)
  const effective = parseAreaAccess(row.effective_areas)
  return { ...row, configured_areas: configured, effective_areas: effective } as CollaborationAccessManagementDto
}

function serializeAreas(areas: CollaborationAreaAccess) {
  return Object.fromEntries(Object.entries(areas).map(([key, level]) => [key, level as CollaborationAreaLevel]))
}

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function rpcError(error: { message: string }): Error {
  const known = [
    'unauthorized',
    'wedding_unavailable',
    'active_connection_required',
    'active_membership_exists',
    'pending_invitation_exists',
    'invitation_unavailable',
    'membership_unavailable',
    'invalid_proposed_share_amount',
    'FORBIDDEN', 'UNAVAILABLE', 'CONFLICT', 'VALIDATION_ERROR',
  ]
  const code = known.find((candidate) => error.message.includes(candidate))
  return new Error(code ?? 'unknown')
}

async function runCommand(
  command:
    | 'accept_wedding_collaboration_invite'
    | 'decline_wedding_collaboration_invite'
    | 'cancel_wedding_collaboration_invite'
    | 'revoke_wedding_collaboration_membership'
    | 'leave_wedding_collaboration',
  idField: 'p_invitation_id' | 'p_membership_id',
  id: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc(command, {
    [idField]: id,
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw rpcError(error)
  if (!data || typeof data !== 'object') throw new Error('unknown')
  return data as Record<string, unknown>
}

export const weddingCollaborationService = {
  async getOwnerState(weddingId: string): Promise<WeddingCollaborationState | null> {
    const { data, error } = await supabase.rpc('get_wedding_collaboration_state', {
      p_wedding_id: weddingId,
    })
    if (error) throw rpcError(error)
    if (!data || typeof data !== 'object') return null
    const value = data as Record<string, unknown>
    return {
      wedding_id: String(value.wedding_id ?? weddingId),
      invitations: asArray<WeddingCollaborationInvitationState>(value.invitations),
      active_memberships: asArray<WeddingCollaborationMembership>(value.active_memberships),
    }
  },

  async listMine(): Promise<WeddingInvitationPreview[]> {
    const { data, error } = await supabase.rpc('list_my_wedding_collaboration_invitations')
    if (error) throw rpcError(error)
    return asArray<WeddingInvitationPreview>(data)
  },

  async getPreview(invitationId: string): Promise<WeddingInvitationPreview | null> {
    const { data, error } = await supabase.rpc('get_wedding_collaboration_invitation_preview', {
      p_invitation_id: invitationId,
    })
    if (error) throw rpcError(error)
    return data && typeof data === 'object' ? data as WeddingInvitationPreview : null
  },

  async getActiveCollaborators() {
    return (await collaborationService.getState()).connections
  },

  async createConfiguredInvitation(
    weddingId: string,
    connectionId: string,
    proposedShareAmount: number | null,
    configuration: AccessConfigurationInput,
    idempotencyKey = newIdempotencyKey(),
  ) {
    const { data, error } = await supabase.rpc('create_wedding_collaboration_invitation_v3', {
      p_wedding_id: weddingId,
      p_connection_id: connectionId,
      p_proposed_share_amount: proposedShareAmount,
      p_idempotency_key: idempotencyKey,
      p_role_key: configuration.roleKey,
      p_custom_role_label: configuration.customRoleLabel,
      p_access_mode: configuration.accessMode,
      p_custom_areas: serializeAreas(configuration.customAreas),
    })
    if (error) throw rpcError(error)
    return data as { status: string; invitation_id?: string; duplicate?: boolean }
  },

  async getMembershipAccessManagement(weddingId: string, membershipId: string) {
    const { data, error } = await supabase.rpc('get_wedding_collaboration_membership_access_management_v3', {
      p_wedding_id: weddingId, p_membership_id: membershipId,
    })
    if (error) throw rpcError(error)
    return parseAccessManagementDto(data)
  },

  async getInvitationAccessManagement(weddingId: string, invitationId: string) {
    const { data, error } = await supabase.rpc('get_wedding_collaboration_invitation_access_management_v3', {
      p_wedding_id: weddingId, p_invitation_id: invitationId,
    })
    if (error) throw rpcError(error)
    return parseAccessManagementDto(data)
  },

  async updateMembershipAccess(weddingId: string, membershipId: string, expectedAccessVersion: string,
    configuration: AccessConfigurationInput) {
    const { data, error } = await supabase.rpc('update_wedding_collaboration_membership_access_v3', {
      p_wedding_id: weddingId, p_membership_id: membershipId,
      p_expected_access_version: expectedAccessVersion, p_role_key: configuration.roleKey,
      p_custom_role_label: configuration.customRoleLabel, p_access_mode: configuration.accessMode,
      p_custom_areas: serializeAreas(configuration.customAreas),
    })
    if (error) throw rpcError(error)
    const result = data as Record<string, unknown>
    if (typeof result.access_version !== 'string' || !/^[1-9][0-9]*$/.test(result.access_version)) throw new Error('unknown')
    return { changed: result.changed === true, access_version: result.access_version,
      configuration: parseAccessManagementDto(result.configuration) }
  },

  async updateInvitationAccess(weddingId: string, invitationId: string, expectedRevision: string,
    configuration: AccessConfigurationInput) {
    const { data, error } = await supabase.rpc('update_wedding_collaboration_invitation_access_v3', {
      p_wedding_id: weddingId, p_invitation_id: invitationId,
      p_expected_configuration_revision: expectedRevision, p_role_key: configuration.roleKey,
      p_custom_role_label: configuration.customRoleLabel, p_access_mode: configuration.accessMode,
      p_custom_areas: serializeAreas(configuration.customAreas),
    })
    if (error) throw rpcError(error)
    const result = data as Record<string, unknown>
    if (typeof result.configuration_revision !== 'string' || !/^[1-9][0-9]*$/.test(result.configuration_revision)) throw new Error('unknown')
    return { changed: result.changed === true, configuration_revision: result.configuration_revision,
      configuration: parseAccessManagementDto(result.configuration) }
  },

  async acceptInvitation(id: string) {
    const result = await runCommand('accept_wedding_collaboration_invite', 'p_invitation_id', id)
    if (result.status !== 'accepted') throw new Error('invitation_unavailable')
    return result
  },

  declineInvitation(id: string) {
    return runCommand('decline_wedding_collaboration_invite', 'p_invitation_id', id)
  },

  cancelInvitation(id: string) {
    return runCommand('cancel_wedding_collaboration_invite', 'p_invitation_id', id)
  },

  revokeMembership(id: string) {
    return runCommand('revoke_wedding_collaboration_membership', 'p_membership_id', id)
  },

  leaveMembership(id: string) {
    return runCommand('leave_wedding_collaboration', 'p_membership_id', id)
  },
}
