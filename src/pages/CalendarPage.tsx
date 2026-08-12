import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { useSessions } from '@/features/sessions/hooks/useSessions'
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
import { addDays, addMonths, startOfMonth, startOfWeek } from '@/features/calendar/utils/calendarDates'
import {
  buildCalendarEventsFromRows,
  mergeCalendarUiEvents,
  type CalendarUiEvent,
} from '@/features/calendar/utils/calendarEvents'
import { calendarEventService } from '@/lib/api/calendarEventService'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import styles from './CalendarPage.module.css'

export function CalendarPage() {
  const { user } = useAuth()
  const { requirePro } = useProAccessGate()
  const {
    data: weddings = [],
    isLoading: weddingsLoading,
    isError: weddingsError,
    error: weddingsErr,
    refetch: refetchWeddings,
  } = useWeddings()
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    isError: sessionsError,
    error: sessionsErr,
    refetch: refetchSessions,
  } = useSessions()
  const {
    data: calendarRows = [],
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErr,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ['calendar', user?.id, weddings.map((w) => w.id).join(',')],
    queryFn: () => calendarEventService.syncWeddingDayEvents(weddings),
    enabled: Boolean(user?.id) && weddings.length > 0,
  })
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

  const isLoading =
    weddingsLoading ||
    sessionsLoading ||
    (weddings.length > 0 && eventsLoading)
  const isError = weddingsError || eventsError || sessionsError

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
            description={
              (weddingsErr instanceof Error
                ? weddingsErr.message
                : null) ||
              (eventsErr instanceof Error ? eventsErr.message : null) ||
              (sessionsErr instanceof Error ? sessionsErr.message : null) ||
              'Spróbuj ponownie.'
            }
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
