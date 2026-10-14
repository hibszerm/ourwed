import { supabase } from '@/lib/supabase'
import { collaborationService } from '@/features/collaboration/collaborationService'
import type { CollaborationAccessModeV1, CollaborationRoleKeyV1 } from './roleCatalog.v1'
import type { CollaborationAccessManagementDto, CustomCapabilityGrant } from './accessManagementTypes'

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

export interface WeddingCollaborationAccessPreviews {
  viewer_preview: CustomCapabilityGrant[]
  editor_preview: CustomCapabilityGrant[]
  permission_group_mapping_version: '1'
}

export interface AccessConfigurationInput {
  roleKey: CollaborationRoleKeyV1
  customRoleLabel: string | null
  accessMode: CollaborationAccessModeV1
  customGrants: CustomCapabilityGrant[] | null
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

  async getAccessPreviews(weddingId: string): Promise<WeddingCollaborationAccessPreviews> {
    const { data, error } = await supabase.rpc('get_wedding_collaboration_access_previews', {
      p_wedding_id: weddingId,
    })
    if (error) throw rpcError(error)
    return data as WeddingCollaborationAccessPreviews
  },

  async createConfiguredInvitation(
    weddingId: string,
    connectionId: string,
    proposedShareAmount: number | null,
    configuration: AccessConfigurationInput,
    idempotencyKey = newIdempotencyKey(),
  ) {
    const { data, error } = await supabase.rpc('create_wedding_collaboration_invitation_configured', {
      p_wedding_id: weddingId,
      p_connection_id: connectionId,
      p_proposed_share_amount: proposedShareAmount,
      p_idempotency_key: idempotencyKey,
      p_role_key: configuration.roleKey,
      p_custom_role_label: configuration.customRoleLabel,
      p_access_mode: configuration.accessMode,
      p_custom_grants: configuration.customGrants,
    })
    if (error) throw rpcError(error)
    return data as { status: string; invitation_id?: string; duplicate?: boolean }
  },

  async getMembershipAccessManagement(weddingId: string, membershipId: string) {
    const { data, error } = await supabase.rpc('get_wedding_collaboration_membership_access_management', {
      p_wedding_id: weddingId, p_membership_id: membershipId,
    })
    if (error) throw rpcError(error)
    return data as CollaborationAccessManagementDto
  },

  async getInvitationAccessManagement(weddingId: string, invitationId: string) {
    const { data, error } = await supabase.rpc('get_wedding_collaboration_invitation_access_management', {
      p_wedding_id: weddingId, p_invitation_id: invitationId,
    })
    if (error) throw rpcError(error)
    return data as CollaborationAccessManagementDto
  },

  async updateMembershipAccess(weddingId: string, membershipId: string, expectedAccessVersion: string,
    configuration: AccessConfigurationInput) {
    const { data, error } = await supabase.rpc('update_wedding_collaboration_membership_access', {
      p_wedding_id: weddingId, p_membership_id: membershipId,
      p_expected_access_version: expectedAccessVersion, p_role_key: configuration.roleKey,
      p_custom_role_label: configuration.customRoleLabel, p_access_mode: configuration.accessMode,
      p_custom_grants: configuration.customGrants,
    })
    if (error) throw rpcError(error)
    return data as { changed: boolean; access_version: string; configuration: CollaborationAccessManagementDto }
  },

  async updateInvitationAccess(weddingId: string, invitationId: string, expectedRevision: string,
    configuration: AccessConfigurationInput) {
    const { data, error } = await supabase.rpc('update_wedding_collaboration_invitation_access', {
      p_wedding_id: weddingId, p_invitation_id: invitationId,
      p_expected_configuration_revision: expectedRevision, p_role_key: configuration.roleKey,
      p_custom_role_label: configuration.customRoleLabel, p_access_mode: configuration.accessMode,
      p_custom_grants: configuration.customGrants,
    })
    if (error) throw rpcError(error)
    return data as { changed: boolean; configuration_revision: string; configuration: CollaborationAccessManagementDto }
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
