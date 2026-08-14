import { useMemo } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useDashboardAssignments } from '@/features/dashboard/hooks/useDashboardAssignments'
import { DashboardHero } from '@/features/dashboard/components/DashboardHero'
import { NextAssignmentCard } from '@/features/dashboard/components/NextWeddingCard'
import { NextAssignmentsSection } from '@/features/dashboard/components/NextAssignmentsSection'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { PendingWeddingsCard } from '@/features/dashboard/components/PendingWeddingsCard'
import { TrialEndingNotice } from '@/features/billing/TrialEndingNotice'
import { buildAssignmentEvents } from '@/features/calendar/utils/calendarEvents'
import {
  getNearestUpcomingAssignment,
  getNextAssignmentsAfterNearest,
} from '@/features/calendar/utils/assignmentMetrics'
import styles from './DashboardPage.module.css'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'

export function DashboardPage() {
  const { data } = useDashboard()
  const {
    data: assignmentLists,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useDashboardAssignments()
  const { data: studioUser } = useCurrentStudioUser()

  const weddings = assignmentLists?.weddings ?? []

  const assignments = useMemo(
    () =>
      buildAssignmentEvents(
        assignmentLists?.weddings ?? [],
        assignmentLists?.sessions ?? [],
      ),
    [assignmentLists],
  )

  const nearest = useMemo(
    () => getNearestUpcomingAssignment(assignments),
    [assignments],
  )

  const nextThree = useMemo(
    () => getNextAssignmentsAfterNearest(assignments, 3),
    [assignments],
  )

  // Primary content needs light assignment lists; dashboard cards are secondary.
  if (assignmentsLoading) {
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

  if (assignmentsError) {
    return (
      <AppLayout>
        <PageContainer>
          <EmptyState
            title="Nie udało się załadować pulpitu"
            description="Odśwież stronę lub spróbuj ponownie później."
          />
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer>
        <div className={styles.dashboard}>
          <TrialEndingNotice />
          <DashboardHero
            userName={studioUser?.displayName ?? '—'}
            nextWedding={
              nearest?.entityType === 'wedding' ? nearest.wedding : null
            }
          />

          <NextAssignmentCard assignment={nearest} />

          <NextAssignmentsSection assignments={nextThree} />

          <div className={styles.grid}>
            <div className={styles.primary}>
              <PendingWeddingsCard />
              <TodoTodayCard
                tasks={data?.todayTasks ?? []}
                weddings={weddings}
              />
            </div>
            <div className={styles.secondary}>
              <NotificationsCard />
            </div>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
