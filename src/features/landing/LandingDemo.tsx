import { useEffect, useRef, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { IconArrowLeft } from '@/components/icons'
import { CalendarMonthView } from '@/features/calendar/components/CalendarMonthView'
import { buildCalendarEvents } from '@/features/calendar/utils/calendarEvents'
import { DashboardHero } from '@/features/dashboard/components/DashboardHero'
import { NextWeddingCard } from '@/features/dashboard/components/NextWeddingCard'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import {
  DEMO_USER_NAME,
  demoMaskedMeta,
  demoNotifications,
  demoQuestionnaireAnswers,
  demoTasks,
  demoTravelPlan,
  demoWedding,
  demoWeddingTasks,
  demoWeddings,
} from '@/features/landing/demoData'
import { WeddingCard } from '@/features/weddings/components/WeddingCard'
import { NotesSection } from '@/features/weddings/components/NotesSection'
import { ScheduleSection } from '@/features/weddings/components/ScheduleSection'
import { EquipmentSection } from '@/features/weddings/components/EquipmentSection'
import { WeddingDetailContact } from '@/features/weddings/components/detail/WeddingDetailContact'
import { WeddingDetailCurrentStage } from '@/features/weddings/components/detail/WeddingDetailCurrentStage'
import { WeddingDetailFinances } from '@/features/weddings/components/detail/WeddingDetailFinances'
import { WeddingDetailHero } from '@/features/weddings/components/detail/WeddingDetailHero'
import { WeddingDetailPackage } from '@/features/weddings/components/detail/WeddingDetailPackage'
import { WeddingDetailQuestionnaires } from '@/features/weddings/components/detail/WeddingDetailQuestionnaires'
import { WeddingDetailStatus } from '@/features/weddings/components/detail/WeddingDetailStatus'
import { WeddingDetailTasks } from '@/features/weddings/components/detail/WeddingDetailTasks'
import { WeddingDetailTimeline } from '@/features/weddings/components/detail/WeddingDetailTimeline'
import { WeddingDetailTravel } from '@/features/weddings/components/detail/WeddingDetailTravel'
import { WeddingDetailWorkflow } from '@/features/weddings/components/detail/WeddingDetailWorkflow'
import dashboardStyles from '@/pages/DashboardPage.module.css'
import weddingDetailStyles from '@/pages/WeddingDetailPage.module.css'
import weddingsStyles from '@/pages/WeddingsPage.module.css'
import shellStyles from './AppTour.module.css'
import styles from './LandingDemo.module.css'

export type DemoNavId =
  | 'dashboard'
  | 'weddings'
  | 'wedding'
  | 'questionnaires'
  | 'travel'
  | 'finance'
  | 'calendar'

const NAV_ITEMS: { id: DemoNavId; label: string; path: string }[] = [
  { id: 'dashboard', label: 'Dashboard', path: 'dashboard' },
  { id: 'weddings', label: 'Śluby', path: 'sluby' },
  { id: 'travel', label: 'Travel', path: 'sluby/demo#travel' },
  { id: 'finance', label: 'Finanse', path: 'sluby/demo#finance' },
  { id: 'questionnaires', label: 'Ankiety', path: 'ankiety' },
  { id: 'calendar', label: 'Kalendarz', path: 'kalendarz' },
]

type WeddingFocus = 'overview' | 'travel' | 'finance' | 'schedule' | 'questionnaires'

interface LandingDemoProps {
  /** Compact hero chrome (shorter content area). */
  compact?: boolean
  className?: string
}

/**
 * Interactive product demo on the landing page — real app components + local demo data.
 */
export function LandingDemo({ compact = false, className = '' }: LandingDemoProps) {
  const [nav, setNav] = useState<DemoNavId>('dashboard')
  const [weddingFocus, setWeddingFocus] = useState<WeddingFocus>('overview')
  const [fadeKey, setFadeKey] = useState(0)

  const travelRef = useRef<HTMLDivElement | null>(null)
  const financeRef = useRef<HTMLDivElement | null>(null)
  const scheduleRef = useRef<HTMLDivElement | null>(null)
  const questionnairesRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const calendarEvents = buildCalendarEvents(demoWeddings)
  const calendarAnchor = new Date(2026, 7, 1) // August 2026

  function go(next: DemoNavId, focus: WeddingFocus = 'overview') {
    setNav(next)
    setWeddingFocus(focus)
    setFadeKey((k) => k + 1)
  }

  function openWedding(focus: WeddingFocus = 'overview') {
    go('wedding', focus)
  }

  useEffect(() => {
    if (nav !== 'wedding' && nav !== 'travel' && nav !== 'finance') return

    const target =
      weddingFocus === 'travel' || nav === 'travel'
        ? travelRef.current
        : weddingFocus === 'finance' || nav === 'finance'
          ? financeRef.current
          : weddingFocus === 'schedule'
            ? scheduleRef.current
            : weddingFocus === 'questionnaires'
              ? questionnairesRef.current
              : null

    if (!target) return
    const t = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [nav, weddingFocus, fadeKey])

  const activeNav: DemoNavId =
    nav === 'wedding'
      ? weddingFocus === 'travel'
        ? 'travel'
        : weddingFocus === 'finance'
          ? 'finance'
          : 'weddings'
      : nav === 'travel' || nav === 'finance'
        ? nav
        : nav

  const path =
    NAV_ITEMS.find((item) => item.id === activeNav)?.path ??
    (nav === 'wedding' ? 'sluby/demo' : 'dashboard')

  const showWedding =
    nav === 'wedding' || nav === 'travel' || nav === 'finance'

  function handleNavClick(id: DemoNavId) {
    if (id === 'travel') {
      openWedding('travel')
      return
    }
    if (id === 'finance') {
      openWedding('finance')
      return
    }
    if (id === 'weddings') {
      go('weddings')
      return
    }
    go(id)
  }

  return (
    <div
      className={`${shellStyles.root} ${compact ? styles.compact : ''} ${className}`.trim()}
    >
      <aside className={shellStyles.nav} aria-label="Nawigacja demo">
        <div className={shellStyles.brand}>
          <span className={shellStyles.brandMark}>OW</span>
          <span>OurWed</span>
        </div>
        <nav className={shellStyles.navList} role="tablist">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeNav === item.id}
              className={`${shellStyles.navItem} ${activeNav === item.id ? shellStyles.navItemActive : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className={shellStyles.navHint}>
          Interaktywne demo — te same komponenty co w aplikacji, dane lokalne.
        </p>
      </aside>

      <div className={shellStyles.stage}>
        <div className={shellStyles.chrome} aria-hidden>
          <span />
          <span />
          <span />
          <div className={shellStyles.url}>app.ourwed.pl/{path}</div>
        </div>
        <div
          className={`${shellStyles.contentSlot} ${styles.contentSlot}`}
          ref={contentRef}
        >
          <div key={fadeKey} className={shellStyles.content} role="tabpanel">
            {nav === 'dashboard' ? (
              <DemoDashboard onOpenWedding={() => openWedding()} />
            ) : null}

            {nav === 'weddings' ? (
              <DemoWeddingsList onOpen={() => openWedding()} />
            ) : null}

            {showWedding ? (
              <DemoWeddingDetail
                focus={weddingFocus}
                travelRef={travelRef}
                financeRef={financeRef}
                scheduleRef={scheduleRef}
                questionnairesRef={questionnairesRef}
                onBack={() => go('weddings')}
              />
            ) : null}

            {nav === 'calendar' ? (
              <div className={styles.calendarWrap}>
                <header className={styles.pageHeader}>
                  <h2 className={styles.pageTitle}>Kalendarz</h2>
                  <p className={styles.pageSub}>Sierpień 2026</p>
                </header>
                <CalendarMonthView
                  anchor={calendarAnchor}
                  events={calendarEvents}
                  allowCreateOnEmpty={false}
                  onSelectEvent={() => openWedding()}
                />
              </div>
            ) : null}

            {nav === 'questionnaires' ? (
              <DemoQuestionnaires onOpenWedding={() => openWedding('questionnaires')} />
            ) : null}
          </div>
        </div>
      </div>

      <div className={shellStyles.mobileTabs} role="tablist" aria-label="Sekcje aplikacji">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeNav === item.id}
            className={`${shellStyles.mobileTab} ${activeNav === item.id ? shellStyles.mobileTabActive : ''}`}
            onClick={() => handleNavClick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DemoDashboard({ onOpenWedding }: { onOpenWedding: () => void }) {
  return (
    <div className={dashboardStyles.dashboard}>
      <DashboardHero userName={DEMO_USER_NAME} nextWedding={demoWedding} />
      <NextWeddingCard wedding={demoWedding} onOpen={onOpenWedding} />
      <div className={dashboardStyles.grid}>
        <div className={dashboardStyles.primary}>
          <TodoTodayCard
            tasks={demoTasks}
            weddings={demoWeddings}
            onOpenWedding={() => onOpenWedding()}
          />
        </div>
        <div className={dashboardStyles.secondary}>
          <NotificationsCard notifications={demoNotifications} />
        </div>
      </div>
    </div>
  )
}

function DemoWeddingsList({ onOpen }: { onOpen: () => void }) {
  return (
    <div>
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Śluby</h2>
        <p className={styles.pageSub}>1 aktywna para</p>
      </header>
      <div className={weddingsStyles.grid}>
        {demoWeddings.map((wedding) => (
          <WeddingCard key={wedding.id} wedding={wedding} onOpen={() => onOpen()} />
        ))}
      </div>
    </div>
  )
}

function DemoWeddingDetail({
  focus,
  travelRef,
  financeRef,
  scheduleRef,
  questionnairesRef,
  onBack,
}: {
  focus: WeddingFocus
  travelRef: RefObject<HTMLDivElement | null>
  financeRef: RefObject<HTMLDivElement | null>
  scheduleRef: RefObject<HTMLDivElement | null>
  questionnairesRef: RefObject<HTMLDivElement | null>
  onBack: () => void
}) {
  void focus

  return (
    <div className={weddingDetailStyles.page}>
      <div className={styles.backRow}>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <IconArrowLeft />
          Wróć do listy
        </Button>
      </div>

      <WeddingDetailHero
        wedding={demoWedding}
        places={demoTravelPlan.places}
        readOnly
        onAction={() => undefined}
      />

      <WeddingDetailStatus wedding={demoWedding} />

      <WeddingDetailWorkflow currentStage={demoWedding.workflowStage} />

      <WeddingDetailCurrentStage wedding={demoWedding} />

      <Card padding="md">
        <CardHeader title="Dane umowy" subtitle="Dane wrażliwe zanonimizowane" />
        <dl className={styles.maskedGrid}>
          <div>
            <dt>Numer umowy</dt>
            <dd>{demoMaskedMeta.contractNumber}</dd>
          </div>
          <div>
            <dt>PESEL Panny Młodej</dt>
            <dd>{demoMaskedMeta.peselBride}</dd>
          </div>
          <div>
            <dt>PESEL Pana Młodego</dt>
            <dd>{demoMaskedMeta.peselGroom}</dd>
          </div>
          <div>
            <dt>Przygotowania Pana Młodego</dt>
            <dd>{demoMaskedMeta.groomPrep}</dd>
          </div>
        </dl>
      </Card>

      <div className={weddingDetailStyles.row} ref={financeRef}>
        <WeddingDetailFinances
          wedding={demoWedding}
          contractPrice={demoWedding.price}
          payments={demoWedding.payments}
        />
        <WeddingDetailPackage wedding={demoWedding} extras={[]} />
        <WeddingDetailContact couple={demoWedding.couple} contacts={[]} />
      </div>

      <div ref={travelRef}>
        <WeddingDetailTravel
          weddingId={demoWedding.id}
          plan={demoTravelPlan}
          readOnly
        />
      </div>

      <div className={weddingDetailStyles.row} ref={questionnairesRef}>
        <WeddingDetailQuestionnaires questionnaires={demoWedding.questionnaires} />
        <WeddingDetailTasks tasks={demoWeddingTasks} />
      </div>

      <Card padding="md">
        <CardHeader
          title="Odpowiedzi z ankiety ślubnej"
          subtitle="Ukończona · realistyczne odpowiedzi pary"
        />
        <dl className={styles.answers}>
          {Object.entries(demoQuestionnaireAnswers).map(([question, answer]) => (
            <div key={question} className={styles.answerRow}>
              <dt>{question}</dt>
              <dd>{answer}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className={weddingDetailStyles.conditional} ref={scheduleRef}>
        <div className={weddingDetailStyles.conditionalItem}>
          <ScheduleSection events={demoWedding.schedule} />
        </div>
        <div className={weddingDetailStyles.conditionalItem}>
          <EquipmentSection items={demoWedding.checklist} />
        </div>
      </div>

      <WeddingDetailTimeline entries={demoWedding.timeline} />

      <NotesSection notes={demoWedding.notes} />
    </div>
  )
}

function DemoQuestionnaires({
  onOpenWedding,
}: {
  onOpenWedding: () => void
}) {
  return (
    <div className={styles.questionnairesPage}>
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Ankiety</h2>
        <p className={styles.pageSub}>Statusy przy ślubie Anna & Michał</p>
      </header>
      <WeddingDetailQuestionnaires questionnaires={demoWedding.questionnaires} />
      <Card padding="md">
        <CardHeader title="Ankieta ślubna" subtitle="Ukończona 20 cze 2026" />
        <dl className={styles.answers}>
          {Object.entries(demoQuestionnaireAnswers).map(([question, answer]) => (
            <div key={question} className={styles.answerRow}>
              <dt>{question}</dt>
              <dd>{answer}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.openRow}>
          <Button type="button" variant="primary" onClick={onOpenWedding}>
            Otwórz ślub
          </Button>
        </div>
      </Card>
    </div>
  )
}
