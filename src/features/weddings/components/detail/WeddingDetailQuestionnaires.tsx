import { Card, CardHeader } from '@/components/ui/Card'
import { formatShortDate } from '@/lib/utils/dates'
import {
  getQuestionnaireStatusDate,
  QUESTIONNAIRE_STATUS_LABELS,
} from '@/lib/utils/questionnaires'
import type { QuestionnaireItem, WeddingQuestionnaires } from '@/types/wedding'
import styles from './WeddingDetailQuestionnaires.module.css'

interface WeddingDetailQuestionnairesProps {
  questionnaires: WeddingQuestionnaires
  /** @deprecated Existing-wedding contract-data send is retired (Path A). */
  onSend?: (kind: 'contractData') => void
}

const ITEMS: { key: 'contractData'; label: string }[] = [
  { key: 'contractData', label: 'Dane do umowy' },
]

function QuestionnaireRow({
  label,
  item,
}: {
  label: string
  item: QuestionnaireItem
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
    </li>
  )
}

/** Legacy/orphan status list — no contract-data send CTA (Path A). */
export function WeddingDetailQuestionnaires({
  questionnaires,
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
          />
        ))}
      </ul>
    </Card>
  )
}
