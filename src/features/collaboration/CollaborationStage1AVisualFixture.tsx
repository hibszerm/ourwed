import { useEffect, useId, useRef, useState } from 'react'
import { ChevronRight, Copy, Eye, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import { Modal } from '@/components/ui/Modal'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { CollaborationAreaMatrixV3 } from './CollaborationAreaMatrixV3'
import { PresetGroup } from './CollaborationPermissionPresetManager'
import { CollaborationConnectionTools, type CollaborationCodeAdapter } from './CollaborationConnectionTools'
import { CollaborationDirectory } from './CollaborationDirectory'
import { COLLABORATION_AREA_OPTIONS, EDITOR_AREA_DEFAULTS, VIEWER_AREA_DEFAULTS, type CollaborationAreaAccess } from './areaAccessV3'
import type { CollaborationState } from './collaborationService'
import { AppLayout } from '@/layouts/AppLayout'
import pageStyles from '@/pages/CollaborationPage.module.css'
import styles from './CollaborationStage1AVisualFixture.module.css'
import presetStyles from './CollaborationPermissionPresetManager.module.css'

type FixtureState = 'full' | 'minimal' | 'incoming' | 'empty' | 'matched' | 'success' | 'invalid' | 'regenerate'
  | 'create' | 'edit' | 'mobile' | 'preview-viewer' | 'preview-editor' | 'custom-menu' | 'mobile-preview' | 'mobile-edit'
  | 'preset-one' | 'preset-many' | 'preset-empty' | 'preset-mobile'
type FixturePresetDialog = 'create' | 'edit' | 'preview-viewer' | 'preview-editor' | null
type PresetFixtureVariant = 'one' | 'many' | 'empty' | 'mobile'

const fullState: CollaborationState = {
  connections: [
    { id: 'connection-1', display_name: 'Anna Kowalska', connected_at: '2026-10-12T12:00:00.000Z' },
    { id: 'connection-2', display_name: 'Michał Pietrzak', connected_at: '2026-10-10T12:00:00.000Z' },
    { id: 'connection-3', display_name: 'Joanna Szymańska', connected_at: '2026-10-08T12:00:00.000Z' },
  ],
  incoming_pending: [],
  outgoing_pending: [
    { id: 'outgoing-1', display_name: 'Kacper Dąbrowski · Kadr Studio', created_at: '2026-10-16T12:00:00.000Z' },
    { id: 'outgoing-2', display_name: 'Ewa Lewandowska · Ewa Studio', created_at: '2026-10-10T12:00:00.000Z' },
  ],
}

const minimalState: CollaborationState = {
  connections: [{ id: 'connection-a', display_name: 'QA Final A', connected_at: '2026-10-15T12:00:00.000Z' }],
  incoming_pending: [], outgoing_pending: [],
}

const incomingState: CollaborationState = {
  connections: [{ id: 'connection-a', display_name: 'QA Final A', connected_at: '2026-10-15T12:00:00.000Z' }],
  incoming_pending: [{ id: 'incoming-a', display_name: 'Anna Kowalska · Kowalska Fotografia', created_at: '2026-10-16T12:00:00.000Z' }],
  outgoing_pending: [],
}

const emptyState: CollaborationState = { connections: [], incoming_pending: [], outgoing_pending: [] }

let fixtureCode = 'OW-7K4P9X'
const fixtureAdapter: CollaborationCodeAdapter = {
  getCurrentCode: async () => fixtureCode,
  lookup: async (email, code) => email.toLowerCase() === 'anna@studio.pl' && code.toUpperCase() === 'OW-7K4P9X'
    ? { id: 'fixture-anna', name: 'Anna Kowalska', studioName: 'Kowalska Fotografia' } : null,
  sendInvitation: async () => undefined,
  regenerateCode: async () => { fixtureCode = 'OW-9P2K6M'; return fixtureCode },
}

const states: Array<{ id: FixtureState; label: string }> = [
  { id: 'full', label: 'A · Pełny hub' }, { id: 'minimal', label: 'B · Minimalny' },
  { id: 'incoming', label: 'C · Zaproszenie przychodzące' }, { id: 'empty', label: 'D · Dodawanie' },
  { id: 'matched', label: 'E · Podgląd osoby' }, { id: 'success', label: 'F · Wysłano' },
  { id: 'invalid', label: 'G · Nieprawidłowy kod' }, { id: 'regenerate', label: 'H · Nowy kod' },
  { id: 'create', label: 'I · Nowy zestaw' }, { id: 'edit', label: 'J · Edycja zestawu' },
  { id: 'mobile', label: 'K · Układ mobilny' }, { id: 'preview-viewer', label: 'L · Podgląd: tylko podgląd' },
  { id: 'preview-editor', label: 'M · Podgląd: pełna edycja' }, { id: 'custom-menu', label: 'N · Menu zestawu własnego' },
  { id: 'mobile-preview', label: 'O · Mobile: podgląd zestawu' }, { id: 'mobile-edit', label: 'P · Mobile: edycja zestawu' },
  { id: 'preset-one', label: 'Q · Zestawy: jeden własny' }, { id: 'preset-many', label: 'R · Zestawy: kilka własnych' },
  { id: 'preset-empty', label: 'S · Zestawy: bez własnych' }, { id: 'preset-mobile', label: 'T · Zestawy: mobile' },
]

function FixturePresets({ dialog, onDialogChange, showCustomMenu, variant }: {
  dialog: FixturePresetDialog; onDialogChange: (next: FixturePresetDialog) => void
  showCustomMenu: boolean; variant: PresetFixtureVariant
}) {
  const [areas, setAreas] = useState<CollaborationAreaAccess>(() => dialog === 'edit'
    ? { logistics: 2, prewedding: 1, contacts: 0, tasks: 2, notes: 2, compensation: 0 }
    : { ...EDITOR_AREA_DEFAULTS })
  function openEdit() {
    setAreas({ logistics: 2, prewedding: 1, contacts: 0, tasks: 2, notes: 2, compensation: 0 })
    onDialogChange('edit')
  }
  const isPreview = dialog === 'preview-viewer' || dialog === 'preview-editor'
  const previewAreas = dialog === 'preview-editor' ? EDITOR_AREA_DEFAULTS : VIEWER_AREA_DEFAULTS
  const customPresets = variant === 'empty' ? [] : variant === 'one'
    ? [{ name: 'Testowy', summary: 'Edycja 2 · Podgląd 2 · Brak 2' }]
    : [{ name: 'Drugi fotograf', summary: 'Edycja 3 · Podgląd 2 · Brak 1' },
      { name: 'Montażysta', summary: 'Edycja 4 · Podgląd 1 · Brak 1' },
      { name: 'Koordynator', summary: 'Edycja 2 · Podgląd 3 · Brak 1' }]
  return <section id="zestawy-dostepu" className={styles.presetSection} aria-labelledby="fixture-presets-heading">
    <header className={presetStyles.sectionHeader}><div><h2 id="fixture-presets-heading">Zestawy dostępu</h2>
      <p>Przygotuj gotowe ustawienia, których możesz używać przy zapraszaniu osoby do konkretnego zlecenia.</p></div></header>
    <Card padding="sm" className={styles.presetCard}>
      <PresetGroup title="Domyślne" action={<Button className={presetStyles.createButton} type="button"
        variant="secondary" size="sm" onClick={() => onDialogChange('create')}>Nowy zestaw</Button>}>
        <FixturePresetRow name="Pełna edycja" summary="Edycja 5 obszarów · Rozliczenie wyłączone" tone="edit"
          onOpen={() => onDialogChange('preview-editor')} />
        <FixturePresetRow name="Tylko podgląd" summary="Podgląd 5 obszarów · Rozliczenie wyłączone" tone="view"
          onOpen={() => onDialogChange('preview-viewer')} />
      </PresetGroup>
      <PresetGroup title="Własne">
        {customPresets.map((preset, index) => <FixturePresetRow key={`${preset.name}-${showCustomMenu && index === 0 ? 'menu' : 'idle'}`}
          name={preset.name} summary={preset.summary} tone="custom" onOpen={openEdit}
          autoOpenMenu={showCustomMenu && index === 0} />)}
        {variant === 'empty' ? <p className={presetStyles.empty}>Nie masz jeszcze własnych zestawów.</p> : null}
      </PresetGroup>
    </Card>
    <Modal open={Boolean(dialog)} title={dialog === 'edit' ? 'Edytuj zestaw dostępu' : isPreview
      ? dialog === 'preview-editor' ? 'Pełna edycja' : 'Tylko podgląd' : 'Nowy zestaw dostępu'}
      description={dialog === 'create' ? 'Zapisz konfigurację, której możesz później używać przy zapraszaniu osoby do konkretnego zlecenia.'
        : dialog === 'edit' ? 'Zmiany w zestawie nie zmienią dostępu już zaproszonych osób.' : undefined}
      onClose={() => onDialogChange(null)} showClose initialFocus="panel"
      size={isPreview ? 'md' : 'lg'} mobilePresentation="center"
      panelClassName={isPreview ? presetStyles.previewModalPanel : presetStyles.editorModalPanel}
      cancelLabel={isPreview ? 'Zamknij' : 'Anuluj'}
      primaryAction={isPreview
        ? <Button type="button" variant="primary" onClick={() => onDialogChange('create')}>Duplikuj zestaw</Button>
        : <Button type="button" variant="primary" onClick={() => onDialogChange(null)}>{dialog === 'edit' ? 'Zapisz zmiany' : 'Zapisz zestaw'}</Button>}>
      {isPreview ? <FixturePresetPreview name={dialog === 'preview-editor' ? 'Pełna edycja' : 'Tylko podgląd'} areas={previewAreas} />
        : <div className={presetStyles.form}>
          <label className={presetStyles.nameField}>Nazwa zestawu<input aria-label="Nazwa zestawu"
            defaultValue={dialog === 'edit' ? 'Drugi fotograf' : ''} placeholder="Drugi fotograf" /></label>
          <section className={presetStyles.accessSection} aria-labelledby="fixture-access-heading">
            <h3 id="fixture-access-heading">Dostęp do zlecenia</h3>
            <CollaborationAreaMatrixV3 variant="premium" areas={areas} onChange={setAreas} />
          </section>
        </div>}
    </Modal>
  </section>
}

function FixturePresetRow({ name, summary, tone, onOpen, autoOpenMenu = false }: {
  name: string; summary: string; tone: 'view' | 'edit' | 'custom'; onOpen: () => void; autoOpenMenu?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(autoOpenMenu)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  useEffect(() => {
    if (!menuOpen) return
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setMenuOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('keydown', escape)
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => document.removeEventListener('keydown', escape)
  }, [menuOpen])
  return <div className={presetStyles.row}>
    <button type="button" className={presetStyles.rowOpen} aria-label={`${tone === 'custom' ? 'Edytuj' : 'Otwórz'} zestaw ${name}`} onClick={onOpen}>
      <span className={presetStyles.copy}><strong>{name}</strong><small>{summary}</small></span>
      <ChevronRight className={presetStyles.chevron} size={18} aria-hidden="true" />
    </button>
    <button ref={triggerRef} type="button" className={presetStyles.menuTrigger} aria-label={`Więcej działań dla zestawu ${name}`}
      aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId}
      onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} aria-hidden="true" /></button>
    <FloatingPortal open={menuOpen} anchorRef={triggerRef} options={{ gap: 4, minMenuWidth: 188, maxMenuWidth: 220, align: 'end', forceAnchored: true, maxMenuHeight: 176, minSpace: 180, padding: 8 }}>
      {() => <div id={menuId} ref={menuRef} className={presetStyles.menuPanel} role="menu">
        <button type="button" role="menuitem" className={presetStyles.menuItem} onClick={() => { setMenuOpen(false); onOpen() }}><Pencil size={16} aria-hidden="true" />Edytuj zestaw</button>
        <button type="button" role="menuitem" className={presetStyles.menuItem} onClick={() => setMenuOpen(false)}><Copy size={16} aria-hidden="true" />Duplikuj zestaw</button>
        <div className={presetStyles.menuDivider} />
        <button type="button" role="menuitem" className={`${presetStyles.menuItem} ${presetStyles.menuItemDanger}`} onClick={() => setMenuOpen(false)}><Trash2 size={16} aria-hidden="true" />Archiwizuj zestaw</button>
      </div>}
    </FloatingPortal>
  </div>
}

function FixturePresetPreview({ name, areas }: { name: string; areas: CollaborationAreaAccess }) {
  const summary = name === 'Tylko podgląd' ? 'Umożliwia podgląd większości obszarów zlecenia.' : 'Zapewnia edycję większości obszarów zlecenia.'
  const labels = ['Brak', 'Podgląd', 'Edycja']
  return <div className={presetStyles.preview} data-testid="preset-read-only-preview">
    <div className={presetStyles.previewIntro}><span className={presetStyles.previewIcon} aria-hidden="true">
      {name === 'Tylko podgląd' ? <Eye size={20} /> : <ShieldCheck size={20} />}</span><div>
      <p className={presetStyles.previewMeta}>Domyślny zestaw dostępu</p><p className={presetStyles.previewDescription}>{summary}</p></div></div>
    <dl className={presetStyles.previewList}>{COLLABORATION_AREA_OPTIONS.map(({ key, label }) => <div className={presetStyles.previewRow} key={key}>
      <dt>{label}</dt><dd data-level={areas[key]}>{labels[areas[key]]}</dd></div>)}</dl>
  </div>
}

export function CollaborationStage1AVisualFixture() {
  const [fixture, setFixture] = useState<FixtureState>('full')
  const [presetDialog, setPresetDialog] = useState<FixturePresetDialog>(null)
  const controlsRef = useRef<HTMLDetailsElement>(null)
  const collaborationState = fixture === 'full' ? fullState : fixture === 'minimal' || fixture === 'mobile'
    ? minimalState : fixture === 'incoming' ? incomingState : emptyState
  const demoValues = fixture === 'matched' ? { state: 'matched' as const, email: 'anna@studio.pl', code: 'OW-7K4P9X',
    preview: { id: 'fixture-anna', name: 'Anna Kowalska', studioName: 'Kowalska Fotografia' } }
    : fixture === 'success' ? { state: 'success' as const, message: 'Anna Kowalska otrzyma zaproszenie w OurWed.' }
      : fixture === 'invalid' ? { state: 'invalid' as const, email: 'anna@studio.pl', code: 'OW-NIEPRAWIDLOWY',
        message: 'Adres e-mail lub kod współpracy są nieprawidłowe.' }
        : fixture === 'regenerate' ? { state: 'regenerate' as const } : undefined
  const presetVariant: PresetFixtureVariant = fixture === 'preset-many' ? 'many'
    : fixture === 'preset-empty' ? 'empty' : fixture === 'preset-mobile' ? 'mobile' : 'one'

  return <AppLayout>
    <PageContainer width="wide" className={pageStyles.page}>
      <div className={pageStyles.workspace}>
        <PageHeader className={pageStyles.collaborationHeader} title="Współpraca"
          subtitle="Połącz się z osobami, z którymi pracujesz, i przygotuj gotowe zasady dostępu do zleceń." />
        <details ref={controlsRef} className={styles.stateControls}>
          <summary>Podgląd stanów projektu</summary>
          <nav aria-label="Podgląd stanów współpracy">
            {states.map(({ id, label }) => <Button key={id} type="button" size="sm" variant={fixture === id ? 'secondary' : 'ghost'}
              aria-pressed={fixture === id} onClick={() => {
                setFixture(id)
                setPresetDialog(id === 'create' ? 'create' : id === 'edit' || id === 'mobile-edit' ? 'edit'
                  : id === 'preview-viewer' || id === 'mobile-preview' ? 'preview-viewer'
                    : id === 'preview-editor' ? 'preview-editor' : null)
                controlsRef.current?.removeAttribute('open')
              }}>{label}</Button>)}
          </nav>
        </details>
        <CollaborationConnectionTools adapter={fixtureAdapter} demoValues={demoValues ?? { state: 'empty' }} />
        <CollaborationDirectory state={collaborationState} loading={false} loadError={false}
          actionError={null} notice={null} busyId={null} onRetry={() => undefined}
          onInvitationAction={() => undefined} onEnd={() => undefined} />
        <FixturePresets dialog={presetDialog} onDialogChange={setPresetDialog}
          showCustomMenu={fixture === 'custom-menu'} variant={presetVariant} />
      </div>
    </PageContainer>
  </AppLayout>
}
