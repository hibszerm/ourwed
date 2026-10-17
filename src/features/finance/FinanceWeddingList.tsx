import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { CollaborativeCompensationArchiveDialog } from '@/features/collaboration/CollaborativeCompensationArchiveDialog'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { FinanceAssignment } from '@/lib/finance/financeSeasonTypes'
import {
  FINANCE_TABLE_DEPOSIT_PAID_LABEL,
  financeAssignmentKindLabel,
  financePaymentStatusLabel,
} from '@/features/finance/financeLabels'
import styles from '@/features/finance/FinanceCenter.module.css'

interface FinanceAssignmentListProps {
  assignments: FinanceAssignment[]
}

/** @deprecated Prefer assignments prop */
interface LegacyProps {
  weddings: FinanceAssignment[]
}

/** Full 8-column table — visible only at ≥1100px Finance workspace widths. */
export function FinanceWeddingTable({
  assignments,
  weddings,
}: Partial<FinanceAssignmentListProps> & Partial<LegacyProps>) {
  const rows = assignments ?? weddings ?? []
  const navigate = useNavigate()
  const { user } = useAuth()
  const [archiveRelationshipId, setArchiveRelationshipId] = useState<string | null>(null)

  function openAssignment(assignment: FinanceAssignment) {
    if (assignment.collaborative && assignment.compensationRelationshipId) {
      setArchiveRelationshipId(assignment.compensationRelationshipId)
    } else navigate(assignment.deepLink)
  }

  return (
    <div className={styles.tableWrap} data-finance-table>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colType} />
          <col className={styles.colDate} />
          <col className={styles.colName} />
          <col className={styles.colMoney} />
          <col className={styles.colMoney} />
          <col className={styles.colMoney} />
          <col className={styles.colMoney} />
          <col className={styles.colStatus} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={styles.colType}>
              Typ
            </th>
            <th scope="col" className={styles.colDate}>
              Data
            </th>
            <th scope="col" className={styles.colName}>
              Zlecenie
            </th>
            <th scope="col" className={styles.num}>
              Wartość dla mnie
            </th>
            <th scope="col" className={styles.num}>
              {FINANCE_TABLE_DEPOSIT_PAID_LABEL}
            </th>
            <th scope="col" className={styles.num}>
              Wpłacono · otrzymano dla mnie
            </th>
            <th scope="col" className={styles.num}>
              Pozostało · saldo dla mnie
            </th>
            <th scope="col" className={styles.colStatus}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr
              key={`${a.kind}-${a.id}`}
              className={styles.tableRow}
              tabIndex={0}
              role="link"
              onClick={() => openAssignment(a)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openAssignment(a)
                }
              }}
            >
              <td className={styles.colType} data-finance-type-cell>
                <span className={styles.kindBadge} data-kind={a.kind}>
                  {financeAssignmentKindLabel(a.kind)}
                </span>
              </td>
              <td className={styles.colDate}>{formatDate(a.date)}</td>
              <td className={styles.colName} data-finance-name-cell>
                <span className={styles.couple}>{a.displayName}</span>
                {a.overpayment > 0 ? (
                  <span className={styles.overpay}>
                    Nadpłata · do przekazania {formatCurrency(a.overpayment)}
                  </span>
                ) : null}
              </td>
              <td className={styles.num}>{a.personalValueKnown && a.personalValue != null ? formatCurrency(a.personalValue) : 'Nieustalona'}</td>
              <td className={styles.num}>{a.collaborative ? '—' : formatCurrency(a.depositPaid)}</td>
              <td className={styles.num}>{formatCurrency(a.personalReceived ?? 0)}</td>
              <td className={styles.num}>{a.personalBalance == null ? '—' : formatCurrency(a.personalBalance)}</td>
              <td className={styles.colStatus}>
                <span
                  className={`${styles.status} ${styles[`status_${a.paymentStatus}`]}`}
                >
                  {financePaymentStatusLabel(a.paymentStatus, {
                    compact: true,
                  })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <CollaborativeCompensationArchiveDialog relationshipId={archiveRelationshipId} userId={user?.id} onClose={() => setArchiveRelationshipId(null)} />
    </div>
  )
}

/**
 * Compact assignment cards/rows — used below 1100px (tablet + mobile).
 * Same component for preview and full Zlecenia list.
 */
export function FinanceWeddingCards({
  assignments,
  weddings,
}: Partial<FinanceAssignmentListProps> & Partial<LegacyProps>) {
  const rows = assignments ?? weddings ?? []
  const navigate = useNavigate()
  const { user } = useAuth()
  const [archiveRelationshipId, setArchiveRelationshipId] = useState<string | null>(null)

  return (
    <ul className={styles.cardList} data-finance-cards>
      {rows.map((a) => (
        <li key={`${a.kind}-${a.id}`}>
          <button
            type="button"
            className={styles.card}
            onClick={() => {
              if (a.collaborative && a.compensationRelationshipId) setArchiveRelationshipId(a.compensationRelationshipId)
              else navigate(a.deepLink)
            }}
          >
            <div className={styles.cardTop}>
              <p className={styles.cardCouple}>
                <span
                  className={styles.kindBadge}
                  data-kind={a.kind}
                  data-finance-card-kind
                >
                  {financeAssignmentKindLabel(a.kind)}
                </span>
                <span className={styles.cardName}>{a.displayName}</span>
              </p>
              <span
                className={`${styles.status} ${styles[`status_${a.paymentStatus}`]}`}
              >
                {financePaymentStatusLabel(a.paymentStatus, { compact: true })}
              </span>
            </div>
            <p className={styles.cardDate}>{formatDate(a.date)}</p>
            <dl className={styles.cardMetrics}>
              <div>
                <dt>Wartość dla mnie</dt>
                <dd>{a.personalValueKnown && a.personalValue != null ? formatCurrency(a.personalValue) : 'Nieustalona'}</dd>
              </div>
              <div>
                <dt>Otrzymano dla mnie</dt>
                <dd>{formatCurrency(a.personalReceived ?? 0)}</dd>
              </div>
              <div>
                <dt>Saldo dla mnie</dt>
                <dd>{a.personalBalance == null ? '—' : formatCurrency(a.personalBalance)}</dd>
              </div>
            </dl>
            {a.overpayment > 0 ? (
              <p className={styles.overpay}>
                Nadpłata · do przekazania {formatCurrency(a.overpayment)}
              </p>
            ) : null}
          </button>
        </li>
      ))}
      <CollaborativeCompensationArchiveDialog relationshipId={archiveRelationshipId} userId={user?.id} onClose={() => setArchiveRelationshipId(null)} />
    </ul>
  )
}
