import styles from './FlattenedProductTabletContent.module.css'
import { LANDING_DEVICE_ASSETS } from '@/features/landing-v2/devices/landingDeviceAssets'

/**
 * Compact Product Story application content — single flattened overview.
 * Live ProductStoryWorkspace must NOT mount when this is used.
 */
export function FlattenedProductTabletContent() {
  return (
    <div
      className={styles.root}
      data-flattened-product-tablet=""
      data-testid="lv2-flattened-product-tablet"
      role="img"
      aria-label="OurWed — szczegóły zlecenia (podgląd)"
    >
      <img
        className={styles.layer}
        src={LANDING_DEVICE_ASSETS.productTabletOverview}
        alt=""
        draggable={false}
        decoding="async"
        data-flattened-layer="overview"
      />
    </div>
  )
}
