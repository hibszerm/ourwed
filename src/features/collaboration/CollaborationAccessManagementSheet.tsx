import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CollaborationPermissionMatrix } from './CollaborationPermissionMatrix'
import { CollaborationPermissionPresetPicker } from './CollaborationPermissionPresetPicker'
import { SaveAccessAsPresetDialog } from './SaveAccessAsPresetDialog'
import { useInvitationAccessManagement, useMembershipAccessManagement, useUpdateCollaborationAccess } from './useWeddingCollaboration'
import { COLLABORATION_ROLE_CATALOG_V1, type CollaborationAccessModeV1, type CollaborationRoleKeyV1 } from './roleCatalog.v1'
import type { AccessConfigurationInput } from './weddingCollaborationService'
import type { CustomCapabilityGrant } from './accessManagementTypes'
import styles from './CollaborationAccessManagementSheet.module.css'

type Props = { weddingId: string; membershipId?: string; invitationId?: string; returnFocusTargetRef?: RefObject<HTMLElement | null>; onClose: () => void }
type Draft = { roleKey: CollaborationRoleKeyV1; customRoleLabel: string; accessMode: CollaborationAccessModeV1; grants: CustomCapabilityGrant[] }

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

function effectiveDraft(dto: NonNullable<ReturnType<typeof useMembershipAccessManagement>['data']>, fromMode: CollaborationAccessModeV1): CustomCapabilityGrant[] {
  const values = fromMode === 'custom' ? dto.custom_grants : fromMode === 'viewer' ? dto.viewer_preview : dto.editor_preview
  return values.map((item) => ({ capability_key: item.capability_key, level: item.level }))
}

export function CollaborationAccessManagementSheet({ weddingId, membershipId, invitationId, returnFocusTargetRef, onClose }: Props) {
  const returnFocusRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    returnFocusRef.current = returnFocusTargetRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  }, [returnFocusTargetRef])
  const pending = Boolean(invitationId)
  const membership = useMembershipAccessManagement(weddingId, membershipId ?? '')
  const invitation = useInvitationAccessManagement(weddingId, invitationId ?? '')
  const query = pending ? invitation : membership
  const mutation = useUpdateCollaborationAccess(weddingId, { membershipId, invitationId })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirtyClose, setDirtyClose] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [expectedVersion, setExpectedVersion] = useState<string | null>(null)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const initialDraft = useMemo(() => query.data ? ({ roleKey: query.data.role_key,
    customRoleLabel: query.data.custom_role_label ?? '', accessMode: query.data.access_mode,
    grants: query.data.custom_grants.map((grant) => ({ ...grant })) }) : null, [query.data])
  const displayDraft = draft ?? initialDraft
  const activeVersion = expectedVersion ?? (pending ? query.data?.configuration_revision : query.data?.access_version) ?? null

  const changed = useMemo(() => {
    const dto = query.data
    if (!dto || !displayDraft) return false
    const roleChanged = displayDraft.roleKey !== dto.role_key || (displayDraft.roleKey === 'custom' ? displayDraft.customRoleLabel : null) !== dto.custom_role_label
    const modeChanged = displayDraft.accessMode !== dto.access_mode
    const savedGrants = dto.access_mode === 'custom' ? dto.custom_grants : []
    const grantsChanged = displayDraft.accessMode === 'custom' && JSON.stringify(displayDraft.grants) !== JSON.stringify(savedGrants)
    return roleChanged || modeChanged || grantsChanged
  }, [query.data, displayDraft])
  const customRoleInvalid = Boolean(displayDraft?.roleKey === 'custom' && (
    !displayDraft.customRoleLabel.trim() || displayDraft.customRoleLabel !== displayDraft.customRoleLabel.trim()
    || Array.from(displayDraft.customRoleLabel).length > 64 || hasControlCharacters(displayDraft.customRoleLabel)
  ))

  function finishClose() {
    const target = returnFocusRef.current
    onClose()
    if (target) window.setTimeout(() => {
      if (target.isConnected) target.focus()
    }, 0)
  }

  function chooseMode(mode: CollaborationAccessModeV1) {
    const dto = query.data
    if (!dto || !displayDraft) return
    setDraft({ ...displayDraft, accessMode: mode,
      grants: mode === 'custom' && displayDraft.accessMode !== 'custom' ? effectiveDraft(dto, displayDraft.accessMode) : displayDraft.grants })
  }

  async function save() {
    if (!displayDraft || !query.data || !changed || !activeVersion) return
    const configuration: AccessConfigurationInput = {
      roleKey: displayDraft.roleKey,
      customRoleLabel: displayDraft.roleKey === 'custom' ? displayDraft.customRoleLabel : null,
      accessMode: displayDraft.accessMode,
      customGrants: displayDraft.accessMode === 'custom' ? displayDraft.grants : null,
    }
    try {
      await mutation.mutateAsync({ version: activeVersion, configuration })
      finishClose()
    } catch (error) {
      if (error instanceof Error && error.message === 'CONFLICT') {
        setConflict(true)
        await query.refetch()
      }
    }
  }

  const close = () => {
    if (changed) { setDirtyClose(true); return }
    finishClose()
  }

  return <>
    <Modal open title="Zarządzaj dostępem" description={pending ? 'Zaproszenie do zlecenia' : 'Dostęp do zlecenia'}
      onClose={close} onCancel={close} cancelLabel="Anuluj" hideFooter showClose initialFocus="panel" size="md">
      {query.isLoading ? <p>Ładowanie aktualnych ustawień…</p> : null}
      {query.isError ? <p className={styles.error} role="alert">Nie udało się pobrać aktualnych ustawień dostępu.</p> : null}
      {displayDraft && query.data ? <div className={styles.content}>
        <label className={styles.label}>Rola przy tym zleceniu
          <select value={displayDraft.roleKey} onChange={(event) => setDraft({ ...displayDraft, roleKey: event.target.value as CollaborationRoleKeyV1,
            customRoleLabel: event.target.value === 'custom' ? displayDraft.customRoleLabel : '' })}>
            {COLLABORATION_ROLE_CATALOG_V1.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
          </select>
        </label>
        {displayDraft.roleKey === 'custom' ? <label className={styles.label}>Nazwa roli
          <input maxLength={64} value={displayDraft.customRoleLabel} onChange={(event) => setDraft({ ...displayDraft, customRoleLabel: event.target.value })}/>
        </label> : null}
        <fieldset className={styles.fieldset}><legend>Zakres dostępu</legend>
          {([
            ['viewer', 'Tylko podgląd', 'Może przeglądać udostępnione obszary.'],
            ['editor', 'Pełna edycja', 'Może edytować obecnie dostępne obszary. Nie obejmuje ustawień właściciela.'],
            ['custom', 'Niestandardowe', ''],
          ] as const).map(([mode, label, description]) => <label className={styles.mode} key={mode}>
            <input type="radio" name="collaboration-access-mode" value={mode} checked={displayDraft.accessMode === mode}
              onChange={() => chooseMode(mode)} />
            <span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
          </label>)}
        </fieldset>
        {displayDraft.accessMode === 'custom' ? <fieldset className={styles.fieldset}>
          <legend>Wybierz, do czego ta osoba ma dostęp.</legend>
          <CollaborationPermissionPresetPicker onApply={(grants) => setDraft({ ...displayDraft, accessMode: 'custom', grants })} />
          <CollaborationPermissionMatrix grants={displayDraft.grants}
            onChange={(grants) => setDraft({ ...displayDraft, grants })} />
          <button type="button" className={styles.cancel} onClick={() => setSaveAsOpen(true)}>Zapisz jako zestaw</button>
        </fieldset> : null}
        {conflict ? <div className={styles.notice} role="alert">
          <p>Dostęp zmienił się w międzyczasie. Sprawdź aktualne ustawienia przed ponownym zapisem.</p>
          <button type="button" onClick={() => { const current = query.data; setExpectedVersion(pending ? current.configuration_revision ?? '1' : current.access_version ?? '1'); setConflict(false) }}>Użyj aktualnej wersji</button>
        </div> : null}
        {mutation.error && !conflict ? <p className={styles.error} role="alert">Nie udało się zapisać zmian. Twoje ustawienia pozostają w formularzu.</p> : null}
        <div className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={close}>Anuluj</button>
          <button type="button" className={styles.save} disabled={!changed || mutation.isPending || conflict || customRoleInvalid}
            onClick={() => void save()}>{mutation.isPending ? 'Zapisywanie…' : 'Zapisz dostęp'}</button>
        </div>
      </div> : null}
    </Modal>
    <Modal open={dirtyClose} title="Niezapisane zmiany" description="Ustawienia nie zostały zapisane."
      onClose={() => setDirtyClose(false)} hideFooter initialFocus="panel" size="md">
      <div className={styles.confirmActions}>
        <button type="button" onClick={() => setDirtyClose(false)}>Wróć do edycji</button>
        <button type="button" onClick={finishClose}>Odrzuć zmiany</button>
      </div>
    </Modal>
    {displayDraft?.accessMode === 'custom' ? <SaveAccessAsPresetDialog open={saveAsOpen}
      grants={displayDraft.grants} onClose={() => setSaveAsOpen(false)} /> : null}
  </>
}
