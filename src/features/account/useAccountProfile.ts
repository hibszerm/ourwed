import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  accountProfileQueryKey,
  getOwnAccountProfile,
  updateOwnAccountNames,
  type AccountProfile,
} from '@/features/account/profileService'

export function useAccountProfile() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: accountProfileQueryKey(userId ?? 'anon'),
    queryFn: getOwnAccountProfile,
    enabled: Boolean(userId),
    staleTime: 30_000,
  })
}

export function useUpdateAccountNames() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id

  return useMutation({
    mutationFn: updateOwnAccountNames,
    onSuccess: (profile: AccountProfile) => {
      if (!userId) return
      queryClient.setQueryData(accountProfileQueryKey(userId), profile)
      void queryClient.invalidateQueries({
        queryKey: ['current-studio-user', userId],
      })
    },
  })
}
