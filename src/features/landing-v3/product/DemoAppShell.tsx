import type { ReactNode, MouseEvent } from 'react'
import {
  IconCalendar,
  IconClipboard,
  IconDashboard,
  IconInbox,
  IconSessions,
  IconSettings,
  IconWeddings,
} from '@/components/icons'
import styles from './DemoAppShell.module.css'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { id: 'weddings', label: 'Śluby', Icon: IconWeddings },
  { id: 'sessions', label: 'Sesje', Icon: IconSessions },
  { id: 'calendar', label: 'Kalendarz', Icon: IconCalendar },
  { id: 'pending', label: 'Oczekujące', Icon: IconInbox },
  { id: 'questionnaires', label: 'Ankiety', Icon: IconClipboard },
  { id: 'settings', label: 'Ustawienia', Icon: IconSettings },
] as const

export type DemoNavId = (typeof NAV)[number]['id']

interface DemoAppShellProps {
  active: DemoNavId
  children: ReactNode
  className?: string
  hideSidebar?: boolean
  /** Fixed marketing frame — never scrolls internally. */
  frame?: 'hero' | 'wedding' | 'calendar' | 'compact'
  'data-testid'?: string
}

/** Read-only app chrome matching production Sidebar — fixed composed frame. */
export function DemoAppShell({
  active,
  children,
  className = '',
  hideSidebar = false,
  frame = 'wedding',
  'data-testid': testId,
}: DemoAppShellProps) {
  function blockNav(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('a')) {
      e.preventDefault()
    }
  }

  return (
    <div
      className={[styles.shell, styles[`frame_${frame}`], className]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId ?? 'lv3-demo-shell'}
      data-landing-preview=""
      data-hide-sidebar={hideSidebar ? 'true' : undefined}
      onClickCapture={blockNav}
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
    >
      {!hideSidebar ? (
        <aside className={styles.sidebar} aria-label="Nawigacja OurWed">
          <div className={styles.logo}>
            <span className={styles.logoMark}>OW</span>
            <span className={styles.logoText}>OurWed</span>
          </div>
          <nav className={styles.nav}>
            {NAV.map(({ id, label, Icon }) => (
              <span
                key={id}
                className={id === active ? styles.navActive : styles.navItem}
                aria-current={id === active ? 'page' : undefined}
              >
                <Icon width={18} height={18} aria-hidden />
                {label}
              </span>
            ))}
          </nav>
        </aside>
      ) : null}
      <div className={styles.main}>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
