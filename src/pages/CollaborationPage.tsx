import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/AuthProvider'
import { CollaborationConnectionTools } from '@/features/collaboration/CollaborationConnectionTools'
import { CollaborationDirectory } from '@/features/collaboration/CollaborationDirectory'
import { CollaborationPermissionPresetManager } from '@/features/collaboration/CollaborationPermissionPresetManager'
import { collaborationService, type CollaborationConnection, type CollaborationInvitation } from '@/features/collaboration/collaborationService'
import { AppLayout } from '@/layouts/AppLayout'
import styles from './CollaborationPage.module.css'

type InvitationAction = 'accept' | 'decline' | 'cancel'

function messageForError(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'rate_limited') return 'Osiągnięto dzienny limit zaproszeń. Spróbuj ponownie później.'
  if (code === 'invalid_email') return 'Sprawdź poprawność adresu e-mail.'
  if (code === 'self_invite') return 'Nie możesz zaprosić własnego adresu e-mail.'
  if (code === 'verified_account_required') return 'Do współpracy potrzebne jest potwierdzone konto OurWed.'
  return 'Nie udało się wykonać tej czynności. Spróbuj ponownie.'
}

export function CollaborationPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [endTarget, setEndTarget] = useState<CollaborationConnection | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const idempotencyKeys = useRef(new Map<string, string>())

  const state = useQuery({
    queryKey: ['collaboration-settings', user?.id],
    queryFn: () => collaborationService.getState(),
    enabled: Boolean(user?.id),
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['collaboration-settings', user?.id] })
  }

  async function recoverAfterActionFailure() {
    await queryClient.resetQueries({ queryKey: ['collaboration-settings', user?.id], exact: true })
  }

  function commandKey(scope: string) {
    const keys = idempotencyKeys.current
    const existing = keys.get(scope)
    if (existing) return existing
    const created = crypto.randomUUID()
    keys.set(scope, created)
    return created
  }

  async function invitationAction(invitation: CollaborationInvitation, action: InvitationAction) {
    if (busyId) return
    setBusyId(invitation.id)
    setActionError(null)
    setNotice(null)
    const scope = `${action}:${invitation.id}`
    try {
      const key = commandKey(scope)
      if (action === 'accept') await collaborationService.acceptInvite(invitation.id, key)
      else if (action === 'decline') await collaborationService.declineInvite(invitation.id, key)
      else await collaborationService.cancelInvite(invitation.id, key)
      idempotencyKeys.current.delete(scope)
      if (action === 'accept') setNotice('Konta są połączone. Żadne zlecenie ani dane nie zostały udostępnione.')
      await refresh()
    } catch (error) {
      setActionError(messageForError(error))
      await recoverAfterActionFailure()
    } finally { setBusyId(null) }
  }

  async function endConnection(connection: CollaborationConnection) {
    if (busyId) return
    setBusyId(connection.id)
    setActionError(null)
    const scope = `end:${connection.id}`
    try {
      await collaborationService.endConnection(connection.id, commandKey(scope))
      idempotencyKeys.current.delete(scope)
      setEndTarget(null)
      await refresh()
    } catch (error) {
      setActionError(messageForError(error))
      await recoverAfterActionFailure()
    } finally { setBusyId(null) }
  }

  return <AppLayout>
    <PageContainer width="wide" className={styles.page}>
      <div className={styles.workspace}>
        <PageHeader className={styles.collaborationHeader} title="Współpraca"
          subtitle="Połącz się z osobami, z którymi pracujesz, i przygotuj gotowe zasady dostępu do zleceń." />

        <CollaborationConnectionTools />

        <CollaborationDirectory state={state.data} loading={state.isPending} loadError={state.isError}
          actionError={actionError} notice={notice} busyId={busyId} onRetry={() => void state.refetch()}
          onInvitationAction={(invitation, action) => void invitationAction(invitation, action)} onEnd={setEndTarget} />

        <CollaborationPermissionPresetManager />
      </div>
    </PageContainer>

    <Modal open={Boolean(endTarget)} title="Zakończyć współpracę?"
      description="Zatrzymasz możliwość wysyłania sobie nowych zaproszeń do współpracy. Dostęp do wcześniej udostępnionych zleceń zarządza się osobno."
      onClose={() => setEndTarget(null)} busy={Boolean(endTarget && busyId === endTarget.id)}
      mobilePresentation="center" primaryAction={<Button type="button" variant="primary"
        disabled={!endTarget || busyId === endTarget.id} onClick={() => endTarget && void endConnection(endTarget)}>
        {endTarget && busyId === endTarget.id ? 'Zapisywanie…' : 'Zakończ współpracę'}
      </Button>}>
      {endTarget ? <p className={styles.confirmName}>{endTarget.display_name}</p> : null}
    </Modal>
  </AppLayout>
}
