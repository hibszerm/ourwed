import { NavLink, useNavigate } from 'react-router-dom'
import {
  IconCalendar,
  IconDashboard,
  IconEquipment,
  IconFinances,
  IconSettings,
  IconTasks,
  IconWeddings,
} from '@/components/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import styles from './Sidebar.module.css'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/sluby', label: 'Śluby', icon: IconWeddings },
  { to: '/kalendarz', label: 'Kalendarz', icon: IconCalendar },
  { to: '/zadania', label: 'Zadania', icon: IconTasks },
  { to: '/sprzet', label: 'Sprzęt', icon: IconEquipment },
  { to: '/finanse', label: 'Finanse', icon: IconFinances },
  { to: '/ustawienia', label: 'Ustawienia', icon: IconSettings },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const displayName = user?.name ?? 'Marcin'
  const displayRole = user?.role ?? 'Administrator'
  const avatarLetter = user?.initials ?? displayName.charAt(0).toUpperCase()

  function handleLogout() {
    logout()
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
