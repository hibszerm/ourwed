import { useEffect, useState } from 'react'
import { motion, useTransform, type MotionValue } from 'framer-motion'
import {
  phoneLayerSrc,
  phoneLayersAt,
  type LandingPhoneLayerId,
} from '@/features/landing-v2/devices/landingDeviceAssets'
import styles from './FlattenedPhoneAppContent.module.css'

type Props = {
  appProgress: MotionValue<number>
}

/**
 * Compact Mobile Story application content.
 *
 * - Dashboard phase: ONE tall strip + translate3d (compositor scroll)
 * - Screen handoffs: max 2 opacity layers
 * Live MobileOurWedApp must NOT mount when this is used.
 */
export function FlattenedPhoneAppContent({ appProgress }: Props) {
  const [layers, setLayers] = useState<[LandingPhoneLayerId, LandingPhoneLayerId]>(
    () => {
      const { a, b } = phoneLayersAt(appProgress.get())
      return [a, b]
    },
  )

  useEffect(() => {
    const warm = (id: LandingPhoneLayerId) => {
      const img = new Image()
      img.src = phoneLayerSrc(id)
    }
    warm('dashStrip')
    const t1 = window.setTimeout(() => warm('day'), 120)
    const t2 = window.setTimeout(() => {
      warm('nav')
      warm('brief')
    }, 480)

    const unsub = appProgress.on('change', (p) => {
      const { a, b } = phoneLayersAt(p)
      setLayers((prev) => (prev[0] === a && prev[1] === b ? prev : [a, b]))
    })

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      unsub()
    }
  }, [appProgress])

  const frontOp = useTransform(appProgress, (p) => 1 - phoneLayersAt(p).blend)
  const backOp = useTransform(appProgress, (p) => phoneLayersAt(p).blend)
  const stripY = useTransform(appProgress, (p) => {
    const { a, stripT } = phoneLayersAt(p)
    if (a !== 'dashStrip' && phoneLayersAt(p).b !== 'dashStrip') return '0%'
    return `${-stripT * 34.5}%`
  })
  const dual = layers[0] !== layers[1]

  return (
    <div
      className={styles.root}
      data-flattened-phone-app=""
      data-testid="lv2-flattened-phone-app"
      data-phone-layers={dual ? 2 : 1}
      role="img"
      aria-label="OurWed — aplikacja mobilna (podgląd)"
    >
      <motion.img
        className={layers[0] === 'dashStrip' ? styles.stripLayer : styles.layer}
        src={phoneLayerSrc(layers[0])}
        alt=""
        draggable={false}
        decoding="async"
        style={{
          opacity: frontOp,
          y: layers[0] === 'dashStrip' ? stripY : 0,
        }}
        data-flattened-layer={layers[0]}
      />
      {dual ? (
        <motion.img
          className={layers[1] === 'dashStrip' ? styles.stripLayer : styles.layer}
          src={phoneLayerSrc(layers[1])}
          alt=""
          draggable={false}
          decoding="async"
          style={{
            opacity: backOp,
            y: layers[1] === 'dashStrip' ? stripY : 0,
          }}
          data-flattened-layer={layers[1]}
        />
      ) : null}
    </div>
  )
}
