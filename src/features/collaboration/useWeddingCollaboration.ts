import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { invalidateNotificationQueries } from '@/features/notifications/useNotifications'
import { weddingCollaborationService } from '@/features/collaboration/weddingCollaborationService'

export const weddingCollaborationQueryKeys = {
  ownerState: (userId: string | undefined, weddingId: string) =>
    ['wedding-collaboration', userId, weddingId] as const,
  incoming: (userId: string | undefined) => ['my-wedding-invitations', userId] as const,
  preview: (userId: string | undefined, invitationId: string) =>
    ['wedding-invitation-preview', userId, invitationId] as const,
  collaborators: (userId: string | undefined) => ['wedding-collaborators', userId] as const,
}

const freshness = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: true,
}

export function useWeddingCollaborationState(weddingId: string) {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: weddingCollaborationQueryKeys.ownerState(userId, weddingId),
    queryFn: () => weddingCollaborationService.getOwnerState(weddingId),
    enabled: Boolean(userId && weddingId),
    ...freshness,
  })
}

export function useMyWeddingInvitations() {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: weddingCollaborationQueryKeys.incoming(userId),
    queryFn: () => weddingCollaborationService.listMine(),
    enabled: Boolean(userId),
    ...freshness,
  })
}

export function useWeddingInvitationPreview(invitationId: string) {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: weddingCollaborationQueryKeys.preview(userId, invitationId),
    queryFn: () => weddingCollaborationService.getPreview(invitationId),
    enabled: Boolean(userId && invitationId),
    ...freshness,
  })
}

export function useActiveWeddingCollaborators() {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: weddingCollaborationQueryKeys.collaborators(userId),
    queryFn: () => weddingCollaborationService.getActiveCollaborators(),
    enabled: Boolean(userId),
    ...freshness,
  })
}

async function invalidateCollaboration(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  input: { weddingId?: string; invitationId?: string; incoming?: boolean },
) {
  const jobs = []
  if (input.weddingId) jobs.push(queryClient.invalidateQueries({
    queryKey: weddingCollaborationQueryKeys.ownerState(userId, input.weddingId),
  }))
  if (input.incoming) jobs.push(queryClient.invalidateQueries({
    queryKey: weddingCollaborationQueryKeys.incoming(userId),
  }))
  if (input.invitationId) jobs.push(queryClient.invalidateQueries({
    queryKey: weddingCollaborationQueryKeys.preview(userId, input.invitationId),
  }))
  await Promise.all(jobs)
  invalidateNotificationQueries(queryClient)
}

export function useCreateWeddingInvitation(weddingId: string) {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ connectionId, amount }: { connectionId: string; amount: number | null }) =>
      weddingCollaborationService.createInvitation(weddingId, connectionId, amount),
    onSettled: () => invalidateCollaboration(queryClient, userId, { weddingId }),
  })
}

export function useWeddingInvitationCommand(weddingId?: string, invitationId?: string) {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { action: 'accept' | 'decline' | 'cancel'; id: string }) => {
      switch (input.action) {
        case 'accept': return weddingCollaborationService.acceptInvitation(input.id)
        case 'decline': return weddingCollaborationService.declineInvitation(input.id)
        case 'cancel': return weddingCollaborationService.cancelInvitation(input.id)
      }
    },
    onSettled: (_data, _error, input) => invalidateCollaboration(queryClient, userId, {
      weddingId,
      invitationId: invitationId ?? input.id,
      incoming: input.action === 'accept' || input.action === 'decline',
    }),
  })
}

export function useWeddingMembershipCommand(weddingId: string) {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (membershipId: string) => weddingCollaborationService.revokeMembership(membershipId),
    onSettled: () => invalidateCollaboration(queryClient, userId, { weddingId }),
  })
}
