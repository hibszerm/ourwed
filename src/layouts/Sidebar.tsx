import { NavLink, useNavigate } from 'react-router-dom'
import {
  IconCalendar,
  IconClipboard,
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

export function Sidebar() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  const { data: studioUser } = useCurrentStudioUser()

  const displayName = studioUser?.displayName ?? ''
  const displayRole = user?.role ?? ''
  const avatarLetter = displayName
    ? displayName.charAt(0).toUpperCase()
    : '—'

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>OW</span>
        <span className={styles.logoText}>OurWed</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
            <div>
              <p className={styles.userName}>{displayName}</p>
              <p className={styles.userRole}>{displayRole}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.logout}
            onClick={handleLogout}
          >
            Wyloguj
          </button>
        </div>
      </div>
    </aside>
  )
}
