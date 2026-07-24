import { Link } from 'react-router-dom'
import type { DashboardV2FocusAction } from '../buildDashboardV2Model'
import styles from '../DashboardV2.module.css'

export function FocusPanel({ actions }: { actions: DashboardV2FocusAction[] }) {
  return (
    <section className={styles.section} aria-label="Fokus na dziś">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Fokus na dziś</h2>
        <p className={styles.sectionHint}>Trzy najważniejsze ruchy</p>
      </div>

      {actions.length === 0 ? (
        <div className={styles.focusEmpty}>
          Nic pilnego. Masz czystą listę — dobry moment na przygotowanie kolejnego
          ślubu.
        </div>
      ) : (
        <div className={styles.focusList}>
          {actions.map((action) => (
            <Link
              key={action.id}
              to={action.href}
              className={styles.focusCard}
            >
              <span
                className={styles.focusPriority}
                data-priority={action.priority}
                aria-label={`Priorytet ${action.priority}`}
              />
              <span>
                <p className={styles.focusTitle}>{action.title}</p>
                <p className={styles.focusMeta}>
                  {action.timeLabel} · {action.weddingLabel}
                </p>
              </span>
              <span className={styles.focusAction}>Otwórz</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
