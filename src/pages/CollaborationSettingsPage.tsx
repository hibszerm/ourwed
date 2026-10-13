import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageContainer } from '@/components/ui/PageContainer'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import {
  SettingsAlert,
  SettingsHelper,
  SettingsMuted,
  SettingsSection,
  SettingsSectionHeader,
  SettingsWorkspace,
} from '@/features/settings/SettingsWorkspace'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  collaborationService,
  type CollaborationConnection,
  type CollaborationInvitation,
} from '@/features/collaboration/collaborationService'
import styles from './CollaborationSettingsPage.module.css'

function messageForError(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'rate_limited') return 'Osiągnięto dzienny limit zaproszeń. Spróbuj ponownie później.'
  if (code === 'invalid_email') return 'Sprawdź poprawność adresu e-mail.'
  if (code === 'self_invite') return 'Nie możesz zaprosić własnego adresu e-mail.'
  if (code === 'verified_account_required') return 'Do współpracy potrzebne jest potwierdzone konto OurWed.'
  if (code === 'account_ambiguous') return 'Nie udało się jednoznacznie potwierdzić konta dla tego adresu. Sprawdź adres i spróbuj ponownie.'
  return 'Nie udało się wykonać tej czynności. Spróbuj ponownie.'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(new Date(value))
}

export function CollaborationSettingsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [endTarget, setEndTarget] = useState<CollaborationConnection | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  async function refreshAfterActionFailure() {
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

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy('send')
    setError(null)
    setNotice(null)
    const scope = `create:${email.trim().toLowerCase()}`
    const key = commandKey(scope)
    try {
      const result = await collaborationService.createInvite(email, key)
      idempotencyKeys.current.delete(scope)
      if (result === 'account_not_found') {
        setError('Nie znaleźliśmy konta OurWed dla tego adresu. Poproś tę osobę, aby najpierw założyła konto.')
        return
      }
      if (result === 'account_ambiguous') {
        setError(messageForError(new Error('account_ambiguous')))
        return
      }
      if (result === 'already_connected') {
        setError('Ta osoba jest już na Twojej liście współpracowników.')
        return
      }
      if (result === 'pending_exists') {
        setError('Zaproszenie do tej osoby już oczekuje na odpowiedź.')
        await refresh()
        return
      }
      setInviteOpen(false)
      setEmail('')
      setNotice('Zaproszenie zostało wysłane.')
      await refresh()
    } catch (err) {
      setError(messageForError(err))
      await refreshAfterActionFailure()
    } finally {
      setBusy(null)
    }
  }

  async function invitationAction(invite: CollaborationInvitation, action: 'accept' | 'decline' | 'cancel') {
    if (busy) return
    setBusy(invite.id)
    setError(null)
    const scope = `${action}:${invite.id}`
    try {
      const key = commandKey(scope)
      if (action === 'accept') await collaborationService.acceptInvite(invite.id, key)
      else if (action === 'decline') await collaborationService.declineInvite(invite.id, key)
      else await collaborationService.cancelInvite(invite.id, key)
      idempotencyKeys.current.delete(scope)
      if (action === 'accept') setNotice('Konta są połączone. Żadne zlecenie ani dane nie zostały udostępnione.')
      await refresh()
    } catch (err) {
      setError(messageForError(err))
      await refreshAfterActionFailure()
    } finally {
      setBusy(null)
    }
  }

  async function end(connection: CollaborationConnection) {
    if (busy) return
    setBusy(connection.id)
    setError(null)
    const scope = `end:${connection.id}`
    try {
      await collaborationService.endConnection(connection.id, commandKey(scope))
      idempotencyKeys.current.delete(scope)
      setEndTarget(null)
      await refresh()
    } catch (err) {
      setError(messageForError(err))
      await refreshAfterActionFailure()
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsLayout
      title="Współpraca"
      subtitle="Połącz się z osobami, z którymi realizujesz wspólne zlecenia."
      action={
        <Button type="button" variant="primary" onClick={() => setInviteOpen(true)}>
          Dodaj współpracownika
        </Button>
      }
    >
      <PageContainer width="full">
        <SettingsWorkspace testId="collaboration-settings-page">
          <SettingsHelper>
            Połączenie kont nie udostępnia automatycznie żadnych zleceń, klientów ani danych.
          </SettingsHelper>
          <Link className={styles.collaborativeWeddingsLink} to="/wspolpraca/sluby">
            Zobacz wspólne zlecenia
          </Link>
          {error ? <SettingsAlert>{error}</SettingsAlert> : null}
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
          {state.isPending ? <SettingsMuted>Ładowanie współpracy…</SettingsMuted> : null}
          {state.isError ? (
            <SettingsAlert>Nie udało się wczytać współpracy. Odśwież stronę i spróbuj ponownie.</SettingsAlert>
          ) : null}

          {state.data && state.data.incoming_pending.length > 0 ? (
            <SettingsSection labelledBy="incoming-heading">
              <SettingsSectionHeader id="incoming-heading" title="Zaproszenia do współpracy" />
              <ul className={styles.list}>
                {state.data.incoming_pending.map((invite) => (
                  <li className={styles.row} key={invite.id}>
                    <div>
                      <p className={styles.name}>{invite.display_name}</p>
                      <p className={styles.meta}>chce połączyć się z Tobą w OurWed · {formatDate(invite.created_at)}</p>
                      <p className={styles.meta}>Po akceptacji będziecie mogli zapraszać się do wspólnych zleceń. Żadne zlecenie nie zostanie udostępnione automatycznie.</p>
                    </div>
                    <div className={styles.actions}>
                      <Button type="button" variant="ghost" disabled={busy === invite.id} onClick={() => void invitationAction(invite, 'decline')}>
                        Odrzuć
                      </Button>
                      <Button type="button" variant="primary" disabled={busy === invite.id} onClick={() => void invitationAction(invite, 'accept')}>
                        {busy === invite.id ? 'Zapisywanie…' : 'Akceptuj'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </SettingsSection>
          ) : null}

          {state.data && state.data.connections.length > 0 ? (
            <SettingsSection labelledBy="collaborators-heading">
              <SettingsSectionHeader id="collaborators-heading" title="Współpracownicy" />
              <ul className={styles.list}>
                {state.data.connections.map((connection) => (
                  <li className={styles.row} key={connection.id}>
                    <div>
                      <p className={styles.name}>{connection.display_name}</p>
                      <p className={styles.meta}>Połączono {formatDate(connection.connected_at)}</p>
                    </div>
                    <Button type="button" variant="ghost" disabled={busy === connection.id} onClick={() => setEndTarget(connection)}>
                      Zakończ współpracę
                    </Button>
                  </li>
                ))}
              </ul>
            </SettingsSection>
          ) : null}

          {state.data && state.data.outgoing_pending.length > 0 ? (
            <SettingsSection labelledBy="outgoing-heading">
              <SettingsSectionHeader id="outgoing-heading" title="Oczekujące" />
              <ul className={styles.list}>
                {state.data.outgoing_pending.map((invite) => (
                  <li className={styles.row} key={invite.id}>
                    <div>
                      <p className={styles.name}>{invite.display_name}</p>
                      <p className={styles.meta}>Oczekuje · wysłano {formatDate(invite.created_at)}</p>
                    </div>
                    <Button type="button" variant="ghost" disabled={busy === invite.id} onClick={() => void invitationAction(invite, 'cancel')}>
                      Anuluj
                    </Button>
                  </li>
                ))}
              </ul>
            </SettingsSection>
          ) : null}

          {state.data && state.data.connections.length === 0
            && state.data.incoming_pending.length === 0 && state.data.outgoing_pending.length === 0 ? (
            <div className={styles.empty}>
              <h2>Współpraca</h2>
              <p>Połącz się z osobami, z którymi realizujesz wspólne zlecenia.</p>
              <p>Połączenie kont nie udostępnia automatycznie żadnych zleceń, klientów ani danych.</p>
              <Button type="button" variant="primary" onClick={() => setInviteOpen(true)}>
                Dodaj współpracownika
              </Button>
            </div>
          ) : null}
        </SettingsWorkspace>
      </PageContainer>

      {inviteOpen ? (
        <Modal
          open
          title="Dodaj współpracownika"
          description="Możesz połączyć się z osobą, która ma już konto OurWed. Akceptacja nie udostępni automatycznie żadnych zleceń."
          onClose={() => setInviteOpen(false)}
          busy={busy === 'send'}
          hideFooter
          showClose
          initialFocus="panel"
        >
          <form onSubmit={(event) => void sendInvite(event)}>
            <Input
              id="collaboration-email"
              label="Adres e-mail"
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              value={email}
              disabled={busy === 'send'}
              onChange={(event) => setEmail(event.target.value)}
            />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.dialogActions}>
              <Button type="button" variant="ghost" disabled={busy === 'send'} onClick={() => setInviteOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" variant="primary" disabled={busy === 'send' || !email.trim()}>
                {busy === 'send' ? 'Wysyłanie…' : 'Wyślij zaproszenie'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {endTarget ? (
        <Modal
          open
          title="Zakończyć współpracę?"
          description="To zatrzyma przyszłe zaproszenia do wspólnych zleceń. W przyszłości już zaakceptowane zlecenia nie znikną automatycznie."
          onClose={() => setEndTarget(null)}
          busy={busy === endTarget.id}
          initialFocus="panel"
          primaryAction={(
            <Button type="button" variant="primary" disabled={busy === endTarget.id} onClick={() => void end(endTarget)}>
              {busy === endTarget.id ? 'Zapisywanie…' : 'Zakończ współpracę'}
            </Button>
          )}
        >
          <p className={styles.name}>{endTarget.display_name}</p>
        </Modal>
      ) : null}
    </SettingsLayout>
  )
}
