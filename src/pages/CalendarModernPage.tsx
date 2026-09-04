import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useAuth } from '@/features/auth/AuthProvider'
import { AddAssignmentDialog } from '@/features/calendar/components/AddAssignmentDialog'
import { type CalendarViewMode } from '@/features/calendar/components/CalendarToolbar'
import { ModernCalendarWorkspace } from '@/features/calendar/modern/ModernCalendarWorkspace'
import {
  readCalendarViewMode,
  writeCalendarViewMode,
  type CalendarCollectionViewMode,
} from '@/features/calendar/modern/calendarViewMode'
import {
  calendarEventsQueryKey,
  useCalendarEvents,
  useCalendarSessions,
  useCalendarWeddings,
} from '@/features/calendar/hooks/useCalendarLightQueries'
import { addDays, addMonths, startOfMonth, startOfWeek } from '@/features/calendar/utils/calendarDates'
import {
  buildCalendarEventsFromRows,
  mergeCalendarUiEvents,
  type CalendarUiEvent,
} from '@/features/calendar/utils/calendarEvents'
import {
  calendarEventService,
  type CalendarEvent,
} from '@/lib/api/calendarEventService'
import { withDevPerf } from '@/lib/performance/devPerf'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import type { Wedding } from '@/types/wedding'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { devWarnArgs } from '@/lib/debug/devConsole'
import styles from './CalendarModernPage.module.css'

function calendarEventsFingerprint(events: CalendarEvent[]): string {
  return events
    .map(
      (e) =>
        `${e.id}\0${e.weddingId}\0${e.startDate}\0${e.title}\0${e.location ?? ''}\0${e.color ?? ''}`,
    )
    .sort()
    .join('\n')
}

function weddingRepairSourceKey(weddings: Wedding[]): string {
  return weddings
    .map(
      (w) =>
        [
          w.id,
          w.date,
          w.accentColor,
          w.ceremonyLocation ?? '',
          w.receptionLocation ?? '',
          w.couple.venue ?? '',
          w.displayName ?? '',
          w.couple.partner1,
          w.couple.partner2,
        ].join('|'),
    )
    .join(';')
}

export function CalendarModernPage() {
  const { user } = useAuth()
  const { requirePro } = useProAccessGate()
  const queryClient = useQueryClient()
  const {
    data: weddings = [],
    isLoading: weddingsLoading,
    isError: weddingsError,
    error: weddingsErr,
    refetch: refetchWeddings,
    isSuccess: weddingsReady,
  } = useCalendarWeddings()
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    isError: sessionsError,
    error: sessionsErr,
    refetch: refetchSessions,
  } = useCalendarSessions()
  const {
    data: calendarRows = [],
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErr,
    refetch: refetchEvents,
  } = useCalendarEvents()
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('month')
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<CalendarUiEvent | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [assignmentDateKey, setAssignmentDateKey] = useState<string | null>(
    null,
  )
  const [collectionView, setCollectionView] =
    useState<CalendarCollectionViewMode>(() => readCalendarViewMode())
  const [entrance] = useState<'full' | 'soft'>(() =>
    weddingsLoading || sessionsLoading || eventsLoading ? 'soft' : 'full',
  )

  const weddingEvents = useMemo(
    () => buildCalendarEventsFromRows(calendarRows, weddings),
    [calendarRows, weddings],
  )

  const events = useMemo(
    () => mergeCalendarUiEvents(weddingEvents, sessions),
    [weddingEvents, sessions],
  )

  const isLoading = weddingsLoading || sessionsLoading || eventsLoading
  const isError = weddingsError || eventsError || sessionsError

  const repairSourceKey = useMemo(
    () => weddingRepairSourceKey(weddings),
    [weddings],
  )

  useEffect(() => {
    if (!user?.id || !weddingsReady) return
    if (weddings.length === 0) return

    let cancelled = false
    const cached =
      queryClient.getQueryData<CalendarEvent[]>(
        calendarEventsQueryKey(user.id),
      ) ?? []
    const beforeFp = calendarEventsFingerprint(cached)

    void withDevPerf('calendar.repair', async () => {
      try {
        const next = await calendarEventService.syncWeddingDayEvents(weddings)
        if (cancelled) return
        if (calendarEventsFingerprint(next) === beforeFp) return
        queryClient.setQueryData(calendarEventsQueryKey(user.id), next)
      } catch (err) {
        if (import.meta.env?.DEV) {
          devWarnArgs(
            '[calendar.repair] deferred wedding-day sync failed',
            err,
          )
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [user?.id, weddingsReady, repairSourceKey, weddings, queryClient])

  function openAssignmentChooser(dateKey?: string) {
    requirePro(() => {
      setAssignmentDateKey(dateKey ?? null)
      setAssignmentDialogOpen(true)
    })
  }

  function handleToday() {
    const today = new Date()
    setAnchor(
      calendarView === 'month' ? startOfMonth(today) : startOfWeek(today),
    )
  }

  function handlePrev() {
    setAnchor((current) =>
      calendarView === 'month'
        ? addMonths(current, -1)
        : addDays(startOfWeek(current), -7),
    )
  }

  function handleNext() {
    setAnchor((current) =>
      calendarView === 'month'
        ? addMonths(current, 1)
        : addDays(startOfWeek(current), 7),
    )
  }

  function handleCalendarViewChange(next: CalendarViewMode) {
    setCalendarView(next)
    setAnchor((current) =>
      next === 'month' ? startOfMonth(current) : startOfWeek(current),
    )
  }

  function handleCollectionViewChange(mode: CalendarCollectionViewMode) {
    setCollectionView(mode)
    writeCalendarViewMode(mode)
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.page} data-testid="calendar-modern">
          <header className={styles.header}>
            <h1 className={styles.title}>Kalendarz</h1>
            <div className={styles.actions}>
              <Button
                className={styles.createAction}
                type="button"
                variant="primary"
                onClick={() => openAssignmentChooser()}
              >
                + Dodaj zlecenie
              </Button>
            </div>
          </header>

          {isLoading ? (
            <ModernCalendarSkeleton />
          ) : isError ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>
                Nie udało się załadować kalendarza
              </p>
              <p className={styles.emptyDesc}>
                {getUserFacingErrorMessage(
                  weddingsErr ?? eventsErr ?? sessionsErr,
                  'Nie udało się pobrać wydarzeń.',
                )}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void refetchWeddings()
                  void refetchEvents()
                  void refetchSessions()
                }}
              >
                Spróbuj ponownie
              </Button>
            </div>
          ) : (
            <ModernCalendarWorkspace
              events={events}
              calendarView={calendarView}
              collectionView={collectionView}
              anchor={anchor}
              selected={selected}
              entrance={entrance}
              onCalendarViewChange={handleCalendarViewChange}
              onCollectionViewChange={handleCollectionViewChange}
              onToday={handleToday}
              onPrev={handlePrev}
              onNext={handleNext}
              onSelectEvent={setSelected}
              onCloseDrawer={() => setSelected(null)}
              onAddAssignment={openAssignmentChooser}
            />
          )}
        </div>
      </PageContainer>

      <AddAssignmentDialog
        open={assignmentDialogOpen}
        dateKey={assignmentDateKey}
        onClose={() => {
          setAssignmentDialogOpen(false)
          setAssignmentDateKey(null)
        }}
      />
    </AppLayout>
  )
}

function ModernCalendarSkeleton() {
  return (
    <div className={styles.skeletonLedger} aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={styles.skeletonRow} />
      ))}
    </div>
  )
}
