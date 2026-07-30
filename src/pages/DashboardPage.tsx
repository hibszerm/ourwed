import { useMemo } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { useSessions } from '@/features/sessions/hooks/useSessions'
import { DashboardHero } from '@/features/dashboard/components/DashboardHero'
import { NextAssignmentCard } from '@/features/dashboard/components/NextWeddingCard'
import { NextAssignmentsSection } from '@/features/dashboard/components/NextAssignmentsSection'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { PendingWeddingsCard } from '@/features/dashboard/components/PendingWeddingsCard'
import { buildAssignmentEvents } from '@/features/calendar/utils/calendarEvents'
import {
  getNearestUpcomingAssignment,
  getNextAssignmentsAfterNearest,
} from '@/features/calendar/utils/assignmentMetrics'
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
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useSessions()
  const { data: studioUser } = useCurrentStudioUser()

  const assignments = useMemo(
    () => buildAssignmentEvents(weddings ?? [], sessions),
    [weddings, sessions],
  )

  const nearest = useMemo(
    () => getNearestUpcomingAssignment(assignments),
    [assignments],
  )

  const nextThree = useMemo(
    () => getNextAssignmentsAfterNearest(assignments, 3),
    [assignments],
  )

  const linkedSessionsForHero = useMemo(() => {
    if (!nearest || nearest.entityType !== 'wedding') return []
    return sessions.filter((s) => s.linkedWeddingId === nearest.entityId)
  }, [nearest, sessions])

  if (isLoading || weddingsLoading || sessionsLoading) {
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

  if (isError || weddingsError || sessionsError || !data) {
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
            nextWedding={
              nearest?.entityType === 'wedding' ? nearest.wedding : null
            }
          />

          <NextAssignmentCard
            assignment={nearest}
            linkedSessions={linkedSessionsForHero}
          />

          <NextAssignmentsSection assignments={nextThree} />

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
