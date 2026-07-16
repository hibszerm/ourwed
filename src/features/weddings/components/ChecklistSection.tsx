import { Card, CardHeader } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { IconCheck } from '@/components/icons'
import type { ChecklistItem } from '@/types/wedding'
import styles from './ChecklistSection.module.css'

interface ChecklistSectionProps {
  items: ChecklistItem[]
  title?: string
  subtitle?: string
}

export function ChecklistSection({
  items,
  title = 'Status przygotowań',
  subtitle,
}: ChecklistSectionProps) {
  const completed = items.filter((i) => i.completed).length
  const categories = [...new Set(items.map((i) => i.category))]
  const resolvedSubtitle = subtitle ?? `${completed} z ${items.length} ukończonych`

  return (
    <Card>
      <CardHeader title={title} subtitle={resolvedSubtitle} />
      <ProgressBar value={completed} max={items.length} />

      <div className={styles.categories}>
        {categories.map((category) => (
          <div key={category} className={styles.category}>
            <h4 className={styles.categoryTitle}>{category}</h4>
            <ul className={styles.list}>
              {items
                .filter((i) => i.category === category)
                .map((item) => (
                  <li key={item.id} className={styles.item}>
                    <span
                      className={`${styles.checkbox} ${item.completed ? styles.checked : ''}`}
                    >
                      {item.completed && <IconCheck width={12} height={12} />}
                    </span>
                    <span className={item.completed ? styles.done : ''}>{item.label}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
