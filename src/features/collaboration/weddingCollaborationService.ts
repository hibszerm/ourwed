import { supabase } from '@/lib/supabase'
import { collaborationService } from '@/features/collaboration/collaborationService'

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

  async createInvitation(
    weddingId: string,
    inviteeUserId: string,
    proposedShareAmount: number | null,
    idempotencyKey = newIdempotencyKey(),
  ) {
    const { data, error } = await supabase.rpc('create_wedding_collaboration_invite', {
      p_wedding_id: weddingId,
      p_invitee_user_id: inviteeUserId,
      p_proposed_share_amount: proposedShareAmount,
      p_idempotency_key: idempotencyKey,
    })
    if (error) throw rpcError(error)
    return data as { status: string; invitation_id?: string; duplicate?: boolean }
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
