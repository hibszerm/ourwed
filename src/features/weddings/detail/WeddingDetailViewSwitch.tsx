import type { WeddingDetailViewMode } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import styles from './WeddingDetailViewSwitch.module.css'

interface WeddingDetailViewSwitchProps {
  value: WeddingDetailViewMode
  onChange: (mode: WeddingDetailViewMode) => void
}

/** Compact accessible segmented control for V1 / V2 presentation. */
export function WeddingDetailViewSwitch({
  value,
  onChange,
}: WeddingDetailViewSwitchProps) {
  return (
    <div className={styles.wrap} role="group" aria-label="Widok szczegółów ślubu">
      <span className={styles.label} id="wedding-detail-view-label">
        Widok
      </span>
      <div
        className={styles.segment}
        role="tablist"
        aria-labelledby="wedding-detail-view-label"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === 'v1'}
          className={value === 'v1' ? styles.active : styles.tab}
          onClick={() => onChange('v1')}
        >
          V1
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'v2'}
          className={value === 'v2' ? styles.active : styles.tab}
          onClick={() => onChange('v2')}
        >
          V2
        </button>
      </div>
    </div>
  )
}
