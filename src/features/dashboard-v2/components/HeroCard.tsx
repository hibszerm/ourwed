import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays } from 'lucide-react'
import type { DashboardV2Model } from '../buildDashboardV2Model'
import styles from '../DashboardV2.module.css'

export function HeroCard({ model }: { model: DashboardV2Model['hero'] }) {
  const s = model.stats
  const hasWedding = Boolean(model.wedding)

  return (
    <section className={styles.hero} aria-label="Najbliższy ślub">
      <div className={styles.heroGlow} aria-hidden />
      <div className={styles.heroInner}>
        <div>
          <p className={styles.heroEyebrow}>Najbliższy ślub</p>
          {hasWedding ? (
            <>
              <h1 className={styles.heroNames}>{model.names}</h1>
              <div className={styles.heroMeta}>
                <span>
                  <strong>{model.dateLabel}</strong>
                </span>
                <span>
                  Za <strong>{model.daysRemaining}</strong>{' '}
                  {model.daysRemaining === 1 ? 'dzień' : 'dni'}
                </span>
                <span>
                  Etap: <strong>{model.stageLabel}</strong>
                </span>
              </div>
              <div className={styles.heroActions}>
                <Link to={model.href} className={styles.ctaPrimary}>
                  Otwórz ślub
                  <ArrowRight size={16} aria-hidden />
                </Link>
                <Link to="/sluby/nowy" className={styles.ctaSecondary}>
                  <CalendarDays size={16} aria-hidden />
                  Dodaj ślub
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className={styles.heroEmpty}>
                Brak nadchodzącego ślubu. Dodaj pierwszą datę i zbuduj spokojny
                rytm pracy.
              </p>
              <div className={styles.heroActions}>
                <Link to="/sluby/nowy" className={styles.ctaPrimary}>
                  Dodaj ślub
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </>
          )}
        </div>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{s.tasksToday}</span>
            <span className={styles.heroStatLabel}>Zadania dziś</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{s.unreadNotifications}</span>
            <span className={styles.heroStatLabel}>Powiadomienia</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{s.paymentsWaiting}</span>
            <span className={styles.heroStatLabel}>Płatności</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{s.documentsPending}</span>
            <span className={styles.heroStatLabel}>Dokumenty</span>
          </div>
        </div>
      </div>
    </section>
  )
}
