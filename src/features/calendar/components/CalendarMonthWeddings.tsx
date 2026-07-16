import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { WorkflowBadge } from '@/components/ui/Badge'
import { IconMapPin } from '@/components/icons'
import { coupleName, formatDate, getDaysUntil } from '@/lib/utils/dates'
import { getWorkflowStatus } from '@/lib/workflow/workflowEngine'
import { getWeddingsInMonth } from '@/lib/utils/weddingMetrics'
import { formatMonthTitle, startOfMonth, toDateKey } from '../utils/calendarDates'
import type { Wedding } from '@/types/wedding'
import styles from './CalendarMonthWeddings.module.css'

interface CalendarMonthWeddingsProps {
  weddings: Wedding[]
  anchor: Date
}

function countdownLabel(date: string): string | null {
  const days = getDaysUntil(date)
  if (days < 0) return null
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

function MonthWeddingCard({ wedding }: { wedding: Wedding }) {
  const status = getWorkflowStatus(wedding)
  const name = coupleName(wedding.couple.partner1, wedding.couple.partner2)
  const countdown = countdownLabel(wedding.date)
  const ceremony = wedding.ceremonyLocation ?? '—'
  const reception = wedding.receptionLocation ?? '—'

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <h3 className={styles.name}>{name}</h3>
          <p className={styles.date}>{formatDate(wedding.date)}</p>
          {countdown && <p className={styles.countdown}>{countdown}</p>}
        </div>
        <WorkflowBadge stage={status.stage} />
      </header>

      <p className={styles.status}>{status.message}</p>

      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt>Ceremonia</dt>
          <dd>
            <IconMapPin width={12} height={12} />
            {ceremony}
          </dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Przyjęcie</dt>
          <dd>{reception}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Pakiet</dt>
          <dd>{wedding.packageName}</dd>
        </div>
      </dl>

      <footer className={styles.footer}>
        <Link to={`/sluby/${wedding.id}`}>
          <Button type="button" variant="secondary" size="sm">
            Otwórz zlecenie
          </Button>
        </Link>
      </footer>
    </article>
  )
}

export function CalendarMonthWeddings({ weddings, anchor }: CalendarMonthWeddingsProps) {
  const monthAnchor = startOfMonth(anchor)
  const monthWeddings = getWeddingsInMonth(weddings, monthAnchor)
  const monthLabel = formatMonthTitle(monthAnchor)
  const emptyDateKey = toDateKey(monthAnchor)

  return (
    <section className={styles.section} aria-label={`Śluby w ${monthLabel}`}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Śluby w tym miesiącu</h2>
        <span className={styles.sectionMeta}>{monthLabel}</span>
      </header>

      {monthWeddings.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Brak ślubów w tym miesiącu.</p>
          <Link to={`/sluby/nowy?date=${emptyDateKey}`}>
            <Button type="button" variant="secondary" size="sm">
              + Dodaj zlecenie
            </Button>
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {monthWeddings.map((wedding) => (
            <MonthWeddingCard key={wedding.id} wedding={wedding} />
          ))}
        </div>
      )}
    </section>
  )
}
