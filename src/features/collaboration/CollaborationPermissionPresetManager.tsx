import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Copy, Eye, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import { Modal } from '@/components/ui/Modal'
import { CollaborationAreaMatrixV3 } from './CollaborationAreaMatrixV3'
import { COLLABORATION_AREA_OPTIONS, VIEWER_AREA_DEFAULTS, type CollaborationAreaAccess } from './areaAccessV3'
import { permissionPresetService, isPresetError } from './permissionPresetService'
import type { CollaborationPermissionPreset, CollaborationPermissionPresetListItem } from './permissionPresetTypes'
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
  areas: CollaborationAreaAccess
  latest?: CollaborationPermissionPreset
}

const MENU_OPTIONS = { gap: 4, minMenuWidth: 188, maxMenuWidth: 220, align: 'end' as const,
  forceAnchored: true, maxMenuHeight: 176, minSpace: 180, padding: 8 }
const LEVEL_NAMES = ['Brak', 'Podgląd', 'Edycja'] as const

export function CollaborationPermissionPresetManager() {
  const presets = useCollaborationPermissionPresets()
  const create = useCreateCollaborationPermissionPreset()
  const update = useUpdateCollaborationPermissionPreset()
  const duplicate = useDuplicateCollaborationPermissionPreset()
  const archive = useArchiveCollaborationPermissionPreset()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [areaDetails, setAreaDetails] = useState<Record<string, CollaborationAreaAccess>>({})
  const editorReturnFocus = useRef<HTMLElement | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<CollaborationPermissionPreset | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [savingError, setSavingError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [nameTouched, setNameTouched] = useState(false)
  const [nameSubmitted, setNameSubmitted] = useState(false)
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [descriptionSubmitted, setDescriptionSubmitted] = useState(false)

  function closeEditor() {
    setEditor(null)
    window.setTimeout(() => {
      if (editorReturnFocus.current?.isConnected) editorReturnFocus.current.focus()
    }, 0)
  }

  useEffect(() => {
    let active = true
    const items = presets.data ?? []
    void Promise.all(items.map(async (item) => {
      try { return [item.preset_id, (await permissionPresetService.get(item.preset_id)).areas] as const }
      catch { return null }
    })).then((entries) => {
      if (!active) return
      setAreaDetails(Object.fromEntries(entries.filter((entry): entry is readonly [string, CollaborationAreaAccess] => entry !== null)))
    })
    return () => { active = false }
  }, [presets.data])

  function newPreset(trigger: HTMLElement) {
    editorReturnFocus.current = trigger
    setSavingError('')
    setNameTouched(false)
    setNameSubmitted(false)
    setDescriptionTouched(false)
    setDescriptionSubmitted(false)
    setEditor({ kind: 'create', preset: null, name: '', description: '', areas: { ...VIEWER_AREA_DEFAULTS } })
  }

  async function openPreset(presetId: string, kind: 'view' | 'edit' | 'duplicate', trigger?: HTMLElement) {
    if (trigger) editorReturnFocus.current = trigger
    setBusyId(presetId); setLoadError(false); setSavingError('')
    setNameTouched(false); setNameSubmitted(false)
    setDescriptionTouched(false); setDescriptionSubmitted(false)
    try {
      const preset = await permissionPresetService.get(presetId)
      const copiedName = `Kopia ${preset.name}`
      setEditor({ kind, preset, name: kind === 'duplicate' ? Array.from(copiedName).slice(0, 80).join('') : preset.name,
        description: preset.description ?? '', areas: { ...preset.areas } })
    } catch {
      setLoadError(true)
      void presets.refetch()
    } finally { setBusyId(null) }
  }

  async function saveEditor() {
    if (!editor) return
    setNameSubmitted(true)
    setDescriptionSubmitted(true)
    const nameValidationError = editor.kind !== 'view' ? presetNameError(editor.name) : ''
    const descriptionValidation = editor.kind !== 'view' ? presetDescriptionError(editor.description) : ''
    if (nameValidationError || descriptionValidation) return
    setSavingError('')
    const input = { name: editor.name, description: editor.description.trim() || null,
      areas: { ...editor.areas } }
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
  const rawNameError = editor && editor.kind !== 'view' ? presetNameError(editor.name) : ''
  const visibleNameError = nameTouched || nameSubmitted ? rawNameError : ''
  const rawDescriptionError = editor && editor.kind !== 'view' ? presetDescriptionError(editor.description) : ''
  const visibleDescriptionError = descriptionTouched || descriptionSubmitted ? rawDescriptionError : ''

  function displayName(preset: CollaborationPermissionPresetListItem) {
    if (preset.scope !== 'system') return preset.name
    if (preset.name === 'Edycja') return 'Pełna edycja'
    if (preset.name === 'Podgląd') return 'Tylko podgląd'
    return preset.name
  }

  function summary(areas: CollaborationAreaAccess | undefined, preset: CollaborationPermissionPresetListItem) {
    const name = displayName(preset)
    if (preset.scope === 'system' && name === 'Tylko podgląd') return 'Podgląd 5 obszarów · Rozliczenie wyłączone'
    if (preset.scope === 'system' && name === 'Pełna edycja') return 'Edycja 5 obszarów · Rozliczenie wyłączone'
    if (!areas) return 'Zapisany własny zakres dostępu'
    const counts = [0, 1, 2].map((level) => COLLABORATION_AREA_OPTIONS.filter(({ key }) => areas[key] === level).length)
    return `Edycja ${counts[2]} · Podgląd ${counts[1]} · Brak ${counts[0]}`
  }

  return <>
    <section id="zestawy-dostepu" className={styles.manager} aria-labelledby="access-presets-heading" data-testid="collaboration-permission-preset-manager">
      <header className={styles.sectionHeader}>
        <div><h2 id="access-presets-heading">Zestawy dostępu</h2>
          <p>Przygotuj gotowe ustawienia, których możesz używać przy zapraszaniu osoby do konkretnego zlecenia.</p></div>
      </header>
      <Card padding="sm" className={styles.presetCard}>
        {presets.isLoading ? <p className={styles.status} role="status">Ładowanie zestawów…</p> : null}
        {presets.isError || loadError ? <div className={styles.error} role="alert">
          <p>Nie udało się wczytać zestawów. Możesz ponowić próbę lub utworzyć nowy zestaw.</p>
          <button type="button" onClick={() => { setLoadError(false); void presets.refetch() }}>Spróbuj ponownie</button>
        </div> : null}
        <PresetGroup title="Domyślne" action={<Button className={styles.createButton} type="button"
          variant="secondary" size="sm" onClick={(event) => newPreset(event.currentTarget)}>Nowy zestaw</Button>}>
          {system.map((preset) => <PresetRow key={preset.preset_id} preset={preset} displayName={displayName(preset)}
            summary={summary(areaDetails[preset.preset_id], preset)} tone={preset.name === 'Edycja' ? 'edit' : 'view'}
            busy={busyId !== null} onOpen={(trigger) => void openPreset(preset.preset_id, 'view', trigger)}
            onDuplicate={(trigger) => void openPreset(preset.preset_id, 'duplicate', trigger)} />)}
        </PresetGroup>
        <PresetGroup title="Własne">
          {mine.map((preset) => <PresetRow key={preset.preset_id} preset={preset} displayName={displayName(preset)}
            summary={summary(areaDetails[preset.preset_id], preset)} tone="custom" busy={busyId !== null}
            onOpen={(trigger) => void openPreset(preset.preset_id, 'edit', trigger)}
            onDuplicate={(trigger) => void openPreset(preset.preset_id, 'duplicate', trigger)}
            onArchive={() => void openArchive(preset.preset_id)} />)}
          {!presets.isLoading && mine.length === 0 ? <p className={styles.empty}>Nie masz jeszcze własnych zestawów.</p> : null}
        </PresetGroup>
      </Card>
    </section>

    <Modal open={Boolean(editor)} title={editor?.kind === 'view' ? editor.preset?.name ?? 'Zestaw domyślny'
      : editor?.kind === 'edit' ? 'Edytuj zestaw dostępu' : editor?.kind === 'duplicate' ? 'Duplikuj zestaw' : 'Nowy zestaw dostępu'}
      description={editor?.kind === 'view' ? undefined : editor?.kind === 'create'
        ? 'Zapisz konfigurację, której możesz później używać przy zapraszaniu osoby do konkretnego zlecenia.'
        : editor?.kind === 'edit' ? 'Zmiany w zestawie nie zmienią dostępu już zaproszonych osób.'
          : 'Utwórz własny zestaw na podstawie wybranej konfiguracji.'}
      onClose={closeEditor} showClose initialFocus="panel" size={editor?.kind === 'view' ? 'md' : 'lg'} mobilePresentation="center"
      panelClassName={editor?.kind === 'view' ? styles.previewModalPanel : styles.editorModalPanel}
      busy={editorBusy}
      cancelLabel={editor?.kind === 'view' ? 'Zamknij' : 'Anuluj'}
      primaryAction={editor?.kind === 'view' && editor.preset ? <Button type="button" variant="primary"
        onClick={() => void openPreset(editor.preset!.preset_id, 'duplicate')}>Duplikuj zestaw</Button>
        : editor && editor.kind !== 'view' ? <Button type="button" variant="primary" disabled={editorBusy} onClick={() => void saveEditor()}>
          {editorBusy ? 'Zapisywanie…' : editor.kind === 'edit' ? 'Zapisz zmiany' : 'Zapisz zestaw'}
        </Button> : undefined}>
      {editor ? editor.kind === 'view' ? <PresetPreview editor={editor} /> : <div className={styles.form}>
        <label className={styles.nameField}>Nazwa zestawu<input autoComplete="off" value={editor.name}
          placeholder="Drugi fotograf" aria-invalid={Boolean(visibleNameError)}
          aria-describedby={visibleNameError ? 'preset-name-error' : undefined}
          onChange={(event) => setEditor({ ...editor, name: event.target.value })}
          onBlur={() => setNameTouched(true)} />
          {visibleNameError ? <small id="preset-name-error" className={styles.fieldError}>{visibleNameError}</small> : null}
        </label>
        <details className={styles.descriptionDetails} open={Boolean(editor.description)}>
          <summary>Opis <span>(opcjonalnie)</span></summary>
          <label className={styles.descriptionField}><textarea value={editor.description}
            aria-label="Opis zestawu" aria-invalid={Boolean(visibleDescriptionError)}
            aria-describedby={visibleDescriptionError ? 'preset-description-error' : undefined}
            onChange={(event) => setEditor({ ...editor, description: event.target.value })}
            onBlur={() => setDescriptionTouched(true)} />
            {visibleDescriptionError ? <small id="preset-description-error" className={styles.fieldError}>{visibleDescriptionError}</small> : null}
          </label>
        </details>
        <section className={styles.accessSection} aria-labelledby="preset-access-heading">
          <h3 id="preset-access-heading">Dostęp do zlecenia</h3>
          {editor.kind === 'duplicate' ? <>
            <p className={styles.duplicateHint}>Zakres zostanie skopiowany z wybranego zestawu. Po utworzeniu kopii możesz go edytować.</p>
            <PresetAccessValues areas={editor.areas} />
          </> : <CollaborationAreaMatrixV3 variant="premium" areas={editor.areas}
            onChange={(areas) => setEditor({ ...editor, areas })} />}
        </section>
        {savingError ? <p className={styles.errorMessage} role="alert">{savingError}</p> : null}
        {editor.latest ? <button type="button" className={styles.refreshVersion} onClick={refreshVersionPreservingDraft}>
          Wczytaj aktualną wersję, zachowując moje zmiany</button> : null}
      </div> : null}
    </Modal>

    <Modal open={Boolean(archiveTarget)} title="Zarchiwizować zestaw?"
      description="Zestaw zniknie z listy, ale nie zmieni dostępu osób, którym wcześniej nadano uprawnienia."
      onClose={() => setArchiveTarget(null)} showClose initialFocus="panel" size="md" mobilePresentation="center"
      busy={archive.isPending} primaryAction={<Button type="button" variant="danger" disabled={archive.isPending} onClick={() => void archivePreset()}>
        {archive.isPending ? 'Archiwizowanie…' : 'Archiwizuj zestaw'}
      </Button>}>
      <p className={styles.archiveName}>{archiveTarget?.name}</p>
      {savingError ? <p className={styles.errorMessage} role="alert">{savingError}</p> : null}
    </Modal>
  </>
}

export function PresetGroup({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className={styles.group} aria-label={title}>
    <header className={styles.groupHeader}>
      <h3>{title}</h3>
      {action ?? <span className={styles.groupActionSpacer} aria-hidden="true" />}
    </header>
    <div className={styles.rows}>{children}</div>
  </section>
}

function PresetRow({ preset, displayName, summary, tone, busy, onOpen, onDuplicate, onArchive }: {
  preset: CollaborationPermissionPresetListItem
  displayName: string
  summary: string
  tone: 'view' | 'edit' | 'custom'
  busy: boolean
  onOpen: (trigger: HTMLElement) => void
  onDuplicate: (trigger: HTMLElement) => void
  onArchive?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!menuOpen) return
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  function dismissMenu() {
    setMenuOpen(false)
    triggerRef.current?.focus()
  }

  function duplicate() {
    dismissMenu()
    onDuplicate(triggerRef.current ?? document.body)
  }

  function edit() {
    dismissMenu()
    onOpen(triggerRef.current ?? document.body)
  }

  function archive() {
    dismissMenu()
    onArchive?.()
  }

  const openLabel = tone === 'custom' ? 'Edytuj' : 'Otwórz'

  return <div className={styles.row} data-testid={`preset-row-${preset.preset_id}`}>
    <button type="button" className={styles.rowOpen} disabled={busy}
      aria-label={`${openLabel} zestaw ${displayName}`}
      onClick={(event) => onOpen(event.currentTarget)}>
      <span className={styles.copy}><strong>{displayName}</strong><small>{summary}</small></span>
      <ChevronRight className={styles.chevron} size={18} strokeWidth={1.7} aria-hidden="true" />
    </button>
    <button ref={triggerRef} type="button" className={styles.menuTrigger} aria-label={`Więcej działań dla zestawu ${displayName}`}
      aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} disabled={busy}
      onClick={() => setMenuOpen((open) => !open)}>
      <MoreHorizontal size={18} strokeWidth={1.8} aria-hidden="true" />
    </button>
    <FloatingPortal open={menuOpen} anchorRef={triggerRef} options={MENU_OPTIONS}>
      {() => <div ref={menuRef} id={menuId} className={styles.menuPanel} role="menu" aria-label={`Działania: ${displayName}`}>
        {onArchive ? <>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={edit}><Pencil size={16} aria-hidden="true" />Edytuj zestaw</button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={duplicate}><Copy size={16} aria-hidden="true" />Duplikuj zestaw</button>
          <div className={styles.menuDivider} />
          <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={archive}>
            <Trash2 size={16} aria-hidden="true" />Archiwizuj zestaw</button>
        </> : <button type="button" role="menuitem" className={styles.menuItem} onClick={duplicate}>
          <Copy size={16} aria-hidden="true" />Duplikuj zestaw</button>}
      </div>}
    </FloatingPortal>
  </div>
}

function PresetPreview({ editor }: { editor: Editor }) {
  const presetName = editor.preset?.name
  const lead = presetName === 'Tylko podgląd'
    ? 'Umożliwia podgląd większości obszarów zlecenia.'
    : 'Zapewnia edycję większości obszarów zlecenia.'
  return <div className={styles.preview} data-testid="preset-read-only-preview">
    <div className={styles.previewIntro}>
      <span className={styles.previewIcon} aria-hidden="true">{presetName === 'Tylko podgląd'
        ? <Eye size={20} strokeWidth={1.8} /> : <ShieldCheck size={20} strokeWidth={1.8} />}</span>
      <div><p className={styles.previewMeta}>Domyślny zestaw dostępu</p><p className={styles.previewDescription}>{lead}</p></div>
    </div>
    <PresetAccessValues areas={editor.areas} />
  </div>
}

function PresetAccessValues({ areas }: { areas: CollaborationAreaAccess }) {
  return <dl className={styles.previewList}>
    {COLLABORATION_AREA_OPTIONS.map(({ key, label }) => <div className={styles.previewRow} key={key}>
      <dt>{label}</dt><dd data-level={areas[key]}>{LEVEL_NAMES[areas[key]]}</dd>
    </div>)}
  </dl>
}
