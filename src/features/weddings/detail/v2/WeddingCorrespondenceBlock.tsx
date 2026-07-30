import {
  getCorrespondenceDisplay,
  CORRESPONDENCE_CHANNEL_LABELS,
  type WeddingCorrespondenceEntry,
} from '@/features/weddings/correspondence/weddingCorrespondence'
import styles from './WeddingDetailV2.module.css'

interface Props {
  correspondence: WeddingCorrespondenceEntry[] | null | undefined
  onEdit?: () => void
}

function actionLabel(channel: WeddingCorrespondenceEntry['channel']): string {
  if (channel === 'email') return 'Napisz wiadomość'
  if (channel === 'instagram') return 'Otwórz profil'
  return 'Otwórz profil'
}

/** Compact multi-entry correspondence block for the Para sidebar card. */
export function WeddingCorrespondenceBlock({ correspondence, onEdit }: Props) {
  const entries = (Array.isArray(correspondence) ? correspondence : []).filter(
    (entry) => entry.value?.trim(),
  )

  if (entries.length === 0) {
    return (
      <div
        className={styles.contextPartner}
        data-testid="sidebar-correspondence"
        data-empty="true"
      >
        <p className={styles.contextRole}>Korespondencja</p>
        <p className={styles.contextMuted}>Nie ustawiono</p>
        {onEdit ? (
          <button type="button" className={styles.textAction} onClick={onEdit}>
            Edytuj
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={styles.correspondenceList}
      data-testid="sidebar-correspondence"
    >
      <p className={styles.contextRole}>Korespondencja</p>
      {entries.map((entry) => {
        const display = getCorrespondenceDisplay(entry)
        if (!display) return null
        const channelLabel = CORRESPONDENCE_CHANNEL_LABELS[entry.channel]
        return (
          <div
            key={entry.id}
            className={styles.correspondenceEntry}
            data-testid="sidebar-correspondence-entry"
            data-channel={entry.channel}
          >
            <p className={styles.contextMuted}>{channelLabel}</p>
            <p className={styles.contextStrong}>{display.label}</p>
            {display.kind === 'mailto' || display.kind === 'external' ? (
              <a
                className={styles.correspondenceLink}
                href={display.href}
                {...(display.kind === 'external'
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {actionLabel(entry.channel)}
              </a>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
