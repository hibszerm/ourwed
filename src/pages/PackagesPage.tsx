import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  ModernPackagesWorkspace,
  type PackageFormValues,
} from '@/features/studio/packages/modern/ModernPackagesWorkspace'
import { packageService } from '@/lib/api/packageService'

export function PackagesPage() {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const { requirePro } = useProAccessGate()
  const {
    data: packages = [],
    isLoading,
    isError,
    error,
    refetch,
    isSuccess,
  } = useQuery({
    queryKey: ['studio-packages', userId],
    queryFn: () => packageService.list(),
    enabled: Boolean(userId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['studio-packages'] })
    void queryClient.invalidateQueries({ queryKey: ['public-form'] })
    void queryClient.invalidateQueries({ queryKey: ['weddings'] })
  }

  const createMutation = useMutation({
    mutationFn: packageService.create,
    onSuccess: () => {
      void invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: PackageFormValues
    }) => packageService.update(id, patch),
    onSuccess: () => {
      void invalidate()
    },
  })

  return (
    <AppLayout>
      <PageContainer width="wide">
        <ModernPackagesWorkspace
          packages={[...packages].sort((a, b) => a.sortOrder - b.sortOrder)}
          isLoading={isLoading || (!isSuccess && !isError)}
          isError={isError}
          error={error}
          onRetry={() => void refetch()}
          saveBusy={createMutation.isPending || updateMutation.isPending}
          canMutate={(action) => requirePro(action)}
          onCreate={async (values) => {
            await createMutation.mutateAsync(values)
          }}
          onUpdate={async (id, values) => {
            await updateMutation.mutateAsync({ id, patch: values })
          }}
          onDuplicate={async (id) => {
            await packageService.duplicate(id)
            invalidate()
          }}
          onArchive={async (id) => {
            await packageService.archive(id)
            invalidate()
          }}
          onDelete={async (id) => {
            await packageService.delete(id)
            invalidate()
          }}
          onReorder={async (fromId, toId) => {
            if (!requirePro()) return
            if (fromId === toId) return
            const ordered = [...packages].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            )
            const ids = ordered.map((pkg) => pkg.id)
            const from = ids.indexOf(fromId)
            const to = ids.indexOf(toId)
            if (from < 0 || to < 0) return
            const next = [...ids]
            const [moved] = next.splice(from, 1)
            if (!moved) return
            next.splice(to, 0, moved)
            await packageService.reorder(next)
            invalidate()
          }}
          onPackageUpdated={() => void invalidate()}
        />
      </PageContainer>
    </AppLayout>
  )
}
