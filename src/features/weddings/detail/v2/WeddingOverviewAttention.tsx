import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils/currency'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatDate } from '@/lib/utils/dates'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface Props {
  wedding: Wedding
  onOpenFinance?: () => void
}

/**
 * Optional Overview attention — only real actionable issues, not a checklist.
 */
export function WeddingOverviewAttention({ wedding, onOpenFinance }: Props) {
  const contractStatus = wedding.contract?.status ?? 'none'
  const unsigned =
    contractStatus === 'generated' || contractStatus === 'sent'
  const commercial = getWeddingCommercialSummary(wedding)
  const due = commercial.finalPaymentDueDate?.trim() || null
  const overdue =
    commercial.remainingToPay > 0 &&
    Boolean(due) &&
    due! < new Date().toISOString().slice(0, 10)

  if (!unsigned && !overdue) return null

  return (
    <section
      className={styles.attentionCard}
      aria-labelledby="overview-attention-title"
      data-testid="overview-attention-card"
    >
      <h2 id="overview-attention-title" className={styles.sectionHeading}>
        Wymaga uwagi
      </h2>
      <ul className={styles.attentionList}>
        {unsigned ? (
          <li>
            Umowa oczekuje na podpis — oznacz podpis w zakładce Umowa i finanse.
          </li>
        ) : null}
        {overdue ? (
          <li>
            Pozostało do zapłaty {formatCurrency(commercial.remainingToPay)}
            {due ? ` · termin ${formatDate(due)}` : ''}.
            {onOpenFinance ? (
              <>
                {' '}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onOpenFinance}
                >
                  Przejdź do płatności
                </Button>
              </>
            ) : null}
          </li>
        ) : null}
      </ul>
    </section>
  )
}
