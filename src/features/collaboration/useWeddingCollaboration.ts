import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { invalidateNotificationQueries } from '@/features/notifications/useNotifications'
import { weddingCollaborationService } from '@/features/collaboration/weddingCollaborationService'
import type { AccessConfigurationInput } from '@/features/collaboration/weddingCollaborationService'

export const weddingCollaborationQueryKeys = {
  ownerState: (userId: string | undefined, weddingId: string) =>
    ['wedding-collaboration', userId, weddingId] as const,
  incoming: (userId: string | undefined) => ['my-wedding-invitations', userId] as const,
  preview: (userId: string | undefined, invitationId: string) =>
    ['wedding-invitation-preview', userId, invitationId] as const,
  collaborators: (userId: string | undefined) => ['wedding-collaborators', userId] as const,
  accessPreviews: (userId: string | undefined, weddingId: string) =>
    ['wedding-collaboration', 'access-previews', userId, weddingId] as const,
  membershipAccess: (userId: string | undefined, weddingId: string, membershipId: string) =>
    ['wedding-collaboration', 'membership-access', userId, weddingId, membershipId] as const,
  invitationAccess: (userId: string | undefined, weddingId: string, invitationId: string) =>
    ['wedding-collaboration', 'invitation-access', userId, weddingId, invitationId] as const,
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

export function useWeddingAccessPreviews(weddingId: string, enabled: boolean) {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: weddingCollaborationQueryKeys.accessPreviews(userId, weddingId),
    queryFn: () => weddingCollaborationService.getAccessPreviews(weddingId),
    enabled: Boolean(userId && weddingId && enabled),
    ...freshness,
  })
}

export function useCreateWeddingInvitation(weddingId: string) {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ connectionId, amount, configuration }: {
      connectionId: string; amount: number | null; configuration: AccessConfigurationInput
    }) => weddingCollaborationService.createConfiguredInvitation(weddingId, connectionId, amount, configuration),
    onSettled: () => invalidateCollaboration(queryClient, userId, { weddingId }),
  })
}

export function useMembershipAccessManagement(weddingId: string, membershipId: string) {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: weddingCollaborationQueryKeys.membershipAccess(userId, weddingId, membershipId),
    queryFn: () => weddingCollaborationService.getMembershipAccessManagement(weddingId, membershipId),
    enabled: Boolean(userId && weddingId && membershipId),
    ...freshness,
  })
}

export function useInvitationAccessManagement(weddingId: string, invitationId: string) {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: weddingCollaborationQueryKeys.invitationAccess(userId, weddingId, invitationId),
    queryFn: () => weddingCollaborationService.getInvitationAccessManagement(weddingId, invitationId),
    enabled: Boolean(userId && weddingId && invitationId),
    ...freshness,
  })
}

export function useUpdateCollaborationAccess(weddingId: string, target: { membershipId?: string; invitationId?: string }) {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  return useMutation<{
    changed: boolean
    access_version?: string
    configuration_revision?: string
    configuration: import('@/features/collaboration/accessManagementTypes').CollaborationAccessManagementDto
  }, Error, { version: string; configuration: AccessConfigurationInput }>({
    mutationFn: ({ version, configuration }: { version: string; configuration: AccessConfigurationInput }) =>
      target.membershipId
        ? weddingCollaborationService.updateMembershipAccess(weddingId, target.membershipId, version, configuration)
        : weddingCollaborationService.updateInvitationAccess(weddingId, target.invitationId!, version, configuration),
    onSuccess: async () => {
      await invalidateCollaboration(queryClient, userId, { weddingId, invitationId: target.invitationId })
      const key = target.membershipId
        ? weddingCollaborationQueryKeys.membershipAccess(userId, weddingId, target.membershipId)
        : weddingCollaborationQueryKeys.invitationAccess(userId, weddingId, target.invitationId!)
      await queryClient.invalidateQueries({ queryKey: key })
    },
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
