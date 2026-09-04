import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CalendarSummary } from '@/features/calendar/components/CalendarSummary'
import {
  CalendarToolbar,
  type CalendarViewMode,
} from '@/features/calendar/components/CalendarToolbar'
import { CalendarWeekView } from '@/features/calendar/components/CalendarWeekView'
import { CalendarQuickPreviewModal } from '@/features/calendar/modern/CalendarQuickPreviewModal'
import { ModernCalendarMonthView } from '@/features/calendar/modern/ModernCalendarMonthView'
import { ModernCalendarAssignmentCard } from '@/features/calendar/modern/ModernCalendarAssignmentCard'
import { ModernCalendarAssignmentLedger } from '@/features/calendar/modern/ModernCalendarAssignmentLedger'
import { ModernCalendarViewSwitch } from '@/features/calendar/modern/ModernCalendarViewSwitch'
import type { CalendarCollectionViewMode } from '@/features/calendar/modern/calendarViewMode'
import { getAssignmentsInMonth } from '@/features/calendar/utils/assignmentMetrics'
import {
  formatMonthTitle,
  startOfMonth,
  toDateKey,
} from '@/features/calendar/utils/calendarDates'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import styles from './ModernCalendarWorkspace.module.css'

interface ModernCalendarWorkspaceProps {
  events: CalendarUiEvent[]
  calendarView: CalendarViewMode
  collectionView: CalendarCollectionViewMode
  anchor: Date
  selected: CalendarUiEvent | null
  entrance?: 'full' | 'soft'
  onCalendarViewChange: (view: CalendarViewMode) => void
  onCollectionViewChange: (mode: CalendarCollectionViewMode) => void
  onToday: () => void
  onPrev: () => void
  onNext: () => void
  onSelectEvent: (event: CalendarUiEvent) => void
  onCloseDrawer: () => void
  onAddAssignment: (dateKey?: string) => void
}

function CollectionBody({
  events,
  viewMode,
}: {
  events: CalendarUiEvent[]
  viewMode: CalendarCollectionViewMode
}) {
  const [shown, setShown] = useState(viewMode)
  const [animateView, setAnimateView] = useState(false)
  if (viewMode !== shown) {
    setShown(viewMode)
    setAnimateView(true)
  }

  const body =
    viewMode === 'list' ? (
      <div className={`${styles.ledgerSurface} v3MaterialSatinFlat`}>
        <ModernCalendarAssignmentLedger events={events} />
      </div>
    ) : (
      <div className={styles.grid} data-testid="modern-calendar-grid">
        {events.map((event) => (
          <ModernCalendarAssignmentCard key={event.id} event={event} />
        ))}
      </div>
    )

  return (
    <div key={viewMode} className={animateView ? styles.viewIn : undefined}>
      {body}
    </div>
  )
}

export function ModernCalendarWorkspace({
  events,
  calendarView,
  collectionView,
  anchor,
  selected,
  entrance = 'full',
  onCalendarViewChange,
  onCollectionViewChange,
  onToday,
  onPrev,
  onNext,
  onSelectEvent,
  onCloseDrawer,
  onAddAssignment,
}: ModernCalendarWorkspaceProps) {
  const monthAnchor = startOfMonth(anchor)
  const monthAssignments = getAssignmentsInMonth(events, monthAnchor)
  const monthLabel = formatMonthTitle(monthAnchor)
  const emptyDateKey = toDateKey(monthAnchor)

  return (
    <div
      className={styles.root}
      data-testid="modern-calendar-workspace"
      data-entrance={entrance}
    >
      <div className={styles.summary}>
        <CalendarSummary events={events} anchor={anchor} />
      </div>

      <div className={styles.toolbar}>
        <CalendarToolbar
          view={calendarView}
          anchor={anchor}
          onViewChange={onCalendarViewChange}
          onToday={onToday}
          onPrev={onPrev}
          onNext={onNext}
        />
      </div>

      <div className={styles.calendar}>
        {calendarView === 'month' ? (
          <ModernCalendarMonthView
            anchor={anchor}
            events={events}
            onSelectEvent={onSelectEvent}
            onAddAssignment={onAddAssignment}
          />
        ) : (
          <CalendarWeekView
            anchor={anchor}
            events={events}
            onSelectEvent={onSelectEvent}
          />
        )}
      </div>

      <section
        className={styles.collection}
        aria-label={`Zlecenia w ${monthLabel}`}
        data-testid="modern-calendar-collection"
      >
        <header className={styles.collectionHeader}>
          <div>
            <h2 className={styles.collectionTitle}>Zlecenia w tym miesiącu</h2>
            <span className={styles.collectionMeta}>{monthLabel}</span>
          </div>
          {monthAssignments.length > 0 ? (
            <div className={styles.collectionControls}>
              <ModernCalendarViewSwitch
                value={collectionView}
                onChange={onCollectionViewChange}
              />
            </div>
          ) : null}
        </header>

        {monthAssignments.length === 0 ? (
          <div className={styles.empty} role="status">
            <p className={styles.emptyTitle}>Brak zleceń w tym miesiącu</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onAddAssignment(emptyDateKey)}
            >
              + Dodaj zlecenie
            </Button>
          </div>
        ) : (
          <CollectionBody
            events={monthAssignments}
            viewMode={collectionView}
          />
        )}
      </section>

      <CalendarQuickPreviewModal event={selected} onClose={onCloseDrawer} />
    </div>
  )
}
