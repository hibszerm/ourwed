import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import styles from './AppScreens.module.css'

export type DesktopScreenId =
  | 'boot'
  | 'dashboard'
  | 'weddings'
  | 'detail'
  | 'tasks'
  | 'payments'
  | 'contracts'
  | 'questionnaires'
  | 'timeline'
  | 'notifications'
  | 'equipment'
  | 'calendar'
  | 'stats'

export type MobileScreenId =
  | 'today'
  | 'nav'
  | 'timeline'
  | 'equipment'
  | 'notes'
  | 'contact'
  | 'location'
  | 'done'
  | 'offline'

export type ContractBeat =
  | 'idle'
  | 'upload'
  | 'analysis'
  | 'ready'
  | 'generate'
  | 'done'

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
}

export function DesktopAppScreen({ id }: { id: DesktopScreenId }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={id}
        className={styles.root}
        {...fade}
      >
        {id === 'boot' ? <BootScreen /> : null}
        {id === 'dashboard' ? <DashboardScreen /> : null}
        {id === 'weddings' ? <WeddingsScreen /> : null}
        {id === 'detail' ? <DetailScreen /> : null}
        {id === 'tasks' ? <TasksScreen /> : null}
        {id === 'payments' ? <PaymentsScreen /> : null}
        {id === 'contracts' ? <ContractsScreen /> : null}
        {id === 'questionnaires' ? <QuestionnairesScreen /> : null}
        {id === 'timeline' ? <TimelineScreen /> : null}
        {id === 'notifications' ? <NotificationsScreen /> : null}
        {id === 'equipment' ? <EquipmentScreen /> : null}
        {id === 'calendar' ? <CalendarScreen /> : null}
        {id === 'stats' ? <StatsScreen /> : null}
      </motion.div>
    </AnimatePresence>
  )
}

export function MobileAppScreen({ id }: { id: MobileScreenId }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={id} className={`${styles.root} ${styles.mobile}`} {...fade}>
        {id === 'today' ? <MobileToday /> : null}
        {id === 'nav' ? <MobileNav /> : null}
        {id === 'timeline' ? <MobileTimeline /> : null}
        {id === 'equipment' ? <MobileEquipment /> : null}
        {id === 'notes' ? <MobileNotes /> : null}
        {id === 'contact' ? <MobileContact /> : null}
        {id === 'location' ? <MobileLocation /> : null}
        {id === 'done' ? <MobileDone /> : null}
        {id === 'offline' ? <MobileOffline /> : null}
      </motion.div>
    </AnimatePresence>
  )
}

export function ContractMagicScreen({ beat }: { beat: ContractBeat }) {
  return (
    <div className={`${styles.root} ${styles.contract}`}>
      <AnimatePresence mode="wait">
        <motion.div key={beat} className={styles.contractInner} {...fade}>
          {beat === 'idle' || beat === 'upload' ? (
            <ContractUpload active={beat === 'upload'} />
          ) : null}
          {beat === 'analysis' ? <ContractAnalysis /> : null}
          {beat === 'ready' ? <ContractReady /> : null}
          {beat === 'generate' ? <ContractGenerate /> : null}
          {beat === 'done' ? <ContractDone /> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function BootScreen() {
  return <div className={styles.boot} />
}

function Shell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <span className={styles.logo}>OW</span>
        <nav>
          {['Pulpit', 'Śluby', 'Kalendarz', 'Umowy'].map((item, i) => (
            <em key={item} data-active={i === 0 || title.startsWith(item)}>
              {item}
            </em>
          ))}
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.top}>
          <strong>{title}</strong>
          <span>Studio · Marcin</span>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}

function DashboardScreen() {
  return (
    <Shell title="Pulpit">
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p>Najbliższy ślub</p>
          <strong>Anna & Michał</strong>
          <span>22 sie · Premium</span>
        </div>
        <div className={styles.card}>
          <p>Do zrobienia</p>
          <strong>4 zadania</strong>
          <span>Umowa · Zaliczka · Ankieta</span>
        </div>
      </div>
      <div className={styles.list}>
        {['Julia & Tomasz — 12 wrz', 'Natalia & Piotr — 3 paź'].map((row) => (
          <div key={row} className={styles.row}>
            {row}
          </div>
        ))}
      </div>
    </Shell>
  )
}

function WeddingsScreen() {
  return (
    <Shell title="Śluby">
      <div className={styles.list}>
        {[
          ['Anna & Michał', 'Aktywny', '22.08'],
          ['Julia & Tomasz', 'Oferta', '12.09'],
          ['Natalia & Piotr', 'Potwierdzony', '03.10'],
        ].map(([name, status, date]) => (
          <div key={name} className={styles.rowSplit}>
            <strong>{name}</strong>
            <em>{status}</em>
            <span>{date}</span>
          </div>
        ))}
      </div>
    </Shell>
  )
}

function DetailScreen() {
  return (
    <Shell title="Anna & Michał">
      <div className={styles.grid3}>
        {['Umowa gotowa', 'Zaliczka 50%', 'Ankieta wysłana'].map((t) => (
          <div key={t} className={styles.pill}>
            {t}
          </div>
        ))}
      </div>
      <div className={styles.card}>
        <p>Pakiet</p>
        <strong>Premium Film + Foto</strong>
        <span>Zinnar Castle · 22.08.2026</span>
      </div>
    </Shell>
  )
}

function TasksScreen() {
  return (
    <Shell title="Zadania">
      <div className={styles.list}>
        {['Wysłać umowę', 'Potwierdzić lokalizację', 'Spakować sprzęt'].map(
          (t, i) => (
            <div key={t} className={styles.task} data-done={i === 0}>
              <i />
              {t}
            </div>
          ),
        )}
      </div>
    </Shell>
  )
}

function PaymentsScreen() {
  return (
    <Shell title="Płatności">
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p>Zaliczka</p>
          <strong>4 750 zł</strong>
          <span>Opłacona</span>
        </div>
        <div className={styles.card}>
          <p>Pozostało</p>
          <strong>4 750 zł</strong>
          <span>Termin: 15.08</span>
        </div>
      </div>
    </Shell>
  )
}

function ContractsScreen() {
  return (
    <Shell title="Umowy">
      <div className={styles.card}>
        <p>Umowa pakietu</p>
        <strong>Premium — gotowa</strong>
        <span>Wygeneruj dla Anny & Michała</span>
      </div>
    </Shell>
  )
}

function QuestionnairesScreen() {
  return (
    <Shell title="Ankiety">
      <div className={styles.card}>
        <p>Dane do umowy</p>
        <strong>Wypełniona</strong>
        <span>12 odpowiedzi · 2 min temu</span>
      </div>
    </Shell>
  )
}

function TimelineScreen() {
  return (
    <Shell title="Harmonogram">
      <div className={styles.list}>
        {['14:00 Przygotowania', '16:00 Ceremonia', '18:00 Przyjęcie'].map(
          (t) => (
            <div key={t} className={styles.row}>
              {t}
            </div>
          ),
        )}
      </div>
    </Shell>
  )
}

function NotificationsScreen() {
  return (
    <Shell title="Powiadomienia">
      <div className={styles.list}>
        {['Zaliczka wpłynęła', 'Ankieta uzupełniona', 'Termin za 7 dni'].map(
          (t) => (
            <div key={t} className={styles.row}>
              {t}
            </div>
          ),
        )}
      </div>
    </Shell>
  )
}

function EquipmentScreen() {
  return (
    <Shell title="Sprzęt">
      <div className={styles.list}>
        {['A7IV + 35mm', 'Dron', 'Mic + rejestrator'].map((t) => (
          <div key={t} className={styles.task} data-done>
            <i />
            {t}
          </div>
        ))}
      </div>
    </Shell>
  )
}

function CalendarScreen() {
  return (
    <Shell title="Kalendarz">
      <div className={styles.cal}>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} data-busy={i === 5 || i === 11} />
        ))}
      </div>
    </Shell>
  )
}

function StatsScreen() {
  return (
    <Shell title="Sezon">
      <div className={styles.grid3}>
        <div className={styles.card}>
          <p>Śluby</p>
          <strong>28</strong>
        </div>
        <div className={styles.card}>
          <p>Umowy</p>
          <strong>26</strong>
        </div>
        <div className={styles.card}>
          <p>Godziny</p>
          <strong>140+</strong>
        </div>
      </div>
    </Shell>
  )
}

function ContractUpload({ active }: { active: boolean }) {
  return (
    <div className={styles.magicCard} data-active={active}>
      <div className={styles.docArt} />
      <strong>Dodaj umowę pakietu</strong>
      <span>Przeciągnij DOCX</span>
    </div>
  )
}

function ContractAnalysis() {
  return (
    <div className={styles.magicCard}>
      <strong>Przygotowujemy dokument</strong>
      <ul className={styles.steps}>
        <li data-done>Czytamy dokument</li>
        <li data-done>Szukamy pól</li>
        <li data-current>Sprawdzamy poprawność</li>
      </ul>
    </div>
  )
}

function ContractReady() {
  return (
    <div className={styles.magicCard}>
      <strong>Umowa gotowa</strong>
      <span>Bezpieczna · Gotowa do generowania</span>
    </div>
  )
}

function ContractGenerate() {
  return (
    <div className={styles.magicCard}>
      <strong>Tworzymy gotową umowę</strong>
      <ul className={styles.steps}>
        <li data-done>Ładujemy szablon</li>
        <li data-current>Uzupełniamy dane ślubu</li>
      </ul>
    </div>
  )
}

function ContractDone() {
  return (
    <div className={styles.magicCard}>
      <strong>Dokument gotowy</strong>
      <span>Podgląd · Pobierz DOCX</span>
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
    <div className={styles.mChrome}>
      <header>
        <span>9:41</span>
        <strong>{title}</strong>
        <span />
      </header>
      <div className={styles.mBody}>{children}</div>
    </div>
  )
}

function MobileToday() {
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

function MobileNav() {
  return (
    <MobileChrome title="Nawigacja">
      <div className={styles.mCard}>
        <strong>Do ceremonii</strong>
        <span>12 min · 8,4 km</span>
      </div>
    </MobileChrome>
  )
}

function MobileTimeline() {
  return (
    <MobileChrome title="Harmonogram">
      <div className={styles.list}>
        {['14:00 Prep', '16:00 Ślub', '18:00 Wesele'].map((t) => (
          <div key={t} className={styles.row}>
            {t}
          </div>
        ))}
      </div>
    </MobileChrome>
  )
}

function MobileEquipment() {
  return (
    <MobileChrome title="Sprzęt">
      <div className={styles.list}>
        {['Korpus A', 'Obiektyw 35', 'Baterie ×4'].map((t) => (
          <div key={t} className={styles.task} data-done>
            <i />
            {t}
          </div>
        ))}
      </div>
    </MobileChrome>
  )
}

function MobileNotes() {
  return (
    <MobileChrome title="Notatka">
      <div className={styles.mCard}>
        <strong>Pierwszy taniec — 20:15</strong>
        <span>Prośba o dodatkowy kąt z balkonu</span>
      </div>
    </MobileChrome>
  )
}

function MobileContact() {
  return (
    <MobileChrome title="Kontakt">
      <div className={styles.mCard}>
        <strong>Anna</strong>
        <span>+48 600 000 000</span>
      </div>
    </MobileChrome>
  )
}

function MobileLocation() {
  return (
    <MobileChrome title="Lokalizacja">
      <div className={styles.mMap} />
      <div className={styles.mCard}>
        <strong>Zinnar Castle</strong>
        <span>Przyjęcie · sala główna</span>
      </div>
    </MobileChrome>
  )
}

function MobileDone() {
  return (
    <MobileChrome title="Zadanie">
      <div className={styles.mCard}>
        <strong>Ceremonię sfilmowano</strong>
        <span>Oznaczono jako gotowe</span>
      </div>
    </MobileChrome>
  )
}

function MobileOffline() {
  return (
    <MobileChrome title="Offline">
      <div className={styles.mCard}>
        <strong>Pracujesz bez sieci</strong>
        <span>Zmiany zsynchronizują się automatycznie</span>
      </div>
    </MobileChrome>
  )
}
