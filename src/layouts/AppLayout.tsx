import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { IconMenu } from '@/components/icons'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  lockBodyScroll,
  unlockBodyScroll,
} from '@/components/ui/overlay/bodyLock'
import { useAssistantOptional } from '@/features/assistant/assistantContext'
import { ReadOnlyBanner } from '@/features/billing/ReadOnlyBanner'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { Sidebar } from './Sidebar'
import styles from './AppLayout.module.css'
import '@/features/dashboard-v3/v3Materials.css'

interface AppLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
  /** Optional app-like identity shown beside the mobile menu trigger only. */
  mobileHeader?: ReactNode
}

export function AppLayout({
  children,
  title,
  subtitle,
  action,
  mobileHeader,
}: AppLayoutProps) {
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [navPath, setNavPath] = useState(location.pathname)
  const navId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const showPageHeader = Boolean(title || action)
  const { isReadOnly, loading, bannerHiddenForSession, hideReadOnlyBanner } =
    useProAccessGate()
  const assistant = useAssistantOptional()

  if (location.pathname !== navPath) {
    setNavPath(location.pathname)
    setNavOpen(false)
  }

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)')
    const closeWhenDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setNavOpen(false)
    }

    mobile.addEventListener('change', closeWhenDesktop)
    return () => mobile.removeEventListener('change', closeWhenDesktop)
  }, [])

  useEffect(() => {
    if (!navOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    lockBodyScroll()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      unlockBodyScroll()
    }
  }, [navOpen])

  return (
    <div
      className={styles.layout}
      data-phase="d25-pending-empty-card-parity"
      data-nav-open={navOpen ? 'true' : 'false'}
      data-shell="v3"
      data-mobile-header={mobileHeader ? 'true' : undefined}
    >
      <button
        type="button"
        className={styles.backdrop}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />

      <Sidebar
        id={navId}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={() => setNavOpen(false)}
        presentation="v3"
        returnFocusRef={menuButtonRef}
      />

      <div
        className={styles.main}
        inert={navOpen ? true : undefined}
        aria-hidden={navOpen ? true : undefined}
      >
        <div className={styles.shellAccess} data-mobile-shell-header>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-label="Otwórz nawigację"
            aria-expanded={navOpen}
            aria-controls={navId}
            onClick={() => setNavOpen(true)}
          >
            <IconMenu />
          </button>
          {mobileHeader ? (
            <div className={styles.mobileHeader}>{mobileHeader}</div>
          ) : null}
          {assistant ? (
            <div className={styles.mobileAssistantSlot}>
              {assistant.MobileLauncher()}
            </div>
          ) : null}
        </div>
        {showPageHeader ? (
          <div className={styles.headerSlot}>
            <PageHeader title={title} subtitle={subtitle} action={action} />
          </div>
        ) : null}
        <main className={styles.content}>
          <ReadOnlyBanner
            visible={!loading && isReadOnly && !bannerHiddenForSession}
            onHide={hideReadOnlyBanner}
          />
          {children}
        </main>
      </div>
    </div>
  )
}
