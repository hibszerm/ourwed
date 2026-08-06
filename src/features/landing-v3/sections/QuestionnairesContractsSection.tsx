import { motion, useReducedMotion } from 'framer-motion'
import { MobileQcArtboard } from '@/features/landing-v3/components/mobile-artboards'
import { DEMO_ASSIGNMENT } from '@/features/landing-v3/data/demoData'
import {
  isMobileLandingMode,
  useLandingViewportMode,
} from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const FORM_FIELDS = [
  { id: 'name', label: 'Imię i nazwisko', value: 'Julia Nowak' },
  { id: 'phone', label: 'Telefon', value: '500 100 200' },
  { id: 'address', label: 'Adres', value: 'ul. Święty Marcin 12, Poznań' },
  { id: 'date', label: 'Data ślubu', value: DEMO_ASSIGNMENT.dateLabel },
  { id: 'package', label: 'Pakiet', value: DEMO_ASSIGNMENT.packageName },
  {
    id: 'notes',
    label: 'Dodatkowe informacje',
    value: 'Preferujemy dyskretne ujęcia podczas ceremonii.',
  },
] as const

const MAP_LABELS = ['Dane pary', 'Pakiet', 'Termin realizacji'] as const

/** Section 2 — questionnaire → contract. Asymmetric split. */
export function QuestionnairesContractsSection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const mobile = isMobileLandingMode(viewport)
  const { ref, active } = useSectionReveal({
    threshold: mobile ? 0.28 : 0.55,
    reduced: !!reduced || mobile,
  })

  return (
    <section
      ref={ref}
      className={styles.editorialSection}
      data-composition="asymmetric"
      data-qc-layout={mobile ? 'mobile-artboard' : 'editorial'}
      data-testid="lv3-qc-section"
      data-viewport-mode={viewport}
      aria-labelledby="qc-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="qc-title" className={styles.titleB}>
          Para wpisuje dane raz.
          <br />
          OurWed wykorzystuje je dalej.
        </h2>
      </div>

      {mobile ? <MobileQcArtboard /> : (
      <div className={styles.qcCanvas} data-landing-preview="">
        <motion.div
          className={styles.qcForm}
          initial={reduced ? false : { opacity: 0, x: -20 }}
          animate={active ? { opacity: 1, x: 0 } : { opacity: 0.5, x: -8 }}
          transition={{ duration: reduced ? 0 : 0.45, ease: premiumEase }}
        >
          <p className={styles.surfaceEyebrow}>Ankieta kontraktowa</p>
          <div className={styles.formFields}>
            {FORM_FIELDS.map((field) => (
              <label key={field.id} className={styles.formField}>
                <span>{field.label}</span>
                <span className={styles.formValue}>{field.value}</span>
              </label>
            ))}
          </div>
          <button type="button" className={styles.formSubmit} tabIndex={-1}>
            Wyślij dane
          </button>
        </motion.div>

        <div className={styles.qcBridge} aria-hidden>
          {MAP_LABELS.map((label, i) => (
            <motion.div
              key={label}
              className={styles.mapLabel}
              initial={reduced ? false : { opacity: 0.35 }}
              animate={
                active
                  ? { opacity: 1 }
                  : { opacity: 0.35 }
              }
              transition={{
                duration: reduced ? 0 : 0.25,
                delay: reduced ? 0 : 0.4 + i * 0.18,
                ease: premiumEase,
              }}
              data-highlight={active ? 'true' : 'false'}
            >
              <span className={styles.mapLine} />
              <span>{label}</span>
            </motion.div>
          ))}
        </div>

        <motion.article
          className={styles.qcDocument}
          initial={reduced ? false : { opacity: 0, x: 20 }}
          animate={active ? { opacity: 1, x: 0 } : { opacity: 0.5, x: 8 }}
          transition={{
            duration: reduced ? 0 : 0.45,
            delay: reduced ? 0 : 0.08,
            ease: premiumEase,
          }}
        >
          <header className={styles.docStudioHead}>
            <div>
              <strong>Studio North Wedding</strong>
              <span>Poznań · Film i fotografia ślubna</span>
            </div>
            <p>Nr OW/2027/0612</p>
          </header>
          <p className={styles.docTitle}>UMOWA O ŚWIADCZENIE USŁUG</p>
          <p className={styles.docLine}>
            Zawarta pomiędzy:
            <br />
            <strong>Julia Nowak i Adrian Kowalski</strong>
          </p>
          <p className={styles.docLine}>
            a:
            <br />
            <strong>Studio North Wedding</strong>
          </p>
          <dl className={styles.docMeta}>
            <div>
              <dt>Package</dt>
              <dd>{DEMO_ASSIGNMENT.packageName}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{DEMO_ASSIGNMENT.dateLabel}</dd>
            </div>
            <div>
              <dt>Value</dt>
              <dd>{DEMO_ASSIGNMENT.contractValueLabel}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <motion.span
                  className={styles.docStatus}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={active ? { opacity: 1 } : { opacity: 0 }}
                  transition={{
                    delay: reduced ? 0 : 1.05,
                    duration: DURATION.micro,
                  }}
                >
                  ✓ Umowa wygenerowana
                </motion.span>
              </dd>
            </div>
          </dl>
          <div className={styles.docLegal}>
            <p>
              Wykonawca zobowiązuje się do realizacji usług zgodnie z ustalonym
              pakietem oraz harmonogramem dnia ślubu.
            </p>
            <p>
              Zamawiający potwierdza poprawność danych przekazanych w ankiecie
              kontraktowej i akceptuje warunki płatności.
            </p>
          </div>
          <div className={styles.docSign}>
            <div>
              <span>Podpis studia</span>
              <em>Studio North Wedding</em>
            </div>
            <div>
              <span>Podpis pary</span>
              <em>Oczekuje</em>
            </div>
          </div>
        </motion.article>
      </div>
      )}
    </section>
  )
}
