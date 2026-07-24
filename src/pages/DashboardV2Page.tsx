import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import {
  ActivityTimeline,
  BusinessOverview,
  DashboardV2Skeleton,
  FocusPanel,
  HeroCard,
  QuickActions,
  UpcomingStrip,
  buildDashboardV2Model,
} from '@/features/dashboard-v2'
import styles from '@/features/dashboard-v2/DashboardV2.module.css'

/**
 * Experimental Dashboard V2 — does not replace /dashboard (V1).
 */
export function DashboardV2Page() {
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

  const model = useMemo(() => {
    if (!data) return null
    return buildDashboardV2Model({
      nextWedding: data.nextWedding,
      weddings: weddings ?? [],
      todayTasks: data.todayTasks,
      notifications: data.notifications,
    })
  }, [data, weddings])

  if (isLoading || weddingsLoading) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <DashboardV2Skeleton />
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || weddingsError || !model) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <EmptyState
            title="Nie udało się załadować Dashboard V2"
            description={
              error instanceof Error
                ? error.message
                : 'Odśwież stronę lub wróć do Dashboard V1.'
            }
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="button" onClick={() => void refetch()}>
              Spróbuj ponownie
            </button>
            <Link to="/dashboard">Wróć do Dashboard V1</Link>
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.page}>
          <div className={styles.topBar}>
            <span className={styles.betaPill}>
              <FlaskConical size={12} aria-hidden />
              Dashboard V2 · Beta
            </span>
            <Link to="/dashboard" className={styles.switchLink}>
              Wróć do Dashboard V1
            </Link>
          </div>

          <HeroCard model={model.hero} />

          <div className={styles.gridTwo}>
            <FocusPanel actions={model.focus} />
            <ActivityTimeline items={model.timeline} />
          </div>

          <UpcomingStrip cards={model.upcoming} />

          <BusinessOverview kpis={model.kpis} />

          <QuickActions />
        </div>
      </PageContainer>
    </AppLayout>
  )
}
