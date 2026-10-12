import { useState } from 'react'
import { useActiveWeddingCollaborators, useCreateWeddingInvitation, useWeddingCollaborationState, useWeddingInvitationCommand, useWeddingMembershipCommand } from '@/features/collaboration/useWeddingCollaboration'
import type { WeddingInvitationStatus } from '@/features/collaboration/weddingCollaborationService'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingCollaboration.module.css'

const STATUS_LABELS: Record<WeddingInvitationStatus, string> = {
  pending: 'Oczekuje',
  accepted: 'Zaakceptowano',
  declined: 'Odrzucono',
  cancelled: 'Anulowano',
  expired: 'Wygasło',
  superseded: 'Zmienione warunki',
}

function amountLabel(value: number | null, currency: string): string {
  if (value === null) return 'Nie określono'
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

export function WeddingCollaborationOwnerPanel({ wedding }: { wedding: Wedding }) {
  const [open, setOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [review, setReview] = useState(false)
  const state = useWeddingCollaborationState(wedding.id)
  const collaborators = useActiveWeddingCollaborators()
  const create = useCreateWeddingInvitation(wedding.id)
  const cancel = useWeddingInvitationCommand(wedding.id)
  const revoke = useWeddingMembershipCommand(wedding.id)

  const currency = wedding.currency ?? 'PLN'
  const available = collaborators.data ?? []
  const normalizedAmountInput = amountInput.trim().replace(',', '.')
  const amount = normalizedAmountInput === '' ? null : Number(normalizedAmountInput)
  const decimalPlaces = normalizedAmountInput.match(/\.(\d+)/)?.[1].length ?? 0
  const amountInvalid = amount !== null && (
    !Number.isFinite(amount) || amount < 0 || decimalPlaces > 2 || amount > 9_999_999_999.99
  )
  const selected = available.find((connection) => connection.id === selectedConnection)
  const error = create.error ?? cancel.error ?? revoke.error

  async function sendInvitation() {
    if (!selected || amountInvalid) return
    await create.mutateAsync({ inviteeUserId: selected.id, amount })
    setSelectedConnection('')
    setAmountInput('')
    setReview(false)
    setOpen(false)
  }

  return (
    <section className={styles.ownerPanel} aria-labelledby="wedding-collaboration-title" data-testid="wedding-collaboration-owner-panel">
      <div className={styles.ownerHeading}>
        <div>
          <p className={styles.eyebrow}>Dla tego zlecenia</p>
          <h2 id="wedding-collaboration-title">Współpraca</h2>
        </div>
        <button type="button" className={styles.quietButton} onClick={() => setOpen((value) => !value)}>
          {open ? 'Zamknij' : 'Dodaj współpracownika'}
        </button>
      </div>

      {state.isLoading ? <p className={styles.muted}>Ładowanie współpracy…</p> : null}
      {state.isError ? <p className={styles.error} role="alert">Nie udało się załadować współpracy. Odśwież zlecenie.</p> : null}
      {!state.isLoading && !state.isError && (state.data?.invitations.length ?? 0) === 0 ? (
        <p className={styles.muted}>Nie ma jeszcze zaproszeń do tego zlecenia.</p>
      ) : null}

      <ul className={styles.invitationList}>
        {(state.data?.invitations ?? []).map((invite) => (
          <li key={invite.invitation_id} className={styles.invitationRow}>
            <div className={styles.invitationIdentity}>
              <strong>{invite.collaborator_display_name}</strong>
              <span>{invite.status === 'accepted' && invite.membership_status && invite.membership_status !== 'active'
                ? 'Współpraca zakończona'
                : STATUS_LABELS[invite.status]}</span>
              {invite.status === 'pending' || invite.status === 'accepted' ? (
                <span>{invite.status === 'accepted' ? 'Uzgodniona kwota' : 'Proponowana kwota'}: {amountLabel(invite.proposed_share_amount, invite.currency)}</span>
              ) : null}
            </div>
            <div className={styles.rowActions}>
              {invite.status === 'pending' ? (
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (window.confirm('Anulować zaproszenie? Zachowamy jego historię.')) {
                      void cancel.mutateAsync({ action: 'cancel', id: invite.invitation_id }).catch(() => undefined)
                    }
                  }}
                >Anuluj</button>
              ) : null}
              {invite.membership_id && invite.membership_status === 'active' ? (
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (window.confirm('Usunąć współpracownika ze zlecenia? Ta zmiana zakończy aktywną współpracę.')) {
                      void revoke.mutateAsync(invite.membership_id!).catch(() => undefined)
                    }
                  }}
                >Usuń ze zlecenia</button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {open ? (
        <div className={styles.createPanel} data-testid="wedding-collaboration-create">
          <label className={styles.field}>
            <span>Wybierz połączone konto</span>
            <select
              value={selectedConnection}
              onChange={(event) => { setSelectedConnection(event.target.value); setReview(false) }}
              disabled={collaborators.isLoading || create.isPending}
            >
              <option value="">Wybierz współpracownika</option>
              {available.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.display_name}
                </option>
              ))}
            </select>
          </label>
          {collaborators.isError ? <p className={styles.error}>Nie udało się pobrać połączonych kont.</p> : null}
          {!collaborators.isLoading && !collaborators.isError && available.length === 0 ? (
            <p className={styles.muted}>Najpierw połącz konto w Ustawieniach → Współpraca.</p>
          ) : null}
          <label className={styles.field}>
            <span>Proponowana kwota dla współpracownika</span>
            <div className={styles.amountField}>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => { setAmountInput(event.target.value); setReview(false) }}
                aria-invalid={amountInvalid}
              />
              <span>{currency}</span>
            </div>
            <small>Pozostaw puste, jeśli nie chcesz proponować kwoty. Możesz wpisać 0.</small>
          </label>
          {amountInvalid ? <p className={styles.error} role="alert">Kwota musi być nieujemna, do 9 999 999 999,99 i mieć maksymalnie dwa miejsca po przecinku.</p> : null}
          {review ? (
            <div className={styles.review} aria-live="polite">
              <p>Zaproszenie dla <strong>{selected?.display_name}</strong></p>
              <p>Proponowana kwota: <strong>{amountLabel(amount, currency)}</strong></p>
              <p>Wartość zlecenia: {amountLabel(wedding.price, currency)}</p>
            </div>
          ) : null}
          {error ? <p className={styles.error} role="alert">Nie udało się zapisać zaproszenia. Odśwież stan współpracy i spróbuj ponownie.</p> : null}
          <div className={styles.formActions}>
            {!review ? (
              <button type="button" className={styles.quietButton} disabled={!selected || amountInvalid} onClick={() => setReview(true)}>
                Sprawdź zaproszenie
              </button>
            ) : (
              <button type="button" className={styles.primaryButton} disabled={create.isPending} onClick={() => void sendInvitation().catch(() => undefined)}>
                {create.isPending ? 'Wysyłanie…' : 'Wyślij zaproszenie'}
              </button>
            )}
            <button type="button" className={styles.textButton} onClick={() => setOpen(false)}>Wróć</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
