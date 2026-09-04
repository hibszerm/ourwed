import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  ModernExtraServicesWorkspace,
  type ExtraServiceEditorValues,
} from '@/features/studio/extras/ModernExtraServicesWorkspace'
import { extraServiceService } from '@/lib/api/extraServiceService'

export function ExtraServicesPage() {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const { requirePro } = useProAccessGate()
  const { data: services = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['studio-extra-services', userId],
    queryFn: () => extraServiceService.list(),
    enabled: Boolean(userId),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['studio-extra-services'] })

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      editingId,
    }: {
      values: ExtraServiceEditorValues
      editingId: string | null
    }) => {
      if (editingId) {
        return extraServiceService.update(editingId, values)
      }
      return extraServiceService.create(values)
    },
    onSuccess: () => {
      void invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => extraServiceService.delete(id),
    onSuccess: () => {
      void invalidate()
    },
  })

  async function handleReorder(fromId: string, toId: string) {
    if (!requirePro()) return
    if (fromId === toId) return
    const ordered = [...services].sort((a, b) => a.sortOrder - b.sortOrder)
    const ids = ordered.map((service) => service.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    await extraServiceService.reorder(next)
    void invalidate()
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <ModernExtraServicesWorkspace
          services={[...services].sort((a, b) => a.sortOrder - b.sortOrder)}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={() => void refetch()}
          saveBusy={saveMutation.isPending}
          onSave={async (values, editingId) => {
            if (!requirePro()) return false
            await saveMutation.mutateAsync({ values, editingId })
            return true
          }}
          onReorder={handleReorder}
          onCheckUsed={(id) => extraServiceService.isAssignedToWedding(id)}
          onDelete={async (id) => {
            await deleteMutation.mutateAsync(id)
          }}
          canMutate={(action) => requirePro(action)}
        />
      </PageContainer>
    </AppLayout>
  )
}
