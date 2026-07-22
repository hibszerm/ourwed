import { useState } from 'react'
import {
  PREVIEW_TABS,
  PreviewBody,
  type PreviewTabId,
} from '@/features/landing/ProductPreview'
import styles from './AppTour.module.css'

/** Same surfaces as the interactive hero — order matches product navigation. */
const TOUR_NAV = PREVIEW_TABS

export function AppTour() {
  const [active, setActive] = useState<PreviewTabId>('dashboard')
  const [fadeKey, setFadeKey] = useState(0)

  function select(id: PreviewTabId) {
    if (id === active) return
    setActive(id)
    setFadeKey((k) => k + 1)
  }

  const path =
    active === 'travel' || active === 'finance'
      ? `sluby/demo`
      : active === 'weddings'
        ? 'sluby'
        : active === 'questionnaires'
          ? 'ankiety'
          : active === 'calendar'
            ? 'kalendarz'
            : 'dashboard'

  return (
    <div className={styles.root}>
      <aside className={styles.nav} aria-label="Nawigacja demo">
        <div className={styles.brand}>
          <span className={styles.brandMark}>OW</span>
          <span>OurWed</span>
        </div>
        <nav className={styles.navList} role="tablist">
          {TOUR_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active === item.id}
              className={`${styles.navItem} ${active === item.id ? styles.navItemActive : ''}`}
              onClick={() => select(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className={styles.navHint}>
          Travel i Finanse to moduły karty ślubu — tak jak w aplikacji.
        </p>
      </aside>

      <div className={styles.stage}>
        <div className={styles.chrome} aria-hidden>
          <span />
          <span />
          <span />
          <div className={styles.url}>app.ourwed.pl/{path}</div>
        </div>
        <div className={styles.contentSlot}>
          <div key={fadeKey} className={styles.content} role="tabpanel">
            <PreviewBody tab={active} />
          </div>
        </div>
      </div>

      <div className={styles.mobileTabs} role="tablist" aria-label="Sekcje aplikacji">
        {TOUR_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            className={`${styles.mobileTab} ${active === item.id ? styles.mobileTabActive : ''}`}
            onClick={() => select(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
