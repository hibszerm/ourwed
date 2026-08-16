/**
 * Phase 1C — Wedding Detail V2 Tasks + Notes reachability & persistence safety.
 * Run: npm run test:wedding-tasks-notes
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

const root = process.cwd()
const v2Root = resolve(root, 'src/features/weddings/detail/v2')
const editingRoot = resolve(root, 'src/features/weddings/detail/editing')
const editRoot = resolve(root, 'src/features/weddings/edit')
const taskServiceSrc = readFileSync(
  resolve(root, 'src/lib/api/taskService.ts'),
  'utf8',
)

/** Mirrors mapTaskRowToModel due-date + completed rules (pure; no supabase). */
function mapDueAndCompleted(row: {
  due_date: string | null
  created_at: string
  status: string
}): { dueDate: string; completed: boolean } {
  const due =
    row.due_date && /^\d{4}-\d{2}-\d{2}/.test(row.due_date)
      ? row.due_date.slice(0, 10)
      : ''
  assert(
    taskServiceSrc.includes("dueDate: toDateString(row.due_date) || ''"),
    'production mapper empty due',
  )
  assert(
    !taskServiceSrc.includes(
      'toDateString(row.due_date) || toDateString(row.created_at)',
    ),
    'no fake created_at due',
  )
  return {
    dueDate: due,
    completed: row.status === 'done',
  }
}

run('1. Wedding V2 exposes Tasks entry action', () => {
  const activity = readFileSync(
    resolve(v2Root, 'WeddingActivityWorkspace.tsx'),
    'utf8',
  )
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(activity.includes('history-edit-tasks'), 'tasks testid')
  assert(activity.includes('Edytuj zadania'), 'tasks copy')
  assert(shell.includes("onEditSection('tasks')"), 'shell opens tasks')
})

run('2. Opening Tasks uses existing WeddingWorkspaceEditSurface', () => {
  const surface = readFileSync(
    resolve(v2Root, 'WeddingWorkspaceEditSurface.tsx'),
    'utf8',
  )
  const page = readFileSync(resolve(root, 'src/pages/WeddingDetailPage.tsx'), 'utf8')
  assert(surface.includes("drawerSection === 'tasks'"), 'surface tasks')
  assert(surface.includes('TaskFields'), 'TaskFields')
  assert(page.includes('onEditSection: openEditor'), 'openEditor')
  assert(page.includes('persistWeddingEditDraft'), 'persist path')
})

run('3. Existing TaskFields load/edit surface present', () => {
  const fields = readFileSync(
    resolve(editingRoot, 'fields/TaskFields.tsx'),
    'utf8',
  )
  assert(fields.includes('Dodaj zadanie'), 'add')
  assert(fields.includes('Termin'), 'due')
  assert(fields.includes('Wykonane'), 'complete')
  assert(fields.includes('Usuń'), 'delete')
  assert(fields.includes("dueDate: ''"), 'new task no fake due date')
  assert(!fields.includes('Priorytet'), 'no priority UI label')
  assert(!fields.includes('description'), 'no description UI in Phase 1C')
})

run('4–6. Persist create path uses taskService (manual only)', () => {
  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(persist.includes('taskService.create'), 'create')
  assert(persist.includes('taskService.update'), 'update')
  assert(persist.includes('taskService.delete'), 'delete')
  assert(!persist.includes('systemKey'), 'no systemKey')
  assert(!persist.includes('lifecycle'), 'no lifecycle seeding')
})

run('7–8. Complete / reopen only when checkbox changes', () => {
  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(
    persist.includes('if (task.completed && !orig.completed)'),
    'complete transition',
  )
  assert(
    persist.includes('if (!task.completed && orig.completed)'),
    'reopen transition',
  )
  assert(persist.includes('in_progress'), 'status preservation intent')
})

run('9. Delete via draft id-diff → taskService.delete', () => {
  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(persist.includes('origTaskIds'), 'id-diff')
  assert(persist.includes('taskService.delete(id)'), 'delete call')
})

run('10. No-due-date preserved in mapper + persist', () => {
  const mapped = mapDueAndCompleted({
    due_date: null,
    created_at: '2026-01-15T10:00:00.000Z',
    status: 'todo',
  })
  assertEq(mapped.dueDate, '', 'mapper empty due')
  assert(mapped.dueDate !== '2026-01-15', 'not created_at fake')

  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(
    persist.includes("task.dueDate?.trim() ? task.dueDate.slice(0, 10) : null"),
    'empty → null on save',
  )
})

run('11. Editing does not invent priority persistence', () => {
  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(taskServiceSrc.includes("priority: 'medium'"), 'display default only')
  assert(!persist.includes('priority'), 'persist ignores priority')
})

run('12. Description / hidden status not wiped on update', () => {
  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(
    persist.includes('description is intentionally omitted'),
    'no description overwrite',
  )
  assert(
    persist.includes('else if (!task.completed && orig.completed)'),
    'only reopen when leaving done',
  )
})

run('13. Task belongs to wedding via create weddingId', () => {
  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(persist.includes('weddingId,'), 'scoped create')
  assert(taskServiceSrc.includes('wedding_id: weddingId'), 'DB wedding_id')
  assert(taskServiceSrc.includes('user_id: userId'), 'DB user_id owner')
})

run('14. No system Next Action inserted into tasks', () => {
  const resolver = readFileSync(
    resolve(root, 'src/lib/workflow/resolveWeddingNextAction.ts'),
    'utf8',
  )
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  assert(!resolver.includes('taskService'), 'resolver pure')
  assert(!card.includes('taskService.create'), 'card no create')
  assert(!card.includes("from('tasks')"), 'card no tasks table')
})

run('N1. Notes entry + NoteFields surface', () => {
  const activity = readFileSync(
    resolve(v2Root, 'WeddingActivityWorkspace.tsx'),
    'utf8',
  )
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  const surface = readFileSync(
    resolve(v2Root, 'WeddingWorkspaceEditSurface.tsx'),
    'utf8',
  )
  const fields = readFileSync(
    resolve(editingRoot, 'fields/NoteFields.tsx'),
    'utf8',
  )
  assert(activity.includes('history-edit-notes'), 'notes entry')
  assert(shell.includes("onEditSection('notes')"), 'shell notes')
  assert(surface.includes("drawerSection === 'notes'"), 'surface notes')
  assert(fields.includes('Dodaj notatkę'), 'add note')
  assert(fields.includes('Przypięta'), 'pinned')
  assert(fields.includes('Usuń'), 'delete note')
})

run('N2. Note persist preserves pinned + content + author', () => {
  const persist = readFileSync(
    resolve(editRoot, 'persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(persist.includes('noteService.create'), 'create')
  assert(persist.includes('noteService.update'), 'update')
  assert(persist.includes('noteService.delete'), 'delete')
  assert(persist.includes('pinned: note.pinned'), 'pinned preserved')
  assert(persist.includes('author: note.author'), 'author preserved')
  assert(persist.includes('content: note.content'), 'content')
})

run('N3. Overview / Next Action freeze — no task/note coupling', () => {
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  assert(!overview.includes('onEditSection'), 'overview no editor')
  assert(!overview.includes('TaskFields'), 'overview no tasks')
  assert(!overview.includes('NoteFields'), 'overview no notes')
  assert(!card.includes('taskService'), 'next action ignores tasks service')
})

run('N4. Historia still lists tasks/notes via buildActivityFeed', () => {
  const selectors = readFileSync(
    resolve(v2Root, 'weddingWorkspaceSelectors.ts'),
    'utf8',
  )
  assert(selectors.includes("filter: 'tasks'"), 'task events')
  assert(selectors.includes("filter: 'notes'"), 'note events')
  assert(selectors.includes('task.dueDate || input.wedding.createdAt'), 'undated sort fallback')
})

run('N5. Reachability guard — cannot orphan TaskFields/NoteFields', () => {
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  const activity = readFileSync(
    resolve(v2Root, 'WeddingActivityWorkspace.tsx'),
    'utf8',
  )
  const surface = readFileSync(
    resolve(v2Root, 'WeddingWorkspaceEditSurface.tsx'),
    'utf8',
  )
  assert(shell.includes("onEditSection('tasks')"), 'tasks reachable')
  assert(shell.includes("onEditSection('notes')"), 'notes reachable')
  assert(activity.includes('onEditTasks'), 'activity wired')
  assert(activity.includes('onEditNotes'), 'activity wired notes')
  assert(surface.includes('TaskFields'), 'fields mounted')
  assert(surface.includes('NoteFields'), 'note fields mounted')
})

run('N6. Page invalidates tasks after save', () => {
  const page = readFileSync(resolve(root, 'src/pages/WeddingDetailPage.tsx'), 'utf8')
  assert(page.includes("queryKey: ['tasks'"), 'tasks invalidate')
  assert(page.includes("queryKey: ['weddings']"), 'weddings invalidate')
})

run('N7. in_progress maps to incomplete; null due stays empty', () => {
  const mapped = mapDueAndCompleted({
    due_date: null,
    created_at: '2026-02-01T10:00:00.000Z',
    status: 'in_progress',
  })
  assertEq(mapped.completed, false, 'not done')
  assertEq(mapped.dueDate, '', 'no due')
  assert(taskServiceSrc.includes("completed: status === 'done'"), 'done only')
})

console.log('\nwedding tasks+notes Phase 1C: done')
