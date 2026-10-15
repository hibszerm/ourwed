import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { CustomCapabilityGrant } from './accessManagementTypes'
import { CollaborationPermissionMatrix } from './CollaborationPermissionMatrix'
import { permissionPresetService, isPresetError } from './permissionPresetService'
import type { CollaborationPermissionPreset } from './permissionPresetTypes'
import {
  useArchiveCollaborationPermissionPreset,
  useCollaborationPermissionPresets,
  useCreateCollaborationPermissionPreset,
  useDuplicateCollaborationPermissionPreset,
  useUpdateCollaborationPermissionPreset,
} from './useCollaborationPermissionPresets'
import styles from './CollaborationPermissionPresetManager.module.css'
import { presetDescriptionError, presetNameError } from './permissionPresetValidation'

type Editor = {
  kind: 'create' | 'edit' | 'duplicate' | 'view'
  preset: CollaborationPermissionPreset | null
  name: string
  description: string
  grants: CustomCapabilityGrant[]
  latest?: CollaborationPermissionPreset
}

export function CollaborationPermissionPresetManager() {
  const presets = useCollaborationPermissionPresets()
  const create = useCreateCollaborationPermissionPreset()
  const update = useUpdateCollaborationPermissionPreset()
  const duplicate = useDuplicateCollaborationPermissionPreset()
  const archive = useArchiveCollaborationPermissionPreset()
  const [editor, setEditor] = useState<Editor | null>(null)
  const editorReturnFocus = useRef<HTMLButtonElement | null>(null)

  function closeEditor() {
    setEditor(null)
    window.setTimeout(() => {
      if (editorReturnFocus.current?.isConnected) editorReturnFocus.current.focus()
    }, 0)
  }
  const [archiveTarget, setArchiveTarget] = useState<CollaborationPermissionPreset | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [savingError, setSavingError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  function newPreset(trigger: HTMLButtonElement) {
    editorReturnFocus.current = trigger
    setSavingError('')
    setEditor({ kind: 'create', preset: null, name: '', description: '', grants: [] })
  }

  async function openPreset(presetId: string, kind: 'view' | 'edit' | 'duplicate', trigger?: HTMLButtonElement) {
    if (trigger) editorReturnFocus.current = trigger
    setBusyId(presetId); setLoadError(false); setSavingError('')
    try {
      const preset = await permissionPresetService.get(presetId)
      const copiedName = `Kopia ${preset.name}`
      setEditor({ kind, preset, name: kind === 'duplicate' ? Array.from(copiedName).slice(0, 80).join('') : preset.name,
        description: preset.description ?? '', grants: preset.grants.map((grant) => ({ ...grant })) })
    } catch {
      setLoadError(true)
      void presets.refetch()
    } finally { setBusyId(null) }
  }

  async function saveEditor() {
    if (!editor || nameError || descriptionError) return
    setSavingError('')
    const input = { name: editor.name, description: editor.description.trim() || null,
      grants: editor.grants.map((grant) => ({ ...grant })) }
    try {
      if (editor.kind === 'create') await create.mutateAsync(input)
      else if (editor.kind === 'duplicate' && editor.preset) {
        await duplicate.mutateAsync({ sourcePresetId: editor.preset.preset_id, name: input.name, description: input.description })
      } else if (editor.kind === 'edit' && editor.preset) {
        await update.mutateAsync({ presetId: editor.preset.preset_id, version: editor.preset.version, input })
      }
      closeEditor()
      await presets.refetch()
    } catch (error) {
      setSavingError(isPresetError(error, 'CONFLICT')
        ? 'Zestaw zmienił się w międzyczasie. Sprawdź aktualną wersję przed ponownym zapisaniem.'
        : isPresetError(error, 'VALIDATION_ERROR') ? 'Sprawdź nazwę, opis i zakres dostępu.'
          : isPresetError(error, 'FORBIDDEN') ? 'Nie można zmienić zestawu OurWed.'
            : 'Nie udało się zapisać zestawu. Wpisane dane pozostały w formularzu.')
      if (isPresetError(error, 'CONFLICT') && editor.preset) {
        try {
          const latest = await permissionPresetService.get(editor.preset.preset_id)
          setEditor((current) => current ? { ...current, latest } : current)
        } catch { /* keep draft */ }
      }
    }
  }

  function refreshVersionPreservingDraft() {
    if (!editor?.latest) return
    setEditor((current) => current?.latest ? { ...current, preset: current.latest, latest: undefined } : current)
    setSavingError('Aktualna wersja została wczytana. Twoje zmiany pozostały w formularzu; zapisz ponownie, aby je zastosować.')
  }

  async function archivePreset() {
    if (!archiveTarget) return
    try {
      await archive.mutateAsync({ presetId: archiveTarget.preset_id, version: archiveTarget.version })
      setArchiveTarget(null)
      await presets.refetch()
    } catch (error) {
      setSavingError(isPresetError(error, 'CONFLICT')
        ? 'Zestaw zmienił się w międzyczasie. Odśwież listę przed archiwizacją.'
        : 'Nie udało się zarchiwizować zestawu.')
    }
  }

  async function openArchive(presetId: string) {
    setBusyId(presetId); setLoadError(false); setSavingError('')
    try { setArchiveTarget(await permissionPresetService.get(presetId)) }
    catch { setLoadError(true); void presets.refetch() }
    finally { setBusyId(null) }
  }

  const system = presets.data?.filter((preset) => preset.scope === 'system') ?? []
  const mine = presets.data?.filter((preset) => preset.scope === 'user') ?? []
  const editorBusy = create.isPending || update.isPending || duplicate.isPending
  const nameError = editor && editor.kind !== 'view' ? presetNameError(editor.name) : ''
  const descriptionError = editor && editor.kind !== 'view' ? presetDescriptionError(editor.description) : ''

  return <>
    <section className={styles.manager} aria-label="Zestawy dostępu" data-testid="collaboration-permission-preset-manager">
      <div className={styles.actions}><button type="button" onClick={(event) => newPreset(event.currentTarget)}>Utwórz zestaw</button></div>
      <p className={styles.hint}>Zestawy pozwalają szybciej ustawić zakres dostępu przy zaproszeniu lub edycji współpracy.</p>
      {presets.isLoading ? <p role="status">Ładowanie zestawów…</p> : null}
      {presets.isError || loadError ? <div className={styles.error} role="alert">
        <p>Nie udało się wczytać zestawów. Możesz ponowić próbę lub utworzyć nowy zestaw.</p>
        <button type="button" onClick={() => { setLoadError(false); void presets.refetch() }}>Spróbuj ponownie</button>
      </div> : null}
      {system.length ? <div className={styles.group}><h3>Zestawy OurWed</h3>{system.map((preset) => <div className={styles.row} key={preset.preset_id}>
        <div className={styles.copy}><strong>{preset.name}</strong>{preset.description ? <small>{preset.description}</small> : null}</div>
        <div className={styles.rowActions}><button type="button" disabled={busyId !== null} onClick={(event) => void openPreset(preset.preset_id, 'view', event.currentTarget)}>Zobacz</button>
          <button type="button" disabled={busyId !== null} onClick={(event) => void openPreset(preset.preset_id, 'duplicate', event.currentTarget)}>Duplikuj</button></div>
      </div>)}</div> : null}
      <div className={styles.group}><h3>Moje zestawy</h3>
        {mine.map((preset) => <div className={styles.row} key={preset.preset_id}>
          <div className={styles.copy}><strong>{preset.name}</strong>{preset.description ? <small>{preset.description}</small> : null}</div>
          <div className={styles.rowActions}><button type="button" disabled={busyId !== null} onClick={(event) => void openPreset(preset.preset_id, 'edit', event.currentTarget)}>Edytuj</button>
            <button type="button" disabled={busyId !== null} onClick={(event) => void openPreset(preset.preset_id, 'duplicate', event.currentTarget)}>Duplikuj</button>
            <button type="button" className={styles.danger} disabled={busyId !== null}
              onClick={() => void openArchive(preset.preset_id)}>Archiwizuj</button></div>
        </div>)}
        {!presets.isLoading && mine.length === 0 ? <p className={styles.empty}>Nie masz jeszcze własnych zestawów.</p> : null}
      </div>
    </section>

    <Modal open={Boolean(editor)} title={editor?.kind === 'view' ? editor.preset?.name ?? 'Zestaw OurWed'
      : editor?.kind === 'edit' ? 'Edytuj zestaw' : editor?.kind === 'duplicate' ? 'Duplikuj zestaw' : 'Utwórz zestaw'}
      description={editor?.kind === 'edit' ? 'Zmiany w zestawie nie zmienią dostępu już zaproszonych osób.'
        : 'Zestawy obejmują zapisany zakres uprawnień. Nowe uprawnienia nie są dodawane automatycznie.'}
      onClose={closeEditor} showClose initialFocus="panel" size="md" hideFooter>
      {editor ? <div className={styles.form}>
        {editor.kind !== 'view' ? <>
          <label>Nazwa zestawu<input autoComplete="off" value={editor.name} aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'preset-name-error' : undefined}
            onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            {nameError ? <small id="preset-name-error" className={styles.error}>{nameError}</small> : null}</label>
          <label>Opis <span>(opcjonalnie)</span><textarea value={editor.description} aria-invalid={Boolean(descriptionError)}
            aria-describedby={descriptionError ? 'preset-description-error' : undefined}
            onChange={(event) => setEditor({ ...editor, description: event.target.value })} />
            {descriptionError ? <small id="preset-description-error" className={styles.error}>{descriptionError}</small> : null}</label>
        </> : <p className={styles.hint}>{editor.preset?.description}</p>}
        <p className={styles.matrixLegend}>Zakres dostępu</p>
        {editor.kind === 'duplicate' ? <p className={styles.hint}>
          Uprawnienia zostaną skopiowane dokładnie z wybranego zestawu. Po utworzeniu kopii możesz je edytować.
        </p> : null}
        <CollaborationPermissionMatrix grants={editor.grants} disabled={editor.kind === 'view' || editor.kind === 'duplicate'}
          onChange={(grants) => setEditor({ ...editor, grants })} />
        {savingError ? <p className={styles.error} role="alert">{savingError}</p> : null}
        {editor.latest ? <button type="button" onClick={refreshVersionPreservingDraft}>Wczytaj aktualną wersję, zachowując moje zmiany</button> : null}
        <div className={styles.actions}>
          <button type="button" onClick={closeEditor}>Zamknij</button>
          {editor.kind === 'view' && editor.preset ? <button type="button" onClick={() => void openPreset(editor.preset!.preset_id, 'duplicate')}>Duplikuj zestaw</button> : null}
          {editor.kind !== 'view' ? <button type="button" disabled={Boolean(nameError || descriptionError) || editorBusy}
            onClick={() => void saveEditor()}>{editorBusy ? 'Zapisywanie…' : 'Zapisz zestaw'}</button> : null}
        </div>
      </div> : null}
    </Modal>

    <Modal open={Boolean(archiveTarget)} title="Archiwizować zestaw?"
      description="Zestaw zniknie z listy, ale nie zmieni dostępu osób, którym wcześniej nadano uprawnienia."
      onClose={() => setArchiveTarget(null)} showClose initialFocus="panel" size="md" hideFooter>
      <div className={styles.actions}><button type="button" onClick={() => setArchiveTarget(null)}>Anuluj</button>
        <button type="button" disabled={archive.isPending} onClick={() => void archivePreset()}>
          {archive.isPending ? 'Archiwizowanie…' : 'Archiwizuj zestaw'}
        </button></div>
      {savingError ? <p className={styles.error} role="alert">{savingError}</p> : null}
    </Modal>
  </>
}
