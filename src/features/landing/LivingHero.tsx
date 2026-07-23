import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import styles from './LivingHero.module.css'

/**
 * Hero vignette — a quiet glimpse of the full wedding-business workflow
 * before the visitor scrolls into journey chapters.
 */
export function LivingHero() {
  const reduce = useReducedMotion()

  return (
    <div className={styles.stage} aria-hidden>
      <motion.div
        className={styles.board}
        animate={reduce ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className={styles.boardHead}>
          <p>Projekty</p>
          <span>12 aktywnych</span>
        </div>
        <div className={styles.rows}>
          {[
            ['Anna & Michał', '22.08', 'Foto+Film'],
            ['Julia & Tomasz', '12.09', 'Standard'],
            ['Natalia & Piotr', '03.10', 'Mini'],
          ].map(([name, date, pkg], i) => (
            <motion.div
              key={name}
              className={styles.row}
              animate={
                reduce
                  ? undefined
                  : {
                      opacity: [0.55, 1, 1, 0.7],
                    }
              }
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.2,
              }}
            >
              <strong>{name}</strong>
              <em>{date}</em>
              <span>{pkg}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className={styles.inquiry}
        animate={
          reduce
            ? undefined
            : {
                opacity: [0.35, 1, 1, 0.5],
                y: [10, 0, 0, -4],
              }
        }
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.25, 0.7, 1],
        }}
      >
        <p className={styles.chipEyebrow}>Nowe zapytanie</p>
        <strong>Ola &amp; Kamil</strong>
        <span>Akceptuj → projekt</span>
      </motion.div>

      <motion.div
        className={styles.wedding}
        animate={
          reduce
            ? undefined
            : {
                opacity: [0.25, 0.25, 1, 1, 0.4],
                y: [14, 14, 0, 0, -3],
              }
        }
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.4, 0.55, 0.85, 1],
        }}
      >
        <p className={styles.chipEyebrow}>Projekt</p>
        <strong>Anna &amp; Michał</strong>
        <span>22.08.2026 · Premium</span>
        <div className={styles.badges}>
          <em>
            <Check size={11} strokeWidth={2.5} />
            Umowa
          </em>
          <em>
            <Check size={11} strokeWidth={2.5} />
            Zaliczka
          </em>
        </div>
      </motion.div>
    </div>
  )
}
