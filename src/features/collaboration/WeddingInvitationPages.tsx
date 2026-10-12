import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMyWeddingInvitations, useWeddingInvitationCommand, useWeddingInvitationPreview } from '@/features/collaboration/useWeddingCollaboration'
import type { WeddingInvitationPreview, WeddingInvitationStatus } from '@/features/collaboration/weddingCollaborationService'
import styles from './WeddingCollaboration.module.css'

const STATUS_LABELS: Record<WeddingInvitationStatus, string> = {
  pending: 'Oczekuje na odpowiedź',
  accepted: 'Zaakceptowano',
  declined: 'Odrzucono',
  cancelled: 'Anulowano',
  expired: 'Wygasło',
  superseded: 'Zmienione warunki',
}

function money(value: number | null, currency: string): string {
  if (value === null) return 'Nie określono'
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function coupleName(invite: WeddingInvitationPreview): string {
  return [invite.couple_first_name, invite.couple_second_name].filter(Boolean).join(' i ') || 'Zaproszenie do zlecenia'
}

function invitationStateCopy(invite: WeddingInvitationPreview): string {
  if (invite.status === 'superseded') {
    return 'Warunki zaproszenia uległy zmianie. Poproś właściciela zlecenia o nowe zaproszenie.'
  }
  if (invite.status === 'cancelled') {
    return invite.reason === 'global_connection_ended'
      ? 'To zaproszenie nie jest już aktywne. Ponowne połączenie wymaga nowego zaproszenia do zlecenia.'
      : 'To zaproszenie nie jest już aktywne.'
  }
  if (invite.status === 'expired') return 'Termin odpowiedzi minął. Poproś właściciela zlecenia o nowe zaproszenie.'
  if (invite.status === 'declined') return 'To zaproszenie zostało odrzucone.'
  if (invite.status === 'accepted' && invite.membership_status && invite.membership_status !== 'active') {
    return 'Współpraca przy zleceniu została zakończona.'
  }
  if (invite.status === 'accepted') return 'Akceptacja zaproszenia została zapisana.'
  return 'To zaproszenie nie jest już aktywne.'
}

export function WeddingInvitationListPage() {
  const invitations = useMyWeddingInvitations()
  return (
    <main className={styles.inviteListPage} data-testid="wedding-invitation-list">
      <p className={styles.eyebrow}>Współpraca przy zleceniach</p>
      <h1 className={styles.pageTitle}>Zaproszenia</h1>
      <p className={styles.muted}>Tutaj zobaczysz zaproszenia skierowane bezpośrednio do Ciebie.</p>
      {invitations.isLoading ? <p className={styles.muted}>Ładowanie zaproszeń…</p> : null}
      {invitations.isError ? (
        <p className={styles.error} role="alert">Nie udało się załadować zaproszeń. Spróbuj ponownie.</p>
      ) : null}
      {!invitations.isLoading && !invitations.isError && invitations.data?.length === 0 ? (
        <p className={styles.terminalState}>Nie masz zaproszeń do zleceń.</p>
      ) : null}
      <ul className={styles.inviteList}>
        {(invitations.data ?? []).map((invite) => (
          <li key={invite.invitation_id}>
            <Link className={styles.inviteListItem} to={`/wspolpraca/zaproszenie/${invite.invitation_id}`}>
              <strong>{coupleName(invite)}</strong>
              <span>{invite.inviter_display_name} · {STATUS_LABELS[invite.status]}</span>
              {invite.wedding_date ? <span>{new Date(`${invite.wedding_date}T12:00:00`).toLocaleDateString('pl-PL')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      <Link className={styles.backLink} to="/powiadomienia">Wróć do powiadomień</Link>
    </main>
  )
}

export function WeddingInvitationPreviewPage() {
  const { invitationId = '' } = useParams<{ invitationId: string }>()
  const preview = useWeddingInvitationPreview(invitationId)
  const command = useWeddingInvitationCommand(undefined, invitationId)
  const [confirmDecline, setConfirmDecline] = useState(false)
  const [accepted, setAccepted] = useState(false)

  async function runAction(action: 'accept' | 'decline') {
    await command.mutateAsync({ action, id: invitationId })
    if (action === 'accept') setAccepted(true)
    setConfirmDecline(false)
  }

  const invite = preview.data
  const pending = invite?.status === 'pending'
  const membershipEnded = invite?.status === 'accepted'
    && Boolean(invite.membership_status && invite.membership_status !== 'active')

  return (
    <main className={styles.invitePage} data-testid="wedding-invitation-preview">
      <p className={styles.eyebrow}>Współpraca przy zleceniu</p>
      <h1 className={styles.pageTitle}>Zaproszenie do zlecenia</h1>

      {preview.isLoading ? <p className={styles.muted}>Ładowanie zaproszenia…</p> : null}
      {preview.isError ? <p className={styles.error} role="alert">Nie udało się otworzyć zaproszenia.</p> : null}
      {!preview.isLoading && !preview.isError && !invite ? (
        <p className={styles.terminalState}>Nie znaleziono zaproszenia.</p>
      ) : null}

      {invite ? (
        <>
          <header className={styles.previewHeader}>
            <h2 className={styles.coupleNames}>{coupleName(invite)}</h2>
            <p className={styles.muted}>Zaprasza: {invite.inviter_display_name}</p>
          </header>
          <dl className={styles.previewFacts}>
            {invite.wedding_date ? (
              <div className={styles.previewFact}>
                <dt>Data ślubu</dt>
                <dd>{new Date(`${invite.wedding_date}T12:00:00`).toLocaleDateString('pl-PL')}</dd>
              </div>
            ) : null}
            {invite.package_label ? (
              <div className={styles.previewFact}>
                <dt>Pakiet</dt>
                <dd>{invite.package_label}</dd>
              </div>
            ) : null}
            <div className={styles.previewFact}>
              <dt>Wartość zlecenia · CV</dt>
              <dd>{money(invite.contract_value, invite.currency)}</dd>
            </div>
            <div className={styles.previewFact}>
              <dt>Twoja proponowana kwota</dt>
              <dd>{money(invite.proposed_share_amount, invite.currency)}</dd>
            </div>
            <div className={styles.previewFact}>
              <dt>Stan zaproszenia</dt>
              <dd>{STATUS_LABELS[invite.status]}</dd>
            </div>
          </dl>

          {membershipEnded ? (
            <p className={styles.terminalState} role="status">{invitationStateCopy(invite)}</p>
          ) : accepted || invite.status === 'accepted' ? (
            <p className={styles.successState} role="status">
              <strong>Zaproszenie zaakceptowane.</strong><br />Akceptacja została zapisana. Ta strona nie udostępnia szczegółów zlecenia.
            </p>
          ) : !pending ? (
            <p className={styles.terminalState} role="status">{invitationStateCopy(invite)}</p>
          ) : confirmDecline ? (
            <div className={styles.terminalState}>
              <p>Czy na pewno odrzucić to zaproszenie?</p>
              <div className={styles.previewActions}>
                <button type="button" className={styles.primaryButton} disabled={command.isPending} onClick={() => void runAction('decline').catch(() => undefined)}>
                  {command.isPending ? 'Zapisywanie…' : 'Potwierdź odrzucenie'}
                </button>
                <button type="button" className={styles.quietButton} onClick={() => setConfirmDecline(false)}>Wróć</button>
              </div>
            </div>
          ) : (
            <div className={styles.previewActions}>
              <button type="button" className={styles.primaryButton} disabled={command.isPending} onClick={() => void runAction('accept').catch(() => undefined)}>
                {command.isPending ? 'Zapisywanie…' : 'Akceptuj'}
              </button>
              <button type="button" className={styles.quietButton} disabled={command.isPending} onClick={() => setConfirmDecline(true)}>
                Odrzuć
              </button>
            </div>
          )}
          {command.isError ? <p className={styles.error} role="alert">Zaproszenie mogło zmienić stan. Odśwież stronę, aby sprawdzić aktualne warunki.</p> : null}
        </>
      ) : null}
      <Link className={styles.backLink} to="/wspolpraca/zaproszenia">Wszystkie zaproszenia</Link>
    </main>
  )
}
