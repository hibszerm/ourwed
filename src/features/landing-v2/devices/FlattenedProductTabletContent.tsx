import { useEffect, useState } from 'react'
import { motion, useTransform, type MotionValue } from 'framer-motion'
import {
  productLayerSrc,
  productLayersAt,
  type LandingProductLayerId,
} from '@/features/landing-v2/devices/landingDeviceAssets'
import styles from './FlattenedProductTabletContent.module.css'

type Props = {
  /** Same sticky remapped progress that drives live tabFromProgress (0→1). */
  tabProgress: MotionValue<number>
}

/**
 * Compact Product Story application content — scroll-linked flattened tabs.
 * Live ProductStoryWorkspace must NOT mount when this is used.
 * Max 2 snapshot layers during handoff; 1 during holds.
 */
export function FlattenedProductTabletContent({ tabProgress }: Props) {
  const [layers, setLayers] = useState<
    [LandingProductLayerId, LandingProductLayerId]
  >(() => {
    const { a, b } = productLayersAt(tabProgress.get())
    return [a, b]
  })

  useEffect(() => {
    const warm = (id: LandingProductLayerId) => {
      const img = new Image()
      img.src = productLayerSrc(id)
    }
    warm('overview')
    const t1 = window.setTimeout(() => warm('logistics'), 80)
    const t2 = window.setTimeout(() => {
      warm('finance')
      warm('questionnaire')
    }, 320)

    const unsub = tabProgress.on('change', (p) => {
      const { a, b } = productLayersAt(p)
      setLayers((prev) => (prev[0] === a && prev[1] === b ? prev : [a, b]))
    })

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      unsub()
    }
  }, [tabProgress])

  const frontOp = useTransform(tabProgress, (p) => 1 - productLayersAt(p).blend)
  const backOp = useTransform(tabProgress, (p) => productLayersAt(p).blend)
  const dual = layers[0] !== layers[1]

  return (
    <div
      className={styles.root}
      data-flattened-product-tablet=""
      data-testid="lv2-flattened-product-tablet"
      data-product-layers={dual ? 2 : 1}
      data-product-tab={dual ? layers[1] : layers[0]}
      role="img"
      aria-label="OurWed — szczegóły zlecenia (podgląd)"
    >
      <motion.img
        className={styles.layer}
        src={productLayerSrc(layers[0])}
        alt=""
        draggable={false}
        decoding="async"
        style={{ opacity: frontOp }}
        data-flattened-layer={layers[0]}
      />
      {dual ? (
        <motion.img
          className={styles.layer}
          src={productLayerSrc(layers[1])}
          alt=""
          draggable={false}
          decoding="async"
          style={{ opacity: backOp }}
          data-flattened-layer={layers[1]}
        />
      ) : null}
    </div>
  )
}
