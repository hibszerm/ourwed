import { CheckCircle2 } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { DocxActionButton } from './DocxActionButton'
import { reducedMotionSafe, scaleIn, softSpring } from './motion'
import styles from './ContractExperience.module.css'

export function ContractSuccessState({
  onPreview,
  onDownload,
  downloadDisabled,
}: {
  onPreview: () => void
  /** Return true when download started successfully. */
  onDownload?: () => Promise<boolean> | boolean
  downloadDisabled?: boolean
}) {
  const prefersReduced = useReducedMotion() ?? false
  const variants = reducedMotionSafe(prefersReduced, scaleIn)

  return (
    <motion.div
      className={`${styles.experience} ${styles.overlay}`}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      role="dialog"
      aria-modal="true"
      aria-label="Umowa gotowa"
    >
      <motion.div
        className={styles.successPanel}
        layout
        transition={softSpring}
      >
        <span className={styles.successGlyph} aria-hidden>
          <CheckCircle2 size={28} strokeWidth={1.75} />
        </span>
        <div>
          <p className={styles.eyebrow}>Gotowe</p>
          <h2 className={styles.title}>Umowa gotowa</h2>
          <p className={styles.subtitle}>
            Dokument został pomyślnie wygenerowany.
          </p>
        </div>

        <div className={styles.successActions}>
          <Button type="button" variant="primary" onClick={onPreview}>
            Podgląd
          </Button>
          <DocxActionButton
            idleLabel="Pobierz DOCX"
            workingLabel="Przygotowywanie…"
            doneLabel="Gotowe"
            slowHint="Przygotowujemy plik DOCX…"
            variant="secondary"
            disabled={downloadDisabled || !onDownload}
            action={async () => {
              if (!onDownload) return false
              try {
                const result = await onDownload()
                return result !== false
              } catch {
                return false
              }
            }}
          />
          <button type="button" className={styles.ghostLink} disabled>
            Wyślij klientowi · wkrótce
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
