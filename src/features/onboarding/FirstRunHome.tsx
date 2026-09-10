import { useId, useState } from 'react'
import {
  ClipboardList,
  FolderInput,
  ShieldCheck,
} from 'lucide-react'
import { ProGateNavButton } from '@/features/billing/ProGateNavButton'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FIRST_RUN_ROUTES } from '@/features/onboarding/firstRunRoutes'
import { writeFirstRunPreferOperationalDashboard } from '@/features/onboarding/firstRunSessionPreference'
import styles from './FirstRunHome.module.css'

export type FirstRunHomeProps = {
  onPreferOperationalDashboard: () => void
}

const LEARN_STEPS = [
  {
    title: 'Zacznij tak, jak pracujesz',
    body: 'Przenieś istniejący sezon z pliku, dodaj zlecenie ręcznie albo zbierz dane nowej pary w ankiecie.',
  },
  {
    title: 'Przygotuj swoje pakiety',
    body: 'Pakiety przechowują cenę, zaliczkę i zakres usługi. Mogą również pojawić się jako wybór w ankiecie wysyłanej parze.',
  },
  {
    title: 'Przygotuj umowę',
    body: 'Do pakietu możesz dodać własny wzór DOCX. Gdy dane zlecenia są gotowe, OurWed pomoże przygotować dokument dla konkretnej pary.',
    note: 'Masz już umowę? Możesz dodać istniejący PDF lub DOCX do zlecenia, a OurWed przeanalizuje dokument i podpowie dane, które możesz przenieść.',
  },
  {
    title: 'Przygotuj dzień ślubu',
    body: 'Wyślij parze ankietę przedślubną, a harmonogram, miejsca i najważniejsze ustalenia trafią automatycznie do zlecenia. Na ich podstawie możesz przygotować m.in. Wedding Brief PDF.',
  },
  {
    title: 'Prowadź zlecenie do końca',
    body: 'Płatności, zadania i terminy pomagają kontrolować zlecenie aż do oddania materiału.',
  },
] as const

/**
 * Dedicated first-run Pulpit when the tenant has never had a wedding.
 * Lives inside AppLayout — not a separate marketing shell.
 */
export function FirstRunHome({ onPreferOperationalDashboard }: FirstRunHomeProps) {
  const [learnOpen, setLearnOpen] = useState(false)
  const sectionTitleId = useId()

  function handleSkip() {
    writeFirstRunPreferOperationalDashboard(true)
    onPreferOperationalDashboard()
  }

  function closeLearn() {
    setLearnOpen(false)
  }

  return (
    <div className={styles.root} data-testid="first-run-home">
      <header className={styles.hero}>
        <h1 className={styles.title}>Witaj w OurWed</h1>
        <p className={styles.headline}>
          Zorganizujmy Twój sezon w jednym miejscu.
        </p>
        <p className={styles.lede}>
          Zacznij tak, jak pracujesz teraz. Możesz przenieść istniejące zlecenia
          albo rozpocząć obsługę nowej pary. Nie musisz konfigurować wszystkiego
          od razu.
        </p>
      </header>

      <section className={styles.intents} aria-labelledby={sectionTitleId}>
        <h2 className={styles.sectionTitle} id={sectionTitleId}>
          Jak chcesz zacząć?
        </h2>

        <div className={styles.cards}>
          <article className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon} aria-hidden="true">
                  <FolderInput size={20} strokeWidth={1.6} />
                </span>
                <h3 className={styles.cardTitle}>Mam już zlecenia</h3>
              </div>
              <p className={styles.cardDesc}>
                Przenieś obecny sezon z arkusza lub dodaj istniejące zlecenie
                ręcznie.
              </p>
              <p className={styles.reassurance}>
                <ShieldCheck
                  className={styles.reassuranceIcon}
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  Import nie wysyła żadnych wiadomości do Twoich klientów.
                </span>
              </p>
            </div>
            <div className={styles.cardActions}>
              <ProGateNavButton
                to={FIRST_RUN_ROUTES.import}
                variant="primary"
                actionKey="create_wedding"
                className={styles.primaryCta}
              >
                Importuj z pliku
              </ProGateNavButton>
              <ProGateNavButton
                to={FIRST_RUN_ROUTES.createExisting}
                variant="secondary"
                actionKey="create_wedding"
                className={styles.secondaryCta}
              >
                Dodaj istniejące zlecenie ręcznie
              </ProGateNavButton>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon} aria-hidden="true">
                  <ClipboardList size={20} strokeWidth={1.6} />
                </span>
                <h3 className={styles.cardTitle}>Mam nowe zlecenie</h3>
              </div>
              <p className={styles.cardDesc}>
                Rozpocznij obsługę nowej pary — wpisz dane samodzielnie albo
                zbierz je w ankiecie.
              </p>
            </div>
            <div className={styles.cardActions}>
              <ProGateNavButton
                to={FIRST_RUN_ROUTES.createManual}
                variant="primary"
                actionKey="create_wedding"
                className={styles.primaryCta}
              >
                Mam już dane pary
              </ProGateNavButton>
              <ProGateNavButton
                to={FIRST_RUN_ROUTES.collectByQuestionnaire}
                variant="secondary"
                actionKey="generate_questionnaire_link"
                className={styles.secondaryCtaSupported}
              >
                Chcę zebrać dane ankietą
              </ProGateNavButton>
            </div>
          </article>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerPrimary}>
          <Button
            type="button"
            variant="secondary"
            className={styles.learnButton}
            onClick={() => setLearnOpen(true)}
          >
            Zobacz, jak działa OurWed
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          className={styles.skipButton}
          onClick={handleSkip}
        >
          Pomiń i przejdź do Pulpitu
        </Button>
      </footer>

      <Modal
        open={learnOpen}
        title="Jak działa OurWed"
        description="Krótka ścieżka pracy — od pierwszego zlecenia do oddania."
        onClose={closeLearn}
        showClose
        size="story"
        mobilePresentation="sheet"
        cancelLabel="Zamknij"
        hideFooter={false}
        initialFocus="panel"
        primaryAction={
          <Button type="button" variant="primary" onClick={closeLearn}>
            Zacznij pracę w OurWed
          </Button>
        }
      >
        <ol className={styles.learnJourney}>
          {LEARN_STEPS.map((step, index) => (
            <li key={step.title} className={styles.learnStep}>
              <div className={styles.learnRail} aria-hidden="true">
                <span className={styles.learnIndex}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                {index < LEARN_STEPS.length - 1 ? (
                  <span className={styles.learnConnector} />
                ) : null}
              </div>
              <div className={styles.learnCopy}>
                <p className={styles.learnTitle}>{step.title}</p>
                <p className={styles.learnBody}>{step.body}</p>
                {'note' in step && step.note ? (
                  <p className={styles.learnNote}>{step.note}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  )
}
