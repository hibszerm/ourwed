import { motion } from 'framer-motion'
import styles from './SceneLabel.module.css'

export function SceneLabel({
  eyebrow,
  title,
  align = 'left',
  visible = true,
}: {
  eyebrow?: string
  title: string
  align?: 'left' | 'right' | 'center'
  visible?: boolean
}) {
  return (
    <motion.aside
      className={styles.label}
      data-align={align}
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : 8,
      }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <p className={styles.title}>{title}</p>
    </motion.aside>
  )
}
