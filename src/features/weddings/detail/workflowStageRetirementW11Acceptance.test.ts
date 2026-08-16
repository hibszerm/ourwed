/**
 * WorkflowStage retirement W1.1 — remove manual workflow editor only.
 * Does not retire the field, Calendar, Dashboard V2, or automatic writes.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

run('A. Wedding editor does not expose Etap workflow', () => {
  const fields = src('src/features/weddings/detail/editing/fields/WeddingDateFields.tsx')
  assert(!fields.includes('Etap workflow'), 'no label')
  assert(!fields.includes('workflowStage'), 'no stage binding')
})

run('B. User cannot manually select workflowStage in live editor path', () => {
  const surface = src(
    'src/features/weddings/detail/v2/WeddingWorkspaceEditSurface.tsx',
  )
  assert(surface.includes('WeddingDateFields'), 'uses DateFields')
  assert(!surface.includes('WORKFLOW_STAGES'), 'no stage list in surface')
  assert(!surface.includes('Etap workflow'), 'no stage select in surface')

  const dead = src('src/features/weddings/components/detail/WeddingDetailStatus.tsx')
  assert(!dead.includes('Etap workflow'), 'dead twin selector removed')
  assert(!dead.includes('workflowStage'), 'dead twin no stage field binding')
  assert(!dead.includes('WORKFLOW_STAGES'), 'dead twin no stage options')
})

run('C. Unrelated wedding save preserves existing workflowStage', () => {
  const persist = src('src/features/weddings/edit/persistWeddingEditDraft.ts')
  assert(persist.includes('structuredClone(snapshot.wedding)'), 'draft clones full wedding')
  assert(persist.includes('weddingService.update'), 'updates full wedding model')
  assert(!persist.includes('workflowStage:'), 'persist never overrides stage')
  assert(!persist.includes('workflowStage ='), 'persist never assigns stage')

  const mapper = src('src/lib/api/weddings/weddingMappers.ts')
  assert(
    mapper.includes('workflow_stage: wedding.workflowStage'),
    'mapper round-trips unchanged stage',
  )
})

run('D. New Wedding UI does not expose Etap startowy', () => {
  const page = src('src/pages/NewWeddingPage.tsx')
  assert(!page.includes('Etap startowy'), 'no starting stage copy')
  assert(!page.includes('WORKFLOW_STAGE_LABELS'), 'no stage labels import')
  assert(!page.includes('workflowLabel'), 'no workflow label')
  assert(page.includes('Zaliczka'), 'deposit summary remains')
})

run('E. workflowStage remains in domain/model', () => {
  const types = src('src/types/wedding.ts')
  assert(types.includes('export type WorkflowStage'), 'WorkflowStage type')
  assert(types.includes('workflowStage: WorkflowStage'), 'Wedding field')
  const schema = src('supabase/schema.sql')
  assert(schema.includes('workflow_stage text not null'), 'DB column')
})

run('F. Automatic legacy stage writes stopped (W4)', () => {
  const create = src('src/lib/api/weddingService.ts')
  assert(
    !create.includes('input.depositPaid\n      ? \'deposit\''),
    'create does not derive stage from depositPaid',
  )
  assert(
    !create.includes('workflow_stage: workflowStage'),
    'create omit explicit stage write',
  )
  assert(
    create.includes("status: 'active'"),
    'create still sets status',
  )
  assert(
    create.includes('// workflow_stage omitted') ||
      !/workflow_stage:\s*workflowStage/.test(create),
    'create relies on DB default',
  )

  const actions = src('src/lib/api/weddingActionsService.ts')
  assert(
    !actions.includes("wedding.workflowStage === 'reservation' ? 'contract'"),
    'no contract stage side-effect',
  )
  assert(
    !actions.includes("wedding.workflowStage === 'deposit' && getDepositPaid"),
    'no payment stage side-effect',
  )
  assert(!actions.includes('getNextStage'), 'no getNextStage')
  assert(actions.includes("updateStatus(wedding.id, 'generated')"), 'contract status still written')
})

run('G. Calendar migrated off legacy workflow engine (W2)', () => {
  const drawer = src('src/features/calendar/components/CalendarDrawer.tsx')
  assert(!drawer.includes('getNextRecommendedAction'), 'no legacy CTA')
  assert(drawer.includes('resolveWeddingNextAction') || drawer.includes('useCalendarWeddingNextAction'), 'modern next action')
  const events = src('src/features/calendar/utils/calendarEvents.ts')
  assert(!events.includes('getWorkflowStageColor'), 'no stage colors')
  assert(!events.includes('getWorkflowStatus'), 'no stage status')
  assert(events.includes('WEDDING_CALENDAR_COLORS'), 'neutral wedding colors')
})

if (process.exitCode) {
  console.error('\nW1.1 workflowStage retirement acceptance failed.')
  process.exit(1)
} else {
  console.log('\nW1.1 workflowStage retirement: all checks passed.')
}
