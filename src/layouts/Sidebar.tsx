import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  IconCalendar,
  IconClipboard,
  IconClose,
  IconDashboard,
  IconInbox,
  IconSettings,
  IconWeddings,
} from '@/components/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import styles from './Sidebar.module.css'
import catalogStyles from '@/features/studio/StudioCatalog.module.css'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/sluby', label: 'Śluby', icon: IconWeddings },
  { to: '/kalendarz', label: 'Kalendarz', icon: IconCalendar },
  { to: '/ankiety', label: 'Ankiety', icon: IconClipboard },
  { to: '/oczekujace', label: 'Oczekujące', icon: IconInbox },
]

const studioItems = [
  { to: '/studio/pakiety', label: 'Pakiety' },
  { to: '/studio/uslugi', label: 'Usługi dodatkowe' },
  { to: '/studio/podroz', label: 'Ustawienia podróży' },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
  onNavigate?: () => void
}

export function Sidebar({ open = false, onClose, onNavigate }: SidebarProps) {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const { data: studioUser } = useCurrentStudioUser()

  const displayName = studioUser?.displayName ?? ''
  const displayRole = user?.role ?? ''
  const avatarLetter = displayName
    ? displayName.charAt(0).toUpperCase()
    : '—'

  async function handleLogout() {
    onNavigate?.()
    await logout()
    navigate('/', { replace: true })
  }

  const drawerClosed = isMobile && !open

  return (
    <aside
      className={styles.sidebar}
      data-open={open ? 'true' : 'false'}
      aria-hidden={drawerClosed}
      inert={drawerClosed ? true : undefined}
    >
      <div className={styles.logoRow}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>OW</span>
          <span className={styles.logoText}>OurWed</span>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Zamknij nawigację"
          onClick={onClose}
        >
          <IconClose />
        </button>
      </div>

      <nav className={styles.nav} aria-label="Nawigacja główna">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <Icon className={styles.navIcon} />
            <span>{label}</span>
          </NavLink>
        ))}

        <div className={catalogStyles.navGroup}>
          <p className={catalogStyles.navGroupLabel}>Studio</p>
          {studioItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <IconSettings className={styles.navIcon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <NavLink
          to="/ustawienia"
          onClick={onNavigate}
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <IconSettings className={styles.navIcon} />
          <span>Ustawienia</span>
        </NavLink>
      </nav>

      <div className={styles.footer}>
        <div className={styles.userMenu}>
          <div className={styles.user}>
            <div className={styles.userAvatar}>{avatarLetter}</div>
            <div className={styles.userText}>
              <p className={styles.userName}>{displayName}</p>
              <p className={styles.userRole}>{displayRole}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.logout}
            onClick={() => void handleLogout()}
          >
            Wyloguj
          </button>
        </div>
      </div>
    </aside>
  )
}
