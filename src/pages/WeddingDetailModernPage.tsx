import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCollaborativeWeddingIdentity } from '@/features/collaboration/useCollaborativeWeddingIdentity'
import { useWeddingDetailAuthority, useEvictIncompatibleWeddingDetailCaches, weddingDetailAuthorityQueryKey } from '@/features/weddings/detail/weddingDetailAuthority'
import { resolveWeddingDetailHostBranch } from '@/features/weddings/detail/weddingDetailHostBranch'
import { WeddingDetailHostModals } from '@/features/weddings/detail/WeddingDetailHostModals'
import { useWeddingDetailHost } from '@/features/weddings/detail/useWeddingDetailHost'
import { ModernWeddingDetailWorkspace } from '@/features/weddings/modern-detail/ModernWeddingDetailWorkspace'
import { ModernWeddingIdentityHero } from '@/features/weddings/modern-detail/ModernWeddingIdentityHero'
import { SharedV3LogisticsWorkspace } from '@/features/weddings/modern-detail/SharedV3LogisticsWorkspace'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { CollaborativeWeddingIdentity } from '@/features/collaboration/collaborativeWeddingIdentityTypes'
import type { Wedding } from '@/types/wedding'
import { isUuid } from '@/features/collaboration/collaborativeWeddingTypes'
import styles from './WeddingDetailModernPage.module.css'
import workspaceStyles from '@/features/weddings/modern-detail/ModernWeddingDetailWorkspace.module.css'

export function WeddingDetailModernPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const authorityQuery = useWeddingDetailAuthority(id)
  const authority = authorityQuery.data
  useEvictIncompatibleWeddingDetailCaches(user?.id, id, authority)
  const branch = resolveWeddingDetailHostBranch({
    validId: isUuid(id),
    isFetching: authorityQuery.isFetching,
    isPending: authorityQuery.isPending,
    isError: authorityQuery.isError,
    authority,
  })

  if (branch === 'unavailable') return <UnavailableDetail />
  // Never render a cached authority result while the server is refreshing it.
  if (branch === 'loading') return <DetailLoading />
  if (branch === 'error') {
    return <DetailProblem
      title="Nie udało się sprawdzić dostępu"
      description={getUserFacingErrorMessage(authorityQuery.error, 'Spróbuj ponownie za chwilę.')}
      onRetry={() => void authorityQuery.refetch()}
    />
  }
  if (branch === 'owned') return <OwnedWeddingDetail />
  if (branch === 'shared' && authority?.kind === 'shared') {
    return <SharedWeddingDetail weddingId={authority.weddingId} userId={user?.id}
      accessVersion={authority.accessVersion} logisticsLevel={authority.effectiveAreas.logistics} />
  }
  return <UnavailableDetail />
}

function OwnedWeddingDetail() {
  const host = useWeddingDetailHost()

  if (host.isLoading) return <DetailLoading />
  if (host.isError) {
    return <DetailProblem
      title="Nie udało się załadować ślubu"
      description={getUserFacingErrorMessage(host.error, 'Spróbuj odświeżyć stronę.')}
      onRetry={() => void host.refetch()}
    />
  }
  if (!host.wedding || !host.snapshot || !host.sharedProps) return <UnavailableDetail />

  return (
    <AppLayout>
      <PageContainer width="full">
        <div className={styles.page} data-testid="wedding-detail-modern">
          <ModernWeddingDetailWorkspace key={host.wedding.id} {...host.sharedProps} />
        </div>
      </PageContainer>
      <WeddingDetailHostModals host={host} />
    </AppLayout>
  )
}

function SharedWeddingDetail({ weddingId, userId, accessVersion, logisticsLevel }: {
  weddingId: string; userId: string | undefined; accessVersion: string; logisticsLevel: 0 | 1 | 2
}) {
  const queryClient = useQueryClient()
  const detail = useCollaborativeWeddingIdentity(weddingId, userId)

  useEffect(() => {
    if (detail.isSuccess && detail.data === null) {
      void queryClient.invalidateQueries({
        queryKey: weddingDetailAuthorityQueryKey(userId, weddingId),
        exact: true,
      })
    }
  }, [detail.data, detail.isSuccess, queryClient, userId, weddingId])

  if (detail.isPending || detail.isFetching) return <DetailLoading />
  if (detail.isError) {
    return <DetailProblem
      title="Nie udało się odświeżyć danych"
      description="Spróbuj ponownie za chwilę."
      onRetry={() => void detail.refetch()}
    />
  }
  if (!detail.data) return <UnavailableDetail />

  const wedding = toSharedIdentityWedding(detail.data)
  return (
    <AppLayout>
      <PageContainer width="full">
        <div className={styles.page} data-testid="wedding-detail-modern" data-authority="shared">
          <div className={workspaceStyles.workspace} data-testid="shared-canonical-wedding-detail">
            <ModernWeddingIdentityHero wedding={wedding} places={[]} testId="modern-wedding-detail-header" />
            {userId ? <SharedV3LogisticsWorkspace wedding={wedding} userId={userId}
              accessVersion={accessVersion} level={logisticsLevel} /> : null}
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}

function toSharedIdentityWedding(detail: CollaborativeWeddingIdentity): Wedding {
  const partner1 = detail.couple_first_name
  const partner2 = detail.couple_second_name
  return {
    id: detail.wedding_id,
    couple: { partner1, partner2, email: '', phone: '', venue: '', city: '' },
    date: detail.wedding_date ?? '',
    status: 'active',
    workflowStage: 'reservation',
    packageName: '',
    price: 0,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#7f6a58',
    createdAt: '',
  }
}

function DetailLoading() {
  return <AppLayout><PageContainer width="wide"><div className={styles.loading} role="status">Sprawdzanie dostępu do zlecenia…</div></PageContainer></AppLayout>
}

function UnavailableDetail() {
  return <AppLayout><PageContainer width="wide">
    <p className={styles.emptyTitle}>Nie znaleziono</p>
    <p className={styles.emptyDesc}>Nie można otworzyć tego zlecenia.</p>
    <Link to="/sluby"><Button variant="secondary">Wróć do listy</Button></Link>
  </PageContainer></AppLayout>
}

function DetailProblem({ title, description, onRetry }: { title: string; description: string; onRetry: () => void }) {
  return <AppLayout><PageContainer width="wide">
    <p className={styles.emptyTitle}>{title}</p>
    <p className={styles.emptyDesc}>{description}</p>
    <Button type="button" variant="secondary" onClick={onRetry}>Spróbuj ponownie</Button>
  </PageContainer></AppLayout>
}
