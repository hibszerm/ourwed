import { NavLink } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { useAdminAuth } from '@/admin/auth/useAdminAuth'
import { maskEmail } from '@/admin/lib/maskEmail'
import styles from '@/admin/styles/admin.module.css'

type NavItem =
  | { kind: 'link'; to: string; label: string }
  | { kind: 'disabled'; label: string; badge: string }

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'PRZEGLĄD',
    items: [{ kind: 'link', to: '/overview', label: 'Przegląd' }],
  },
  {
    section: 'KLIENCI',
    items: [{ kind: 'link', to: '/users', label: 'Użytkownicy' }],
  },
  {
    section: 'OPERACJE',
    items: [
      { kind: 'link', to: '/emails', label: 'E-maile' },
      { kind: 'link', to: '/integrations', label: 'Integracje' },
      { kind: 'link', to: '/system', label: 'Zdrowie systemu' },
    ],
  },
  {
    section: 'BEZPIECZEŃSTWO',
    items: [{ kind: 'link', to: '/audit', label: 'Audyt' }],
  },
  {
    section: 'ROZLICZENIA',
    items: [{ kind: 'link', to: '/subscriptions', label: 'Subskrypcje' }],
  },
]

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAdminAuth()

  useEffect(() => {
    const previous = document.title
    document.title = 'OurWed Platform'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className={`${styles.page} ${styles.shell}`} data-testid="admin-shell">
      <aside className={`${styles.sidebar} ${styles.sans}`}>
        <div className={styles.sidebarBrandBlock}>
          <span className={styles.sidebarMark}>OW</span>
          <p className={styles.sidebarBrand}>OurWed Platform</p>
        </div>

        <nav className={styles.nav} aria-label="Nawigacja główna">
          {NAV.map((group) => (
            <div key={group.section} className={styles.navSection}>
              <p className={styles.navSectionLabel}>{group.section}</p>
              {group.items.map((item) =>
                item.kind === 'link' ? (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/overview'}
                    className={({ isActive }) =>
                      isActive ? styles.navActive : styles.navLink
                    }
                  >
                    {item.label}
                  </NavLink>
                ) : (
                  <div
                    key={item.label}
                    className={styles.navDisabled}
                    aria-disabled="true"
                  >
                    {item.label}
                    <span>{item.badge}</span>
                  </div>
                ),
              )}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <div>
            <strong>{maskEmail(user?.email)}</strong>
            <div>Owner</div>
            <div className={styles.mfaBadge}>MFA aktywne</div>
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void signOut()}
            style={{ color: '#f4f1ec', borderColor: 'rgba(244,241,236,0.28)' }}
          >
            Wyloguj
          </button>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
