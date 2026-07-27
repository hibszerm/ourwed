import type { ReactNode } from 'react'
import styles from './demos.module.css'
import type { ContractBeat, DesktopBeat, MobileBeat } from '../motion/sceneTimings'

function Shell({
  title,
  active,
  children,
}: {
  title: string
  active?: string
  children: ReactNode
}) {
  return (
    <div className={styles.ui}>
      <div className={styles.shell}>
        <aside className={styles.side}>
          <span className={styles.logo}>OW</span>
          <nav>
            {['Pulpit', 'Śluby', 'Pakiety', 'Kalendarz'].map((item) => (
              <em key={item} data-on={active === item || item === 'Pulpit'}>
                {item}
              </em>
            ))}
          </nav>
        </aside>
        <div className={styles.main}>
          <header className={styles.top}>
            <strong>{title}</strong>
            <span>Studio</span>
          </header>
          <div className={styles.body}>{children}</div>
        </div>
      </div>
    </div>
  )
}

export function DashboardDemo() {
  return (
    <Shell title="Pulpit" active="Pulpit">
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p>Najbliższy ślub</p>
          <strong>Anna & Michał</strong>
          <span>22 sie · Premium</span>
        </div>
        <div className={styles.card}>
          <p>Do zrobienia</p>
          <strong>4 zadania</strong>
          <span>Umowa · Zaliczka</span>
        </div>
      </div>
      <div className={styles.row}>
        <span>Julia & Tomasz</span>
        <span>12 wrz</span>
      </div>
    </Shell>
  )
}

export function WeddingDemo() {
  return (
    <Shell title="Anna & Michał" active="Śluby">
      <div className={styles.card}>
        <p>Pakiet</p>
        <strong>Premium Film + Foto</strong>
        <span>Zinnar Castle · 22.08.2026</span>
      </div>
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p>Status</p>
          <strong>Gotowy</strong>
          <span>Umowa · Ankieta</span>
        </div>
        <div className={styles.card}>
          <p>Zaliczka</p>
          <strong>Opłacona</strong>
          <span>4 750 zł</span>
        </div>
      </div>
    </Shell>
  )
}

export function TasksDemo() {
  return (
    <Shell title="Zadania" active="Pulpit">
      {[
        ['Wysłać umowę', true],
        ['Potwierdzić lokalizację', false],
        ['Spakować sprzęt', false],
      ].map(([label, done]) => (
        <div key={String(label)} className={styles.task} data-done={done}>
          <i />
          {label}
        </div>
      ))}
    </Shell>
  )
}

export function PaymentsDemo() {
  return (
    <Shell title="Płatności" active="Pulpit">
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p>Zaliczka</p>
          <strong>4 750 zł</strong>
          <span>Opłacona</span>
        </div>
        <div className={styles.card}>
          <p>Pozostało</p>
          <strong>4 750 zł</strong>
          <span>Termin 15.08</span>
        </div>
      </div>
    </Shell>
  )
}

export function ContractDemo({ beat }: { beat: ContractBeat }) {
  return (
    <div className={`${styles.ui} ${styles.magic}`}>
      {beat === 'upload' ? (
        <div className={styles.magicCard}>
          <div className={styles.doc} />
          <strong>Dodaj umowę pakietu</strong>
          <span>Przeciągnij DOCX</span>
        </div>
      ) : null}
      {beat === 'prepare' ? (
        <div className={styles.magicCard}>
          <strong>Przygotowujemy dokument</strong>
          <ul className={styles.steps}>
            <li data-done>Czytamy dokument</li>
            <li data-done>Szukamy pól</li>
            <li>Sprawdzamy poprawność</li>
          </ul>
        </div>
      ) : null}
      {beat === 'ready' ? (
        <div className={styles.magicCard}>
          <strong>Umowa gotowa</strong>
          <span>Bezpieczna · Gotowa do generowania</span>
        </div>
      ) : null}
      {beat === 'generate' ? (
        <div className={styles.magicCard}>
          <strong>Tworzymy gotową umowę</strong>
          <ul className={styles.steps}>
            <li data-done>Ładujemy szablon</li>
            <li>Uzupełniamy dane ślubu</li>
          </ul>
        </div>
      ) : null}
      {beat === 'preview' ? (
        <div className={styles.magicCard}>
          <strong>Dokument gotowy</strong>
          <span className={styles.btn}>Podgląd</span>
        </div>
      ) : null}
    </div>
  )
}

function MobileChrome({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className={`${styles.ui} ${styles.mobile}`}>
      <header className={styles.mTop}>
        <span>9:41</span>
        <strong>{title}</strong>
        <span />
      </header>
      <div className={styles.mBody}>{children}</div>
    </div>
  )
}

export function MobileTodayDemo() {
  return (
    <MobileChrome title="Dziś">
      <div className={styles.mHero}>
        <p>Ślub</p>
        <strong>Anna & Michał</strong>
        <span>Zinnar Castle · start 14:00</span>
      </div>
    </MobileChrome>
  )
}

export function MobileNavigationDemo({ draw = 0.7 }: { draw?: number }) {
  const len = 180
  const dash = len * (1 - draw)
  return (
    <MobileChrome title="Nawigacja">
      <div className={styles.map}>
        <svg viewBox="0 0 200 130" aria-hidden>
          <path
            d="M20 100 C60 90, 70 40, 110 45 S170 80, 180 30"
            fill="none"
            stroke="color-mix(in srgb, var(--color-text-primary) 18%, transparent)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M20 100 C60 90, 70 40, 110 45 S170 80, 180 30"
            fill="none"
            stroke="var(--color-text-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={dash}
          />
          <circle cx="20" cy="100" r="4" fill="var(--color-text-primary)" />
          <circle cx="180" cy="30" r="5" fill="var(--color-text-primary)" />
        </svg>
      </div>
      <div className={styles.mCard}>
        <strong>Do ceremonii</strong>
        <span>12 min · 8,4 km</span>
        <span className={styles.btn}>Nawiguj</span>
      </div>
    </MobileChrome>
  )
}

export function MobileChecklistDemo({ done = false }: { done?: boolean }) {
  return (
    <MobileChrome title="Sprzęt">
      {['Korpus A', 'Obiektyw 35', 'Baterie ×4'].map((item, i) => (
        <div
          key={item}
          className={styles.task}
          data-done={done || i < 2}
        >
          <i />
          {item}
        </div>
      ))}
    </MobileChrome>
  )
}

export function MobileTimelineDemo() {
  return (
    <MobileChrome title="Harmonogram">
      {['14:00 Przygotowania', '16:00 Ceremonia', '18:00 Przyjęcie'].map(
        (row) => (
          <div key={row} className={styles.row}>
            {row}
          </div>
        ),
      )}
    </MobileChrome>
  )
}

export function MobileContactDemo() {
  return (
    <MobileChrome title="Kontakt">
      <div className={styles.mCard}>
        <strong>Anna</strong>
        <span>+48 600 000 000</span>
        <span className={styles.btn}>Zadzwoń</span>
      </div>
    </MobileChrome>
  )
}

export function MobileOfflineDemo() {
  return (
    <MobileChrome title="Offline">
      <div className={styles.mCard}>
        <strong>Pracujesz bez sieci</strong>
        <span>Zmiany zsynchronizują się automatycznie</span>
      </div>
    </MobileChrome>
  )
}

export function ProductSceneContent({
  phase,
  desktopBeat,
  contractBeat,
  mobileBeat,
  navDraw,
  checklistDone,
}: {
  phase: 'boot' | 'desktop' | 'contract' | 'mobile' | 'sync'
  desktopBeat: DesktopBeat
  contractBeat: ContractBeat
  mobileBeat: MobileBeat
  navDraw: number
  checklistDone: boolean
}) {
  if (phase === 'boot') {
    return <div className={styles.ui} style={{ background: '#050505' }} />
  }

  if (phase === 'contract') {
    return <ContractDemo beat={contractBeat} />
  }

  if (phase === 'mobile' || phase === 'sync') {
    if (mobileBeat === 'today') return <MobileTodayDemo />
    if (mobileBeat === 'nav') return <MobileNavigationDemo draw={navDraw} />
    if (mobileBeat === 'timeline') return <MobileTimelineDemo />
    if (mobileBeat === 'checklist') {
      return <MobileChecklistDemo done={checklistDone || phase === 'sync'} />
    }
    if (mobileBeat === 'contact') return <MobileContactDemo />
    return <MobileOfflineDemo />
  }

  if (desktopBeat === 'wedding') return <WeddingDemo />
  if (desktopBeat === 'tasks') return <TasksDemo />
  if (desktopBeat === 'payments') return <PaymentsDemo />
  if (desktopBeat === 'contractCue') return <ContractDemo beat="ready" />
  return <DashboardDemo />
}
