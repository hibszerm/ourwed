import { useMemo, useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDashboardAssignments } from '@/features/dashboard/hooks/useDashboardAssignments'
import { DashboardHero } from '@/features/dashboard/components/DashboardHero'
import { NearestDeliveryDeadlineCard } from '@/features/dashboard/components/NearestDeliveryDeadlineCard'
import { NextAssignmentCard } from '@/features/dashboard/components/NextWeddingCard'
import { NextAssignmentsSection } from '@/features/dashboard/components/NextAssignmentsSection'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { PendingWeddingsCard } from '@/features/dashboard/components/PendingWeddingsCard'
import { TrialEndingNotice } from '@/features/billing/TrialEndingNotice'
import { FirstRunHome } from '@/features/onboarding/FirstRunHome'
import { GuideDiscoveryModalHost } from '@/features/onboarding/guide/GuideDiscoveryModalHost'
import { shouldShowFirstRunHome } from '@/features/onboarding/firstRunDiscriminator'
import { readFirstRunPreferOperationalDashboard } from '@/features/onboarding/firstRunSessionPreference'
import { buildAssignmentEvents } from '@/features/calendar/utils/calendarEvents'
import {
  getNearestUpcomingAssignment,
  getNextAssignmentsAfterNearest,
} from '@/features/calendar/utils/assignmentMetrics'
import styles from './DashboardPage.module.css'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'

export function DashboardPage() {
  const {
    data: assignmentLists,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useDashboardAssignments()
  const { data: studioUser } = useCurrentStudioUser()
  const [preferOperational, setPreferOperational] = useState(() =>
    readFirstRunPreferOperationalDashboard(),
  )

  const weddings = assignmentLists?.weddings ?? []
  const showFirstRun = shouldShowFirstRunHome({
    totalWeddingHistoryCount: weddings.length,
    sessionPreferOperationalDashboard: preferOperational,
  })

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

  if (showFirstRun) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <TrialEndingNotice />
          <FirstRunHome
            onPreferOperationalDashboard={() => setPreferOperational(true)}
          />
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <GuideDiscoveryModalHost showingFirstRunHome={false} />
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
              <TodoTodayCard weddings={weddings} />
              <NearestDeliveryDeadlineCard
                hasWeddingHistory={weddings.length > 0}
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
