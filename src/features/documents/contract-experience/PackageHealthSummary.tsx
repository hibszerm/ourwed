import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { PackageContractHealthReport } from '@/features/documents/template/packageContractHealthAudit'
import { packageHealthRecommendations } from './packageHealthCopy'
import { fadeSlide, reducedMotionSafe, softSpring } from './motion'
import styles from './ContractExperience.module.css'

const READY_PILLS = [
  { id: 'safe', label: 'Bezpieczna' },
  { id: 'ready', label: 'Gotowa do generowania' },
  { id: 'linked', label: 'Powiązana z pakietem' },
] as const

export function PackageHealthSummary({
  fileName,
  healthReport,
  actions,
}: {
  fileName: string | null
  healthReport: PackageContractHealthReport | null
  actions?: ReactNode
}) {
  const prefersReduced = useReducedMotion() ?? false
  const variants = reducedMotionSafe(prefersReduced, fadeSlide)
  const recommendations = packageHealthRecommendations(
    healthReport?.checks ?? [],
  )
  const [recsOpen, setRecsOpen] = useState(recommendations.length > 0)

  return (
    <motion.div
      className={`${styles.experience} ${styles.card}`}
      variants={variants}
      initial="initial"
      animate="animate"
      layout
    >
      <div className={styles.successHero}>
        <span className={styles.successGlyph} aria-hidden>
          <ShieldCheck size={26} strokeWidth={1.75} />
        </span>
        <div>
          <p className={styles.eyebrow}>Umowa pakietu</p>
          <h3 className={styles.title}>Umowa gotowa</h3>
          <p className={styles.subtitle}>
            Dokument został przeanalizowany i jest gotowy do użycia w pakietach.
          </p>
          {fileName ? (
            <p className={styles.fileChipMeta} style={{ marginTop: '0.65rem' }}>
              {fileName}
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.pillRow}>
        {READY_PILLS.map((pill) => (
          <span key={pill.id} className={styles.pill}>
            <Check size={14} strokeWidth={2.5} aria-hidden />
            {pill.label}
          </span>
        ))}
      </div>

      {recommendations.length > 0 ? (
        <div className={styles.recs}>
          <button
            type="button"
            className={styles.recsToggle}
            aria-expanded={recsOpen}
            onClick={() => setRecsOpen((v) => !v)}
          >
            <span>Rekomendacje</span>
            <motion.span
              animate={{ rotate: recsOpen ? 180 : 0 }}
              transition={softSpring}
              style={{ display: 'inline-flex' }}
            >
              <ChevronDown size={18} aria-hidden />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {recsOpen ? (
              <motion.div
                key="recs"
                className={styles.recsBody}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: prefersReduced ? 0.01 : 0.22 }}
              >
                <ul className={styles.recsList}>
                  {recommendations.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </motion.div>
  )
}
