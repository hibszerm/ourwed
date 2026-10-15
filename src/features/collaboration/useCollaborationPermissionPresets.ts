import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { permissionPresetService } from './permissionPresetService'
import type { PermissionPresetInput } from './permissionPresetTypes'

export const collaborationPermissionPresetKeys = {
  list: (userId: string | undefined) => ['collaboration', 'permission-presets', userId] as const,
  detail: (userId: string | undefined, presetId: string) =>
    ['collaboration', 'permission-presets', userId, 'detail', presetId] as const,
}

export function useCollaborationPermissionPresets() {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: collaborationPermissionPresetKeys.list(userId),
    queryFn: () => permissionPresetService.list(),
    enabled: Boolean(userId), staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
  })
}

export function useCreateCollaborationPermissionPreset() {
  const userId = useStudioAuthId()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: PermissionPresetInput) => permissionPresetService.create(input),
    onSuccess: async () => client.invalidateQueries({ queryKey: collaborationPermissionPresetKeys.list(userId) }),
  })
}

export function useUpdateCollaborationPermissionPreset() {
  const userId = useStudioAuthId()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ presetId, version, input }: { presetId: string; version: string; input: PermissionPresetInput }) =>
      permissionPresetService.update(presetId, version, input),
    onSuccess: async (_result, variables) => Promise.all([
      client.invalidateQueries({ queryKey: collaborationPermissionPresetKeys.list(userId) }),
      client.invalidateQueries({ queryKey: collaborationPermissionPresetKeys.detail(userId, variables.presetId) }),
    ]),
  })
}

export function useArchiveCollaborationPermissionPreset() {
  const userId = useStudioAuthId()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ presetId, version }: { presetId: string; version: string }) =>
      permissionPresetService.archive(presetId, version),
    onSuccess: async (_result, variables) => Promise.all([
      client.invalidateQueries({ queryKey: collaborationPermissionPresetKeys.list(userId) }),
      client.invalidateQueries({ queryKey: collaborationPermissionPresetKeys.detail(userId, variables.presetId) }),
    ]),
  })
}

export function useDuplicateCollaborationPermissionPreset() {
  const userId = useStudioAuthId()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ sourcePresetId, name, description }: { sourcePresetId: string; name: string; description: string | null }) =>
      permissionPresetService.duplicate(sourcePresetId, name, description),
    onSuccess: async () => client.invalidateQueries({ queryKey: collaborationPermissionPresetKeys.list(userId) }),
  })
}
