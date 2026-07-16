import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { DashboardHero } from '@/features/dashboard/components/DashboardHero'
import { NextWeddingCard } from '@/features/dashboard/components/NextWeddingCard'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { PendingWeddingsCard } from '@/features/dashboard/components/PendingWeddingsCard'
import styles from './DashboardPage.module.css'

export function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const { data: weddings, isLoading: weddingsLoading } = useWeddings()

  if (isLoading || weddingsLoading || !data) {
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

  return (
    <AppLayout>
      <PageContainer>
        <div className={styles.dashboard}>
          <DashboardHero userName="Karolina" nextWedding={data.nextWedding} />

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
