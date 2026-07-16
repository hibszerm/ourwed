import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
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
  type CalendarWeddingEvent,
} from '@/features/calendar/utils/calendarEvents'
import { calendarEventService } from '@/lib/api/calendarEventService'
import styles from './CalendarPage.module.css'

export function CalendarPage() {
  const {
    data: weddings = [],
    isLoading: weddingsLoading,
    isError: weddingsError,
    error: weddingsErr,
    refetch: refetchWeddings,
  } = useWeddings()
  const {
    data: calendarRows = [],
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErr,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ['calendar-events', weddings.map((w) => w.id).join(',')],
    queryFn: () => calendarEventService.syncWeddingDayEvents(weddings),
    enabled: weddings.length > 0,
  })
  const [view, setView] = useState<CalendarViewMode>('month')
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<CalendarWeddingEvent | null>(null)

  const events = useMemo(
    () => buildCalendarEventsFromRows(calendarRows, weddings),
    [calendarRows, weddings],
  )

  const isLoading = weddingsLoading || (weddings.length > 0 && eventsLoading)
  const isError = weddingsError || eventsError

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
      subtitle="Planowanie ślubów"
      action={
        <Link to="/sluby/nowy">
          <Button variant="primary">+ Nowe zlecenie</Button>
        </Link>
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
              'Spróbuj ponownie.'
            }
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void refetchWeddings()
              void refetchEvents()
            }}
          >
            Spróbuj ponownie
          </Button>
        </PageContainer>
      ) : (
        <PageContainer width="wide">
          <div className={styles.page}>
            <CalendarSummary weddings={weddings} anchor={anchor} />

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
              />
            ) : (
              <CalendarWeekView
                anchor={anchor}
                events={events}
                onSelectEvent={setSelected}
              />
            )}

            <CalendarMonthWeddings weddings={weddings} anchor={anchor} />

            <CalendarDrawer event={selected} onClose={() => setSelected(null)} />
          </div>
        </PageContainer>
      )}
    </AppLayout>
  )
}
