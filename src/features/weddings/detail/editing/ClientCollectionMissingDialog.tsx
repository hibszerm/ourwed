/**
 * Path A — missing client-collection checklist.
 * Generation readiness (MissingContractDataDialog) is a separate gate.
 */

import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { listClientCollectionMissingGroups } from '@/features/weddings/detail/editing/clientCollectionMissing'
import type { WeddingEditorSection } from '@/features/weddings/detail/editing/weddingEditorTypes'
import { applyWeddingPlaces } from '@/lib/api/weddings/weddingHydrate'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import type { Wedding } from '@/types/wedding'
import styles from './ClientCollectionMissingDialog.module.css'

interface Props {
  open: boolean
  wedding: Wedding
  onClose: () => void
  onCorrect: (
    section: Extract<WeddingEditorSection, 'contacts' | 'wedding' | 'locations'>,
  ) => void
}

export function ClientCollectionMissingDialog({
  open,
  wedding,
  onClose,
  onCorrect,
}: Props) {
  const userId = useStudioAuthId()
  const { data: places = [] } = useQuery({
    queryKey: ['wedding-places', userId, wedding.id],
    queryFn: () => weddingPlaceService.listByWeddingId(wedding.id),
    enabled: Boolean(open && userId && wedding.id),
  })

  const hydrated = applyWeddingPlaces(wedding, places)
  const groups = listClientCollectionMissingGroups(hydrated)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Uzupełnij dane do umowy"
      description="Uzupełnij brakujące informacje potrzebne do przygotowania umowy."
      size="md"
      showClose
      mobilePresentation="center"
      initialFocus="panel"
      cancelLabel="Zamknij"
      hideFooter={groups.length === 0}
    >
      <div
        className={styles.body}
        data-testid="client-collection-missing-dialog"
      >
        {groups.length === 0 ? (
          <p className={styles.empty}>Wszystkie wymagane dane są uzupełnione.</p>
        ) : (
          groups.map((group) => (
            <section
              key={group.id}
              className={styles.group}
              data-testid={`client-collection-group-${group.id}`}
            >
              <div className={styles.groupHeader}>
                <div className={styles.groupText}>
                  <h3 className={styles.groupTitle}>{group.label}</h3>
                  <p className={styles.groupSummary}>{group.summary}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid={`client-collection-cta-${group.id}`}
                  onClick={() => onCorrect(group.section)}
                >
                  {group.ctaLabel}
                </Button>
              </div>
              {group.items.length > 1 ? (
                <ul className={styles.list}>
                  {group.items.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))
        )}
      </div>
    </Modal>
  )
}
