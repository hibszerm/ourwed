import { Input, Select } from '@/components/ui/Input'
import type { Wedding, WeddingStatus } from '@/types/wedding'
import styles from '../WeddingEditorFields.module.css'

const STATUS_LABELS: Record<WeddingStatus, string> = {
  active: 'Aktywny',
  archived: 'Zarchiwizowany',
  cancelled: 'Anulowany',
}

/** Shared wedding date / status fields — no V1 layout wrappers. */
export function WeddingDateFields({
  wedding,
  onChange,
}: {
  wedding: Wedding
  onChange: (patch: Partial<Wedding>) => void
}) {
  return (
    <div className={styles.fieldGrid}>
      <div className={styles.fieldRow}>
        <Input
          label="Data ślubu"
          type="date"
          value={wedding.date}
          onChange={(e) => onChange({ date: e.target.value })}
        />
        <Input
          label="Godzina ceremonii"
          type="time"
          value={wedding.ceremonyTime ?? ''}
          onChange={(e) =>
            onChange({ ceremonyTime: e.target.value || undefined })
          }
        />
      </div>
      <Select
        label="Status ślubu"
        value={wedding.status}
        onChange={(e) => onChange({ status: e.target.value as WeddingStatus })}
      >
        {(Object.keys(STATUS_LABELS) as WeddingStatus[]).map((key) => (
          <option key={key} value={key}>
            {STATUS_LABELS[key]}
          </option>
        ))}
      </Select>
    </div>
  )
}
