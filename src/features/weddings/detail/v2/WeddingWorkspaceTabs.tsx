import {
  WORKSPACE_TABS,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingWorkspaceTab } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import styles from './WeddingDetailV2.module.css'

interface WeddingWorkspaceTabsProps {
  value: WeddingWorkspaceTab
  onChange: (tab: WeddingWorkspaceTab) => void
}

export function WeddingWorkspaceTabs({
  value,
  onChange,
}: WeddingWorkspaceTabsProps) {
  return (
    <div
      className={styles.tabsBar}
      role="tablist"
      aria-label="Sekcje workspace"
      data-testid="wedding-workspace-tabs"
    >
      {WORKSPACE_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`ws-tab-${tab.id}`}
          aria-selected={value === tab.id}
          aria-controls={`ws-panel-${tab.id}`}
          className={value === tab.id ? styles.tabActive : styles.tab}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
