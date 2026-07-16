import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { IconClock, IconMapPin } from '@/components/icons'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import { getNextRecommendedAction } from '@/lib/workflow/workflowEngine'
import type { CalendarWeddingEvent } from '../utils/calendarEvents'
import styles from './CalendarDrawer.module.css'

interface CalendarDrawerProps {
  event: CalendarWeddingEvent | null
  onClose: () => void
}

function countdownLabel(date: string): string {
  const days = getDaysUntil(date)
  if (days < 0) return 'Ślub już się odbył'
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

export function CalendarDrawer({ event, onClose }: CalendarDrawerProps) {
  if (!event) return null

  const nextAction = getNextRecommendedAction(event.wedding)

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
          <div
            className={styles.stagePill}
            style={{
              background: event.colors.background,
              color: event.colors.text,
              borderColor: event.colors.border,
            }}
          >
            {event.stageLabel}
          </div>

          <p className={styles.status}>{event.statusMessage}</p>
          {nextAction && <p className={styles.next}>{nextAction.label}</p>}

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
              <dt>Pakiet</dt>
              <dd>
                <span className={styles.package}>
                  <span
                    className={styles.packageDot}
                    style={{ background: event.packageColor }}
                  />
                  {event.packageName}
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
          <Link to={`/sluby/${event.id}`} className={styles.link}>
            <Button type="button" variant="primary">
              Otwórz zlecenie
            </Button>
          </Link>
          <Button type="button" variant="secondary">
            Dodaj notatkę
          </Button>
        </footer>
      </aside>
    </>
  )
}
