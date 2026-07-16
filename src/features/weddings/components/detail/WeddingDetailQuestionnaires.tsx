import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { formatShortDate } from '@/lib/utils/dates'
import {
  getQuestionnaireStatusDate,
  QUESTIONNAIRE_STATUS_LABELS,
} from '@/lib/utils/questionnaires'
import type { QuestionnaireItem, WeddingQuestionnaires } from '@/types/wedding'
import styles from './WeddingDetailQuestionnaires.module.css'

type QuestionnaireKey = keyof WeddingQuestionnaires

interface WeddingDetailQuestionnairesProps {
  questionnaires: WeddingQuestionnaires
  onSend?: (kind: QuestionnaireKey) => void
}

const ITEMS: { key: QuestionnaireKey; label: string }[] = [
  { key: 'contractData', label: 'Dane do umowy' },
  { key: 'weddingQuestionnaire', label: 'Ankieta ślubna' },
]

function QuestionnaireRow({
  label,
  item,
  onSend,
}: {
  label: string
  item: QuestionnaireItem
  onSend?: () => void
}) {
  const statusDate = getQuestionnaireStatusDate(item)

  return (
    <li className={styles.item}>
      <div className={styles.content}>
        <p className={styles.name}>{label}</p>
        <div className={styles.meta}>
          <span className={styles.status}>{QUESTIONNAIRE_STATUS_LABELS[item.status]}</span>
          {statusDate && (
            <time className={styles.date}>{formatShortDate(statusDate)}</time>
          )}
        </div>
      </div>
      {item.status === 'not_sent' && onSend ? (
        <Button type="button" variant="primary" size="sm" onClick={onSend}>
          Wyślij
        </Button>
      ) : null}
    </li>
  )
}

export function WeddingDetailQuestionnaires({
  questionnaires,
  onSend,
}: WeddingDetailQuestionnairesProps) {
  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Ankiety" />
      <ul className={styles.list}>
        {ITEMS.map(({ key, label }) => (
          <QuestionnaireRow
            key={key}
            label={label}
            item={questionnaires[key]}
            onSend={onSend ? () => onSend(key) : undefined}
          />
        ))}
      </ul>
    </Card>
  )
}
