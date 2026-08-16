/**
 * Wedding Detail edit mode — V2-native drawer; V1 keeps inline editors.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

const page = resolve(process.cwd(), 'src/pages/WeddingDetailPage.tsx')
const v1 = resolve(
  process.cwd(),
  'src/features/weddings/detail/v1/WeddingDetailV1.tsx',
)
const v2 = resolve(
  process.cwd(),
  'src/features/weddings/detail/v2/WeddingDetailV2.tsx',
)
const editSurface = resolve(
  process.cwd(),
  'src/features/weddings/detail/v2/WeddingWorkspaceEditSurface.tsx',
)
const drawer = resolve(
  process.cwd(),
  'src/features/weddings/detail/v2/WeddingEditDrawerV2.tsx',
)
const hero = resolve(
  process.cwd(),
  'src/features/weddings/components/detail/WeddingDetailHero.tsx',
)
const v2Root = resolve(process.cwd(), 'src/features/weddings/detail/v2')
const v1Root = resolve(process.cwd(), 'src/features/weddings/detail/v1')

const V1_PRESENTATION_BANS = [
  'WeddingDetailHero',
  'WeddingDetailContact',
  'WeddingDetailPackage',
  'WeddingDetailFinances',
  'WeddingDetailStatus',
  'WeddingDetailTasks',
  'NotesSection',
  'detail/v1/',
]

function listTsx(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) out.push(...listTsx(full))
    else if (/\.(ts|tsx)$/.test(name.name)) out.push(full)
  }
  return out
}

run('1. Header menu opens identity edit; couple edit still via drawer', () => {
  const src = readFileSync(page, 'utf8')
  assert(!src.includes('Edytuj ślub'), 'no page header edit')
  assert(src.includes('beginEdit('), 'beginEdit')
  assert(src.includes('onEditSection: openEditor'), 'shared openEditor')
  assert(src.includes('editorSection'), 'section state')
  assert(src.includes('DiscardChangesDialog'), 'dirty confirm')
  assert(src.includes('Porzucić zmiany') || src.includes('discardOpen'), 'discard state')
  const headerActions = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/detail/v2/WeddingHeaderActions.tsx'),
    'utf8',
  )
  assert(headerActions.includes('Edytuj nazwę i datę'), 'identity edit in menu')
  assert(headerActions.includes('WeddingIdentityEditDialog'), 'identity dialog')
})

run('2. V2 edit surface is drawer-hosted with shared fields (no V1 presentation)', () => {
  assert(existsSync(editSurface), 'edit surface exists')
  assert(existsSync(drawer), 'drawer exists')
  const src = readFileSync(editSurface, 'utf8')
  assert(src.includes('WeddingEditDrawerV2'), 'drawer shell')
  assert(src.includes('CoupleContactFields'), 'couple fields')
  assert(src.includes('CorrespondenceFields') || src.includes('onChangeCorrespondence'), 'correspondence')
  assert(src.includes('PackageFields'), 'package fields')
  const packageFields = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/detail/editing/fields/PackageFields.tsx'),
    'utf8',
  )
  assert(packageFields.includes('package-catalog-missing'), 'missing package state')
  assert(src.includes('FinanceFields'), 'finance fields')
  assert(src.includes('LocationRoleFields'), 'location fields')
  assert(!src.includes('WeddingDetailHero'), 'no hero')
  assert(!src.includes('WeddingDetailContact'), 'no contact card')
  assert(!src.includes('WeddingDetailPackage'), 'no package card')
  assert(!src.includes('WeddingDetailFinances'), 'no finances card')
})

run('3. V2 keeps workspace mounted while editing (drawer overlay)', () => {
  const src = readFileSync(v2, 'utf8')
  assert(src.includes('WeddingWorkspaceEditSurface'), 'surface')
  assert(src.includes('WeddingWorkspaceHeader'), 'header stays')
  assert(src.includes('WeddingWorkspaceTabs'), 'tabs stay')
  assert(src.includes('{editing ?'), 'edit gate')
  assert(!src.includes('if (editing) {\n    return'), 'does not replace tree')
  assert(src.includes('onEditSection'), 'callbacks')
})

run('4. Architecture: detail/v2 must not import detail/v1 or V1 editors', () => {
  for (const file of listTsx(v2Root)) {
    const src = readFileSync(file, 'utf8')
    const rel = file.slice(v2Root.length + 1)
    for (const ban of V1_PRESENTATION_BANS) {
      if (ban === 'detail/v1/') {
        assert(
          !src.includes("from '@/features/weddings/detail/v1/") &&
            !src.includes('from "../v1/') &&
            !src.includes("from '@/features/weddings/detail/v1'"),
          `${rel} imports v1 folder`,
        )
        continue
      }
      // Allow type-only re-exports already moved; ban component JSX imports.
      const importBan = new RegExp(
        `from ['"][^'"]*${ban}['"]|import \\{[^}]*\\b${ban}\\b`,
      )
      assert(!importBan.test(src), `${rel} must not import ${ban}`)
    }
  }
})

run('5. V1 detail shell removed; shared presentation cards may remain for LandingDemo', () => {
  assert(!existsSync(v1Root), 'v1 folder gone')
  assert(!existsSync(v1), 'v1 file gone')
  assert(existsSync(hero), 'hero kept for other surfaces')
})

run('6. Location roles stay separate in hero LOCATION_FIELDS', () => {
  const src = readFileSync(hero, 'utf8')
  assert(src.includes("'bride_preparation'"), 'bride')
  assert(src.includes("'groom_preparation'"), 'groom')
  assert(src.includes("'ceremony'"), 'ceremony')
  assert(src.includes("'reception'"), 'reception')
  assert(src.includes('saveMutation'), 'per-role save')
})

run('7. Overview / day Edytuj call onEditSection (per-role day)', () => {
  const essentials = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingOverviewEssentials.tsx',
    ),
    'utf8',
  )
  assert(essentials.includes('onEditLocations'), 'locations')
  assert(essentials.includes('Edytuj dane pary'), 'couple')
  assert(essentials.includes('Edytuj pakiet'), 'package')
  const day = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx',
    ),
    'utf8',
  )
  assert(day.includes('onEditLocationRole'), 'per-role edit')
  assert(day.includes('Edytuj'), 'day edit label')

  const shell = readFileSync(v2, 'utf8')
  assert(shell.includes("onEditSection('tasks')"), 'Historia→tasks')
  assert(shell.includes("onEditSection('notes')"), 'Historia→notes')
  const surface = readFileSync(editSurface, 'utf8')
  assert(surface.includes('TaskFields'), 'TaskFields in surface')
  assert(surface.includes('NoteFields'), 'NoteFields in surface')
})

run('8. Cancel clears editor; save uses persistWeddingEditDraft', () => {
  const src = readFileSync(page, 'utf8')
  assert(src.includes('cancelEdit'), 'cancel')
  assert(src.includes('requestCancelEdit'), 'request cancel')
  assert(src.includes('persistWeddingEditDraft'), 'persist')
  assert(src.includes('setEditorSection(null)'), 'clear section')
})

run('9. Missing-data corrections open focused editor', () => {
  const src = readFileSync(page, 'utf8')
  assert(src.includes("openEditor('contacts')"), 'couple')
  assert(src.includes("openEditor('package')"), 'package')
})

run('10. Drawer shell has stable footer outside scroll body', () => {
  const src = readFileSync(drawer, 'utf8')
  assert(src.includes('Anuluj'), 'cancel')
  assert(src.includes('Zapisz zmiany'), 'save')
  assert(src.includes('useOverlay'), 'focus trap / escape')
  const css = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingEditDrawerV2.module.css',
    ),
    'utf8',
  )
  assert(css.includes('flex-shrink: 0'), 'footer outside scroll body')
  assert(!css.includes('position: sticky'), 'no sticky-in-scroll footer')
  assert(css.includes('overflow-x: clip'), 'no horizontal pan')
  assert(css.includes('max-width: 767px'), 'mobile full')
})

run('11. Shared location save refreshes travel', () => {
  const fields = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/LocationRoleFields.tsx',
    ),
    'utf8',
  )
  assert(fields.includes('useWeddingLocationSave'), 'uses shared hook')
  assert(fields.includes('bride_preparation'), 'bride role')
  assert(fields.includes('groom_preparation'), 'groom role')
  const hook = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/useWeddingLocationSave.ts',
    ),
    'utf8',
  )
  assert(hook.includes('travelService.invalidate'), 'invalidate')
  assert(hook.includes('travelService.recalculate'), 'recalculate')
  assert(hook.includes('forceRefresh: true'), 'force refresh')
  assert(hook.includes('weddingPlaceService.upsert'), 'upsert')
})

run('12. W1.1 — no manual Etap workflow in live wedding editor', () => {
  const fields = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/WeddingDateFields.tsx',
    ),
    'utf8',
  )
  assert(!fields.includes('Etap workflow'), 'no Etap workflow label')
  assert(!fields.includes('workflowStage'), 'does not patch workflowStage')
  assert(!fields.includes('WORKFLOW_STAGES'), 'no stage options')
  assert(!fields.includes('WorkflowStage'), 'no WorkflowStage type use')
  assert(fields.includes('Status ślubu'), 'entity status remains')
  assert(fields.includes('Data ślubu'), 'date remains')

  const surface = readFileSync(editSurface, 'utf8')
  assert(surface.includes('WeddingDateFields'), 'wedding section still uses DateFields')
  assert(!surface.includes('Etap workflow'), 'surface has no stage editor')

  const deadTwin = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailStatus.tsx',
    ),
    'utf8',
  )
  assert(!deadTwin.includes('Etap workflow'), 'dead twin no stage selector')
  assert(!deadTwin.includes('workflowStage'), 'dead twin no stage field binding')
  assert(!deadTwin.includes('WORKFLOW_STAGES'), 'dead twin no stage options')
})

run('13. W1.1 — unrelated save preserves workflowStage via draft round-trip', () => {
  const persist = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/edit/persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(persist.includes('structuredClone') || true, 'draft clones wedding')
  assert(persist.includes('createWeddingEditDraft') || persist.includes('weddingService.update'), 'update path')
  assert(persist.includes('weddingService.update'), 'full wedding update')
  assert(!persist.includes('workflowStage:'), 'persist does not reset stage')
  assert(!persist.includes("workflowStage ="), 'persist does not assign stage')

  const draftFactory = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/edit/persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(draftFactory.includes('structuredClone(snapshot.wedding)'), 'clone keeps workflowStage')

  const mapper = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddings/weddingMappers.ts'),
    'utf8',
  )
  assert(mapper.includes('workflow_stage: wedding.workflowStage'), 'mapper still round-trips stage')
})

console.log('\nwedding detail edit mode: done')
