import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import styles from './HeroShowcase.module.css'

/**
 * Non-interactive premium hero composition.
 * Floating glass cards communicate product quality — the Demo section owns interaction.
 */
export function HeroShowcase({ className = '' }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const reducedMotion = usePrefersReducedMotion()

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (reducedMotion) return
    const el = stageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    setTilt({ x: nx, y: ny })
  }

  function onPointerLeave() {
    setTilt({ x: 0, y: 0 })
  }

  return (
    <div
      ref={stageRef}
      className={`${styles.stage} ${className}`.trim()}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      aria-hidden
    >
      <div className={styles.glow} />
      <div className={styles.glowSecondary} />

      <article
        className={`${styles.card} ${styles.cardWedding}`}
        style={parallax(tilt, 10, 8, reducedMotion)}
      >
        <div className={styles.cardTop}>
          <span className={styles.avatar}>AK</span>
          <div className={styles.cardMeta}>
            <p className={styles.cardEyebrow}>Najbliższy ślub</p>
            <h3 className={styles.cardTitle}>Anna & Michał</h3>
          </div>
        </div>
        <p className={styles.cardDate}>22 sie 2026</p>
        <div className={styles.workflow}>
          <span className={styles.workflowLabel}>Workflow</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: '50%' }} />
          </div>
          <span className={styles.workflowStage}>Formalności zakończone</span>
        </div>
      </article>

      <article
        className={`${styles.card} ${styles.cardTravel}`}
        style={parallax(tilt, -14, 12, reducedMotion)}
      >
        <p className={styles.cardEyebrow}>Podróże</p>
        <ol className={styles.route}>
          <li>
            <span className={styles.stopIndex}>1</span>
            <div>
              <strong>Przygotowania</strong>
              <span>Villa Love</span>
            </div>
          </li>
          <li className={styles.leg} aria-hidden>
            <span>↓</span>
            <em>18 min · 22 km</em>
          </li>
          <li>
            <span className={styles.stopIndex}>2</span>
            <div>
              <strong>Ceremonia</strong>
              <span>Kościół św. Anny</span>
            </div>
          </li>
          <li className={styles.leg} aria-hidden>
            <span>↓</span>
            <em>11 min · 12 km</em>
          </li>
          <li>
            <span className={styles.stopIndex}>3</span>
            <div>
              <strong>Przyjęcie</strong>
              <span>Pałac Mała Wieś</span>
            </div>
          </li>
        </ol>
      </article>

      <article
        className={`${styles.card} ${styles.cardTasks}`}
        style={parallax(tilt, 12, -10, reducedMotion)}
      >
        <p className={styles.cardEyebrow}>Dzisiaj</p>
        <ul className={styles.taskList}>
          <li>
            <span className={styles.checkbox} />
            Oddać galerię
          </li>
          <li>
            <span className={styles.checkbox} />
            Potwierdzić dojazd
          </li>
          <li>
            <span className={styles.checkbox} />
            Potwierdzić harmonogram
          </li>
        </ul>
      </article>

      <article
        className={`${styles.card} ${styles.cardForms}`}
        style={parallax(tilt, -8, -14, reducedMotion)}
      >
        <p className={styles.cardEyebrow}>Ankiety</p>
        <ul className={styles.checkList}>
          <li>
            <span className={styles.checkMark}>✓</span>
            Ankieta ślubna
          </li>
          <li>
            <span className={styles.checkMark}>✓</span>
            Dane do umowy
          </li>
        </ul>
      </article>

      <article
        className={`${styles.card} ${styles.cardPay}`}
        style={parallax(tilt, 16, 6, reducedMotion)}
      >
        <p className={styles.cardEyebrow}>Płatność</p>
        <div className={styles.payRow}>
          <span>Zadatek</span>
          <strong className={styles.paid}>Opłacony</strong>
        </div>
        <div className={styles.payRow}>
          <span>Pozostało</span>
          <strong>5 500 PLN</strong>
        </div>
      </article>
    </div>
  )
}

function parallax(
  tilt: { x: number; y: number },
  strengthX: number,
  strengthY: number,
  reduced: boolean,
): CSSProperties {
  if (reduced) return undefined as unknown as CSSProperties
  return {
    transform: `translate3d(${tilt.x * strengthX}px, ${tilt.y * strengthY}px, 0)`,
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}
