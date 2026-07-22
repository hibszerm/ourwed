import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { WorkflowBadge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import {
  WORKFLOW_STAGE_DESCRIPTIONS,
  WORKFLOW_STAGE_LABELS,
  getWorkflowProgress,
} from '@/lib/utils/workflow'
import type { WorkflowStage } from '@/types/wedding'
import styles from './ProductPreview.module.css'

/** Tabs mirror real product surfaces (sidebar + wedding detail modules). */
export const PREVIEW_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'weddings', label: 'Śluby' },
  { id: 'questionnaires', label: 'Ankiety' },
  { id: 'travel', label: 'Travel' },
  { id: 'finance', label: 'Finanse' },
  { id: 'calendar', label: 'Kalendarz' },
] as const

export type PreviewTabId = (typeof PREVIEW_TABS)[number]['id']

const DEMO_WEDDINGS: {
  names: string
  packageName: string
  date: string
  location: string
  stage: WorkflowStage
  accent: string
  days: number
}[] = [
  {
    names: 'Anna & Michał',
    packageName: 'Pakiet Premium',
    date: '15 sie 2026',
    location: 'Pałac w Wilanowie, Warszawa',
    stage: 'contract',
    accent: '#7c5cbf',
    days: 24,
  },
  {
    names: 'Kasia & Piotr',
    packageName: 'Pakiet Standard',
    date: '22 sie 2026',
    location: 'Dwór Sanna, Lublin',
    stage: 'deposit',
    accent: '#5c8cbf',
    days: 31,
  },
  {
    names: 'Ola & Tomek',
    packageName: 'Pakiet Mini',
    date: '5 wrz 2026',
    location: 'Hotel Narvil, Serock',
    stage: 'pre_wedding_questionnaire',
    accent: '#bf8c5c',
    days: 45,
  },
]

export function PreviewDashboard() {
  return (
    <div className={styles.screen}>
      <p className={styles.greeting}>Dzień dobry</p>
      <h3 className={styles.screenTitle}>Anna</h3>

      <div className={styles.nextWedding}>
        <div className={styles.nextBody}>
          <div className={styles.nextEyebrow}>
            <span className={styles.nextDot} style={{ background: '#7c5cbf' }} />
            Najbliższy ślub
          </div>
          <strong className={styles.nextNames}>Anna & Michał</strong>
          <p className={styles.nextMeta}>
            15 sierpnia 2026 · Pakiet Premium
          </p>
          <p className={styles.nextLoc}>Pałac w Wilanowie, Warszawa</p>
          <div className={styles.nextStatus}>
            <WorkflowBadge stage="contract" />
            <span>{WORKFLOW_STAGE_DESCRIPTIONS.contract}</span>
          </div>
          <span className={styles.nextCta}>Otwórz ślub</span>
        </div>
        <div className={styles.nextCountdown}>
          <span className={styles.nextDays}>24</span>
          <span className={styles.nextUnit}>dni do ślubu</span>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.listCard}>
          <div className={styles.listHead}>Dzisiaj</div>
          <div className={styles.taskRow}>
            <div>
              <strong>Wiśniewscy</strong>
              <span>Wysłać ankietę umowy</span>
            </div>
            <em>Pilne</em>
          </div>
          <div className={styles.taskRow}>
            <div>
              <strong>Zielińscy</strong>
              <span>Potwierdzić zadatek</span>
            </div>
          </div>
        </div>
        <div className={styles.listCard}>
          <div className={styles.listHead}>Powiadomienia</div>
          <div className={styles.listRow}>
            <span>Nowa odpowiedź w ankiecie</span>
            <em>2 min</em>
          </div>
          <div className={styles.listRow}>
            <span>Umowa gotowa do wysłania</span>
            <em>Dziś</em>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewWeddings() {
  return (
    <div className={styles.screen}>
      <div className={styles.screenHeader}>
        <div>
          <h3 className={styles.screenTitle}>Śluby</h3>
          <p className={styles.screenSub}>8 aktywnych par</p>
        </div>
        <span className={styles.fakeBtn}>Nowy ślub</span>
      </div>
      <div className={styles.weddingGrid}>
        {DEMO_WEDDINGS.map((w) => (
          <div key={w.names} className={styles.weddingCard}>
            <div className={styles.weddingHeader}>
              <Avatar name={w.names} color={w.accent} size="md" />
              <div className={styles.weddingInfo}>
                <strong>{w.names}</strong>
                <span>{w.packageName}</span>
              </div>
              <WorkflowBadge stage={w.stage} />
            </div>
            <p className={styles.weddingLoc}>{w.location}</p>
            <div className={styles.weddingFooter}>
              <div className={styles.weddingProgress}>
                <span>Workflow</span>
                <ProgressBar
                  value={getWorkflowProgress(w.stage)}
                  max={100}
                  showLabel={false}
                />
              </div>
              <div className={styles.weddingDate}>
                <strong>{w.date}</strong>
                <span>za {w.days} dni</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewTravel() {
  const stops = [
    {
      i: 1,
      title: 'Studio',
      address: 'ul. Mokotowska 12, Warszawa',
    },
    {
      i: 2,
      title: 'Preparations',
      address: 'ul. Kwiatowa 8, Konstancin',
    },
    {
      i: 3,
      title: 'Ceremony',
      address: 'Kościół św. Anny, Warszawa',
    },
    {
      i: 4,
      title: 'Reception',
      address: 'Pałac w Wilanowie',
    },
  ]
  const legs = [
    { duration: '28 min', distance: '18 km' },
    { duration: '22 min', distance: '14 km' },
    { duration: '12 min', distance: '7 km' },
  ]

  return (
    <div className={styles.screen}>
      <div className={styles.screenHeader}>
        <div>
          <h3 className={styles.screenTitle}>Travel</h3>
          <p className={styles.screenSub}>
            Studio → Preparations → Ceremony → Reception
          </p>
        </div>
      </div>

      <div className={styles.mapBlock}>
        <div className={styles.mapRoute} />
        {stops.map((s, idx) => (
          <span
            key={s.i}
            className={styles.mapPin}
            style={{
              left: `${18 + idx * 20}%`,
              top: `${32 + (idx % 2) * 22}%`,
            }}
          >
            {s.i}
          </span>
        ))}
      </div>

      <div className={styles.travelFlow}>
        {stops.map((stop, idx) => (
          <div key={stop.i} className={styles.travelFlowItem}>
            <div className={styles.stopCard}>
              <span className={styles.stopIndex}>{stop.i}</span>
              <div>
                <strong>{stop.title}</strong>
                <span>{stop.address}</span>
              </div>
            </div>
            {legs[idx] ? (
              <div className={styles.leg}>
                <span className={styles.legArrow}>↓</span>
                <span className={styles.legMeta}>
                  {legs[idx].duration}
                  <em>•</em>
                  {legs[idx].distance}
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className={styles.travelSummary}>
        <div>
          <span>Total distance</span>
          <strong>39 km</strong>
        </div>
        <div>
          <span>Estimated driving</span>
          <strong>1 h 2 min</strong>
        </div>
      </div>
    </div>
  )
}

function PreviewQuestionnaires() {
  const rows = [
    {
      status: 'Wysłana',
      type: 'Umowa',
      couple: 'Anna · Michał',
      created: '12 lip',
    },
    {
      status: 'Otwarta',
      type: 'Ankieta przedślubna',
      couple: 'Kasia · Piotr',
      created: '18 lip',
    },
    {
      status: 'Oczekuje',
      type: 'Umowa',
      couple: 'Lead / przed ślubem',
      created: '20 lip',
    },
  ]

  return (
    <div className={styles.screen}>
      <div className={styles.screenHeader}>
        <div>
          <h3 className={styles.screenTitle}>Ankiety</h3>
          <p className={styles.screenSub}>Status wysyłki i odpowiedzi</p>
        </div>
        <span className={styles.fakeBtn}>Wygeneruj ankietę</span>
      </div>
      <div className={styles.table}>
        <div className={styles.tableHead}>
          <span>Status</span>
          <span>Typ</span>
          <span>Para</span>
          <span>Utworzono</span>
        </div>
        {rows.map((row) => (
          <div key={row.couple + row.type} className={styles.tableRow}>
            <span className={styles.statusPill}>{row.status}</span>
            <strong>{row.type}</strong>
            <span>{row.couple}</span>
            <span>{row.created}</span>
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
        <span>Wartość umowy</span>
        <strong>9 500 zł</strong>
      </div>
      <div className={styles.financeSplit}>
        <div>
          <span>Wpłacono</span>
          <strong className={styles.ok}>3 000 zł</strong>
        </div>
        <div>
          <span>Pozostało</span>
          <strong>6 500 zł</strong>
        </div>
      </div>
      <div className={styles.financeRows}>
        <div>
          <span>Zadatek</span>
          <strong className={styles.ok}>3 000 zł · wpłacono</strong>
        </div>
        <div>
          <span>Płatność końcowa</span>
          <strong>6 500 zł · nieopłacona</strong>
        </div>
      </div>
    </div>
  )
}

function PreviewCalendar() {
  const days = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
  return (
    <div className={styles.screen}>
      <div className={styles.calSummary}>
        <div>
          <span>Najbliższy ślub</span>
          <strong>15 sie</strong>
        </div>
        <div>
          <span>Śluby</span>
          <strong>3</strong>
        </div>
        <div>
          <span>Wartość zleceń</span>
          <strong>24,5k</strong>
        </div>
      </div>
      <div className={styles.screenHeader}>
        <h3 className={styles.screenTitle}>Sierpień 2026</h3>
        <span className={styles.pill}>Miesiąc</span>
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
        <div className={styles.listHead}>Śluby w tym miesiącu</div>
        {DEMO_WEDDINGS.map((w) => (
          <div key={w.names} className={styles.calWeddingRow}>
            <span>{w.date}</span>
            <strong>{w.names}</strong>
            <WorkflowBadge stage={w.stage} />
          </div>
        ))}
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
            <div
              key={`m-${fadeKey}`}
              className={styles.phonePane}
              role="tabpanel"
            >
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

export function HeroProductPreview({ className = '' }: { className?: string }) {
  const [active, setActive] = useState<PreviewTabId>('dashboard')
  const [fadeKey, setFadeKey] = useState(0)

  function selectTab(id: PreviewTabId) {
    if (id === active) return
    setActive(id)
    setFadeKey((k) => k + 1)
  }

  const path =
    active === 'travel' || active === 'finance'
      ? `sluby/demo#${active}`
      : active === 'weddings'
        ? 'sluby'
        : active === 'questionnaires'
          ? 'ankiety'
          : active === 'calendar'
            ? 'kalendarz'
            : 'dashboard'

  return (
    <div className={`${styles.root} ${styles.heroRoot} ${className}`.trim()}>
      <TabList active={active} onSelect={selectTab} label="Ekrany aplikacji" />
      <PreviewFrame
        tab={active}
        fadeKey={fadeKey}
        url={`app.ourwed.pl/${path}`}
      />
    </div>
  )
}

export function HeroProductFrame(props: { className?: string }) {
  return <HeroProductPreview {...props} />
}

export function ProductPreview({ className = '' }: { className?: string }) {
  return <HeroProductPreview className={className} />
}

/** Expose stage labels for other landing sections. */
export { WORKFLOW_STAGE_LABELS }
