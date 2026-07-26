import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { softSpring } from './motion'
import styles from './ContractExperience.module.css'

type ActionPhase = 'idle' | 'working' | 'done' | 'error'

/**
 * Inline save/download feedback — presentation only.
 * Calls `action` and shows Zapisywanie… → ✓ Gotowe without toasts/alerts.
 */
export function DocxActionButton({
  idleLabel,
  workingLabel,
  doneLabel = 'Gotowe',
  slowHint = 'Przygotowujemy plik DOCX…',
  errorMessage = 'Nie udało się rozpocząć pobierania. Spróbuj ponownie.',
  variant = 'secondary',
  disabled,
  action,
  onSuccess,
  slowAfterMs = 700,
  doneHoldMs = 800,
}: {
  idleLabel: string
  workingLabel: string
  doneLabel?: string
  slowHint?: string
  errorMessage?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  /** Return true when the action succeeded (e.g. download started / save finished). */
  action: () => Promise<boolean>
  /** Called after the brief ✓ Gotowe hold. */
  onSuccess?: () => void
  slowAfterMs?: number
  doneHoldMs?: number
}) {
  const [phase, setPhase] = useState<ActionPhase>('idle')
  const [showSlow, setShowSlow] = useState(false)
  const prefersReduced = useReducedMotion() ?? false
  const busyRef = useRef(false)

  useEffect(() => {
    if (phase !== 'working') {
      setShowSlow(false)
      return
    }
    const timer = window.setTimeout(() => setShowSlow(true), slowAfterMs)
    return () => window.clearTimeout(timer)
  }, [phase, slowAfterMs])

  async function onClick() {
    if (busyRef.current || disabled || phase === 'working') return
    busyRef.current = true
    setPhase('working')
    try {
      const ok = await action()
      if (!ok) {
        setPhase('error')
        busyRef.current = false
        return
      }
      setShowSlow(false)
      setPhase('done')
      window.setTimeout(
        () => {
          onSuccess?.()
          setPhase('idle')
          busyRef.current = false
        },
        prefersReduced ? 120 : doneHoldMs,
      )
    } catch {
      setPhase('error')
      busyRef.current = false
    }
  }

  const label =
    phase === 'working'
      ? workingLabel
      : phase === 'done'
        ? doneLabel
        : idleLabel

  return (
    <div className={styles.docxActionWrap}>
      <Button
        type="button"
        variant={variant}
        disabled={disabled || phase === 'working' || phase === 'done'}
        aria-busy={phase === 'working'}
        onClick={() => void onClick()}
      >
        <span className={styles.docxActionInner}>
          {phase === 'working' ? (
            <span className={styles.docxActionBreath} aria-hidden />
          ) : null}
          {phase === 'done' ? (
            <Check size={15} strokeWidth={2.5} aria-hidden />
          ) : null}
          {label}
        </span>
      </Button>

      <AnimatePresence>
        {phase === 'working' && showSlow ? (
          <motion.p
            key="slow"
            className={styles.docxActionHint}
            role="status"
            aria-live="polite"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={softSpring}
          >
            {slowHint}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'error' ? (
          <motion.p
            key="err"
            className={styles.docxActionError}
            role="alert"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={softSpring}
          >
            {errorMessage}{' '}
            <button
              type="button"
              className={styles.docxActionRetry}
              onClick={() => {
                setPhase('idle')
                busyRef.current = false
              }}
            >
              Spróbuj ponownie
            </button>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** Tiny floating hint while a long DOCX action runs. */
export function DocxWorkingHint({
  show,
  children = 'Przygotowujemy plik DOCX…',
}: {
  show: boolean
  children?: ReactNode
}) {
  const prefersReduced = useReducedMotion() ?? false
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          className={styles.docxWorkingOverlay}
          role="status"
          aria-live="polite"
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={softSpring}
        >
          <span className={styles.docxActionBreath} aria-hidden />
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
