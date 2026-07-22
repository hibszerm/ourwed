import { useState, type ReactNode } from 'react'
import styles from './ProductPreview.module.css'

export const PREVIEW_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'weddings', label: 'Śluby' },
  { id: 'travel', label: 'Podróże' },
  { id: 'questionnaires', label: 'Ankiety' },
  { id: 'finance', label: 'Finanse' },
  { id: 'calendar', label: 'Kalendarz' },
] as const

export type PreviewTabId = (typeof PREVIEW_TABS)[number]['id']

export function PreviewDashboard() {
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
        <div className={styles.listHead}>Dzisiejsze zadania</div>
        <div className={styles.listRow}>
          <span>Wysłać ankietę — Wiśniewscy</span>
          <em>Do 18:00</em>
        </div>
        <div className={styles.listRow}>
          <span>Potwierdzić zaliczkę — Zielińscy</span>
          <em>Pilne</em>
        </div>
      </div>
      <div className={styles.listCard}>
        <div className={styles.listHead}>Powiadomienia</div>
        <div className={styles.listRow}>
          <span>Nowa odpowiedź w ankiecie umowy</span>
          <em>2 min</em>
        </div>
        <div className={styles.listRow}>
          <span>Przypomnienie: sesja plenerowa</span>
          <em>Dziś</em>
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
          { names: 'Anna & Michał', date: '15 sie 2026', stage: 'Umowa', progress: 35 },
          { names: 'Kasia & Piotr', date: '22 sie 2026', stage: 'Zaliczka', progress: 55 },
          { names: 'Ola & Tomek', date: '5 wrz 2026', stage: 'Przygotowania', progress: 72 },
        ].map((w) => (
          <div key={w.names} className={styles.weddingCard}>
            <div className={styles.weddingCardTop}>
              <strong>{w.names}</strong>
              <em>{w.stage}</em>
            </div>
            <span>{w.date}</span>
            <div className={styles.progressTrack}>
              <i style={{ width: `${w.progress}%` }} />
            </div>
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
      <div className={styles.screenHeader}>
        <h3 className={styles.screenTitle}>Ankiety</h3>
        <span className={styles.pill}>5 otwartych</span>
      </div>
      <div className={styles.surveyList}>
        {[
          { title: 'Wiśniewscy — umowa', status: 'Wysłana', pct: 40 },
          { title: 'Zielińscy — szczegóły', status: 'W trakcie', pct: 68 },
          { title: 'Nowakowie — timeline', status: 'Ukończona', pct: 100 },
        ].map((item) => (
          <div key={item.title} className={styles.surveyCard}>
            <div className={styles.surveyTop}>
              <strong>{item.title}</strong>
              <em>{item.status}</em>
            </div>
            <div className={styles.progressTrack}>
              <i style={{ width: `${item.pct}%` }} />
            </div>
            <span className={styles.surveyMeta}>{item.pct}% ukończenia</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewFinance() {
  return (
    <div className={styles.screen}>
      <h3 className={styles.screenTitle}>Finanse</h3>
      <div className={styles.financeHero}>
        <span>Pakiet Premium · wartość umowy</span>
        <strong>9 500 zł</strong>
      </div>
      <div className={styles.financeRows}>
        <div>
          <span>Zaliczka</span>
          <strong className={styles.ok}>3 000 zł · opłacona</strong>
        </div>
        <div>
          <span>Druga rata</span>
          <strong>3 250 zł · zaplanowana</strong>
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
      <div className={styles.listCard}>
        <div className={styles.listHead}>Nadchodzące</div>
        <div className={styles.listRow}>
          <span>15 sie — Kowalska & Nowak</span>
          <em>Ślub</em>
        </div>
        <div className={styles.listRow}>
          <span>22 sie — Zielińscy</span>
          <em>Ślub</em>
        </div>
      </div>
    </div>
  )
}

export function PreviewBody({ tab }: { tab: PreviewTabId }) {
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

function PreviewFrame({
  tab,
  fadeKey,
  url,
}: {
  tab: PreviewTabId
  fadeKey: number
  url: string
}) {
  return (
    <>
      <div className={styles.deviceDesktop}>
        <div className={styles.device}>
          <div className={styles.chrome} aria-hidden>
            <span />
            <span />
            <span />
            <div className={styles.chromeUrl}>{url}</div>
          </div>
          <div className={styles.deviceBody}>
            <aside className={styles.sidebar} aria-hidden>
              <div className={styles.sideBrand}>OW</div>
              {PREVIEW_TABS.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.sideItem} ${item.id === tab ? styles.sideActive : ''}`}
                />
              ))}
            </aside>
            <div className={styles.previewSlot}>
              <div key={fadeKey} className={styles.previewPane} role="tabpanel">
                <PreviewBody tab={tab} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.deviceMobile}>
        <div className={styles.phoneCard}>
          <div className={styles.phoneNotch} aria-hidden />
          <div className={styles.previewSlot}>
            <div key={`m-${fadeKey}`} className={styles.phonePane} role="tabpanel">
              <PreviewBody tab={tab} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function TabList({
  active,
  onSelect,
  label,
}: {
  active: PreviewTabId
  onSelect: (id: PreviewTabId) => void
  label: string
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {PREVIEW_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`${styles.tab} ${active === tab.id ? styles.tabActive : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** Hero interactive preview — tabs + one device frame, no autoplay. */
export function HeroProductPreview({ className = '' }: { className?: string }) {
  const [active, setActive] = useState<PreviewTabId>('dashboard')
  const [fadeKey, setFadeKey] = useState(0)

  function selectTab(id: PreviewTabId) {
    if (id === active) return
    setActive(id)
    setFadeKey((k) => k + 1)
  }

  return (
    <div className={`${styles.root} ${styles.heroRoot} ${className}`.trim()}>
      <TabList active={active} onSelect={selectTab} label="Ekrany aplikacji" />
      <PreviewFrame tab={active} fadeKey={fadeKey} url={`app.ourwed.pl/${active}`} />
    </div>
  )
}

/** @deprecated use HeroProductPreview */
export function HeroProductFrame(props: { className?: string }) {
  return <HeroProductPreview {...props} />
}

/** @deprecated use AppTour for the explore section */
export function ProductPreview({ className = '' }: { className?: string }) {
  return <HeroProductPreview className={className} />
}

export function PreviewShell({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`${styles.root} ${className}`.trim()}>{children}</div>
}
