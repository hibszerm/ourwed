import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { WeddingLocationEditor } from '@/features/weddings/detail/editing/fields/WeddingLocationEditor'
import { useWeddingLocationSave } from '@/features/weddings/detail/editing/useWeddingLocationSave'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import type { WeddingPlaceRole } from '@/types/travel'
import styles from '../WeddingEditorFields.module.css'

const ALL_ROLES: Array<{ role: WeddingPlaceRole; label: string }> = [
  { role: 'bride_preparation', label: 'Przygotowania Panny Młodej' },
  { role: 'groom_preparation', label: 'Przygotowania Pana Młodego' },
  { role: 'ceremony', label: 'Ceremonia' },
  { role: 'reception', label: 'Przyjęcie weselne' },
]

export function LocationRoleFields({
  weddingId,
  roles,
}: {
  weddingId: string
  roles?: WeddingPlaceRole[]
}) {
  const userId = useStudioAuthId()
  const { data: places = [], isLoading } = useQuery({
    queryKey: ['wedding-places', userId, weddingId],
    queryFn: () => weddingPlaceService.listByWeddingId(weddingId),
    enabled: Boolean(userId && weddingId),
  })
  const saveMutation = useWeddingLocationSave(weddingId)
  const byRole = new Map(places.map((p) => [p.role, p]))
  const fields = roles
    ? ALL_ROLES.filter((r) => roles.includes(r.role))
    : ALL_ROLES

  if (isLoading) {
    return <p className={styles.muted}>Ładowanie lokalizacji…</p>
  }

  return (
    <div className={styles.fieldGrid}>
      {fields.map(({ role, label }) => {
        const saved = byRole.get(role) ?? null
        return (
          <WeddingLocationEditor
            key={role}
            roleLabel={label}
            saved={saved}
            disabled={saveMutation.isPending}
            onSave={async (place) => {
              await saveMutation.mutateAsync({ role, place })
            }}
          />
        )
      })}
      {saveMutation.isError ? (
        <p className={styles.muted} role="alert">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : 'Nie udało się zapisać lokalizacji.'}
        </p>
      ) : null}
    </div>
  )
}
