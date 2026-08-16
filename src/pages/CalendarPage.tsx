import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useAuth } from '@/features/auth/AuthProvider'
import { AddAssignmentDialog } from '@/features/calendar/components/AddAssignmentDialog'
import { CalendarSummary } from '@/features/calendar/components/CalendarSummary'
import {
  CalendarToolbar,
  type CalendarViewMode,
} from '@/features/calendar/components/CalendarToolbar'
import { CalendarMonthView } from '@/features/calendar/components/CalendarMonthView'
import { CalendarWeekView } from '@/features/calendar/components/CalendarWeekView'
import { CalendarDrawer } from '@/features/calendar/components/CalendarDrawer'
import { CalendarMonthWeddings } from '@/features/calendar/components/CalendarMonthWeddings'
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
import styles from './CalendarPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { devWarnArgs } from '@/lib/debug/devConsole'

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

export function CalendarPage() {
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
  const [view, setView] = useState<CalendarViewMode>('month')
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<CalendarUiEvent | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [assignmentDateKey, setAssignmentDateKey] = useState<string | null>(
    null,
  )

  const weddingEvents = useMemo(
    () => buildCalendarEventsFromRows(calendarRows, weddings),
    [calendarRows, weddings],
  )

  const events = useMemo(
    () => mergeCalendarUiEvents(weddingEvents, sessions),
    [weddingEvents, sessions],
  )

  // First paint waits only on light parallel reads — never on syncWeddingDayEvents.
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
    setAnchor(view === 'month' ? startOfMonth(today) : startOfWeek(today))
  }

  function handlePrev() {
    setAnchor((current) =>
      view === 'month' ? addMonths(current, -1) : addDays(startOfWeek(current), -7),
    )
  }

  function handleNext() {
    setAnchor((current) =>
      view === 'month' ? addMonths(current, 1) : addDays(startOfWeek(current), 7),
    )
  }

  function handleViewChange(next: CalendarViewMode) {
    setView(next)
    setAnchor((current) =>
      next === 'month' ? startOfMonth(current) : startOfWeek(current),
    )
  }

  return (
    <AppLayout
      title="Kalendarz"
      subtitle="Planowanie ślubów i sesji"
      action={
        <Button
          type="button"
          variant="primary"
          onClick={() => openAssignmentChooser()}
        >
          + Dodaj zlecenie
        </Button>
      }
    >
      {isLoading ? (
        <PageContainer width="wide">
          <p className={styles.loading}>Ładowanie kalendarza...</p>
        </PageContainer>
      ) : isError ? (
        <PageContainer width="wide">
          <EmptyState
            title="Nie udało się załadować kalendarza"
            description={getUserFacingErrorMessage(
              weddingsErr ?? eventsErr ?? sessionsErr,
              'Nie udało się pobrać wydarzeń.',
            )}
          />
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
        </PageContainer>
      ) : (
        <PageContainer width="wide">
          <div className={styles.page}>
            <CalendarSummary events={events} anchor={anchor} />

            <CalendarToolbar
              view={view}
              anchor={anchor}
              onViewChange={handleViewChange}
              onToday={handleToday}
              onPrev={handlePrev}
              onNext={handleNext}
            />

            {view === 'month' ? (
              <CalendarMonthView
                anchor={anchor}
                events={events}
                onSelectEvent={setSelected}
                onAddAssignment={openAssignmentChooser}
              />
            ) : (
              <CalendarWeekView
                anchor={anchor}
                events={events}
                onSelectEvent={setSelected}
              />
            )}

            <CalendarMonthWeddings
              events={events}
              anchor={anchor}
              onAddAssignment={openAssignmentChooser}
            />

            <CalendarDrawer event={selected} onClose={() => setSelected(null)} />
          </div>
        </PageContainer>
      )}

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
