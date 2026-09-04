import type { KeyboardEvent } from 'react'
import { WORKSPACE_TABS } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingWorkspaceTab } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import styles from './ModernWeddingDetailTabs.module.css'

/** Modern display labels only. Tab ids stay canonical; Classic keeps WORKSPACE_TABS copy. */
const MODERN_TAB_LABELS: Partial<Record<WeddingWorkspaceTab, string>> = {
  wedding_day: 'Logistyka',
}

interface Props {
  value: WeddingWorkspaceTab
  onChange: (tab: WeddingWorkspaceTab) => void
}

export function ModernWeddingDetailTabs({ value, onChange }: Props) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = WORKSPACE_TABS.findIndex((tab) => tab.id === value)
    if (index < 0) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      const next =
        WORKSPACE_TABS[(index + delta + WORKSPACE_TABS.length) % WORKSPACE_TABS.length]
      if (next) onChange(next.id)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      onChange(WORKSPACE_TABS[0]!.id)
    }
    if (event.key === 'End') {
      event.preventDefault()
      onChange(WORKSPACE_TABS[WORKSPACE_TABS.length - 1]!.id)
    }
  }

  return (
    <div
      className={styles.bar}
      role="tablist"
      aria-label="Sekcje workspace"
      data-testid="modern-wedding-detail-tabs"
      onKeyDown={onKeyDown}
    >
      <div className={styles.scroller}>
        {WORKSPACE_TABS.map((tab) => {
          const selected = value === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ws-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`ws-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? styles.tabActive : styles.tab}
              onClick={() => onChange(tab.id)}
            >
              {MODERN_TAB_LABELS[tab.id] ?? tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
