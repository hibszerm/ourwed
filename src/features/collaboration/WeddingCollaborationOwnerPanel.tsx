import { useRef, useState, type KeyboardEvent } from 'react'
import { CollaborationAccessManagementSheet } from '@/features/collaboration/CollaborationAccessManagementSheet'
import { COLLABORATION_ROLE_CATALOG_V1, type CollaborationAccessModeV1, type CollaborationRoleKeyV1 } from '@/features/collaboration/roleCatalog.v1'
import type { CustomCapabilityGrant } from '@/features/collaboration/accessManagementTypes'
import { useActiveWeddingCollaborators, useCreateWeddingInvitation, useWeddingCollaborationState, useWeddingAccessPreviews, useWeddingInvitationCommand, useWeddingMembershipCommand } from '@/features/collaboration/useWeddingCollaboration'
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

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

export function WeddingCollaborationOwnerPanel({ wedding }: { wedding: Wedding }) {
  const [open, setOpen] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [review, setReview] = useState(false)
  const [roleKey, setRoleKey] = useState<CollaborationRoleKeyV1>('unspecified')
  const [customRoleLabel, setCustomRoleLabel] = useState('')
  const [accessMode, setAccessMode] = useState<CollaborationAccessModeV1 | null>(null)
  const [customGrants, setCustomGrants] = useState<CustomCapabilityGrant[]>([])
  const [managementTarget, setManagementTarget] = useState<{ membershipId?: string; invitationId?: string } | null>(null)
  const managementTriggerRef = useRef<HTMLButtonElement | null>(null)
  const state = useWeddingCollaborationState(wedding.id)
  const accessPreviews = useWeddingAccessPreviews(wedding.id, open)
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
  const selected = available.find((connection) => connection.id === selectedConnectionId)
  const customRoleInvalid = roleKey === 'custom' && (!customRoleLabel.trim()
    || customRoleLabel !== customRoleLabel.trim() || Array.from(customRoleLabel).length > 64 || hasControlCharacters(customRoleLabel))
  const error = create.error ?? cancel.error ?? revoke.error

  function setInviteGroupLevel(keys: readonly string[], level: number) {
    const keySet = new Set(keys)
    const remaining = customGrants.filter((grant) => !keySet.has(grant.capability_key))
    const grants = level === 0 ? [] : keys.map((capability_key) => ({ capability_key: capability_key as CustomCapabilityGrant['capability_key'], level: level as 1 | 2 }))
    setCustomGrants([...remaining, ...grants].sort((a, b) => a.capability_key.localeCompare(b.capability_key)))
    setReview(false)
  }

  function handleInviteGroupKey(event: KeyboardEvent<HTMLButtonElement>, keys: readonly string[], levels: readonly number[], current: number) {
    const index = Math.max(0, levels.indexOf(current))
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % levels.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + levels.length - 1) % levels.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? levels.length - 1 : -1
    if (next < 0) return
    event.preventDefault()
    setInviteGroupLevel(keys, levels[next])
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  async function sendInvitation() {
    if (!selected || amountInvalid) return
    if (!accessMode) return
    await create.mutateAsync({ connectionId: selected.id, amount, configuration: {
      roleKey, customRoleLabel: roleKey === 'custom' ? customRoleLabel : null, accessMode,
      customGrants: accessMode === 'custom' ? customGrants : null,
    } })
    setSelectedConnectionId('')
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
              {invite.status === 'pending' ? <button type="button" className={styles.textButton}
                onClick={(event) => { managementTriggerRef.current = event.currentTarget; setManagementTarget({ invitationId: invite.invitation_id }) }}>Zarządzaj dostępem</button> : null}
              {invite.membership_id && invite.membership_status === 'active' ? <button type="button" className={styles.textButton}
                onClick={(event) => { managementTriggerRef.current = event.currentTarget; setManagementTarget({ membershipId: invite.membership_id! }) }}>Zarządzaj dostępem</button> : null}
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
              value={selectedConnectionId}
              onChange={(event) => { setSelectedConnectionId(event.target.value); setReview(false) }}
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
          <label className={styles.field}><span>Rola przy tym zleceniu</span>
            <select value={roleKey} onChange={(event) => { const value = event.target.value as CollaborationRoleKeyV1; setRoleKey(value); if (value !== 'custom') setCustomRoleLabel(''); setReview(false) }}>
              {COLLABORATION_ROLE_CATALOG_V1.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
            </select>
          </label>
          {roleKey === 'custom' ? <label className={styles.field}><span>Nazwa roli</span>
            <input maxLength={64} value={customRoleLabel} onChange={(event) => { setCustomRoleLabel(event.target.value); setReview(false) }} />
          </label> : null}
          <fieldset className={styles.accessChoice}><legend>Zakres dostępu</legend>
            {([
              ['viewer', 'Tylko podgląd', 'Może przeglądać udostępnione obszary.'],
              ['editor', 'Pełna edycja', 'Może edytować obecnie dostępne obszary. Nie obejmuje ustawień właściciela.'],
              ['custom', 'Niestandardowe', ''],
            ] as const).map(([mode, label, description]) => <label key={mode}>
                <input type="radio" name={`invite-access-${wedding.id}`} checked={accessMode === mode}
                  disabled={mode === 'custom' && !accessPreviews.data}
                  onChange={() => {
                if (mode === 'custom' && accessMode !== 'custom' && accessPreviews.data) {
                  const source = accessMode === 'editor' ? accessPreviews.data.editor_preview : accessPreviews.data.viewer_preview
                  setCustomGrants(source.map((grant) => ({ ...grant })))
                }
                setAccessMode(mode)
                setReview(false)
              }} />
              <span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
            </label>)}
          </fieldset>
          {accessPreviews.isLoading ? <p className={styles.muted} role="status" aria-live="polite">Ładowanie bezpiecznych ustawień dostępu…</p> : null}
          {accessPreviews.isError ? <p className={styles.error} role="alert">Nie udało się pobrać podglądu uprawnień dla ustawienia niestandardowego.
            <button type="button" className={styles.textButton} onClick={() => void accessPreviews.refetch()}>Spróbuj ponownie</button>
          </p> : null}
          {accessMode === 'custom' ? <div className={styles.inviteMatrix}>
            {([
              { label: 'Podstawowe informacje', keys: ['wedding.identity'] as const, values: [0, 1] as const },
              { label: 'Miejsca i godziny', keys: ['places.address', 'schedule.operational_time'] as const, values: [0, 1, 2] as const },
            ]).map((group) => {
              const levels = group.keys.map((key) => customGrants.find((grant) => grant.capability_key === key)?.level ?? 0)
              const current = levels.every((value) => value === levels[0]) ? levels[0] : -1
              return <div className={styles.inviteMatrixRow} key={group.label}><span>{group.label}</span>
                <div className={styles.segment} role="radiogroup" aria-label={group.label}>
                  {group.values.map((level) => <button key={level} type="button" role="radio" aria-checked={current === level}
                    tabIndex={current === level || (current === -1 && level === group.values[0]) ? 0 : -1}
                    className={current === level ? styles.segmentSelected : ''} onClick={() => setInviteGroupLevel(group.keys, level)}
                    onKeyDown={(event) => handleInviteGroupKey(event, group.keys, group.values, current)}>{level === 0 ? 'Brak' : level === 1 ? 'Podgląd' : 'Edycja'}</button>)}
                </div>
                {current === -1 ? <small>Różne poziomy</small> : null}
              </div>
            })}
          </div> : null}
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
              <p>Rola: <strong>{roleKey === 'custom' ? customRoleLabel : COLLABORATION_ROLE_CATALOG_V1.find((role) => role.key === roleKey)?.label}</strong></p>
              <p>Dostęp: <strong>{accessMode === 'viewer' ? 'Tylko podgląd' : accessMode === 'editor' ? 'Pełna edycja' : 'Niestandardowe'}</strong></p>
              <p>Proponowana kwota: <strong>{amountLabel(amount, currency)}</strong></p>
              <p>Wartość zlecenia: {amountLabel(wedding.price, currency)}</p>
            </div>
          ) : null}
          {error ? <p className={styles.error} role="alert">Nie udało się zapisać zaproszenia. Odśwież stan współpracy i spróbuj ponownie.</p> : null}
          <div className={styles.formActions}>
            {!review ? (
              <button type="button" className={styles.quietButton} disabled={!selected || !accessMode || amountInvalid || customRoleInvalid} onClick={() => setReview(true)}>
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
      {managementTarget ? <CollaborationAccessManagementSheet weddingId={wedding.id} {...managementTarget} returnFocusTargetRef={managementTriggerRef}
        onClose={() => setManagementTarget(null)} /> : null}
    </section>
  )
}
