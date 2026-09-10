import { useMemo, useRef, useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDashboardAssignments } from '@/features/dashboard/hooks/useDashboardAssignments'
import { DashboardV3DeadlinePanel } from '@/features/dashboard-v3/DashboardV3DeadlinePanel'
import { DashboardV3Header } from '@/features/dashboard-v3/DashboardV3Header'
import { DashboardV3Hero } from '@/features/dashboard-v3/DashboardV3Hero'
import { DashboardV3InquiriesPanel } from '@/features/dashboard-v3/DashboardV3InquiriesPanel'
import {
  MOBILE_NEXT_ASSIGNMENT_SENTINEL_ID,
  MobileNextAssignmentBar,
} from '@/features/dashboard-v3/MobileNextAssignmentBar'
import { DashboardV3NotificationsPanel } from '@/features/dashboard-v3/DashboardV3NotificationsPanel'
import { DashboardV3TodayPanel } from '@/features/dashboard-v3/DashboardV3TodayPanel'
import { DashboardV3UpcomingAssignments } from '@/features/dashboard-v3/DashboardV3UpcomingAssignments'
import { useDashboardMobileReveals } from '@/features/dashboard-v3/useDashboardMobileReveals'
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
import styles from './DashboardV3Page.module.css'

/**
 * Modern dashboard presentation (accepted V4.1.5 composition).
 * Rendered from /dashboard when interfaceStyle is modern.
 * Reuses current Dashboard data hooks. Does not fork domain logic.
 */
export function DashboardV3Page() {
  const pageRef = useRef<HTMLDivElement>(null)
  const {
    data: assignmentLists,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useDashboardAssignments()
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

  useDashboardMobileReveals(
    pageRef,
    !assignmentsLoading && !assignmentsError && !showFirstRun,
  )

  if (assignmentsLoading) {
    return (
      <AppLayout mobileHeader={<DashboardV3Header compact />}>
        <PageContainer width="full">
          <div className={styles.canvas}>
            <div
              className={styles.loading}
              data-testid="dashboard-v3-loading"
              aria-busy="true"
              aria-label="Ładowanie pulpitu"
            >
              <div className={styles.loadingPulse} />
              <div className={styles.mobileLoading} aria-hidden>
                <div className={styles.mobileLoadingHero} />
                <div className={styles.mobileLoadingHeading} />
                <div className={styles.mobileLoadingRows}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (assignmentsError) {
    return (
      <AppLayout mobileHeader={<DashboardV3Header compact />}>
        <PageContainer width="full">
          <div className={styles.canvas}>
            <EmptyState
              title="Nie udało się załadować pulpitu"
              description="Odśwież stronę lub spróbuj ponownie później."
            />
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (showFirstRun) {
    return (
      <AppLayout mobileHeader={<DashboardV3Header compact />}>
        <PageContainer width="wide">
          <div className={styles.canvas}>
            <TrialEndingNotice />
            {/* No desktop operational greeting — FirstRunHome owns the hero. */}
            <FirstRunHome
              onPreferOperationalDashboard={() => setPreferOperational(true)}
            />
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      mobileHeader={
        <>
          <DashboardV3Header compact />
          <MobileNextAssignmentBar
            key={
              nearest
                ? `${nearest.entityType}:${nearest.entityId}`
                : 'no-nearest-assignment'
            }
            assignment={nearest}
          />
        </>
      }
    >
      <GuideDiscoveryModalHost showingFirstRunHome={false} />
      <PageContainer width="full">
        <div className={styles.canvas}>
          <div
            ref={pageRef}
            className={styles.page}
            data-testid="dashboard-v3"
          >
            <TrialEndingNotice />
            <div className={styles.desktopHeader}>
              <DashboardV3Header />
            </div>

            <div
              className={styles.layout}
              data-has-upcoming={nextThree.length > 0 ? 'true' : 'false'}
            >
              <div className={styles.hero}>
                <DashboardV3Hero assignment={nearest} />
                <span
                  id={MOBILE_NEXT_ASSIGNMENT_SENTINEL_ID}
                  className={styles.assignmentSentinel}
                  aria-hidden
                />
              </div>

              <div className={styles.today} data-mobile-reveal="pending">
                <DashboardV3TodayPanel weddings={weddings} />
              </div>

              <div className={styles.deadlines} data-mobile-reveal="pending">
                <DashboardV3DeadlinePanel
                  hasWeddingHistory={weddings.length > 0}
                />
              </div>

              {nextThree.length > 0 ? (
                <div
                  className={styles.upcomingBand}
                  data-mobile-reveal="pending"
                  data-testid="dashboard-v3-upcoming-band"
                >
                  <h2
                    className={styles.upcomingLabel}
                    id="dashboard-v3-upcoming-title"
                  >
                    Kolejne zlecenia
                  </h2>

                  <div className={styles.upcoming}>
                    <DashboardV3UpcomingAssignments
                      assignments={nextThree}
                      labelledBy="dashboard-v3-upcoming-title"
                    />
                  </div>
                </div>
              ) : null}

              <div className={styles.feed}>
                <div
                  className={styles.notifications}
                  data-mobile-reveal="pending"
                >
                  <DashboardV3NotificationsPanel />
                </div>
                <div
                  className={styles.inquiries}
                  data-mobile-reveal="pending"
                >
                  <DashboardV3InquiriesPanel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
