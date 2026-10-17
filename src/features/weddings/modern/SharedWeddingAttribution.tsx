import { UsersRound } from 'lucide-react'
import styles from './SharedWeddingAttribution.module.css'

export function SharedWeddingAttribution({ ownerDisplayName }: { ownerDisplayName: string | null }) {
  const displayName = ownerDisplayName?.trim() || 'właściciela zlecenia'
  const message = `Udostępnione przez ${displayName}`

  return (
      <span
        className={styles.marker}
        aria-label={message}
        role="img"
        title={message}
      >
        <UsersRound size={15} strokeWidth={1.75} aria-hidden="true" />
      </span>
  )
}
