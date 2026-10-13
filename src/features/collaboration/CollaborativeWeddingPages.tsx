import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  formatCollaborativeWeddingDate,
  isValidOperationalClock,
  isUuid,
  type CollaborativeWeddingPlaceRole,
} from './collaborativeWeddingTypes'
import {
  isCollaborationError,
  validateCollaborativeAddress,
  validateCollaborativeClock,
} from './collaborativeOperationalService'
import {
  clearCollaborativeWeddingAccess,
  useCollaborativeWedding,
  useCollaborativeWeddingOperationalEditState,
  useUpdateCollaborativeOperationalTime,
  useUpdateCollaborativeWeddingPlace,
  useCollaborativeWeddings,
} from './useCollaborativeWeddings'
import { useToast } from '@/components/ui/Toast'
import styles from './CollaborativeWeddingPages.module.css'

const PLACE_LABELS: Record<CollaborativeWeddingPlaceRole, string> = {
  bride_preparation: 'Przygotowania panny młodej',
  groom_preparation: 'Przygotowania pana młodego',
  ceremony: 'Ceremonia',
  reception: 'Przyjęcie',
}

function coupleName(first: string, second: string) {
  return [first, second].filter(Boolean).join(' i ') || 'Wspólne zlecenie'
}

export function CollaborativeWeddingListPage() {
  const query = useCollaborativeWeddings()
  const location = useLocation()
  const ended = Boolean((location.state as { accessEnded?: boolean } | null)?.accessEnded)
  const items = query.data?.pages.flat() ?? []

  return (
    <main className={styles.page} data-testid="collaborative-wedding-list">
      <p className={styles.eyebrow}>Współpraca</p>
      <h1>Wspólne zlecenia</h1>
      <p className={styles.muted}>Zlecenia, do których właściciel zaprosił Cię do współpracy.</p>
      {ended ? <p className={styles.notice} role="status">Dostęp do tego zlecenia został zakończony.</p> : null}
      {query.isPending ? <p className={styles.muted}>Ładowanie zleceń…</p> : null}
      {query.isError ? <p className={styles.error} role="alert">Nie udało się wczytać wspólnych zleceń. Spróbuj ponownie.</p> : null}
      {!query.isPending && !query.isError && items.length === 0
        ? <p className={styles.empty}>Nie masz aktywnych wspólnych zleceń.</p>
        : null}
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.wedding_id}>
            <Link className={styles.listItem} to={`/wspolpraca/sluby/${item.wedding_id}`}>
              <strong>{coupleName(item.couple_first_name, item.couple_second_name)}</strong>
              <span>{formatCollaborativeWeddingDate(item.wedding_date) ?? 'Data do ustalenia'}</span>
            </Link>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <button className={styles.button} type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {query.isFetchingNextPage ? 'Ładowanie…' : 'Pokaż kolejne'}
        </button>
      ) : null}
      <Link className={styles.backLink} to="/ustawienia/wspolpraca">Ustawienia współpracy</Link>
    </main>
  )
}

export function CollaborativeWeddingDetailPage() {
  const { weddingId = '' } = useParams<{ weddingId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const validId = isUuid(weddingId)
  const detail = useCollaborativeWedding(weddingId, validId)
  const editState = useCollaborativeWeddingOperationalEditState(weddingId, validId)
  const updatePlace = useUpdateCollaborativeWeddingPlace()
  const updateTime = useUpdateCollaborativeOperationalTime()
  const [editor, setEditor] = useState<{ role: CollaborativeWeddingPlaceRole; kind: 'address' | 'time' } | null>(null)
  const [addressDraft, setAddressDraft] = useState('')
  const [timeDraft, setTimeDraft] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [conflicted, setConflicted] = useState(false)
  const isSaving = updatePlace.isPending || updateTime.isPending
  const ended = !validId || detail.isError || (!detail.isPending && detail.data === null)

  useEffect(() => {
    const editAccessEnded = isCollaborationError(editState.error, 'UNAVAILABLE')
    if (!ended && !editAccessEnded) return
    clearCollaborativeWeddingAccess(queryClient, user?.id, weddingId)
    navigate('/wspolpraca/sluby', { replace: true, state: { accessEnded: true } })
  }, [editState.error, ended, navigate, queryClient, user?.id, weddingId])

  // Never paint a cached projection while the server is checking current membership.
  if (!validId || ended || detail.isFetching || detail.isPending || !detail.data) {
    return <main className={styles.page} data-testid="collaborative-wedding-detail" aria-busy="true">
      <p className={styles.muted}>Sprawdzanie dostępu do zlecenia…</p>
    </main>
  }

  const wedding = detail.data
  const editPlaces = editState.data?.places ?? []
  const detailRoles = new Set(wedding.places.map((place) => place.role))
  const currentEdit = editor ? editPlaces.find((place) => place.role === editor.role) : undefined

  function openEditor(role: CollaborativeWeddingPlaceRole, kind: 'address' | 'time') {
    const place = editPlaces.find((item) => item.role === role)
    setEditor({ role, kind })
    setAddressDraft(place?.formatted_address ?? '')
    setTimeDraft(isValidOperationalClock(place?.operational_time_override) ? place.operational_time_override : '')
    setFormError(null)
    setConflicted(false)
    updatePlace.reset()
    updateTime.reset()
  }

  function closeEditor() {
    if (isSaving) return
    setEditor(null)
    setFormError(null)
    setConflicted(false)
  }

  function mutationError(error: unknown) {
    if (isCollaborationError(error, 'VALIDATION_ERROR')) return 'Sprawdź poprawność wpisanych danych.'
    if (isCollaborationError(error, 'CONFLICT')) return 'Wartość zmieniła się w międzyczasie. Sprawdź aktualny stan i zapisz ponownie.'
    if (isCollaborationError(error, 'UNAVAILABLE')) return 'Dostęp do tego zlecenia został zakończony.'
    return 'Nie udało się potwierdzić zapisu. Sprawdź połączenie i spróbuj ponownie.'
  }

  async function saveAddress(value: string) {
    if (!editor || !currentEdit) return
    const normalized = validateCollaborativeAddress(value)
    if (normalized === null) {
      setFormError('Adres może mieć maksymalnie 500 znaków i nie może zawierać znaków sterujących.')
      return
    }
    if (!detailRoles.has(editor.role) && normalized.length === 0) {
      setFormError('Wpisz adres, aby dodać to miejsce.')
      return
    }
    setFormError(null)
    try {
      const result = await updatePlace.mutateAsync({
        weddingId,
        role: editor.role,
        formattedAddress: normalized,
        expectedVersion: currentEdit.address_version,
      })
      setEditor(null)
      setConflicted(false)
      toast.showToast(result.changed ? 'Adres został zapisany.' : 'Adres jest już aktualny.')
    } catch (error) {
      setFormError(mutationError(error))
      setConflicted(isCollaborationError(error, 'CONFLICT'))
    }
  }

  async function saveTime(value: string | null) {
    if (!editor || !currentEdit) return
    if (value !== null && !validateCollaborativeClock(value)) {
      setFormError('Wpisz godzinę w formacie 00:00–23:59.')
      return
    }
    setFormError(null)
    try {
      const result = await updateTime.mutateAsync({
        weddingId,
        role: editor.role,
        operationalTime: value,
        expectedVersion: currentEdit.time_version,
      })
      setEditor(null)
      setConflicted(false)
      toast.showToast(result.changed ? 'Godzina została zapisana.' : 'Godzina jest już aktualna.')
    } catch (error) {
      setFormError(mutationError(error))
      setConflicted(isCollaborationError(error, 'CONFLICT'))
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editor?.kind === 'address') void saveAddress(addressDraft)
    if (editor?.kind === 'time') void saveTime(timeDraft)
  }

  const currentServerValue = !conflicted || !editor || !currentEdit
    ? null
    : editor.kind === 'address'
      ? (currentEdit.formatted_address || 'Brak zapisanego adresu')
      : (currentEdit.operational_time_override || currentEdit.effective_operational_time || 'Brak zapisanej godziny')

  return (
    <main className={styles.page} data-testid="collaborative-wedding-detail">
      <Link className={styles.backLink} to="/wspolpraca/sluby">Wszystkie wspólne zlecenia</Link>
      <p className={styles.eyebrow}>Wspólne zlecenie</p>
      <h1>{coupleName(wedding.couple_first_name, wedding.couple_second_name)}</h1>
      <section className={styles.section} aria-labelledby="collaborative-wedding-date">
        <h2 id="collaborative-wedding-date">Data ślubu</h2>
        <p>{formatCollaborativeWeddingDate(wedding.wedding_date) ?? 'Data do ustalenia'}</p>
      </section>
      <section className={styles.section} aria-labelledby="collaborative-wedding-places">
        <h2 id="collaborative-wedding-places">Miejsca i godziny</h2>
        {editState.isPending ? <p className={styles.muted}>Ładowanie pól do edycji…</p> : null}
        {editState.isError ? <p className={styles.error} role="alert">Nie udało się wczytać danych edycji. Spróbuj ponownie.</p> : null}
        <ul className={styles.places}>
          {editPlaces.map((place) => (
            <li key={place.role} data-testid={`collaborative-place-${place.role}`}>
              <div className={styles.placeHeading}>
                <h3>{PLACE_LABELS[place.role]}</h3>
                <div className={styles.placeActions}>
                  <Button type="button" size="sm" onClick={() => openEditor(place.role, 'address')}>Edytuj adres</Button>
                  {detailRoles.has(place.role)
                    ? <Button type="button" size="sm" variant="ghost" onClick={() => openEditor(place.role, 'time')}>Edytuj godzinę</Button>
                    : <span className={styles.muted}>Dodaj adres, aby ustawić godzinę</span>}
                </div>
              </div>
              <p>{place.formatted_address || 'Adres do ustalenia'}</p>
              {place.effective_operational_time
                ? <p className={styles.time}>Godzina: {place.effective_operational_time}{place.time_source === 'ceremony_fallback' ? ' (ustawienie ślubu)' : ''}</p>
                : <p className={styles.time}>Godzina do ustalenia</p>}
              {place.address_version !== null && !detailRoles.has(place.role)
                ? <p className={styles.muted}>To miejsce zostało wcześniej usunięte.</p>
                : null}
            </li>
          ))}
        </ul>
        <p className={styles.mapNote}>Po zmianie adresu właściciel może ponownie potwierdzić lokalizację na mapie, zanim będzie można uwzględnić ją w obliczeniach trasy.</p>
      </section>
      {editor && currentEdit ? (
        <Modal
          open
          title={editor.kind === 'address' ? `Adres — ${PLACE_LABELS[editor.role]}` : `Godzina — ${PLACE_LABELS[editor.role]}`}
          description={editor.kind === 'address' ? 'Zapisz adres jako zwykły tekst.' : 'Wybierz godzinę w formacie 24-godzinnym.'}
          onClose={closeEditor}
          busy={isSaving}
          cancelLabel="Anuluj"
          cancelVariant="secondary"
          mobileFooterLayout="inline"
          initialFocus="panel"
          primaryAction={<Button type="submit" form="collaborative-operational-edit" variant="primary" disabled={isSaving}>{isSaving ? 'Zapisywanie…' : 'Zapisz'}</Button>}
          secondaryAction={editor.kind === 'address' && detailRoles.has(editor.role)
            ? <Button type="button" variant="ghost" disabled={isSaving} onClick={() => void saveAddress('')}>Wyczyść</Button>
            : editor.kind === 'time'
              ? <Button type="button" variant="ghost" disabled={isSaving} onClick={() => void saveTime(null)}>Usuń godzinę</Button>
              : undefined}
        >
          <form id="collaborative-operational-edit" className={styles.editForm} onSubmit={handleSubmit}>
            {editor.kind === 'address' ? (
              <label className={styles.fieldLabel}>
                Adres
                <textarea
                  autoComplete="street-address"
                  maxLength={1000}
                  rows={3}
                  value={addressDraft}
                  onChange={(event) => { setAddressDraft(event.target.value); setFormError(null) }}
                  aria-describedby="collaborative-address-help"
                  data-testid="collaborative-address-input"
                />
                <span id="collaborative-address-help" className={styles.fieldHint}>{[...addressDraft.trim()].length}/500</span>
              </label>
            ) : (
              <label className={styles.fieldLabel}>
                Godzina
                <input
                  type="time"
                  step={60}
                  value={timeDraft}
                  onChange={(event) => { setTimeDraft(event.target.value); setFormError(null) }}
                  data-testid="collaborative-time-input"
                />
                {currentEdit.operational_time_override && !isValidOperationalClock(currentEdit.operational_time_override)
                  ? <span className={styles.fieldHint}>Zapisana wcześniej godzina wymaga poprawienia albo usunięcia.</span>
                  : null}
              </label>
            )}
            {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
            {conflicted && currentServerValue
              ? <p className={styles.conflictNote} role="status">Aktualna wartość na serwerze: <strong>{currentServerValue}</strong>. Sprawdź ją i wybierz ponownie „Zapisz”.</p>
              : null}
            {editor.kind === 'address'
              ? <p className={styles.fieldHint}>Adres zapisuje się bez danych lokalizacji z mapy. Właściciel może później potwierdzić punkt.</p>
              : null}
          </form>
        </Modal>
      ) : null}
    </main>
  )
}
