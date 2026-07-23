import { NavLink } from 'react-router-dom'
import styles from '@/features/questionnaires/Questionnaires.module.css'

const items = [
  { to: '/ankiety', label: 'Ankiety', end: true },
  { to: '/ankiety/szablony', label: 'Szablony ankiet', end: false },
] as const

/** Sub-navigation for the Questionnaire module. */
export function QuestionnaireModuleNav() {
  return (
    <nav className={styles.moduleNav} aria-label="Ankiety">
      {items.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `${styles.moduleNavLink} ${isActive ? styles.moduleNavLinkActive : ''}`.trim()
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
