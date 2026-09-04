import { Link } from 'react-router-dom'
import type { PendingQuestionnaireItem } from '@/lib/api/questionnaireService'
import { formatDate } from '@/lib/utils/dates'
import { formatPendingSubmittedAt } from '@/features/questionnaires/pending/modern/formatPendingSubmittedAt'
import {
  PENDING_ACCEPT,
  PENDING_BUSY,
  PENDING_CEREMONY_LABEL,
  PENDING_CONTACT_LABEL,
  PENDING_OPEN,
  PENDING_RECEPTION_LABEL,
  PENDING_REJECT,
  PENDING_SUBMITTED_LABEL,
} from '@/features/questionnaires/pending/modern/pendingCopy'
import styles from './ModernPendingWorkspace.module.css'

export function ModernPendingRow({
  item,
  busy,
  onAccept,
  onReject,
}: {
  item: PendingQuestionnaireItem
  busy: boolean
  onAccept: (id: string) => void
  onReject: (id: string) => void
}) {
  const weddingDate = item.weddingDate ? formatDate(item.weddingDate) : ''
  const packageName = item.packageName.trim()
  const meta = [weddingDate, packageName].filter(Boolean).join(' · ')
  const contact = [item.phone.trim(), item.email.trim()].filter(Boolean)
  const submitted = formatPendingSubmittedAt(item.instance.submittedAt)
  const ceremony = item.ceremonyLocation.trim()
  const reception = item.receptionLocation.trim()

  return (
    <li className={styles.row} aria-busy={busy}>
      <div className={styles.body}>
        <p className={styles.couple}>{item.coupleLabel}</p>
        {meta ? <p className={styles.meta}>{meta}</p> : null}

        {ceremony || reception || contact.length > 0 || submitted ? (
          <dl className={styles.facts}>
            {ceremony ? (
              <div className={styles.fact}>
                <dt>{PENDING_CEREMONY_LABEL}</dt>
                <dd>{ceremony}</dd>
              </div>
            ) : null}
            {reception ? (
              <div className={styles.fact}>
                <dt>{PENDING_RECEPTION_LABEL}</dt>
                <dd>{reception}</dd>
              </div>
            ) : null}
            {contact.length > 0 ? (
              <div className={styles.fact}>
                <dt>{PENDING_CONTACT_LABEL}</dt>
                <dd>{contact.join(' · ')}</dd>
              </div>
            ) : null}
            {submitted ? (
              <div className={styles.fact}>
                <dt>{PENDING_SUBMITTED_LABEL}</dt>
                <dd>
                  <time dateTime={item.instance.submittedAt ?? undefined}>
                    {submitted}
                  </time>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>

      <div className={styles.actions}>
        <Link
          to={`/ankiety/${item.instance.id}`}
          state={{ from: '/oczekujace' }}
          className={styles.openLink}
        >
          {PENDING_OPEN}
        </Link>
        <button
          type="button"
          className={styles.reject}
          disabled={busy}
          onClick={() => onReject(item.instance.id)}
        >
          {PENDING_REJECT}
        </button>
        <button
          type="button"
          className={styles.accept}
          disabled={busy}
          onClick={() => onAccept(item.instance.id)}
        >
          {busy ? PENDING_BUSY : PENDING_ACCEPT}
        </button>
      </div>
    </li>
  )
}
