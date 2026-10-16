import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { collaborativeLogisticsService } from '@/features/collaboration/collaborativeLogisticsService'
import { collaborativeProjectionToTravelPlan, selectCanonicalLogisticsPlace, type CollaborativeLogisticsProjection } from '@/features/collaboration/collaborativeLogisticsTypes'
import { weddingDetailAuthorityQueryKey } from '@/features/weddings/detail/weddingDetailAuthority'
import { LocationRoleFieldsPresentation } from '@/features/weddings/detail/editing/fields/LocationRoleFieldsPresentation'
import { CanonicalWeddingLogisticsPresentation } from '@/features/weddings/modern-detail/CanonicalWeddingLogisticsPresentation'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import styles from './SharedV3LogisticsWorkspace.module.css'

export function SharedV3LogisticsWorkspace({
  wedding, userId, accessVersion, level,
}: { wedding: Wedding; userId: string; accessVersion: string; level: 0 | 1 | 2 }) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (level === 0) queryClient.removeQueries({ queryKey: ['collaborative-logistics-v3', userId, wedding.id] })
  }, [level, queryClient, userId, wedding.id])
  if (level === 0) return null
  return <EnabledSharedV3LogisticsWorkspace wedding={wedding} userId={userId} accessVersion={accessVersion} level={level} />
}

function EnabledSharedV3LogisticsWorkspace({
  wedding, userId, accessVersion, level,
}: { wedding: Wedding; userId: string; accessVersion: string; level: 1 | 2 }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editorVersion, setEditorVersion] = useState<string | null>(null)
  const editorOpen = editorVersion === accessVersion
  const key = ['collaborative-logistics-v3', userId, wedding.id, accessVersion] as const
  const logistics = useQuery({
    queryKey: key,
    queryFn: async () => {
      const projection = await collaborativeLogisticsService.get(wedding.id)
      if (projection.access_version !== accessVersion || projection.logistics_level !== level) throw new Error('CONFLICT')
      return projection
    },
    enabled: true,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    queryClient.removeQueries({
      predicate: (query) => Array.isArray(query.queryKey)
        && query.queryKey[0] === 'collaborative-logistics-v3'
        && query.queryKey[1] === userId && query.queryKey[2] === wedding.id
        && query.queryKey[3] !== accessVersion,
    })
  }, [accessVersion, queryClient, userId, wedding.id])
  useEffect(() => {
    if (!logistics.error) return
    queryClient.removeQueries({ queryKey: ['collaborative-logistics-v3', userId, wedding.id] })
    void queryClient.invalidateQueries({ queryKey: weddingDetailAuthorityQueryKey(userId, wedding.id), exact: true })
  }, [logistics.error, queryClient, userId, wedding.id])
  const save = useMutation({
    mutationFn: async ({ role, place }: { role: WeddingPlaceRole; place: import('@/types/travel').GeoPlace | null }) => {
      const current = logistics.data
      if (!current || current.logistics_level < 2) throw new Error('FORBIDDEN')
      const saved = selectCanonicalLogisticsPlace(current.places, role)
      await collaborativeLogisticsService.savePlace(wedding.id, current.access_version, {
        id: saved?.id ?? null, role, label: place?.label?.trim() || null,
        address: place?.formattedAddress?.trim() ?? '', placeId: place?.placeId ?? null,
        latitude: place?.latitude ?? null, longitude: place?.longitude ?? null,
        addressVersion: saved ? addressVersionFor(current, role) : '1',
        nameVersion: saved ? nameVersionFor(current, role) : '1',
      })
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: key, exact: true }) },
    onError: async () => {
      queryClient.removeQueries({ queryKey: key, exact: true })
      await queryClient.invalidateQueries({ queryKey: weddingDetailAuthorityQueryKey(userId, wedding.id), exact: true })
    },
  })
  const recalculate = useMutation({
    mutationFn: async () => {
      const current = await collaborativeLogisticsService.get(wedding.id)
      if (current.logistics_level < 2 || current.access_version !== accessVersion) throw new Error('FORBIDDEN')
      return collaborativeLogisticsService.recalculate(wedding.id, current)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: key, exact: true }) },
    onError: async () => {
      queryClient.removeQueries({ queryKey: key, exact: true })
      await queryClient.invalidateQueries({ queryKey: weddingDetailAuthorityQueryKey(userId, wedding.id), exact: true })
    },
  })
  const open = searchParams.get('tab') === 'wedding_day'
  const setOpen = (next: boolean) => {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('tab', 'wedding_day')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }
  const data = logistics.data
  const places = data?.places ?? []
  const formPlaces = canonicalFormPlaces(places, wedding.id)
  const error = logistics.isError ? getUserFacingErrorMessage(logistics.error, 'Nie udało się załadować logistyki.') : null
  return (
    <div className={styles.root} data-testid="shared-v3-logistics" data-logistics-level={level}>
      <nav className={styles.nav} role="tablist" aria-label="Sekcje zlecenia">
        <button type="button" role="tab" aria-selected={open} aria-controls="shared-logistics-panel"
          onClick={() => setOpen(!open)}>Logistyka</button>
      </nav>
      {open ? <section id="shared-logistics-panel" role="tabpanel" className={styles.panel}>
        {error ? <p role="alert">{error}</p> : null}
        {logistics.isPending ? <p role="status">Ładowanie lokalizacji…</p> : null}
        {data ? <CanonicalWeddingLogisticsPresentation wedding={wedding} places={data.places}
          plan={collaborativeProjectionToTravelPlan(data)} loading={false} fetching={logistics.isFetching}
          canEdit={level >= 2} shared onEdit={level >= 2 ? () => setEditorVersion(accessVersion) : undefined}
          recalculating={recalculate.isPending} onRecalculate={() => recalculate.mutateAsync()} /> : null}
      </section> : null}
      {editorOpen && data && level >= 2 ? <div className={styles.backdrop} onMouseDown={(event) => {
        if (event.target === event.currentTarget) setEditorVersion(null)
      }}>
        <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="shared-logistics-edit-title">
          <header><h2 id="shared-logistics-edit-title">Edytuj miejsca</h2>
            <button type="button" onClick={() => setEditorVersion(null)} aria-label="Zamknij">×</button></header>
          <LocationRoleFieldsPresentation places={formPlaces} disabled={save.isPending}
            onSave={(role, place) => save.mutateAsync({ role, place })}
            error={save.isError ? getUserFacingErrorMessage(save.error, 'Nie udało się zapisać lokalizacji.') : null} />
        </section>
      </div> : null}
    </div>
  )
}

function addressVersionFor(data: CollaborativeLogisticsProjection, role: WeddingPlaceRole) {
  const place = selectCanonicalLogisticsPlace(data.places, role)
  return place?.addressVersion ?? '1'
}
function nameVersionFor(data: CollaborativeLogisticsProjection, role: WeddingPlaceRole) {
  const place = selectCanonicalLogisticsPlace(data.places, role)
  return place?.nameVersion ?? '1'
}
function canonicalFormPlaces(places: WeddingPlace[], weddingId: string): WeddingPlace[] {
  return (['bride_preparation','groom_preparation','ceremony','reception'] as const).flatMap((role, index) => {
    const place = selectCanonicalLogisticsPlace(places, role)
    return place ? [{ ...place, role }] : [{ id: `empty-${role}`, weddingId, role, label: null, placeId: null,
      formattedAddress: '', latitude: null, longitude: null, sortOrder: [15,10,20,30][index] ?? 100,
      createdAt: '', updatedAt: '' }]
  })
}
