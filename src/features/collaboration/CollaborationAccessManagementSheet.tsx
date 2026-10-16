import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CollaborationAreaMatrixV3 } from './CollaborationAreaMatrixV3'
import { CollaborationPermissionPresetPicker } from './CollaborationPermissionPresetPicker'
import { SaveAccessAsPresetDialog } from './SaveAccessAsPresetDialog'
import { useInvitationAccessManagement, useMembershipAccessManagement, useUpdateCollaborationAccess } from './useWeddingCollaboration'
import { COLLABORATION_ROLE_CATALOG_V1, type CollaborationRoleKeyV1 } from './roleCatalog.v1'
import { areaDefaultsForMode, type CollaborationAccessMode, type CollaborationAreaAccess } from './areaAccessV3'
import type { AccessConfigurationInput } from './weddingCollaborationService'
import styles from './CollaborationAccessManagementSheet.module.css'

type Props = { weddingId: string; membershipId?: string; invitationId?: string; returnFocusTargetRef?: RefObject<HTMLElement | null>; onClose: () => void }
type Draft = { roleKey: CollaborationRoleKeyV1; customRoleLabel: string; accessMode: CollaborationAccessMode; areas: CollaborationAreaAccess }

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
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
    areas: { ...query.data.configured_areas } }) : null, [query.data])
  const displayDraft = draft ?? initialDraft
  const activeVersion = expectedVersion ?? (pending ? query.data?.configuration_revision : query.data?.access_version) ?? null
  const changed = useMemo(() => {
    if (!query.data || !displayDraft) return false
    const roleChanged = displayDraft.roleKey !== query.data.role_key
      || (displayDraft.roleKey === 'custom' ? displayDraft.customRoleLabel : null) !== query.data.custom_role_label
    const modeChanged = displayDraft.accessMode !== query.data.access_mode
    const areasChanged = displayDraft.accessMode === 'custom'
      && JSON.stringify(displayDraft.areas) !== JSON.stringify(query.data.configured_areas)
    return roleChanged || modeChanged || areasChanged
  }, [query.data, displayDraft])
  const customRoleInvalid = Boolean(displayDraft?.roleKey === 'custom' && (
    !displayDraft.customRoleLabel.trim() || displayDraft.customRoleLabel !== displayDraft.customRoleLabel.trim()
    || Array.from(displayDraft.customRoleLabel).length > 64 || hasControlCharacters(displayDraft.customRoleLabel)
  ))

  function finishClose() {
    const target = returnFocusRef.current
    onClose()
    if (target) window.setTimeout(() => { if (target.isConnected) target.focus() }, 0)
  }

  function chooseMode(mode: CollaborationAccessMode) {
    if (!displayDraft) return
    const defaults = areaDefaultsForMode(mode)
    setDraft({ ...displayDraft, accessMode: mode, areas: defaults ?? displayDraft.areas })
  }

  async function save() {
    if (!displayDraft || !query.data || !changed || !activeVersion) return
    const configuration: AccessConfigurationInput = {
      roleKey: displayDraft.roleKey,
      customRoleLabel: displayDraft.roleKey === 'custom' ? displayDraft.customRoleLabel : null,
      accessMode: displayDraft.accessMode,
      customAreas: displayDraft.areas,
    }
    try {
      await mutation.mutateAsync({ version: activeVersion, configuration })
      finishClose()
    } catch (error) {
      if (error instanceof Error && error.message === 'CONFLICT') { setConflict(true); await query.refetch() }
    }
  }

  const close = () => { if (changed) setDirtyClose(true); else finishClose() }

  return <>
    <Modal open title="Zarządzaj dostępem" description={pending ? 'Zaproszenie do zlecenia' : 'Dostęp do zlecenia'}
      onClose={close} onCancel={close} cancelLabel="Anuluj" hideFooter showClose initialFocus="panel" size="md">
      {query.isLoading ? <p>Ładowanie aktualnych ustawień…</p> : null}
      {query.isError ? <p className={styles.error} role="alert">Nie udało się pobrać aktualnych ustawień dostępu.</p> : null}
      {displayDraft && query.data ? <div className={styles.content}>
        <label className={styles.label}>Rola przy tym zleceniu
          <select value={displayDraft.roleKey} onChange={(event) => setDraft({ ...displayDraft,
            roleKey: event.target.value as CollaborationRoleKeyV1,
            customRoleLabel: event.target.value === 'custom' ? displayDraft.customRoleLabel : '' })}>
            {COLLABORATION_ROLE_CATALOG_V1.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
          </select>
        </label>
        {displayDraft.roleKey === 'custom' ? <label className={styles.label}>Nazwa roli
          <input maxLength={64} value={displayDraft.customRoleLabel} onChange={(event) => setDraft({ ...displayDraft, customRoleLabel: event.target.value })}/>
        </label> : null}
        <fieldset className={styles.fieldset}><legend>Dostęp</legend>
          {([['viewer','Podgląd'],['editor','Edycja'],['custom','Własny']] as const).map(([mode,label]) =>
            <label className={styles.mode} key={mode}><input type="radio" name="collaboration-access-mode" value={mode}
              checked={displayDraft.accessMode === mode} onChange={() => chooseMode(mode)} /><span><strong>{label}</strong></span></label>)}
        </fieldset>
        {displayDraft.accessMode === 'custom' ? <fieldset className={styles.fieldset}>
          <legend>Wybierz dostęp do obszarów</legend>
          <CollaborationPermissionPresetPicker onApply={(areas) => setDraft({ ...displayDraft, accessMode: 'custom', areas })} />
          <CollaborationAreaMatrixV3 areas={displayDraft.areas} onChange={(areas) => setDraft({ ...displayDraft, areas })} />
          <button type="button" className={styles.cancel} onClick={() => setSaveAsOpen(true)}>Zapisz jako zestaw</button>
        </fieldset> : null}
        {conflict ? <div className={styles.notice} role="alert"><p>Dostęp zmienił się w międzyczasie. Sprawdź aktualne ustawienia przed ponownym zapisem.</p>
          <button type="button" onClick={() => { const current = query.data; setExpectedVersion(pending ? current.configuration_revision ?? '1' : current.access_version ?? '1'); setConflict(false) }}>Użyj aktualnej wersji</button>
        </div> : null}
        {mutation.error && !conflict ? <p className={styles.error} role="alert">Nie udało się zapisać zmian. Twoje ustawienia pozostają w formularzu.</p> : null}
        <div className={styles.footer}><button type="button" className={styles.cancel} onClick={close}>Anuluj</button>
          <button type="button" className={styles.save} disabled={!changed || mutation.isPending || conflict || customRoleInvalid}
            onClick={() => void save()}>{mutation.isPending ? 'Zapisywanie…' : 'Zapisz dostęp'}</button></div>
      </div> : null}
    </Modal>
    <Modal open={dirtyClose} title="Niezapisane zmiany" description="Ustawienia nie zostały zapisane."
      onClose={() => setDirtyClose(false)} hideFooter initialFocus="panel" size="md"><div className={styles.confirmActions}>
      <button type="button" onClick={() => setDirtyClose(false)}>Wróć do edycji</button><button type="button" onClick={finishClose}>Odrzuć zmiany</button>
    </div></Modal>
    {displayDraft?.accessMode === 'custom' ? <SaveAccessAsPresetDialog open={saveAsOpen}
      areas={displayDraft.areas} onClose={() => setSaveAsOpen(false)} /> : null}
  </>
}
