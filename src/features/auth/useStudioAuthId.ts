import { useAuth } from '@/features/auth/AuthProvider'

/** Authenticated studio uid for tenant-scoped React Query keys. */
export function useStudioAuthId(): string | undefined {
  return useAuth().user?.id
}
