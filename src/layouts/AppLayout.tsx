import { useEffect, useId, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { IconMenu } from '@/components/icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { Sidebar } from './Sidebar'
import styles from './AppLayout.module.css'

interface AppLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
}

export function AppLayout({ children, title, subtitle, action }: AppLayoutProps) {
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const navId = useId()
  const showPageHeader = Boolean(title || action)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!navOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [navOpen])

  return (
    <div className={styles.layout} data-nav-open={navOpen ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Zamknij nawigację"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={() => setNavOpen(false)}
      />

      <div className={styles.main}>
        <div
          className={`${styles.shellHeader} ${showPageHeader ? '' : styles.shellHeaderMenuOnly}`}
        >
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Otwórz nawigację"
            aria-expanded={navOpen}
            aria-controls={navId}
            onClick={() => setNavOpen(true)}
          >
            <IconMenu />
          </button>
          {showPageHeader ? (
            <div className={styles.headerSlot}>
              <PageHeader title={title} subtitle={subtitle} action={action} />
            </div>
          ) : null}
        </div>
        <main className={styles.content} id={navId}>
          {children}
        </main>
      </div>
    </div>
  )
}
