import { Search } from 'lucide-react'
import {
  ASSISTANT_LAUNCHER_LABEL,
  ASSISTANT_TITLE,
} from '../copy'
import styles from './Assistant.module.css'

export function AssistantMobileLauncher({
  onOpen,
}: {
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={styles.launcher}
      aria-label={ASSISTANT_LAUNCHER_LABEL}
      onClick={onOpen}
      data-testid="assistant-mobile-launcher"
    >
      <Search className={styles.launcherIcon} aria-hidden />
    </button>
  )
}

export function AssistantSidebarLauncher({
  onOpen,
  active = false,
}: {
  onOpen: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={styles.sidebarLauncher}
      onClick={onOpen}
      data-testid="assistant-sidebar-launcher"
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
    >
      <Search className={styles.sidebarLauncherIcon} aria-hidden />
      <span>{ASSISTANT_TITLE}</span>
    </button>
  )
}
