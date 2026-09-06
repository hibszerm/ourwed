import { FileText } from 'lucide-react'
import { LV2_SEASON_IMPORT_ATTACHMENT } from '@/features/landing-v2/mobile-story/seasonImportClaims'
import styles from './SeasonImportPdfBadge.module.css'

/** Shared Season Import PDF attachment badge — desktop + compact. */
export function SeasonImportPdfBadge() {
  return (
    <span className={styles.badge} data-season-import-pdf-badge="" aria-hidden="true">
      <FileText className={styles.icon} strokeWidth={1.5} aria-hidden />
      <span className={styles.label}>{LV2_SEASON_IMPORT_ATTACHMENT.mark}</span>
    </span>
  )
}
