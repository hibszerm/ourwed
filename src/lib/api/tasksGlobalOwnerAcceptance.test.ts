/**
 * Phase 1D.1 — Global tasks DB / RLS / domain foundation acceptance.
 * Run: npm run test:tasks-global-owner
 *
 * Does NOT require migration apply — asserts migration + schema + service source.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
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
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260816120000_tasks_global_owner.sql'),
  'utf8',
)
const schema = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8')
const service = readFileSync(resolve(root, 'src/lib/api/taskService.ts'), 'utf8')
const types = readFileSync(resolve(root, 'src/types/wedding.ts'), 'utf8')

run('1. Migration adds user_id, backfills, NOT NULL, orphan guard', () => {
  assert(migration.includes('add column if not exists user_id'), 'add user_id')
  assert(migration.includes('references public.users (id)'), 'FK users')
  assert(migration.includes('set user_id = w.user_id'), 'backfill from weddings')
  assert(migration.includes('from public.weddings w'), 'select weddings')
  assert(
    !/^\s*update\s+public\.weddings/im.test(migration),
    'no wedding UPDATE statement',
  )
  assert(migration.includes('user_id is null'), 'orphan check')
  assert(migration.includes('raise exception'), 'fail on orphans')
  assert(migration.includes('alter column user_id set not null'), 'NOT NULL')
})

run('2. wedding_id becomes nullable; existing links preserved (no rewrite)', () => {
  assert(migration.includes('alter column wedding_id drop not null'), 'nullable')
  assert(!migration.includes('set wedding_id = null'), 'no mass unlink')
  assert(!migration.includes('delete from public.tasks'), 'no delete')
})

run('3. RLS owner-scoped + Pro writes + optional wedding check', () => {
  assert(migration.includes('force row level security'), 'FORCE RLS')
  assert(migration.includes('tasks_select_own'), 'select policy')
  assert(migration.includes('using (user_id = auth.uid())'), 'select owner')
  assert(
    !/tasks_select_own[\s\S]*account_has_pro_access/.test(
      migration.slice(migration.indexOf('tasks_select_own')),
    ) ||
      migration.indexOf('tasks_insert_own') <
        migration.indexOf('account_has_pro_access', migration.indexOf('tasks_insert_own')),
    'select not Pro-gated before insert block',
  )
  // SELECT block must not include Pro
  const selectBlock = migration.slice(
    migration.indexOf('create policy tasks_select_own'),
    migration.indexOf('create policy tasks_insert_own'),
  )
  assert(!selectBlock.includes('account_has_pro_access'), 'SELECT no Pro gate')

  const insertBlock = migration.slice(
    migration.indexOf('create policy tasks_insert_own'),
    migration.indexOf('create policy tasks_update_own'),
  )
  assert(insertBlock.includes('account_has_pro_access()'), 'INSERT Pro')
  assert(insertBlock.includes('wedding_id is null'), 'INSERT allows unlinked')
  assert(insertBlock.includes('is_wedding_owner(wedding_id)'), 'INSERT wedding check')

  const updateBlock = migration.slice(
    migration.indexOf('create policy tasks_update_own'),
    migration.indexOf('create policy tasks_delete_own'),
  )
  assert(updateBlock.includes('user_id = auth.uid()'), 'UPDATE owner USING')
  assert(updateBlock.includes('with check'), 'UPDATE WITH CHECK')
  assert(updateBlock.includes('is_wedding_owner(wedding_id)'), 'UPDATE wedding check')
  assert(updateBlock.includes('account_has_pro_access()'), 'UPDATE Pro')

  const deleteBlock = migration.slice(migration.indexOf('create policy tasks_delete_own'))
  assert(deleteBlock.includes('user_id = auth.uid()'), 'DELETE owner')
  assert(deleteBlock.includes('account_has_pro_access()'), 'DELETE Pro')
})

run('4. Indexes for owner-scoped access', () => {
  assert(migration.includes('tasks_user_id_status_due_date_idx'), 'status+due')
  assert(migration.includes('tasks_user_id_wedding_id_idx'), 'wedding')
})

run('5. schema.sql parity', () => {
  const tasksTable = schema.slice(
    schema.indexOf('-- 7. tasks'),
    schema.indexOf('-- 8. forms'),
  )
  assert(tasksTable.includes('user_id uuid not null references public.users'), 'schema user_id')
  assert(tasksTable.includes('wedding_id uuid references public.weddings'), 'schema wedding_id')
  assert(!tasksTable.includes('wedding_id uuid not null'), 'schema wedding_id nullable')
  assert(schema.includes('tasks_user_id_status_due_date_idx'), 'schema index')
  assert(schema.includes('alter table public.tasks force row level security'), 'schema FORCE')
  assert(schema.includes('create policy tasks_select_own'), 'schema select')
  assert(schema.includes('create policy tasks_insert_own'), 'schema insert')
  assert(schema.includes('is_wedding_owner(wedding_id)'), 'schema wedding check')
  assert(schema.includes('account_has_pro_access()'), 'schema Pro')
})

run('6. Frontend Task.weddingId nullable', () => {
  assert(types.includes('weddingId: string | null'), 'nullable type')
})

run('7. Mapper + create service foundation', () => {
  assert(service.includes('weddingId: row.wedding_id ?? null'), 'null map')
  assert(service.includes("dueDate: toDateString(row.due_date) || ''"), 'no fake due')
  assert(service.includes('resolveStudioUserId()'), 'owner from studio')
  assert(service.includes('user_id: userId'), 'insert owner')
  assert(service.includes('wedding_id: weddingId'), 'optional wedding')
  assert(service.includes('listForStudio'), 'studio list')
  assert(service.includes('.eq(\'user_id\', userId)'), 'owner filter')
  assert(service.includes('TASKS_QUERY_ROOT'), 'query root')
  assert(!service.includes('input.userId'), 'no caller-chosen owner')
  assert(!service.includes('userId?:'), 'CreateTaskInput no userId')
})

run('8. listByWeddingId defense in depth', () => {
  const block = service.slice(
    service.indexOf('async listByWeddingId'),
    service.indexOf('async listForStudio'),
  )
  assert(block.includes(".eq('user_id', userId)"), 'owner')
  assert(block.includes(".eq('wedding_id', weddingId)"), 'wedding')
})

run('9. listAll aliases listForStudio (no wedding-id-only fanout)', () => {
  const block = service.slice(
    service.indexOf('async listAll'),
    service.indexOf('async listDueOn'),
  )
  assert(block.includes('listForStudio()'), 'alias')
  assert(!block.includes('listOwnedWeddingIds'), 'no fanout')
})

run('10. Phase 1C / Next Action freeze markers', () => {
  const persist = readFileSync(
    resolve(root, 'src/features/weddings/edit/persistWeddingEditDraft.ts'),
    'utf8',
  )
  assert(persist.includes('taskService.create'), 'wedding persist create')
  assert(persist.includes('description is intentionally omitted'), 'desc preserve')
  const resolver = readFileSync(
    resolve(root, 'src/lib/workflow/resolveWeddingNextAction.ts'),
    'utf8',
  )
  assert(!resolver.includes('taskService'), 'no Next Action→tasks')
})

run('11. Dashboard uses shared persisted complete (1D.4)', () => {
  const card = readFileSync(
    resolve(root, 'src/features/dashboard/components/TodoTodayCard.tsx'),
    'utf8',
  )
  assert(card.includes('taskService.complete'), 'persisted complete')
  assert(!card.includes('dismissed'), 'no local dismiss hack')
  assert(card.includes('task.weddingId'), 'null-safe wedding access')
})

console.log('\ntasks global owner Phase 1D.1: done')
