import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useDashboardAssignments } from '@/features/dashboard/hooks/useDashboardAssignments'
import {
  useLatestNotifications,
  useUnreadNotificationCount,
} from '@/features/notifications/useNotifications'
import { getNearestUpcomingWedding } from '@/lib/utils/weddingMetrics'
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
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

/**
 * Experimental Dashboard V2 — does not replace /dashboard (V1).
 * Uses the same light assignment lists as V1 (no full wedding hydrate path).
 */
export function DashboardV2Page() {
  const {
    data,
    isLoading: dashboardLoading,
    isError: dashboardError,
    error,
    refetch,
  } = useDashboard()
  const {
    data: assignmentLists,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useDashboardAssignments()
  const latestNotifications = useLatestNotifications(8)
  const unreadCount = useUnreadNotificationCount()

  const weddings = assignmentLists?.weddings

  const model = useMemo(() => {
    if (!weddings) return null
    const notifications = latestNotifications.data ?? []
    const built = buildDashboardV2Model({
      nextWedding: getNearestUpcomingWedding(weddings),
      weddings,
      todayTasks: data?.todayTasks ?? [],
      notifications,
    })
    if (typeof unreadCount.data === 'number') {
      built.hero.stats.unreadNotifications = unreadCount.data
    }
    return built
  }, [data, weddings, latestNotifications.data, unreadCount.data])

  // Primary: light dashboard assignment lists.
  if (assignmentsLoading) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <DashboardV2Skeleton />
        </PageContainer>
      </AppLayout>
    )
  }

  if (assignmentsError || !model) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <EmptyState
            title="Nie udało się załadować pulpitu V2"
            description={
              getUserFacingErrorMessage(error, 'Odśwież stronę lub wróć do pulpitu.')
            }
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="button" onClick={() => void refetch()}>
              Spróbuj ponownie
            </button>
            <Link to="/dashboard">Wróć do pulpitu</Link>
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
              Pulpit V2 · Beta
            </span>
            <Link to="/dashboard" className={styles.switchLink}>
              Wróć do pulpitu
            </Link>
          </div>

          {dashboardError ? (
            <EmptyState
              title="Część pulpitu nie załadowała się"
              description="Śluby są widoczne; odśwież, aby dociągnąć zadania."
            />
          ) : null}
          {dashboardLoading && !data ? (
            <div aria-busy="true" />
          ) : null}

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
