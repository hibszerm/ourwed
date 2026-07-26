import { FileText } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AnimatedChecklist,
  stagesToChecklist,
} from './AnimatedChecklist'
import { fadeSlide, reducedMotionSafe } from './motion'
import { useSequentialStages } from './useSequentialStages'
import styles from './ContractExperience.module.css'

export const PACKAGE_ANALYSIS_STAGES = [
  { id: 'read', label: 'Czytamy dokument' },
  { id: 'structure', label: 'Rozumiemy strukturę dokumentu' },
  { id: 'fields', label: 'Szukamy pól do uzupełnienia' },
  { id: 'safety', label: 'Sprawdzamy poprawność dokumentu' },
  { id: 'prepare', label: 'Przygotowujemy umowę pakietu' },
  { id: 'ready', label: 'Gotowe' },
] as const

export function ContractAnalysisAnimation({
  fileName,
  pipelineDone,
  onComplete,
}: {
  fileName: string | null
  pipelineDone: boolean
  onComplete?: () => void
}) {
  const prefersReduced = useReducedMotion() ?? false
  const { index } = useSequentialStages({
    stages: PACKAGE_ANALYSIS_STAGES,
    active: true,
    pipelineDone,
    stageMs: 780,
    fastMs: 300,
    onComplete,
  })

  const items = stagesToChecklist(
    PACKAGE_ANALYSIS_STAGES,
    index,
    pipelineDone,
  )
  const variants = reducedMotionSafe(prefersReduced, fadeSlide)
  const stillWorking = !pipelineDone || index < PACKAGE_ANALYSIS_STAGES.length - 1

  return (
    <motion.div
      className={`${styles.experience} ${styles.card}`}
      variants={variants}
      initial="initial"
      animate="animate"
      aria-busy={stillWorking}
      aria-live="polite"
      aria-label="Przygotowujemy dokument"
    >
      <div>
        <p className={styles.eyebrow}>Przygotowanie</p>
        <h3 className={styles.title}>Przygotowujemy dokument</h3>
        <p className={styles.subtitle}>
          {fileName
            ? `Sprawdzamy „${fileName}” i przygotowujemy go do użycia w pakiecie.`
            : 'Sprawdzamy dokument i przygotowujemy go do użycia w pakiecie.'}
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
            Trwa przygotowanie
          </p>
        </div>
      </div>

      <AnimatedChecklist
        items={items}
        announce="Przygotowujemy dokument…"
      />
    </motion.div>
  )
}
