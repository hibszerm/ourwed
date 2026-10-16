import { WeddingLocationEditor } from '@/features/weddings/detail/editing/fields/WeddingLocationEditor'
import type { GeoPlace, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import styles from '../WeddingEditorFields.module.css'

const ALL_ROLES: Array<{ role: WeddingPlaceRole; label: string }> = [
  { role: 'bride_preparation', label: 'Przygotowania Panny Młodej' },
  { role: 'groom_preparation', label: 'Przygotowania Pana Młodego' },
  { role: 'ceremony', label: 'Ceremonia' },
  { role: 'reception', label: 'Przyjęcie weselne' },
]

export function LocationRoleFieldsPresentation({
  places,
  roles,
  disabled = false,
  onSave,
  error = null,
  loading = false,
}: {
  places: WeddingPlace[]
  roles?: WeddingPlaceRole[]
  disabled?: boolean
  onSave: (role: WeddingPlaceRole, place: GeoPlace | null) => void | Promise<void>
  error?: string | null
  loading?: boolean
}) {
  const byRole = new Map(places.map((place) => [place.role, place]))
  const fields = roles ? ALL_ROLES.filter((item) => roles.includes(item.role)) : ALL_ROLES
  if (loading) return <p className={styles.muted}>Ładowanie lokalizacji…</p>
  return <div className={styles.fieldGrid}>
    {fields.map(({ role, label }) => <WeddingLocationEditor
      key={role}
      roleLabel={label}
      saved={byRole.get(role) ?? null}
      disabled={disabled}
      onSave={(place) => onSave(role, place)}
    />)}
    {error ? <p className={styles.muted} role="alert">{error}</p> : null}
  </div>
}
