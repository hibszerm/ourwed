import type { ContractAnswerItem } from '@/features/questionnaires/contractAnswerSummary'
import styles from './ModernQuestionnaireDetailWorkspace.module.css'

function displayLines(item: ContractAnswerItem): string[] {
  if (item.kind === 'addons' || item.kind === 'package') {
    return item.value
      .split(', ')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return [item.value]
}

export function ModernQuestionnaireResponseRow({
  item,
}: {
  item: ContractAnswerItem
}) {
  const lines = displayLines(item)
  const long = item.kind === 'long_text'

  return (
    <div className={styles.fact}>
      <dt>{item.label}</dt>
      <dd className={long ? styles.factLong : undefined}>
        {lines.length > 1 ? (
          <ul className={styles.factList}>
            {lines.map((line, index) => (
              <li key={`${item.id}-${index}`}>{line}</li>
            ))}
          </ul>
        ) : (
          lines[0]
        )}
      </dd>
    </div>
  )
}
