/**
 * Ankiety V1 — Modern questionnaire library (presentation only).
 * Run: npm run test:modern-questionnaire-library
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  QUESTIONNAIRE_LIBRARY_CATALOG_MAX_PX,
  QUESTIONNAIRE_LIBRARY_CONTRACT_META,
  QUESTIONNAIRE_LIBRARY_CONTRACT_NAME,
  QUESTIONNAIRE_LIBRARY_CONTRACT_SECTION,
  QUESTIONNAIRE_LIBRARY_CREATE_LABEL,
  QUESTIONNAIRE_LIBRARY_DELETE_BODY,
  QUESTIONNAIRE_LIBRARY_DELETE_CONFIRM,
  QUESTIONNAIRE_LIBRARY_DELETE_TITLE,
  QUESTIONNAIRE_LIBRARY_EMPTY_COPY,
  QUESTIONNAIRE_LIBRARY_EMPTY_TITLE,
  QUESTIONNAIRE_LIBRARY_PREWEDDING_SECTION,
  QUESTIONNAIRE_LIBRARY_SUBTITLE,
  QUESTIONNAIRE_LIBRARY_TITLE,
} from '@/features/prewedding/modern/questionnaireLibraryCopy'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const page = read('src/pages/QuestionnaireLibraryPage.tsx')
const workspace = read(
  'src/features/prewedding/modern/ModernQuestionnaireLibrary.tsx',
)
const css = read(
  'src/features/prewedding/modern/ModernQuestionnaireLibrary.module.css',
)
const overflow = read(
  'src/features/prewedding/modern/QuestionnaireLibraryOverflowMenu.tsx',
)
const weddings = read('src/pages/WeddingsModernPage.tsx')
const extrasPage = read('src/pages/ExtraServicesPage.tsx')
const extrasCss = read(
  'src/features/studio/extras/ModernExtraServicesWorkspace.module.css',
)
const editor = read(
  'src/features/questionnaires/shared-editor/ContractQuestionnaireSectionEditor.tsx',
)
const preweddingEditor = read('src/pages/PreWeddingTemplatesPage.tsx')
const publicForm = read('src/pages/PublicFormTokenPage.tsx')
const publicPre = read('src/pages/PublicPreWeddingQuestionnairePage.tsx')
const presets = read('src/features/prewedding/officialPresets.ts')
const provisionSql = read(
  'supabase/migrations/20260824220000_official_pre_wedding_presets_v1.sql',
)

run('1. AppLayout title/headerSlot not used for H1', () => {
  assert(page.includes('<AppLayout>'), 'bare AppLayout')
  assert(!page.includes('title="Ankiety"'), 'no AppLayout title')
  assert(!page.includes('headerSlot'), 'no headerSlot')
  assert(!page.includes('action='), 'no AppLayout action')
  assert(workspace.includes('<h1'), 'in-page H1')
  assert(workspace.includes('QUESTIONNAIRE_LIBRARY_TITLE'), 'uses title copy')
  assertEq(QUESTIONNAIRE_LIBRARY_TITLE, 'Ankiety', 'H1 copy')
})

run('2. PageContainer wide + accepted Modern shell', () => {
  assert(page.includes('PageContainer'), 'PageContainer')
  assert(page.includes('width="wide"'), 'wide page axis')
  assert(page.includes('ModernQuestionnaireLibrary'), 'modern workspace')
  assert(weddings.includes('<AppLayout>'), 'Śluby reference shell')
  assert(weddings.includes('width="wide"'), 'Śluby wide')
  assert(extrasPage.includes('width="wide"'), 'Usługi wide')
  assert(!css.includes('content-max-narrow'), 'page is not a narrow utility')
  assert(!css.includes('.stage'), 'no custom page stage')
})

run('3. two truthful product sections', () => {
  assertEq(QUESTIONNAIRE_LIBRARY_CONTRACT_SECTION, 'Dane do umowy', 'contract section')
  assertEq(
    QUESTIONNAIRE_LIBRARY_PREWEDDING_SECTION,
    'Ankiety przedślubne',
    'pre-wedding section',
  )
  assert(workspace.includes('library-section-contract'), 'contract testid')
  assert(workspace.includes('library-section-pre-wedding'), 'pre-wedding testid')
  assert(!workspace.includes('role="tablist"'), 'no type tabs')
  assert(!workspace.includes("['all', 'Wszystkie']"), 'no Wszystkie filter')
  assert(!workspace.includes('Do umowy'), 'no short contract filter label')
  assert(!workspace.includes('Przedślubne'), 'no short pre-wedding filter label')
})

run('4. singleton contract row', () => {
  assertEq(QUESTIONNAIRE_LIBRARY_CONTRACT_NAME, 'Domyślna ankieta do umowy', 'name')
  assertEq(
    QUESTIONNAIRE_LIBRARY_CONTRACT_META,
    'Dane potrzebne do przygotowania umowy i zlecenia.',
    'meta',
  )
  assert(workspace.includes('contract-template-card'), 'contract row testid')
  assert(workspace.includes('/ankiety/dane-do-umowy'), 'opens existing editor')
  assert(!workspace.includes('Edytor danych kontraktowych'), 'no technical editor copy')
  assert(!workspace.includes('istniejący przepływ'), 'no flow jargon')
  assert(!workspace.includes("type: 'contract'"), 'does not create contract templates')
  const contractStart = workspace.indexOf('library-section-contract')
  const preStart = workspace.indexOf('library-section-pre-wedding')
  const contractBlock = workspace.slice(contractStart, preStart)
  assert(!contractBlock.includes('Ustaw jako domyślną'), 'no default control')
  assert(!contractBlock.includes('Duplikuj'), 'no duplicate')
  assert(!contractBlock.includes('Archiwizuj'), 'no archive')
  assert(!contractBlock.includes('countAnswerableQuestions'), 'no fake question count')
})

run('5. pre-wedding catalog / list, not Classic cards', () => {
  assert(css.includes('.catalog'), 'catalog object')
  assert(css.includes('max-width: 920px'), 'catalog max 920')
  assert(css.includes('margin-inline: auto'), 'catalog centered')
  assertEq(QUESTIONNAIRE_LIBRARY_CATALOG_MAX_PX, 920, 'catalog constant')
  assert(css.includes('var(--surface-primary'), 'surface-primary')
  assert(css.includes('.list'), 'list structure')
  assert(css.includes('.row'), 'row grammar')
  assert(!css.includes('.cardGrid'), 'no Classic card grid')
  assert(!css.includes('grid-template-columns: 1fr 1fr'), 'no 2-column cards')
  assert(!workspace.includes('styles.cardGrid'), 'no cardGrid usage')
  assert(workspace.includes('data-testid="template-card"'), 'row testid kept')
  assert(workspace.includes('QuestionnaireRowIdentity'), 'shared row identity')
  assert(workspace.includes('size={16}'), 'same 16px FileText')
  assert(css.includes('.entryIcon'), 'shared quiet icon')
  assert(css.includes('.entryHead'), 'shared icon+copy alignment')
  assert(!workspace.includes('Camera'), 'no camera icons')
  assert(!workspace.includes('Video'), 'no video icons')
  assert(!workspace.includes('Clipboard'), 'no clipboard icons')
  assert(extrasCss.includes('margin-inline: auto'), 'Usługi catalog also centered')
})

run('6. default + archived presentation', () => {
  assert(workspace.includes('data-testid="default-badge"'), 'quiet default')
  assert(workspace.includes('Domyślna'), 'default copy')
  assert(css.includes('.defaultPill'), 'default is a quiet pill')
  assert(css.includes('border-radius: 999px'), 'pill shape')
  const pillStart = css.indexOf('.defaultPill')
  const pillBlock = css.slice(pillStart, pillStart + 420)
  assert(pillBlock.includes('var(--color-bg-subtle)'), 'muted pill fill')
  assert(!pillBlock.includes('--color-accent'), 'default pill is not accent-filled')
  assert(workspace.includes('Archiwalne ('), 'archived disclosure')
  assert(workspace.includes('Archiwalna'), 'archived row label')
  assert(workspace.includes('IconChevronDown'), 'archived chevron')
  assert(css.includes('.archived[open] .archivedChevron'), 'open chevron state')
  assert(!workspace.includes('Zarchiwizowane'), 'old archived copy removed')
  assert(workspace.includes('showArchived'), 'archived toggle preserved')
})

run('7. no technical / admin metadata', () => {
  assert(!workspace.includes('source_key'), 'no source_key')
  assert(!workspace.includes('schema version'), 'no schema version')
  assert(!workspace.includes('schema_snapshot'), 'no snapshot copy')
  assert(!workspace.includes('QUESTIONNAIRE_TEMPLATE_TYPE_LABELS'), 'no type enum labels')
  assert(!workspace.includes('{template.sourceKey}'), 'source_key not rendered')
  assert(!workspace.includes('{template.id}</'), 'id not shown as copy')
  assert(!workspace.includes('schema_json'), 'no schema_json copy')
  assert(!css.includes('.filters'), 'no admin filter chrome')
})

run('8. mobile row grammar + 44px targets', () => {
  assert(css.includes('@media (max-width: 767px)'), 'mobile breakpoint')
  assert(css.includes('flex-direction: column'), 'stacked header')
  assert(css.includes('min-height: var(--touch-target)'), 'touch target token')
  assert(css.includes('width: var(--touch-target)'), 'overflow 44px')
  assert(css.includes('height: var(--touch-target)'), 'overflow 44px height')
  assert(!css.includes('grid-template-columns: 1fr 1fr'), 'no 2-col on mobile')
})

run('9. overflow is a portal, not a clipped menu', () => {
  assert(overflow.includes('FloatingPortal'), 'portal menu')
  assert(overflow.includes('aria-label="Więcej działań"'), 'overflow label')
  assert(overflow.includes('role="menu"'), 'menu role')
  assert(overflow.includes('minSpace: 248'), 'menu flips above when space is tight')
  assert(overflow.includes('mousedown'), 'outside click')
  assert(workspace.includes('Edytuj'), 'edit action')
  assert(workspace.includes('Zmień nazwę'), 'rename action')
  assert(workspace.includes('Duplikuj'), 'duplicate action')
  assert(workspace.includes('Ustaw jako domyślną'), 'set default')
  assert(workspace.includes('Archiwizuj'), 'archive')
  assert(workspace.includes('Przywróć'), 'restore')
  assert(workspace.includes('QUESTIONNAIRE_LIBRARY_DELETE_CONFIRM'), 'permanent delete action')
  assertEq(QUESTIONNAIRE_LIBRARY_DELETE_TITLE, 'Usunąć ankietę na stałe?', 'delete title')
  assertEq(
    QUESTIONNAIRE_LIBRARY_DELETE_BODY,
    'Szablon zniknie z biblioteki i nie będzie można go przywrócić. Ankiety już wysłane parom oraz ich odpowiedzi pozostaną bez zmian.',
    'delete body',
  )
  assertEq(QUESTIONNAIRE_LIBRARY_DELETE_CONFIRM, 'Usuń na stałe', 'delete confirm')
  assert(workspace.includes('QUESTIONNAIRE_LIBRARY_DELETE_TITLE'), 'delete modal title')
  assert(workspace.includes('QUESTIONNAIRE_LIBRARY_DELETE_BODY'), 'delete modal body')
  assert(!workspace.includes('window.prompt'), 'no window.prompt')
  assert(!workspace.includes('window.confirm'), 'no window.confirm')
  assert(workspace.includes('rename-template-name'), 'in-app rename')
  assert(workspace.includes('permanent-delete-dialog'), 'in-app delete confirm')
  assert(workspace.includes('variant="danger"'), 'destructive button')
  assert(!workspace.includes('removeQueries'), 'no optimistic cache drop')
  const rowFn = workspace.slice(workspace.indexOf('function TemplateRow'))
  const archivedBranch = rowFn.slice(
    rowFn.indexOf('template.isArchived'),
    rowFn.indexOf(': ['),
  )
  const activeBranch = rowFn.slice(rowFn.indexOf(': [') , rowFn.indexOf('return ('))
  assert(archivedBranch.includes("id: 'restore'"), 'archived restore')
  assert(archivedBranch.includes("id: 'delete'"), 'archived delete')
  assert(!archivedBranch.includes("id: 'archive'"), 'archived has no archive')
  assert(!archivedBranch.includes("id: 'edit'"), 'archived has no edit')
  assert(activeBranch.includes("id: 'archive'"), 'active archive')
  assert(!activeBranch.includes("id: 'delete'"), 'active has no permanent delete')
})

run('10. create is pre-wedding only', () => {
  assertEq(QUESTIONNAIRE_LIBRARY_CREATE_LABEL, 'Nowa ankieta', 'primary CTA')
  assert(workspace.includes("type: 'pre_wedding'"), 'creates pre-wedding')
  assert(!workspace.includes("setType('contract')"), 'no contract radio')
  assert(!workspace.includes('Otwórz edytor umowy'), 'no fake contract create')
  assert(workspace.includes('create-template-dialog'), 'create dialog')
  assert(workspace.includes('create-template-name'), 'name field')
})

run('11. empty / loading / error', () => {
  assertEq(QUESTIONNAIRE_LIBRARY_EMPTY_TITLE, 'Brak ankiet przedślubnych', 'empty title')
  assertEq(
    QUESTIONNAIRE_LIBRARY_EMPTY_COPY,
    'Utwórz ankietę, którą wyślesz parze przed ślubem.',
    'empty copy',
  )
  assert(workspace.includes('prewedding-empty'), 'empty testid')
  assert(workspace.includes('Użyj domyślnej'), 'legacy seed remains explicit')
  assert(!workspace.includes('Ładowanie…'), 'no raw loading copy')
  assert(css.includes('.skeletonRow'), 'skeleton rows')
  assert(workspace.includes('Spróbuj ponownie'), 'error retry')
  const emptyStart = workspace.indexOf('prewedding-empty')
  const emptyBlock = workspace.slice(emptyStart, emptyStart + 800)
  assert(!emptyBlock.includes('getOrSeedDefault()'), 'empty render does not auto-seed')
})

run('12. subtitle + header axis copy', () => {
  assertEq(
    QUESTIONNAIRE_LIBRARY_SUBTITLE,
    'Twórz i zarządzaj ankietami wysyłanymi do par.',
    'subtitle',
  )
  assert(css.includes('justify-content: space-between'), 'header axis')
  assert(css.includes('var(--type-page-title-size'), 'shared title size')
  assert(css.includes('letter-spacing: -0.04em'), 'shared title tracking')
})

run('13. editor components not changed by this library', () => {
  assert(!editor.includes('ModernQuestionnaireLibrary'), 'contract editor untouched')
  assert(!preweddingEditor.includes('ModernQuestionnaireLibrary'), 'pre-wedding editor untouched')
  assert(!publicForm.includes('ModernQuestionnaireLibrary'), 'public form untouched')
  assert(!publicPre.includes('ModernQuestionnaireLibrary'), 'public pre-wedding untouched')
  assert(!presets.includes('ModernQuestionnaireLibrary'), 'presets untouched')
  assert(provisionSql.includes('provision_official_pre_wedding_presets'), 'provision SQL intact')
})
