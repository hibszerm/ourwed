/**
 * Calm staged progress for package DOCX template upload (no AI).
 */

import { FileText } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { AnimatedChecklist, stagesToChecklist } from './AnimatedChecklist'
import { fadeSlide, reducedMotionSafe } from './motion'
import { useSequentialStages } from './useSequentialStages'
import type { PackageTemplateUiPhase } from '@/features/studio/packageTemplateUiPhase'
import styles from './ContractExperience.module.css'

export const PACKAGE_TEMPLATE_UPLOAD_STAGES = [
  { id: 'uploading', label: 'Przesyłanie pliku' },
  { id: 'saving', label: 'Zapisywanie szablonu' },
  { id: 'done', label: 'Szablon został dodany' },
] as const

function stageIndexForPhase(phase: PackageTemplateUiPhase): number {
  if (phase === 'uploading') return 0
  if (phase === 'saving') return 1
  if (phase === 'success_transition' || phase === 'ready') return 2
  if (phase === 'error') return 1
  return 0
}

export function PackageTemplateUploadProgress({
  fileName,
  phase,
  pipelineDone,
  error,
  onRetry,
  onComplete,
}: {
  fileName: string | null
  phase: PackageTemplateUiPhase
  pipelineDone: boolean
  error?: string | null
  onRetry?: () => void
  onComplete?: () => void
}) {
  const prefersReduced = useReducedMotion() ?? false
  const forcedIndex = stageIndexForPhase(phase)
  const { index } = useSequentialStages({
    stages: PACKAGE_TEMPLATE_UPLOAD_STAGES,
    active: phase !== 'error',
    pipelineDone: pipelineDone && phase === 'success_transition',
    stageMs: 380,
    fastMs: 240,
    readyHoldMs: 280,
    onComplete,
  })

  const displayIndex =
    phase === 'error' ? forcedIndex : Math.max(index, forcedIndex)

  const items = stagesToChecklist(
    PACKAGE_TEMPLATE_UPLOAD_STAGES,
    displayIndex,
    pipelineDone && phase === 'success_transition',
  )
  const variants = reducedMotionSafe(prefersReduced, fadeSlide)
  const stillWorking =
    phase === 'uploading' ||
    phase === 'saving' ||
    (phase === 'success_transition' && !pipelineDone)
  const progressPct =
    phase === 'success_transition' && pipelineDone
      ? 100
      : phase === 'saving'
        ? 62
        : phase === 'uploading'
          ? 28
          : phase === 'error'
            ? 45
            : 15

  const title =
    phase === 'error'
      ? 'Nie udało się zapisać szablonu'
      : phase === 'success_transition'
        ? 'Szablon został dodany'
        : phase === 'saving'
          ? 'Zapisywanie szablonu…'
          : 'Przesyłanie pliku…'

  const meta =
    phase === 'error'
      ? 'Spróbuj ponownie'
      : phase === 'success_transition'
        ? 'Zapisano'
        : phase === 'saving'
          ? 'Zapisywanie szablonu…'
          : 'Przesyłanie pliku…'

  return (
    <motion.div
      className={`${styles.experience} ${styles.card}`}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      aria-busy={stillWorking}
      aria-live="polite"
      aria-label={title}
      data-testid="package-template-upload-progress"
    >
      <div>
        <p className={styles.eyebrow}>Szablon umowy</p>
        <h3 className={styles.title} style={{ fontSize: '1.25rem' }}>
          {title}
        </h3>
        <p className={styles.subtitle}>
          {fileName
            ? `„${fileName}”`
            : 'Przygotowujemy dokument do użycia w pakiecie.'}
        </p>
      </div>

      <div
        className={`${styles.fileChip} ${
          stillWorking && !prefersReduced ? styles.fileChipLiving : ''
        }`}
      >
        <span className={styles.fileChipIcon} aria-hidden>
          <FileText size={18} strokeWidth={1.75} />
        </span>
        <div className={styles.fileChipBody}>
          <p className={styles.fileChipName}>{fileName ?? 'Dokument DOCX'}</p>
          <p
            className={`${styles.fileChipMeta} ${
              stillWorking && !prefersReduced ? styles.fileChipMetaLiving : ''
            }`}
          >
            {meta}
          </p>
        </div>
      </div>

      <div
        className={styles.uploadProgressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
      >
        <motion.div
          className={styles.uploadProgressFill}
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={
            prefersReduced
              ? { duration: 0.01 }
              : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
          }
        />
      </div>

      {phase === 'error' && error ? (
        <div className={styles.templateErrorBlock} role="alert">
          <p className={styles.attentionUploadNote}>{error}</p>
          {onRetry ? (
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              Spróbuj ponownie
            </Button>
          ) : null}
        </div>
      ) : (
        <AnimatedChecklist items={items} announce={title} />
      )}
    </motion.div>
  )
}
