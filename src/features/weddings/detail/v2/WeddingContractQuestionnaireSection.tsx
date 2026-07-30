import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatShortDate } from '@/lib/utils/dates'
import { WeddingContractQuestionnaireAnswers } from '@/features/weddings/detail/v2/WeddingContractQuestionnaireAnswers'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface Props {
  wedding: Wedding
}

/**
 * Collapsible Contract Questionnaire answers for Umowa i finanse.
 * Collapsed by default — full stream only after explicit expansion.
 */
export function WeddingContractQuestionnaireSection({ wedding }: Props) {
  const [open, setOpen] = useState(false)
  const q = wedding.questionnaires.contractData
  const completed = q.status === 'completed'

  const statusLabel =
    q.status === 'completed'
      ? q.completedAt
        ? `Wypełniona · ${formatShortDate(q.completedAt)}`
        : 'Wypełniona'
      : q.status === 'sent'
        ? 'Oczekuje na odpowiedzi'
        : 'Oczekuje'

  return (
    <section
      className={styles.surfaceSection}
      aria-labelledby="contract-answers-section-title"
      data-testid="contract-finance-questionnaire"
    >
      <div className={styles.surfaceHeader}>
        <div>
          <h2
            id="contract-answers-section-title"
            className={styles.sectionHeading}
          >
            Dane z ankiety do umowy
          </h2>
          <p
            className={styles.contextMuted}
            data-testid="contract-answers-summary"
          >
            {statusLabel}
            {wedding.packageName?.trim()
              ? ` · Pakiet: ${wedding.packageName.trim()}`
              : ''}
          </p>
        </div>
        {completed ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={open}
            aria-controls="contract-answers-panel"
            data-testid="contract-answers-toggle"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Zwiń dane' : 'Rozwiń dane'}
          </Button>
        ) : null}
      </div>

      {!completed ? (
        <p className={styles.contextMuted}>
          Pełne odpowiedzi pojawią się po wypełnieniu ankiety do umowy.
        </p>
      ) : null}

      {completed && open ? (
        <div id="contract-answers-panel" data-testid="contract-answers-expanded">
          <WeddingContractQuestionnaireAnswers
            weddingId={wedding.id}
            enabled
          />
        </div>
      ) : null}
    </section>
  )
}
