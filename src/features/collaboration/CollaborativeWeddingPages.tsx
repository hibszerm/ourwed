import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  formatCollaborativeWeddingDate,
  isUuid,
  type CollaborativeWeddingPlaceRole,
} from './collaborativeWeddingTypes'
import {
  clearCollaborativeWeddingAccess,
  useCollaborativeWedding,
  useCollaborativeWeddings,
} from './useCollaborativeWeddings'
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
  const validId = isUuid(weddingId)
  const detail = useCollaborativeWedding(weddingId, validId)
  const ended = !validId || detail.isError || (!detail.isPending && detail.data === null)

  useEffect(() => {
    if (!ended) return
    clearCollaborativeWeddingAccess(queryClient, user?.id, weddingId)
    navigate('/wspolpraca/sluby', { replace: true, state: { accessEnded: true } })
  }, [ended, navigate, queryClient, user?.id, weddingId])

  // Never paint a cached projection while the server is checking current membership.
  if (!validId || ended || detail.isFetching || detail.isPending || !detail.data) {
    return <main className={styles.page} data-testid="collaborative-wedding-detail" aria-busy="true">
      <p className={styles.muted}>Sprawdzanie dostępu do zlecenia…</p>
    </main>
  }

  const wedding = detail.data
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
        {wedding.places.length === 0 ? <p className={styles.muted}>Właściciel nie dodał jeszcze miejsc.</p> : null}
        <ul className={styles.places}>
          {wedding.places.map((place, index) => (
            <li key={`${place.role}-${index}`}>
              <h3>{PLACE_LABELS[place.role]}</h3>
              <p>{place.formatted_address}</p>
              {place.operational_time ? <p className={styles.time}>Godzina: {place.operational_time}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
