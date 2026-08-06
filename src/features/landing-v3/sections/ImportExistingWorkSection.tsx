import { motion, useReducedMotion } from 'framer-motion'
import {
  IMPORT_PREPARED,
  IMPORT_SPREADSHEET_ROWS,
  IMPORT_STEPS,
} from '@/features/landing-v3/data/importDemoData'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

/**
 * Import existing season — spreadsheet + contracts → prepared assignment.
 * Presentational only; does not connect to real import.
 */
export function ImportExistingWorkSection() {
  const reduced = useReducedMotion()
  const { ref, active } = useSectionReveal({
    threshold: 0.6,
    reduced: !!reduced,
  })
  const done = reduced || active

  return (
    <section
      ref={ref}
      className={styles.editorialSection}
      data-testid="lv3-import-section"
      data-import-layout="two-panel"
      aria-labelledby="import-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="import-title" className={styles.titleB}>
          Masz już zapisany cały sezon?
          <br />
          Nie zaczynasz od zera.
        </h2>
        <p className={styles.editorialLead}>
          Zaimportuj obecne śluby i sesje z arkusza. Dołącz umowy, a OurWed
          przygotuje dane zleceń do Twojego zatwierdzenia.
        </p>
        <p className={styles.editorialLeadSecondary}>
          Daty, pary, pakiety, kwoty i lokalizacje mogą zostać uporządkowane bez
          ręcznego przepisywania każdego zlecenia.
        </p>
      </div>

      <ol className={styles.importProcess} aria-label="Kroki importu">
        {IMPORT_STEPS.map((step, i) => (
          <li key={step}>
            <span className={styles.importStepIndex}>{i + 1}</span>
            <span>{step}</span>
            {i < IMPORT_STEPS.length - 1 ? (
              <span className={styles.importProcessArrow} aria-hidden>
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className={styles.importCompose} data-landing-preview="">
        <article className={styles.importSheet} data-import-panel="sheet">
          <header className={styles.importSheetHead}>
            <div>
              <p className={styles.surfaceEyebrow}>Arkusz</p>
              <h3>zlecenia_sezon_2027.xlsx</h3>
            </div>
            <p className={styles.importSheetStatus}>24 wiersze gotowe do importu</p>
          </header>

          <div className={styles.importTable} role="table" aria-label="Podgląd arkusza">
            <div className={styles.importTableHead} role="row">
              <span role="columnheader">Para</span>
              <span role="columnheader">Data</span>
              <span role="columnheader">Pakiet</span>
              <span role="columnheader">Wartość</span>
            </div>
            {IMPORT_SPREADSHEET_ROWS.map((row, i) => (
              <motion.div
                key={row.id}
                className={styles.importTableRow}
                role="row"
                data-highlight={row.highlight ? 'true' : 'false'}
                data-mobile-hide={i >= 3 ? 'true' : undefined}
                initial={false}
                animate={
                  done && row.highlight
                    ? {
                        backgroundColor: 'rgba(29, 39, 43, 0.07)',
                        boxShadow: 'inset 3px 0 0 #1d272b',
                      }
                    : done
                      ? { backgroundColor: 'rgba(29, 39, 43, 0.02)' }
                      : { backgroundColor: 'transparent' }
                }
                transition={{
                  duration: reduced ? 0 : 0.35,
                  delay: reduced ? 0 : row.highlight ? 0.45 : 0.05 + i * 0.05,
                  ease: premiumEase,
                }}
              >
                <strong role="cell">{row.couple}</strong>
                <span role="cell">{row.date}</span>
                <span role="cell">{row.packageName}</span>
                <span role="cell">{row.value}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            className={styles.importAttachment}
            initial={false}
            animate={
              done ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 6 }
            }
            transition={{
              duration: reduced ? 0 : 0.3,
              delay: reduced ? 0 : 0.25,
              ease: premiumEase,
            }}
          >
            <span className={styles.importPdfMark}>PDF</span>
            <div>
              <strong>Umowa_Julia_Adrian.pdf</strong>
              <span>Dołączona do wiersza Julia i Adrian</span>
            </div>
          </motion.div>
        </article>

        <article className={styles.importResult} data-import-panel="result">
          <p className={styles.surfaceEyebrow}>Zlecenie gotowe do zatwierdzenia</p>
          <h3>{IMPORT_PREPARED.couple}</h3>
          <dl className={styles.importResultMeta}>
            {[
              ['Data', IMPORT_PREPARED.date],
              ['Pakiet', IMPORT_PREPARED.packageName],
              ['Wartość', IMPORT_PREPARED.value],
              ['Zaliczka', IMPORT_PREPARED.deposit],
              ['Lokalizacja', IMPORT_PREPARED.location],
              ['Dokument', IMPORT_PREPARED.document],
            ].map(([label, value], i) => (
              <motion.div
                key={label}
                initial={false}
                animate={
                  done
                    ? {
                        backgroundColor:
                          i < 4 ? 'rgba(29, 39, 43, 0.05)' : 'transparent',
                      }
                    : { backgroundColor: 'transparent' }
                }
                transition={{
                  duration: reduced ? 0 : 0.35,
                  delay: reduced ? 0 : 0.55 + i * 0.06,
                  ease: premiumEase,
                }}
              >
                <dt>{label}</dt>
                <dd>{value}</dd>
              </motion.div>
            ))}
          </dl>
          <motion.p
            className={styles.importResultStatus}
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : done ? 0.95 : 0 }}
            data-status={done ? 'ready' : 'prepared'}
          >
            {done ? 'Gotowe do zatwierdzenia' : 'Dane przygotowane'}
          </motion.p>
          <button type="button" className={styles.importReviewBtn} tabIndex={-1}>
            Sprawdź dane
          </button>
        </article>
      </div>
    </section>
  )
}
