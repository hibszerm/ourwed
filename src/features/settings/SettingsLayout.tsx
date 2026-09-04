import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import {
  SettingsPrimaryNavigation,
  SettingsSecondaryNavigation,
} from './SettingsNavigation'
import {
  getSettingsNavGroup,
  shouldShowSettingsSecondaryNav,
} from './settingsNav'
import styles from './SettingsLayout.module.css'

interface SettingsLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
}

type MobileTitleMode = 'page' | 'group'

function getMobileTitleMode(
  title: string | undefined,
  pathname: string,
): MobileTitleMode {
  const group = getSettingsNavGroup(pathname)
  if (group && title && shouldShowSettingsSecondaryNav(group)) return 'group'
  return 'page'
}

/**
 * Settings presentation shell. One information architecture on every
 * viewport: heading, top-level tabs, optional secondary destinations,
 * then section content. Does not fetch or mutate Settings data.
 */
export function SettingsLayout({
  children,
  title,
  subtitle,
  action,
}: SettingsLayoutProps) {
  const { pathname } = useLocation()
  const group = getSettingsNavGroup(pathname)
  const mobileTitleMode = getMobileTitleMode(title, pathname)

  return (
    <AppLayout>
      <div
        className={styles.shell}
        data-testid="settings-shell"
        data-settings-panel="true"
      >
        <div className={styles.intro}>
          <div className={styles.introText}>
            <p className={styles.workspaceTitle}>Ustawienia</p>
            <p className={styles.purpose}>
              Zarządzaj konfiguracją studia i swojego konta.
            </p>
          </div>
        </div>

        <SettingsPrimaryNavigation />

        {title || action ? (
          <header
            className={styles.pageHead}
            data-mobile-title={mobileTitleMode}
          >
            <div className={styles.pageText}>
              {title ? (
                <h1 className={styles.pageTitle}>
                  <span className={styles.pageTitlePage}>{title}</span>
                  {mobileTitleMode === 'group' && group ? (
                    <span className={styles.pageTitleGroup}>{group.label}</span>
                  ) : null}
                </h1>
              ) : null}
              {subtitle ? (
                <p className={styles.pageSubtitle}>{subtitle}</p>
              ) : null}
            </div>
            {action ? <div className={styles.pageAction}>{action}</div> : null}
          </header>
        ) : null}

        <SettingsSecondaryNavigation />

        <div className={styles.workspace}>{children}</div>
      </div>
    </AppLayout>
  )
}
