import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { IconClock, IconMapPin } from '@/components/icons'
import { useCalendarWeddingNextAction } from '@/features/calendar/hooks/useCalendarWeddingNextAction'
import { hrefForWeddingNextAction } from '@/features/calendar/utils/hrefForWeddingNextAction'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import type { CalendarUiEvent } from '../utils/calendarEvents'
import styles from './CalendarDrawer.module.css'

interface CalendarDrawerProps {
  event: CalendarUiEvent | null
  onClose: () => void
  /** When set, primary CTA does not navigate via router (landing demo). */
  onOpen?: (event: CalendarUiEvent) => void
}

function countdownLabel(date: string): string {
  const days = getDaysUntil(date)
  if (days < 0) return 'Termin już minął'
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

function WeddingDrawerBody({
  event,
  onClose,
  onOpen,
}: {
  event: Extract<CalendarUiEvent, { entityType: 'wedding' }>
  onClose: () => void
  onOpen?: (event: CalendarUiEvent) => void
}) {
  const { action, isLoading } = useCalendarWeddingNextAction(event.entityId, true)
  const nextHref = action
    ? hrefForWeddingNextAction(event.entityId, action)
    : event.href

  return (
    <>
      <button type="button" className={styles.backdrop} aria-label="Zamknij" onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-label="Szczegóły ślubu">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Ślub</p>
            <h2 className={styles.title}>{event.coupleLabel}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Zamknij
          </Button>
        </header>

        <div className={styles.body}>
          {event.packageName ? (
            <div
              className={styles.stagePill}
              style={{
                background: event.colors.background,
                color: event.colors.text,
                borderColor: event.colors.border,
              }}
            >
              <span className={styles.package}>
                <span
                  className={styles.packageDot}
                  style={{ background: event.packageColor }}
                />
                {event.packageName}
              </span>
            </div>
          ) : null}

          {!isLoading && action ? (
            <p className={styles.next} data-testid="calendar-next-action">
              {action.title}
            </p>
          ) : null}

          <dl className={styles.details}>
            <div className={styles.row}>
              <dt>Data</dt>
              <dd>{formatDate(event.wedding.date)}</dd>
            </div>
            <div className={styles.row}>
              <dt>Countdown</dt>
              <dd>{countdownLabel(event.wedding.date)}</dd>
            </div>
            <div className={styles.row}>
              <dt>Godzina</dt>
              <dd>
                <span className={styles.inline}>
                  <IconClock width={14} height={14} />
                  {event.timeLabel}
                </span>
              </dd>
            </div>
            <div className={styles.row}>
              <dt>Ceremonia</dt>
              <dd>
                <span className={styles.inline}>
                  <IconMapPin width={14} height={14} />
                  {event.ceremonyLocation}
                </span>
              </dd>
            </div>
            <div className={styles.row}>
              <dt>Przyjęcie</dt>
              <dd>{event.receptionLocation}</dd>
            </div>
          </dl>
        </div>

        <footer className={styles.footer}>
          {onOpen ? (
            <button
              type="button"
              className={styles.link}
              onClick={() => onOpen(event)}
            >
              <span className={styles.ctaPrimary}>
                {action?.title ?? 'Otwórz zlecenie'}
              </span>
            </button>
          ) : action ? (
            <Link to={nextHref} className={styles.link}>
              <Button type="button" variant="primary" data-action-id={action.id}>
                {action.title}
              </Button>
            </Link>
          ) : (
            <Link to={event.href} className={styles.link}>
              <Button type="button" variant="primary">
                Otwórz zlecenie
              </Button>
            </Link>
          )}
          {!onOpen && action ? (
            <Link to={event.href} className={styles.link}>
              <Button type="button" variant="secondary">
                Otwórz zlecenie
              </Button>
            </Link>
          ) : null}
        </footer>
      </aside>
    </>
  )
}

export function CalendarDrawer({ event, onClose, onOpen }: CalendarDrawerProps) {
  if (!event) return null

  if (event.entityType === 'session') {
    return (
      <>
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Zamknij"
          onClick={onClose}
        />
        <aside className={styles.drawer} role="dialog" aria-label="Szczegóły sesji">
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Sesja</p>
              <h2 className={styles.title}>{event.title}</h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Zamknij
            </Button>
          </header>

          <div className={styles.body}>
            <div
              className={styles.stagePill}
              style={{
                background: event.colors.background,
                color: event.colors.text,
                borderColor: event.colors.border,
              }}
            >
              {event.sessionTypeLabel}
            </div>

            <dl className={styles.details}>
              <div className={styles.row}>
                <dt>Data</dt>
                <dd>{formatDate(event.dateKey)}</dd>
              </div>
              <div className={styles.row}>
                <dt>Countdown</dt>
                <dd>{countdownLabel(event.dateKey)}</dd>
              </div>
              <div className={styles.row}>
                <dt>Godzina</dt>
                <dd>
                  <span className={styles.inline}>
                    <IconClock width={14} height={14} />
                    {event.timeLabel}
                  </span>
                </dd>
              </div>
              {event.locationSummary ? (
                <div className={styles.row}>
                  <dt>Lokalizacja</dt>
                  <dd>
                    <span className={styles.inline}>
                      <IconMapPin width={14} height={14} />
                      {event.locationSummary}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <footer className={styles.footer}>
            {onOpen ? (
              <button
                type="button"
                className={styles.link}
                onClick={() => onOpen(event)}
              >
                <span className={styles.ctaPrimary}>Otwórz sesję</span>
              </button>
            ) : (
              <Link to={event.href} className={styles.link}>
                <Button type="button" variant="primary">
                  Otwórz sesję
                </Button>
              </Link>
            )}
          </footer>
        </aside>
      </>
    )
  }

  return <WeddingDrawerBody event={event} onClose={onClose} onOpen={onOpen} />
}
