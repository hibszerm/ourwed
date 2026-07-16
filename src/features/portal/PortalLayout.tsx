/**
 * @deprecated Couple Portal layout — use Form Engine (`/forms/:token`) instead.
 * No sidebar/nav in the new architecture; portal kept for Sprint 04 demos.
 */
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { portalService } from '@/lib/api/portalService'
import styles from './PortalLayout.module.css'

export function PortalLayout() {
  const { token = '' } = useParams<{ token: string }>()
  const { data: settings } = useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => portalService.getSettings(),
  })
  const { data: portal, isLoading, isError } = useQuery({
    queryKey: ['portal', token],
    queryFn: () => portalService.getByToken(token),
    enabled: Boolean(token),
  })

  const sections = portalService.getSections()
  const base = `/portal/${token}`

  if (isLoading) {
    return (
      <div className={styles.shell}>
        <p className={styles.loading}>Ładowanie portalu...</p>
      </div>
    )
  }

  if (isError || !portal) {
    return (
      <div className={styles.shell}>
        <div className={styles.error}>
          <h1>Link nieaktywny</h1>
          <p>Ten portal nie istnieje lub wygasł. Skontaktujcie się ze studiem.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <p className={styles.brand}>{settings?.studioName ?? 'OurWed'}</p>
      </header>

      <nav className={styles.nav} aria-label="Portal pary">
        {sections.map((section) => {
          const to = section.path ? `${base}/${section.path}` : base
          const end = !section.path
          return (
            <NavLink
              key={section.id}
              to={to}
              end={end}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navActive : ''} ${!section.available ? styles.navMuted : ''}`
              }
            >
              {section.label}
            </NavLink>
          )
        })}
      </nav>

      <main className={styles.main}>
        <Outlet context={{ token, portal }} />
      </main>

      {settings?.footerMessage && (
        <footer className={styles.footer}>
          <p>{settings.footerMessage}</p>
        </footer>
      )}
    </div>
  )
}
