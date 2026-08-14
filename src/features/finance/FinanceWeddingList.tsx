import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { FinanceAssignment } from '@/lib/finance/financeSeasonTypes'
import {
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
              Wartość
            </th>
            <th scope="col" className={styles.num}>
              Zaliczka
            </th>
            <th scope="col" className={styles.num}>
              Wpłacono
            </th>
            <th scope="col" className={styles.num}>
              Pozostało
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
              onClick={() => navigate(a.deepLink)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(a.deepLink)
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
                    Nadpłata {formatCurrency(a.overpayment)}
                  </span>
                ) : null}
              </td>
              <td className={styles.num}>{formatCurrency(a.contractValue)}</td>
              <td className={styles.num}>{formatCurrency(a.depositPaid)}</td>
              <td className={styles.num}>{formatCurrency(a.totalPaid)}</td>
              <td className={styles.num}>{formatCurrency(a.remaining)}</td>
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

  return (
    <ul className={styles.cardList} data-finance-cards>
      {rows.map((a) => (
        <li key={`${a.kind}-${a.id}`}>
          <button
            type="button"
            className={styles.card}
            onClick={() => navigate(a.deepLink)}
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
                <dt>Wartość</dt>
                <dd>{formatCurrency(a.contractValue)}</dd>
              </div>
              <div>
                <dt>Wpłacono</dt>
                <dd>{formatCurrency(a.totalPaid)}</dd>
              </div>
              <div>
                <dt>Pozostało</dt>
                <dd>{formatCurrency(a.remaining)}</dd>
              </div>
            </dl>
            {a.overpayment > 0 ? (
              <p className={styles.overpay}>
                Nadpłata {formatCurrency(a.overpayment)}
              </p>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
