import { Link } from 'react-router-dom'
import {
  ClipboardList,
  FilePlus2,
  FileText,
  ListTodo,
  Plus,
} from 'lucide-react'
import styles from '../DashboardV2.module.css'

const ACTIONS = [
  {
    to: '/sluby/nowy',
    label: 'Dodaj ślub',
    icon: Plus,
  },
  {
    to: '/ustawienia/dokumenty/szablony',
    label: 'Generuj umowę',
    icon: FilePlus2,
  },
  {
    to: '/ankiety/szablony',
    label: 'Utwórz ankietę',
    icon: ClipboardList,
  },
  {
    to: '/sluby',
    label: 'Nowe zadanie',
    icon: ListTodo,
  },
  {
    to: '/ustawienia/dokumenty/szablony',
    label: 'Dokumenty',
    icon: FileText,
  },
] as const

export function QuickActions() {
  return (
    <section className={styles.section} aria-label="Szybkie akcje">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Szybkie akcje</h2>
      </div>
      <div className={styles.actionsGrid}>
        {ACTIONS.map(({ to, label, icon: Icon }) => (
          <Link key={label} to={to} className={styles.actionCard}>
            <span className={styles.actionIcon}>
              <Icon size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span className={styles.actionLabel}>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
