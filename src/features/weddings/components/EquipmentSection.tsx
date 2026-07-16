import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconEquipment } from '@/components/icons'
import type { ChecklistItem } from '@/types/wedding'
import { ChecklistSection } from './ChecklistSection'
import styles from './EquipmentSection.module.css'

interface EquipmentSectionProps {
  items: ChecklistItem[]
}

export function EquipmentSection({ items }: EquipmentSectionProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader title="Sprzęt" subtitle="Lista pakowania" />
        <div className={styles.body}>
          <EmptyState
            icon={<IconEquipment />}
            title="Brak listy sprzętu"
            description="Dodaj checklistę pakowania przed dniem ślubu."
          />
        </div>
      </Card>
    )
  }

  return <ChecklistSection items={items} title="Sprzęt" subtitle="Lista pakowania" />
}
