import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { DashboardHero } from '@/features/dashboard/components/DashboardHero'
import { NextWeddingCard } from '@/features/dashboard/components/NextWeddingCard'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { PendingWeddingsCard } from '@/features/dashboard/components/PendingWeddingsCard'
import styles from './DashboardPage.module.css'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'

export function DashboardPage() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useDashboard()
  const {
    data: weddings,
    isLoading: weddingsLoading,
    isError: weddingsError,
  } = useWeddings()
  const { data: studioUser } = useCurrentStudioUser()

  if (isLoading || weddingsLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <div className={styles.loading}>
            <div className={styles.loadingPulse} />
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || weddingsError || !data) {
    return (
      <AppLayout>
        <PageContainer>
          <EmptyState
            title="Nie udało się załadować pulpitu"
            description={
              error instanceof Error
                ? error.message
                : 'Odśwież stronę lub spróbuj ponownie później.'
            }
          />
          <button type="button" onClick={() => void refetch()}>
            Spróbuj ponownie
          </button>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer>
        <div className={styles.dashboard}>
          <DashboardHero
            userName={studioUser?.displayName ?? '—'}
            nextWedding={data.nextWedding}
          />

          <NextWeddingCard wedding={data.nextWedding} />

          <div className={styles.grid}>
            <div className={styles.primary}>
              <PendingWeddingsCard />
              <TodoTodayCard tasks={data.todayTasks} weddings={weddings ?? []} />
            </div>
            <div className={styles.secondary}>
              <NotificationsCard notifications={data.notifications} />
            </div>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
