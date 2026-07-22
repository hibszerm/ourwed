import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatTemplateDate } from '@/features/documents/templateMeta'
import type { DocumentTemplateVersion } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

interface TemplateVersionTimelineProps {
  versions: DocumentTemplateVersion[]
  currentVersionId: string | null
  uploadPending?: boolean
  onUploadVersion: () => void
  onViewDetails: (version: DocumentTemplateVersion) => void
  onDuplicate: (versionId: string) => void
  onRestore: (versionId: string) => void
}

export function TemplateVersionTimeline({
  versions,
  currentVersionId,
  uploadPending,
  onUploadVersion,
  onViewDetails,
  onDuplicate,
  onRestore,
}: TemplateVersionTimelineProps) {
  return (
    <section className={styles.section} aria-labelledby="version-history-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="version-history-title" className={styles.sectionTitle}>
            Historia wersji
          </h2>
          <p className={styles.sectionSubtitle}>
            Starsze wersje pozostają dostępne — nic nie nadpisujemy.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={uploadPending}
          onClick={onUploadVersion}
        >
          <Upload size={15} style={{ marginRight: 6 }} aria-hidden />
          {uploadPending ? 'Przesyłanie…' : 'Prześlij nową wersję'}
        </Button>
      </div>

      {versions.length === 0 ? (
        <p className={styles.fileHint}>
          Nie ma jeszcze żadnej wersji. Prześlij plik DOCX, aby zacząć.
        </p>
      ) : (
        <ol className={styles.timeline}>
          {versions.map((v, index) => {
            const isCurrent = v.id === currentVersionId
            const isOldest = index === versions.length - 1
            const note =
              v.notes?.trim() ||
              (isOldest
                ? 'Pierwsze przesłanie szablonu'
                : 'Aktualizacja dokumentu')

            return (
              <li key={v.id} className={styles.timelineItem}>
                <div className={styles.timelineRail} aria-hidden>
                  <span
                    className={`${styles.timelineDot} ${isCurrent ? styles.timelineDotCurrent : ''}`}
                  />
                  {index < versions.length - 1 && (
                    <span className={styles.timelineLine} />
                  )}
                </div>
                <article
                  className={`${styles.timelineCard} ${isCurrent ? styles.timelineCardCurrent : ''}`}
                >
                  <header className={styles.timelineCardHeader}>
                    <div className={styles.timelineTitleRow}>
                      <h3 className={styles.timelineTitle}>
                        v{v.versionNumber}
                      </h3>
                      {isCurrent && (
                        <span className={styles.timelineCurrentBadge}>
                          Bieżąca
                        </span>
                      )}
                    </div>
                    <span
                      className={`${styles.versionStatusPill} ${isCurrent ? styles.versionStatusActive : styles.versionStatusArchive}`}
                    >
                      {isCurrent ? 'Aktywna' : 'Archiwalna'}
                    </span>
                  </header>
                  <p className={styles.timelineMeta}>
                    {formatTemplateDate(v.createdAt)}
                  </p>
                  <p className={styles.timelineNote}>{note}</p>
                  <div className={styles.timelineActions}>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onViewDetails(v)}
                    >
                      Zobacz szczegóły
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDuplicate(v.id)}
                    >
                      Duplikuj
                    </Button>
                    {!isCurrent && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onRestore(v.id)}
                      >
                        Przywróć
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
