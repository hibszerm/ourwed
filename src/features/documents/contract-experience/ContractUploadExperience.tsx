import { useRef, useState, type DragEvent } from 'react'
import { Check, FileText } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { fadeSlide, reducedMotionSafe, softSpring } from './motion'
import styles from './ContractExperience.module.css'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function ContractUploadExperience({
  disabled,
  selectedFile,
  onFile,
}: {
  disabled?: boolean
  selectedFile: File | null
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const prefersReduced = useReducedMotion() ?? false
  const variants = reducedMotionSafe(prefersReduced, fadeSlide)

  function accept(file: File | null | undefined) {
    if (!file || disabled) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.docx')) return
    onFile(file)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer.files?.[0])
  }

  return (
    <div className={`${styles.experience} ${styles.card}`}>
      <div>
        <p className={styles.eyebrow}>Umowa pakietu</p>
        <h3 className={styles.title}>Dodaj umowę</h3>
        <p className={styles.subtitle}>
          Prześlij dokument DOCX — przygotujemy go do automatycznego
          generowania dla zleceń z tym pakietem.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        disabled={disabled}
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {selectedFile ? (
          <motion.div
            key="file"
            className={styles.fileChip}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            layout
          >
            <span className={styles.fileChipIcon} aria-hidden>
              <FileText size={20} strokeWidth={1.75} />
            </span>
            <div className={styles.fileChipBody}>
              <p className={styles.fileChipName}>{selectedFile.name}</p>
              <p className={styles.fileChipMeta}>
                {formatBytes(selectedFile.size)}
              </p>
            </div>
            <span className={styles.fileChipOk}>
              <Check size={14} strokeWidth={2.5} aria-hidden />
              Wgrano
            </span>
          </motion.div>
        ) : (
          <motion.button
            key="zone"
            type="button"
            className={styles.uploadZone}
            data-dragging={dragging}
            data-active={!disabled}
            disabled={disabled}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            whileHover={prefersReduced || disabled ? undefined : { scale: 1.01 }}
            whileTap={prefersReduced || disabled ? undefined : { scale: 0.995 }}
            transition={softSpring}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className={styles.docxArt} aria-hidden>
              <FileText size={28} strokeWidth={1.5} />
            </span>
            <div className={styles.uploadCopy}>
              <p className={styles.uploadLead}>Przeciągnij plik DOCX</p>
              <p className={styles.uploadHint}>lub kliknij, aby wybrać</p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
