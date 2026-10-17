import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCollaborativeWeddingIdentity } from '@/features/collaboration/useCollaborativeWeddingIdentity'
import { CollaborativeCompensationCard } from '@/features/collaboration/CollaborativeCompensationCard'
import { useWeddingDetailAuthority, useEvictIncompatibleWeddingDetailCaches, weddingDetailAuthorityQueryKey } from '@/features/weddings/detail/weddingDetailAuthority'
import { resolveWeddingDetailHostBranch } from '@/features/weddings/detail/weddingDetailHostBranch'
import { WeddingDetailHostModals } from '@/features/weddings/detail/WeddingDetailHostModals'
import { useWeddingDetailHost } from '@/features/weddings/detail/useWeddingDetailHost'
import { ModernWeddingDetailWorkspace } from '@/features/weddings/modern-detail/ModernWeddingDetailWorkspace'
import { ModernWeddingIdentityHero } from '@/features/weddings/modern-detail/ModernWeddingIdentityHero'
import { SharedV3LogisticsWorkspace } from '@/features/weddings/modern-detail/SharedV3LogisticsWorkspace'
import { SharedV3PreweddingWorkspace } from '@/features/weddings/modern-detail/SharedV3PreweddingWorkspace'
import { CanonicalCoupleCard } from '@/features/weddings/modern-detail/ModernWeddingOverview'
import { CanonicalCoupleContactsEditor } from '@/features/weddings/detail/CanonicalCoupleContactsEditor'
import { CanonicalWeddingTasksCard } from '@/features/tasks/CanonicalWeddingTasksCard'
import { ModernWeddingHistoriaWorkspace } from '@/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace'
import { ManageWeddingNotesModal } from '@/features/weddings/modern-detail/ManageWeddingNotesModal'
import { AddNoteModal } from '@/features/weddings/actions/AddNoteModal'
import { collaborativeContactsService, contactsToCouple, type WeddingContactsAggregate } from '@/features/collaboration/collaborativeContactsService'
import { collaborativeNotesQueryKey, collaborativeNotesService } from '@/features/collaboration/collaborativeNotesService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { CollaborativeWeddingIdentity } from '@/features/collaboration/collaborativeWeddingIdentityTypes'
import type { Wedding } from '@/types/wedding'
import type { ActivityFeedItem } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import { isUuid } from '@/features/collaboration/collaborativeWeddingTypes'
import styles from './WeddingDetailModernPage.module.css'
import workspaceStyles from '@/features/weddings/modern-detail/ModernWeddingDetailWorkspace.module.css'

export function WeddingDetailModernPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const authorityQuery = useWeddingDetailAuthority(id)
  const authority = authorityQuery.data
  useEvictIncompatibleWeddingDetailCaches(user?.id, id, authority)
  const branch = resolveWeddingDetailHostBranch({
    validId: isUuid(id),
    isFetching: authorityQuery.isFetching,
    isPending: authorityQuery.isPending,
    isError: authorityQuery.isError,
    authority,
  })

  if (branch === 'unavailable') return <UnavailableDetail />
  // Never render a cached authority result while the server is refreshing it.
  if (branch === 'loading') return <DetailLoading />
  if (branch === 'error') {
    return <DetailProblem
      title="Nie udało się sprawdzić dostępu"
      description={getUserFacingErrorMessage(authorityQuery.error, 'Spróbuj ponownie za chwilę.')}
      onRetry={() => void authorityQuery.refetch()}
    />
  }
  if (branch === 'owned') return <OwnedWeddingDetail />
  if (branch === 'shared' && authority?.kind === 'shared') {
    return <SharedWeddingDetail key={`${user?.id}:${authority.weddingId}:${authority.accessVersion}:${authority.effectiveAreas.contacts}:${authority.effectiveAreas.notes}`}
      weddingId={authority.weddingId} userId={user?.id}
      accessVersion={authority.accessVersion} logisticsLevel={authority.effectiveAreas.logistics}
      preweddingLevel={authority.effectiveAreas.prewedding} contactsLevel={authority.effectiveAreas.contacts}
      tasksLevel={authority.effectiveAreas.tasks} notesLevel={authority.effectiveAreas.notes}
      compensationLevel={authority.effectiveAreas.compensation} />
  }
  return <UnavailableDetail />
}

function OwnedWeddingDetail() {
  const host = useWeddingDetailHost()

  if (host.isLoading) return <DetailLoading />
  if (host.isError) {
    return <DetailProblem
      title="Nie udało się załadować ślubu"
      description={getUserFacingErrorMessage(host.error, 'Spróbuj odświeżyć stronę.')}
      onRetry={() => void host.refetch()}
    />
  }
  if (!host.wedding || !host.snapshot || !host.sharedProps) return <UnavailableDetail />

  return (
    <AppLayout>
      <PageContainer width="full">
        <div className={styles.page} data-testid="wedding-detail-modern">
          <ModernWeddingDetailWorkspace key={host.wedding.id} {...host.sharedProps} />
        </div>
      </PageContainer>
      <WeddingDetailHostModals host={host} />
    </AppLayout>
  )
}

function SharedWeddingDetail({ weddingId, userId, accessVersion, logisticsLevel, preweddingLevel, contactsLevel, tasksLevel, notesLevel, compensationLevel }: {
  weddingId: string; userId: string | undefined; accessVersion: string; logisticsLevel: 0 | 1 | 2; preweddingLevel: 0 | 1 | 2; contactsLevel: 0 | 1 | 2; tasksLevel: 0 | 1 | 2; notesLevel: 0 | 1 | 2; compensationLevel: 0 | 1 | 2
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [contactsEditing, setContactsEditing] = useState(false)
  const [contactsDraft, setContactsDraft] = useState<WeddingContactsAggregate | null>(null)
  const [contactsSaving, setContactsSaving] = useState(false)
  const [contactsSaveError, setContactsSaveError] = useState<string | null>(null)
  const [notesEditing, setNotesEditing] = useState(false)
  const [notesAdding, setNotesAdding] = useState(false)
  const detail = useCollaborativeWeddingIdentity(weddingId, userId)
  const contactsKey = ['collaborative-contacts-v3', userId, weddingId, accessVersion] as const
  const contactsQuery = useQuery({
    queryKey: contactsKey,
    queryFn: () => collaborativeContactsService.get(weddingId),
    enabled: Boolean(userId) && contactsLevel > 0,
    staleTime: 0,
  })
  const notesKey = useMemo(() => collaborativeNotesQueryKey(userId, weddingId, accessVersion),
    [accessVersion, userId, weddingId])
  const notesQuery = useQuery({
    queryKey: notesKey,
    queryFn: () => collaborativeNotesService.get(weddingId, accessVersion),
    enabled: Boolean(userId) && notesLevel > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (detail.isSuccess && detail.data === null) {
      void queryClient.invalidateQueries({
        queryKey: weddingDetailAuthorityQueryKey(userId, weddingId),
        exact: true,
      })
    }
  }, [detail.data, detail.isSuccess, queryClient, userId, weddingId])

  const revoked = detail.isSuccess && detail.data === null
  useEffect(() => {
    const contactsKeyPrefix = ['collaborative-contacts-v3', userId, weddingId]
    if (contactsLevel === 0 || revoked) {
      queryClient.removeQueries({ queryKey: contactsKeyPrefix })
    }
    return () => queryClient.removeQueries({ queryKey: contactsKeyPrefix })
  }, [contactsLevel, queryClient, revoked, userId, weddingId])
  useEffect(() => {
    const notesKeyPrefix = ['collaborative-wedding-notes-v3', userId, weddingId]
    if (notesLevel === 0 || revoked) {
      queryClient.removeQueries({ queryKey: notesKeyPrefix })
    }
    return () => queryClient.removeQueries({ queryKey: notesKey, exact: true })
  }, [notesKey, notesLevel, queryClient, revoked, userId, weddingId])
  if (detail.isPending || detail.isFetching) return <DetailLoading />
  if (detail.isError) {
    return <DetailProblem
      title="Nie udało się odświeżyć danych"
      description="Spróbuj ponownie za chwilę."
      onRetry={() => void detail.refetch()}
    />
  }
  if (!detail.data) return <UnavailableDetail />

  const wedding = toSharedIdentityWedding(detail.data)
  wedding.notes = notesQuery.data?.notes ?? []
  const visible = [
    ...(logisticsLevel > 0 ? [{ id: 'wedding_day', label: 'Logistyka' }] : []),
    ...(preweddingLevel > 0 ? [{ id: 'pre_wedding_questionnaire', label: 'Ankieta przedślubna' }] : []),
    ...(notesLevel > 0 ? [{ id: 'activity', label: 'Historia' }] : []),
  ]
  const requestedTab = searchParams.get('tab')
  const activeTab = visible.some((item) => item.id === requestedTab) ? requestedTab : visible[0]?.id
  const selectTab = (tab: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }
  async function saveSharedContacts() {
    if (!contactsDraft || contactsLevel !== 2) return
    setContactsSaving(true)
    setContactsSaveError(null)
    try {
      await collaborativeContactsService.saveShared({ weddingId, accessVersion, contacts: contactsDraft })
      setContactsEditing(false)
      setContactsDraft(null)
      await Promise.all([
        contactsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['collaborative-wedding-identity', userId, weddingId], exact: true }),
      ])
    } catch (error) {
      setContactsSaveError(error instanceof Error ? error.message : 'Nie udało się zapisać zmian.')
      await queryClient.invalidateQueries({ queryKey: weddingDetailAuthorityQueryKey(userId, weddingId), exact: true })
    } finally {
      setContactsSaving(false)
    }
  }
  return (
    <AppLayout>
      <PageContainer width="full">
        <div className={styles.page} data-testid="wedding-detail-modern" data-authority="shared">
          <div className={workspaceStyles.workspace} data-testid="shared-canonical-wedding-detail">
            <ModernWeddingIdentityHero wedding={wedding} places={[]} testId="modern-wedding-detail-header" />
            {userId ? <CollaborativeCompensationCard key={`${userId}:${weddingId}:${accessVersion}:${compensationLevel}`} weddingId={weddingId} userId={userId}
              accessVersion={accessVersion} compensationLevel={compensationLevel} /> : null}
            {contactsLevel > 0 && contactsQuery.data ? (
              <CanonicalCoupleCard
                couple={contactsToCouple(contactsQuery.data)}
                correspondence={contactsQuery.data.correspondence}
                contractAddress={contactsQuery.data.contract_address ?? undefined}
                onEdit={contactsLevel === 2 ? () => {
                  setContactsDraft({ ...contactsQuery.data! })
                  setContactsSaveError(null)
                  setContactsEditing(true)
                } : undefined}
              />
            ) : null}
            {contactsLevel > 0 && contactsQuery.isError ? (
              <p role="alert">Nie udało się załadować danych kontaktowych.</p>
            ) : null}
            {visible.length ? <nav className={workspaceStyles.sharedNavigation} role="tablist" aria-label="Sekcje zlecenia">
              {visible.map((item) => <button key={item.id} type="button" role="tab"
                aria-selected={activeTab === item.id} onClick={() => selectTab(item.id)}>{item.label}</button>)}
            </nav> : null}
            {userId && activeTab === 'wedding_day' ? <SharedV3LogisticsWorkspace wedding={wedding} userId={userId}
              accessVersion={accessVersion} level={logisticsLevel} embedded /> : null}
            {userId && activeTab === 'pre_wedding_questionnaire' ? <SharedV3PreweddingWorkspace weddingId={weddingId}
              userId={userId} accessVersion={accessVersion} level={preweddingLevel} /> : null}
            {activeTab === 'activity' && notesLevel > 0 ? (notesQuery.isError
              ? <p role="alert">Nie udało się załadować notatek. Sprawdź dostęp i spróbuj ponownie.</p>
              : notesQuery.isPending ? <p role="status">Ładowanie notatek…</p>
                : <ModernWeddingHistoriaWorkspace
                    feed={wedding.notes.map((note): ActivityFeedItem => ({
                      id: `note-${note.id}`, source: 'note', filter: 'notes', title: note.author || 'Notatka',
                      body: note.content, date: note.createdAt, badge: note.badge || 'Notatka', pinned: Boolean(note.pinned),
                    }))}
                    onEditNotes={notesLevel === 2 ? () => setNotesEditing(true) : undefined}
                    onAddNote={notesLevel === 2 ? () => setNotesAdding(true) : undefined}
                  />) : null}
            {userId && tasksLevel > 0 ? <CanonicalWeddingTasksCard weddingId={weddingId} wedding={wedding}
              accessVersion={accessVersion} tasksLevel={tasksLevel} /> : null}
          </div>
        </div>
      </PageContainer>
      {contactsEditing && contactsLevel === 2 && contactsDraft ? (
        <CanonicalCoupleContactsEditor
          contacts={contactsDraft}
          onChange={setContactsDraft}
          busy={contactsSaving}
          error={contactsSaveError}
          onSave={() => void saveSharedContacts()}
          onCancel={() => { setContactsEditing(false); setContactsDraft(null) }}
        />
      ) : null}
      <ManageWeddingNotesModal
        key={`shared-notes:${userId}:${weddingId}:${accessVersion}:${notesLevel}`}
        open={notesEditing && notesLevel === 2 && Boolean(notesQuery.data)}
        weddingId={weddingId}
        notes={notesQuery.data?.notes ?? []}
        mode="shared"
        accessVersion={accessVersion}
        onClose={() => setNotesEditing(false)}
        onSaved={async () => (await notesQuery.refetch()).data?.notes}
        onAuthorityLost={(kind) => {
          if (kind === 'UNAVAILABLE') {
            queryClient.removeQueries({ queryKey: ['collaborative-wedding-notes-v3', userId, weddingId] })
          }
          void queryClient.invalidateQueries({ queryKey: weddingDetailAuthorityQueryKey(userId, weddingId), exact: true })
        }}
      />
      <AddNoteModal
        key={`shared-add-note:${userId}:${weddingId}:${accessVersion}`}
        open={notesAdding && notesLevel === 2 && notesQuery.isSuccess}
        onClose={() => setNotesAdding(false)}
        wedding={wedding}
        mode="shared"
        accessVersion={accessVersion}
        onCreated={() => notesQuery.refetch()}
        onAuthorityLost={(kind) => {
          if (kind === 'UNAVAILABLE') queryClient.removeQueries({ queryKey: ['collaborative-wedding-notes-v3', userId, weddingId] })
          void queryClient.invalidateQueries({ queryKey: weddingDetailAuthorityQueryKey(userId, weddingId), exact: true })
        }}
      />
    </AppLayout>
  )
}

function toSharedIdentityWedding(detail: CollaborativeWeddingIdentity): Wedding {
  const partner1 = detail.couple_first_name
  const partner2 = detail.couple_second_name
  return {
    id: detail.wedding_id,
    couple: { partner1, partner2, email: '', phone: '', venue: '', city: '' },
    date: detail.wedding_date ?? '',
    status: 'active',
    workflowStage: 'reservation',
    packageName: '',
    price: 0,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#7f6a58',
    createdAt: '',
  }
}

function DetailLoading() {
  return <AppLayout><PageContainer width="wide"><div className={styles.loading} role="status">Sprawdzanie dostępu do zlecenia…</div></PageContainer></AppLayout>
}

function UnavailableDetail() {
  return <AppLayout><PageContainer width="wide">
    <p className={styles.emptyTitle}>Nie znaleziono</p>
    <p className={styles.emptyDesc}>Nie można otworzyć tego zlecenia.</p>
    <Link to="/sluby"><Button variant="secondary">Wróć do listy</Button></Link>
  </PageContainer></AppLayout>
}

function DetailProblem({ title, description, onRetry }: { title: string; description: string; onRetry: () => void }) {
  return <AppLayout><PageContainer width="wide">
    <p className={styles.emptyTitle}>{title}</p>
    <p className={styles.emptyDesc}>{description}</p>
    <Button type="button" variant="secondary" onClick={onRetry}>Spróbuj ponownie</Button>
  </PageContainer></AppLayout>
}
