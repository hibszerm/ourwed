import { useQuery } from '@tanstack/react-query'
import { IconCheck, IconClipboard, IconDocuments } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import {
  buildWeddingProgressSummary,
  type ProgressStatusTone,
} from '@/features/weddings/detail/v2/buildWeddingProgressSummary'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import { isPreWeddingSubmittedStatus } from '@/types/preweddingQuestionnaire'
import type { WeddingPlace } from '@/types/travel'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface Props {
  wedding: Wedding
  places: WeddingPlace[]
  onPrimaryAction?: (actionId: string) => void
}

function toneMark(tone: ProgressStatusTone): string {
  switch (tone) {
    case 'current':
      return '›'
    case 'attention':
      return '!'
    case 'not_started':
      return '○'
    default:
      return '–'
  }
}

/** Active-state badges only — completed rows use icon + label alone. */
function activeToneLabel(tone: ProgressStatusTone): string | null {
  switch (tone) {
    case 'current':
      return 'W toku'
    case 'attention':
      return 'Wymaga działania'
    case 'not_started':
      return 'Oczekuje'
    default:
      return null
  }
}

function groupIcon(id: string) {
  if (id === 'contract') return <IconDocuments width={16} height={16} />
  return <IconClipboard width={16} height={16} />
}

/**
 * Calm two-domain Wedding Progress — Umowa + Przygotowania.
 */
export function WeddingProgressCard({
  wedding,
  places,
  onPrimaryAction,
}: Props) {
  const { data: preWeddingQ } = useQuery({
    queryKey: ['prewedding-questionnaire', wedding.id],
    queryFn: () => weddingQuestionnaireService.getByWeddingId(wedding.id),
  })

  let preOverride: QuestionnaireStatus | null | undefined
  if (preWeddingQ === undefined) {
    preOverride = undefined
  } else if (!preWeddingQ) {
    preOverride = null
  } else if (isPreWeddingSubmittedStatus(preWeddingQ.status)) {
    preOverride = 'completed'
  } else if (
    preWeddingQ.status === 'sent' ||
    preWeddingQ.status === 'opened' ||
    preWeddingQ.status === 'in_progress'
  ) {
    preOverride = 'sent'
  } else {
    preOverride = 'not_sent'
  }

  const summary = buildWeddingProgressSummary(wedding, places, {
    preweddingStatus: preOverride,
  })

  return (
    <section
      className={styles.progressCard}
      aria-labelledby="wedding-progress-title"
      data-testid="wedding-progress-card"
    >
      <div className={styles.progressHeader}>
        <h2 id="wedding-progress-title" className={styles.sectionHeading}>
          Postęp zlecenia
        </h2>
        {summary.primaryAction && onPrimaryAction ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="progress-primary-action"
            onClick={() => onPrimaryAction(summary.primaryAction!.id)}
          >
            {summary.primaryAction.label}
          </Button>
        ) : null}
      </div>

      <div className={styles.progressGroups}>
        {summary.groups.map((group) => (
          <div
            key={group.id}
            className={styles.progressGroup}
            data-emphasis={group.emphasis}
            data-testid={`progress-group-${group.id}`}
          >
            <h3 className={styles.progressGroupTitle}>
              <span className={styles.progressGroupIcon} aria-hidden>
                {groupIcon(group.id)}
              </span>
              {group.title}
            </h3>
            <ul className={styles.progressList}>
              {group.items.map((item) => {
                const badge = activeToneLabel(item.tone)
                return (
                  <li
                    key={item.id}
                    className={styles.progressItem}
                    data-tone={item.tone}
                    data-testid={`progress-item-${item.id}`}
                  >
                    <span className={styles.progressMark} aria-hidden>
                      {item.tone === 'complete' ? (
                        <IconCheck width={14} height={14} />
                      ) : (
                        toneMark(item.tone)
                      )}
                    </span>
                    <div className={styles.progressItemBody}>
                      <span className={styles.progressItemLabel}>
                        {item.label}
                        {badge ? (
                          <span className={styles.srOnly}>{` — ${badge}`}</span>
                        ) : item.tone === 'complete' ? (
                          <span className={styles.srOnly}> — Ukończone</span>
                        ) : null}
                      </span>
                      {badge ? (
                        <span
                          className={styles.progressToneBadge}
                          data-tone={item.tone}
                        >
                          {badge}
                        </span>
                      ) : null}
                      {item.tone !== 'complete' && item.detail ? (
                        <span className={styles.progressItemDetail}>
                          {item.detail}
                        </span>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
