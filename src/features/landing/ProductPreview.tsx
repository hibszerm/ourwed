import { useEffect, useState } from 'react'
import styles from './ProductPreview.module.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'weddings', label: 'Śluby' },
  { id: 'travel', label: 'Podróże' },
  { id: 'questionnaires', label: 'Ankiety' },
  { id: 'finance', label: 'Finanse' },
  { id: 'calendar', label: 'Kalendarz' },
] as const

type TabId = (typeof TABS)[number]['id']

function PreviewDashboard() {
  return (
    <div className={styles.screen}>
      <p className={styles.greeting}>Dzień dobry</p>
      <h3 className={styles.screenTitle}>Anna</h3>
      <div className={styles.statRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Następny ślub</span>
          <strong className={styles.statValue}>12 dni</strong>
          <span className={styles.statMeta}>Kowalska & Nowak</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Dziś</span>
          <strong className={styles.statValue}>3</strong>
          <span className={styles.statMeta}>zadania do zrobienia</span>
        </div>
      </div>
      <div className={styles.listCard}>
        <div className={styles.listHead}>Oczekujące ankiety</div>
        <div className={styles.listRow}>
          <span>Wiśniewscy — umowa</span>
          <em>Nowa</em>
        </div>
        <div className={styles.listRow}>
          <span>Zielińscy — szczegóły</span>
          <em>Wysłana</em>
        </div>
      </div>
    </div>
  )
}

function PreviewWeddings() {
  return (
    <div className={styles.screen}>
      <div className={styles.screenHeader}>
        <h3 className={styles.screenTitle}>Śluby</h3>
        <span className={styles.pill}>8 aktywnych</span>
      </div>
      <div className={styles.weddingGrid}>
        {[
          { names: 'Anna & Michał', date: '15 sie 2026', stage: 'Umowa' },
          { names: 'Kasia & Piotr', date: '22 sie 2026', stage: 'Zaliczka' },
          { names: 'Ola & Tomek', date: '5 wrz 2026', stage: 'Przygotowania' },
        ].map((w) => (
          <div key={w.names} className={styles.weddingCard}>
            <strong>{w.names}</strong>
            <span>{w.date}</span>
            <em>{w.stage}</em>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewTravel() {
  return (
    <div className={styles.screen}>
      <h3 className={styles.screenTitle}>Plan podróży</h3>
      <div className={styles.mapBlock}>
        <div className={styles.mapRoute} />
        <span className={styles.mapPin} style={{ left: '18%', top: '42%' }}>
          1
        </span>
        <span className={styles.mapPin} style={{ left: '48%', top: '28%' }}>
          2
        </span>
        <span className={styles.mapPin} style={{ left: '72%', top: '58%' }}>
          3
        </span>
      </div>
      <div className={styles.flowList}>
        <div className={styles.flowStop}>
          <b>1</b>
          <div>
            <strong>Przygotowania</strong>
            <span>ul. Kwiatowa 12</span>
          </div>
        </div>
        <div className={styles.flowLeg}>24 min · 18 km</div>
        <div className={styles.flowStop}>
          <b>2</b>
          <div>
            <strong>Ceremonia</strong>
            <span>Kościół św. Anny</span>
          </div>
        </div>
        <div className={styles.flowLeg}>12 min · 7 km</div>
        <div className={styles.flowStop}>
          <b>3</b>
          <div>
            <strong>Przyjęcie</strong>
            <span>Pałac w Wilanowie</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewQuestionnaires() {
  return (
    <div className={styles.screen}>
      <h3 className={styles.screenTitle}>Ankiety</h3>
      <div className={styles.formCard}>
        <span className={styles.formEyebrow}>Umowa</span>
        <strong>Dane pary młodej</strong>
        <div className={styles.fakeField}>
          <em>Imię pani młodej</em>
          <span>Anna</span>
        </div>
        <div className={styles.fakeField}>
          <em>Imię pana młodego</em>
          <span>Michał</span>
        </div>
        <div className={styles.fakeField}>
          <em>Data ślubu</em>
          <span>15.08.2026</span>
        </div>
        <div className={styles.formProgress}>
          <i style={{ width: '68%' }} />
        </div>
        <span className={styles.formMeta}>Krok 2 z 4 · zapisano</span>
      </div>
    </div>
  )
}

function PreviewFinance() {
  return (
    <div className={styles.screen}>
      <h3 className={styles.screenTitle}>Finanse</h3>
      <div className={styles.financeHero}>
        <span>Wartość umowy</span>
        <strong>9 500 zł</strong>
      </div>
      <div className={styles.financeRows}>
        <div>
          <span>Zaliczka</span>
          <strong className={styles.ok}>3 000 zł · opłacona</strong>
        </div>
        <div>
          <span>Pozostało</span>
          <strong>6 500 zł</strong>
        </div>
        <div>
          <span>Termin płatności</span>
          <strong>1 sie 2026</strong>
        </div>
      </div>
    </div>
  )
}

function PreviewCalendar() {
  const days = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
  return (
    <div className={styles.screen}>
      <div className={styles.screenHeader}>
        <h3 className={styles.screenTitle}>Sierpień 2026</h3>
        <span className={styles.pill}>3 śluby</span>
      </div>
      <div className={styles.calGrid}>
        {days.map((d) => (
          <span key={d} className={styles.calDow}>
            {d}
          </span>
        ))}
        {Array.from({ length: 31 }, (_, i) => {
          const day = i + 1
          const event = day === 15 || day === 22 || day === 29
          return (
            <span
              key={day}
              className={`${styles.calDay} ${event ? styles.calEvent : ''}`}
            >
              {day}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function PreviewBody({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'dashboard':
      return <PreviewDashboard />
    case 'weddings':
      return <PreviewWeddings />
    case 'travel':
      return <PreviewTravel />
    case 'questionnaires':
      return <PreviewQuestionnaires />
    case 'finance':
      return <PreviewFinance />
    case 'calendar':
      return <PreviewCalendar />
  }
}

interface ProductPreviewProps {
  className?: string
  /** Auto-rotate tabs in hero */
  autoRotate?: boolean
}

export function ProductPreview({
  className = '',
  autoRotate = false,
}: ProductPreviewProps) {
  const [active, setActive] = useState<TabId>('dashboard')
  const [fadeKey, setFadeKey] = useState(0)

  useEffect(() => {
    if (!autoRotate) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const id = window.setInterval(() => {
      setActive((prev) => {
        const idx = TABS.findIndex((t) => t.id === prev)
        const next = TABS[(idx + 1) % TABS.length]!
        return next.id
      })
      setFadeKey((k) => k + 1)
    }, 4200)

    return () => window.clearInterval(id)
  }, [autoRotate])

  function selectTab(id: TabId) {
    setActive(id)
    setFadeKey((k) => k + 1)
  }

  return (
    <div className={`${styles.root} ${className}`.trim()}>
      <div className={styles.tabs} role="tablist" aria-label="Podgląd aplikacji">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`${styles.tab} ${active === tab.id ? styles.tabActive : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.device}>
        <div className={styles.chrome} aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.deviceBody}>
          <aside className={styles.sidebar} aria-hidden>
            <div className={styles.sideBrand}>OW</div>
            {TABS.map((tab) => (
              <div
                key={tab.id}
                className={`${styles.sideItem} ${active === tab.id ? styles.sideActive : ''}`}
              />
            ))}
          </aside>
          <div
            key={fadeKey}
            className={styles.previewPane}
            role="tabpanel"
          >
            <PreviewBody tab={active} />
          </div>
        </div>
      </div>

      <div className={styles.phone} aria-hidden>
        <div className={styles.phoneNotch} />
        <div key={`p-${fadeKey}`} className={styles.phoneBody}>
          <PreviewBody tab={active} />
        </div>
      </div>
    </div>
  )
}
