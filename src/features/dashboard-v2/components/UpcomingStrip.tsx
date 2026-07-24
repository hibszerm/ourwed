import { Link } from 'react-router-dom'
import type { DashboardV2UpcomingCard } from '../buildDashboardV2Model'
import styles from '../DashboardV2.module.css'

export function UpcomingStrip({ cards }: { cards: DashboardV2UpcomingCard[] }) {
  return (
    <section className={styles.section} aria-label="Nadchodzące śluby">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Nadchodzące śluby</h2>
        <Link to="/sluby" className={styles.switchLink}>
          Wszystkie
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className={styles.focusEmpty}>Brak nadchodzących dat.</div>
      ) : (
        <div className={styles.upcomingStrip}>
          {cards.map((card) => (
            <Link key={card.id} to={card.href} className={styles.upcomingCard}>
              <div>
                <h3 className={styles.upcomingNames}>{card.names}</h3>
                <p className={styles.upcomingCountdown}>
                  {card.daysRemaining === 0
                    ? 'Dziś'
                    : `Za ${card.daysRemaining} ${
                        card.daysRemaining === 1 ? 'dzień' : 'dni'
                      }`}
                  {' · '}
                  {card.packageName}
                </p>
              </div>
              <div
                className={styles.progressTrack}
                aria-label={`Postęp ${card.progress}%`}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${card.progress}%` }}
                />
              </div>
              <div className={styles.upcomingFoot}>
                <span>{card.stageLabel}</span>
                <span className={styles.upcomingCta}>Otwórz</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
