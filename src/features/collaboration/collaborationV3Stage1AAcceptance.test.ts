import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const page = read('src/pages/CollaborationPage.tsx')
const tools = read('src/features/collaboration/CollaborationConnectionTools.tsx')
const directory = read('src/features/collaboration/CollaborationDirectory.tsx')
const presets = read('src/features/collaboration/CollaborationPermissionPresetManager.tsx')
const matrix = read('src/features/collaboration/CollaborationAreaMatrixV3.tsx')
const matrixStyles = read('src/features/collaboration/CollaborationPermissionMatrix.module.css')
const areaAccess = read('src/features/collaboration/areaAccessV3.ts')
const presetStyles = read('src/features/collaboration/CollaborationPermissionPresetManager.module.css')
const route = read('src/routes/router.tsx')
const fixture = read('src/features/collaboration/CollaborationStage1AVisualFixture.tsx')
const service = read('src/features/collaboration/collaborationService.ts')

let assertions = 0
function check(condition: boolean, message: string) {
  assertions += 1
  if (!condition) throw new Error(`FAIL Collaboration V3 Hub — ${message}`)
}

check(route.includes("path: '/wspolpraca', element: <CollaborationPage />")
  && route.indexOf('element: <ProtectedRoute />') < route.indexOf("path: '/wspolpraca', element: <CollaborationPage />"),
'canonical collaboration hub remains behind authentication')
check(route.includes("path: '/ustawienia/wspolpraca', element: <Navigate to=\"/wspolpraca#zestawy-dostepu\" replace />"),
'legacy collaboration settings route redirects to the canonical preset section')
check(page.includes("queryKey: ['collaboration-settings', user?.id]") && page.includes('collaborationService.getState()'),
'hub reuses the existing collaboration state query and service')
check(page.includes('PageContainer width="wide"') && page.includes('<PageHeader')
  && page.includes('Połącz się z osobami, z którymi pracujesz'), 'hub retains Finance grid and full-hub heading copy')
check(!page.includes('Zaproś współpracownika') && !page.includes('createInvite') && !page.includes('weddingCollaborationService'),
'no legacy email-only invite CTA/command or wedding authority is used')
check(tools.includes('Adres e-mail') && tools.includes('Kod współpracy') && tools.includes('Znajdź osobę')
  && tools.includes('disabled={!enabled'), 'lookup requires both fields and stays honest while backend is unavailable')
check(tools.includes('collaboration-account-preview') && tools.includes('Wyślij zaproszenie')
  && !tools.includes('Anna Kowalska'), 'real lookup UI contains a safe inline preview action without hardcoded account data')
check(tools.includes('collaboration-invitation-success') && tools.includes('otrzyma zaproszenie w OurWed'),
'invitation success is inline and states internal OurWed delivery')
check(tools.includes('Twój kod współpracy') && tools.includes('Kopiuj kod') && tools.includes('Skopiowano')
  && tools.includes('Wygeneruj nowy'), 'personal code surface supports accessible copy and regeneration UX')
check(tools.includes('Wygenerować nowy kod?') && tools.includes('Poprzedni kod przestanie działać')
  && tools.includes('Istniejące współprace pozostaną bez zmian') && tools.includes('mobilePresentation="center"'),
'code regeneration requires a centered confirmation')
check(directory.includes('Zaproszenie do współpracy') && directory.includes('Akceptuj')
  && directory.includes('Odrzuć'), 'incoming invitations render as a conditional attention surface')
check(directory.includes('Współpracownicy') && directory.includes('Oczekujące')
  && directory.includes('{outgoing.length ?') && !directory.includes('Brak oczekujących'),
'accepted collaborators and conditional outgoing subgroup share a people surface with no empty pending state')
check(directory.includes("onAction(invitation, 'accept')")
  && directory.includes("onAction(invitation, 'decline')")
  && directory.includes("onAction(invitation, 'cancel')"), 'supported invitation actions remain wired')
check(directory.includes('aria-haspopup="menu"') && directory.includes('role="menuitem"')
  && directory.includes('Zakończ współpracę') && directory.includes("event.key !== 'Escape'"),
'accepted connection overflow menu has accessible labels, keyboard close, and supported end action')
check(directory.includes("from '@/components/ui/Card'") && directory.includes('padding="sm"'),
'people surfaces reuse the canonical OurWed Card primitive')
check(presets.includes('id="zestawy-dostepu"') && presets.includes('Zestawy dostępu')
  && presets.includes('konkretnego zlecenia'), 'preset management is part of the collaboration hub with wedding-specific context')
check(presets.includes('Domyślne') && presets.includes('Własne') && presets.includes('COLLABORATION_AREA_OPTIONS')
  && presets.includes('Dostęp do zlecenia'), 'preset list groups system/custom items and modal reuses the six canonical area controls')
check(presets.includes('className={styles.rowOpen}') && presets.includes("onOpen={(trigger) => void openPreset(preset.preset_id, 'view', trigger)}")
  && presets.includes("onOpen={(trigger) => void openPreset(preset.preset_id, 'edit', trigger)}")
  && !presets.includes('>Zobacz</Button>') && !presets.includes('>Duplikuj</Button>'),
'preset rows open on click and keep view/duplicate actions out of the permanent row layout')
const presetRow = presets.slice(presets.indexOf('function PresetRow'), presets.indexOf('function PresetPreview'))
const presetRowLeadingContent = presetRow.slice(presetRow.indexOf('className={styles.rowOpen}'), presetRow.indexOf('className={styles.copy}'))
const sectionHeader = presets.slice(presets.indexOf('<header className={styles.sectionHeader}'), presets.indexOf('</header>') + '</header>'.length)
const defaultGroup = presets.slice(presets.indexOf('<PresetGroup title="Domyślne"'), presets.indexOf('</PresetGroup>'))
const presetGroup = presets.slice(presets.indexOf('export function PresetGroup'), presets.indexOf('function PresetRow'))
check(presets.includes('id="access-presets-heading"') && sectionHeader.includes('Zestawy dostępu')
  && !sectionHeader.includes('Nowy zestaw') && defaultGroup.includes('action={<Button')
  && defaultGroup.includes('>Nowy zestaw</Button>') && !presets.includes('managerTop'),
'new preset action is inside the Domyślne group header and no longer sits in the outer section header or toolbar')
check(presets.includes('<PresetGroup title="Domyślne"') && presets.includes('<PresetGroup title="Własne">')
  && presetGroup.includes('className={styles.groupHeader}') && presetGroup.includes('<h3>{title}</h3>')
  && fixture.includes('import { PresetGroup }') && fixture.includes('<PresetGroup title="Własne">'),
'live and fixture sections use one reusable preset group-heading pattern')
check(presetStyles.includes('--preset-group-gap: var(--space-4); --preset-group-header-content-gap: 0px; display: grid; row-gap: var(--preset-group-header-content-gap)')
  && presetStyles.includes('height: 44px; min-height: 44px; align-items: center')
  && presetStyles.includes('font-size: var(--text-base, 1rem); font-weight: 650; letter-spacing: var(--tracking-snug); line-height: var(--leading-snug)')
  && presetStyles.includes('min-height: 66px; align-items: center; margin: 0; padding: 8px'),
'both groups use equal heading-to-content rhythm, one tokenized transition gap, and an empty line matching row height')
check(presets.includes("preset.name === 'Edycja') return 'Pełna edycja'")
  && presets.includes("preset.name === 'Podgląd') return 'Tylko podgląd'")
  && presets.includes('Edycja 5 obszarów · Rozliczenie wyłączone')
  && presets.includes('Podgląd 5 obszarów · Rozliczenie wyłączone'), 'system preset rows use the approved product labels and concise summaries')
check(!presetRowLeadingContent.includes('identityIcon') && !presetRowLeadingContent.includes('<Eye')
  && !presetRowLeadingContent.includes('<Pencil') && presetRow.includes('<ChevronRight')
  && presetRow.includes('aria-label={`Więcej działań dla zestawu ${displayName}`}'),
'preset rows have no leading action icons and retain the restrained open affordance and accessible separate menu')
check(presets.includes('Nie masz jeszcze własnych zestawów.') && !presets.includes('Twoje zapisane zestawy pojawią się tutaj.')
  && !presetRow.includes('>Zobacz<') && !presetRow.includes('>Duplikuj<'),
'empty custom group is compact and rows do not expose permanent view/duplicate actions')
check(presets.includes('function PresetPreview') && presets.includes('function PresetAccessValues')
  && presets.includes('<dl className={styles.previewList}>') && presets.includes('Domyślny zestaw dostępu')
  && presets.includes('LEVEL_NAMES[areas[key]]')
  && !presets.slice(presets.indexOf('function PresetPreview')).includes('CollaborationAreaMatrixV3'),
'default preset preview renders a deliberate read-only six-area value list')
check(areaAccess.includes("'logistics',\n  'prewedding',\n  'contacts',\n  'tasks',\n  'notes',\n  'compensation'")
  && areaAccess.includes('logistics: 1, prewedding: 1, contacts: 1, tasks: 1, notes: 1, compensation: 0')
  && areaAccess.includes('logistics: 2, prewedding: 2, contacts: 2, tasks: 2, notes: 2, compensation: 0'),
'viewer/editor presets retain their exact six-area permission semantics')
check(matrix.includes('role="radiogroup"') && matrix.includes('role="radio"')
  && matrix.includes('event.key === \'Home\'') && matrix.includes('variant === \'premium\'')
  && matrixStyles.includes('.premium .controls {') && matrixStyles.includes('.premium .row {'),
'premium access matrix remains keyboard-operable and uses one segmented track per area')
check(presets.includes('nameTouched || nameSubmitted') && presets.includes('onBlur={() => setNameTouched(true)}')
  && presets.includes('setNameSubmitted(true)') && presets.includes('descriptionDetails')
  && presets.includes('presetDescriptionError(editor.description)')
  && presets.includes('description: editor.description.trim() || null'),
'new preset form delays validation and preserves optional descriptions through existing preset commands')
check(presets.includes('aria-haspopup="menu"') && presets.includes('role="menuitem"')
  && presets.includes('event.key !== \'Escape\'') && presets.includes('triggerRef.current?.focus()')
  && presets.includes('Archiwizuj zestaw'), 'preset actions use an accessible focused menu and only the supported archive mutation')
check(presetStyles.includes('.editorModalPanel.editorModalPanel { max-width: 632px; }')
  && presetStyles.includes('@media (max-width: 767px)') && presetStyles.includes('width: calc(100vw - 32px)'),
'preset modals use the wider desktop layout and centered viewport-safe mobile width')
check(presets.includes('Edytuj zestaw dostępu') && presets.includes('Nowy zestaw dostępu')
  && presets.includes('mobilePresentation="center"') && presets.includes('description: editor.description.trim() || null'),
'create/edit modal is centered, uses the required titles, and preserves existing preset descriptions')
check(fixture.includes('A · Pełny hub') && fixture.includes('B · Minimalny') && fixture.includes('C · Zaproszenie przychodzące')
  && fixture.includes('D · Dodawanie') && fixture.includes('E · Podgląd osoby') && fixture.includes('F · Wysłano')
  && fixture.includes('G · Nieprawidłowy kod') && fixture.includes('H · Nowy kod')
  && fixture.includes('I · Nowy zestaw') && fixture.includes('J · Edycja zestawu') && fixture.includes('K · Układ mobilny')
  && fixture.includes('L · Podgląd: tylko podgląd') && fixture.includes('M · Podgląd: pełna edycja')
  && fixture.includes('N · Menu zestawu własnego') && fixture.includes('O · Mobile: podgląd zestawu')
  && fixture.includes('P · Mobile: edycja zestawu'),
'development fixture covers hub, both read-only previews, preset menu, create/edit, and mobile presets states')
check(fixture.includes('Q · Zestawy: jeden własny') && fixture.includes('R · Zestawy: kilka własnych')
  && fixture.includes('S · Zestawy: bez własnych') && fixture.includes('T · Zestawy: mobile')
  && fixture.includes("variant === 'empty' ? []") && fixture.includes('Nie masz jeszcze własnych zestawów.'),
'fixture demonstrates one, many, and empty custom preset groups plus mobile section composition')
check(fixture.includes('Anna Kowalska') && fixture.includes('OW-7K4P9X')
  && fixture.includes('Kowalska Fotografia') && fixture.includes('fixtureAdapter'),
'synthetic lookup identity and collaboration code exist only in the development fixture')
check(!page.includes('shared weddings') && !page.includes('weddingId') && !page.includes('compensation')
  && !directory.includes('membership') && !directory.includes('weddingId'),
'hub does not expose wedding lists, roles, membership, client, or compensation data')
check(service.includes("'get_collaboration_state'") && service.includes("'accept_collaboration_invite'")
  && service.includes("'cancel_collaboration_invite'") && service.includes("'end_collaboration'"),
'existing service stays the sole source for supported global collaboration behavior')

console.log(`PASS Collaboration V3 final hub acceptance — ${assertions} assertions`)
