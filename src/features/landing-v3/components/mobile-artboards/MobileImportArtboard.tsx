import {
  IMPORT_PREPARED,
  IMPORT_SPREADSHEET_ROWS,
  IMPORT_STEPS,
} from '@/features/landing-v3/data/importDemoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

const ROWS = IMPORT_SPREADSHEET_ROWS.slice(0, 3)

/** Real-scale import — sources + dominant completed assignment. */
export function MobileImportArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={`${styles.board} ${styles.importBoard}`}
          data-mobile-artboard="import"
          data-artboard-pattern="parity-scale"
          data-reveal-active={active ? 'true' : 'false'}
        >
          <ol className={styles.importSteps} aria-label="Kroki importu">
            {IMPORT_STEPS.map((step, i) => (
              <li key={step}>
                <span className={styles.importStepNum}>{i + 1}</span>
                <span className={styles.importStepLabel}>{step}</span>
              </li>
            ))}
          </ol>

          <div className={styles.importPreviews}>
            <div className={styles.importSheetMini}>
              <p className={styles.eyebrow}>Arkusz</p>
              <h4>zlecenia_sezon_2027.xlsx</h4>
              {ROWS.map((row) => (
                <div
                  key={row.id}
                  className={styles.importRow}
                  data-hl={row.highlight ? 'true' : 'false'}
                >
                  <span>{row.couple}</span>
                  <span>{row.date}</span>
                  <span>{row.value}</span>
                </div>
              ))}
            </div>
            <div className={styles.importDocMini}>
              <p className={styles.eyebrow}>Umowa</p>
              <div className={styles.importDocSurface}>
                <div className={styles.importDocHeader}>
                  <span className={styles.importDocBadge}>PDF</span>
                  <span className={styles.importDocStatus}>Załączono</span>
                </div>
                <p className={styles.importDocTitle}>{IMPORT_PREPARED.document}</p>
                <div className={styles.importDocLines} aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles.importDocMeta}>
                  Dołączona do wiersza Julia i Adrian
                </span>
              </div>
            </div>
          </div>

          <div className={styles.importResult} data-dominant="true">
            <p className={styles.importResultEyebrow}>
              Zlecenie gotowe do zatwierdzenia
            </p>
            <h3 className={styles.importResultTitle}>{IMPORT_PREPARED.couple}</h3>
            <p className={styles.importResultMeta}>{IMPORT_PREPARED.date}</p>
            <div className={styles.importResultRow}>
              <span>{IMPORT_PREPARED.packageName}</span>
              <strong>{IMPORT_PREPARED.value}</strong>
            </div>
            <span className={styles.importReady}>Gotowe do zatwierdzenia</span>
          </div>
        </div>
      )}
    </MobileRevealAnchor>
  )
}
