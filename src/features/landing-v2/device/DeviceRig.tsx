import type { CSSProperties, ReactNode } from 'react'
import styles from './DeviceRig.module.css'

export type DeviceRigVars = {
  lid?: number
  morph?: number
  screenOn?: number
  camRx?: number
  camRy?: number
  camScale?: number
  camTx?: number
  camTy?: number
  baseOpacity?: number
  keyboardOpacity?: number
  phoneDetailOpacity?: number
  deviceW?: number
  screenH?: number
  radius?: number
}

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Physical wireframe laptop ↔ phone rig.
 * Driven by CSS custom properties (GSAP-friendly).
 */
export function DeviceRig({
  vars,
  children,
  className,
  style,
}: {
  vars?: DeviceRigVars
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const lid = clamp(vars?.lid ?? 1)
  const morph = clamp(vars?.morph ?? 0)
  const screenOn = clamp(vars?.screenOn ?? 1)

  const deviceW = vars?.deviceW ?? lerp(640, 280, morph)
  const screenH = vars?.screenH ?? lerp(400, 560, morph)
  const radius = vars?.radius ?? lerp(14, 34, morph)

  const css = {
    '--lid': String(lid),
    '--morph': String(morph),
    '--screen-on': String(screenOn),
    '--cam-rx': `${vars?.camRx ?? lerp(12, 4, morph)}deg`,
    '--cam-ry': `${vars?.camRy ?? lerp(-18, 0, morph)}deg`,
    '--cam-scale': String(vars?.camScale ?? lerp(0.92, 0.98, morph)),
    '--cam-tx': `${vars?.camTx ?? 0}px`,
    '--cam-ty': `${vars?.camTy ?? 0}px`,
    '--base-opacity': String(vars?.baseOpacity ?? 1 - morph),
    '--keyboard-opacity': String(vars?.keyboardOpacity ?? 1 - morph),
    '--phone-detail-opacity': String(vars?.phoneDetailOpacity ?? morph),
    '--device-w': `${deviceW}px`,
    '--screen-h': `${screenH}px`,
    '--radius': `${radius}px`,
    '--bezel': `${lerp(12, 10, morph)}px`,
    ...style,
  } as CSSProperties

  return (
    <div className={`${styles.rig} ${className ?? ''}`} style={css} aria-hidden>
      <div className={styles.rigInner}>
        <div className={styles.shadow} />
        <div className={styles.lid}>
          <div className={styles.bezel}>
            <span className={styles.camera} />
            <span className={styles.island} />
            <div className={styles.screen}>
              <div className={styles.screenGlow} />
              <div className={styles.screenSurface}>{children}</div>
              <div className={styles.screenOff} />
            </div>
          </div>
        </div>
        <div className={styles.base}>
          <div className={styles.hinge} />
          <div className={styles.deck}>
            <div className={styles.keyboard}>
              {Array.from({ length: 42 }).map((_, i) => (
                <span
                  key={i}
                  className={`${styles.key} ${i % 14 === 0 ? styles.keyWide : ''}`}
                />
              ))}
            </div>
            <div className={styles.trackpad} />
          </div>
        </div>
        <div className={styles.phoneChin} />
      </div>
    </div>
  )
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
