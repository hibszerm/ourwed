import { useState } from 'react'
import {
  PREVIEW_TABS,
  PreviewBody,
  type PreviewTabId,
} from '@/features/landing/ProductPreview'
import styles from './AppTour.module.css'

const TOUR_NAV = [
  { id: 'dashboard' as const, label: 'Dashboard' },
  { id: 'weddings' as const, label: 'Śluby' },
  { id: 'questionnaires' as const, label: 'Ankiety' },
  { id: 'travel' as const, label: 'Podróże' },
  { id: 'finance' as const, label: 'Finanse' },
  { id: 'calendar' as const, label: 'Kalendarz' },
]

export function AppTour() {
  const [active, setActive] = useState<PreviewTabId>('dashboard')
  const [fadeKey, setFadeKey] = useState(0)

  function select(id: PreviewTabId) {
    if (id === active) return
    setActive(id)
    setFadeKey((k) => k + 1)
  }

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
      </aside>

      <div className={styles.stage}>
        <div className={styles.chrome} aria-hidden>
          <span />
          <span />
          <span />
          <div className={styles.url}>
            app.ourwed.pl/{PREVIEW_TABS.find((t) => t.id === active)?.id}
          </div>
        </div>
        <div className={styles.contentSlot}>
          <div key={fadeKey} className={styles.content} role="tabpanel">
            <PreviewBody tab={active} />
          </div>
        </div>
      </div>

      {/* Mobile: horizontal chips instead of sidebar */}
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
