import { supabase } from '@/lib/supabase'

type Uuid = `${string}-${string}-${string}-${string}-${string}`

function requireUuid(value: string): Uuid {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_identifier')
  }
  return value as Uuid
}

export interface CollaborationConnection {
  id: string
  display_name: string
  connected_at: string
}

export interface CollaborationInvitation {
  id: string
  display_name: string
  created_at: string
}

export interface CollaborationState {
  incoming_pending: CollaborationInvitation[]
  outgoing_pending: CollaborationInvitation[]
  connections: CollaborationConnection[]
}

export type CreateInviteStatus =
  | 'created'
  | 'account_not_found'
  | 'account_ambiguous'
  | 'already_connected'
  | 'pending_exists'

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

function domainError(message: string): Error {
  for (const code of ['rate_limited', 'invalid_email', 'self_invite', 'verified_account_required', 'invitation_unavailable', 'connection_unavailable', 'idempotency_key_reused']) {
    if (message.includes(code)) return new Error(code)
  }
  return new Error('unknown')
}

async function runInvitationCommand(
  command: 'accept_collaboration_invite' | 'decline_collaboration_invite' | 'cancel_collaboration_invite',
  invitationId: string,
  idempotencyKey: string,
) {
  const { error } = await supabase.rpc(command, {
    p_invitation_id: requireUuid(invitationId),
    p_idempotency_key: requireUuid(idempotencyKey),
  })
  if (error) throw domainError(error.message)
}

export const collaborationService = {
  async getState(): Promise<CollaborationState> {
    const { data, error } = await supabase.rpc('get_collaboration_state')
    if (error) throw error
    return {
      incoming_pending: Array.isArray(data?.incoming_pending) ? data.incoming_pending : [],
      outgoing_pending: Array.isArray(data?.outgoing_pending) ? data.outgoing_pending : [],
      connections: Array.isArray(data?.connections) ? data.connections : [],
    }
  },

  async createInvite(email: string, idempotencyKey = newIdempotencyKey()): Promise<CreateInviteStatus> {
    const { data, error } = await supabase.rpc('create_collaboration_invite', {
      p_email: email,
      p_idempotency_key: requireUuid(idempotencyKey),
    })
    if (error) throw domainError(error.message)
    const status = data?.status
    if (status === 'created' || status === 'account_not_found' || status === 'account_ambiguous'
      || status === 'already_connected' || status === 'pending_exists') return status
    throw new Error('unknown')
  },

  async acceptInvite(invitationId: string, idempotencyKey = newIdempotencyKey()) {
    await runInvitationCommand('accept_collaboration_invite', invitationId, idempotencyKey)
  },

  async declineInvite(invitationId: string, idempotencyKey = newIdempotencyKey()) {
    await runInvitationCommand('decline_collaboration_invite', invitationId, idempotencyKey)
  },

  async cancelInvite(invitationId: string, idempotencyKey = newIdempotencyKey()) {
    await runInvitationCommand('cancel_collaboration_invite', invitationId, idempotencyKey)
  },

  async endConnection(connectionId: string, idempotencyKey = newIdempotencyKey()) {
    const { error } = await supabase.rpc('end_collaboration', {
      p_connection_id: requireUuid(connectionId),
      p_idempotency_key: requireUuid(idempotencyKey),
    })
    if (error) throw domainError(error.message)
  },
}
