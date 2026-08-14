/**
 * Session payment ledger — source and SQL acceptance guards.
 * Run: npm run test:session-payments
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SESSION_PAYMENT_MIGRATION_NOTE } from '@/types/sessionPayment'

const migrationPath =
  'supabase/migrations/20260814160000_session_payments.sql'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertIncludes(source: string, needle: string, message: string) {
  assert(
    source.includes(needle),
    `${message}: missing ${JSON.stringify(needle)}`,
  )
}

function assertNotMatches(source: string, pattern: RegExp, message: string) {
  assert(!pattern.test(source), `${message}: matched ${String(pattern)}`)
}

assert(
  existsSync(resolve(process.cwd(), migrationPath)),
  'session_payments migration must exist',
)

const migration = read(migrationPath)
const schema = read('supabase/schema.sql')
const service = read('src/lib/api/sessionPaymentService.ts')
const types = read('src/types/sessionPayment.ts')

{
  assertIncludes(
    migration,
    'create table if not exists public.session_payments',
    'ledger table',
  )
  assertIncludes(
    migration,
    'references public.sessions (id) on delete cascade',
    'session FK cascade',
  )
  assertIncludes(
    migration,
    "check (type in ('deposit', 'installment', 'final', 'other'))",
    'payment type check',
  )
  assertIncludes(
    migration,
    'amount numeric(12, 2) not null check (amount >= 0)',
    'non-negative amount',
  )
  console.log('PASS  session payment ledger table constraints')
}

{
  assertIncludes(
    migration,
    'create or replace function public.is_session_owner',
    'ownership helper',
  )
  assertIncludes(
    migration,
    'alter table public.session_payments enable row level security',
    'RLS enabled',
  )
  assertIncludes(
    migration,
    'alter table public.session_payments force row level security',
    'RLS forced',
  )
  for (const operation of ['select', 'insert', 'update', 'delete'] as const) {
    assertIncludes(
      migration,
      `session_payments_${operation}_own`,
      `${operation} owner policy`,
    )
  }
  assert(
    (migration.match(/public\.account_has_pro_access\(\)/g) ?? []).length >= 4,
    'insert/update/delete policies must enforce Pro access',
  )
  assert(
    (migration.match(/public\.is_session_owner\(session_id\)/g) ?? []).length >=
      4,
    'all policies must enforce session ownership',
  )
  console.log('PASS  owner-scoped RLS + Pro mutation gate')
}

{
  assertIncludes(
    migration,
    'session_payments_session_id_idx',
    'session lookup index',
  )
  assertIncludes(
    migration,
    'session_payments_session_id_payment_date_idx',
    'session/date index',
  )
  console.log('PASS  ledger indexes')
}

{
  assertIncludes(migration, 'not exists (', 'idempotent backfill')
  assertIncludes(
    migration,
    'where sp.session_id = s.id',
    'backfill deduplicates by session',
  )
  assertIncludes(
    migration,
    'and sp.note = migration_note',
    'backfill deduplicates by migration note',
  )
  assertIncludes(
    migration,
    SESSION_PAYMENT_MIGRATION_NOTE,
    'SQL uses the exported migration note',
  )
  assertIncludes(
    types,
    'SESSION_PAYMENT_MIGRATION_NOTE',
    'migration note is exported to application source',
  )
  assertNotMatches(
    migration,
    /\bupdate\s+public\.sessions\b/i,
    'backfill must not update sessions',
  )
  assertNotMatches(
    migration,
    /\bset\s+deposit_amount\b/i,
    'deposit_amount must remain agreed deposit',
  )
  console.log('PASS  idempotent historical backfill preserves deposit_amount')
}

{
  assertIncludes(
    schema,
    'create table public.session_payments',
    'schema documents ledger table',
  )
  assertIncludes(
    schema,
    'comment on table public.session_payments',
    'schema documents ledger purpose',
  )
  assertIncludes(
    schema,
    'comment on column public.sessions.total_price',
    'schema documents total price',
  )
  assertIncludes(
    schema,
    'comment on column public.sessions.deposit_amount',
    'schema documents agreed deposit',
  )
  assertIncludes(
    schema,
    'paid amounts live in session_payments',
    'schema explains ledger payment truth',
  )
  assertIncludes(
    schema,
    'create or replace function public.is_session_owner',
    'schema includes session ownership helper',
  )
  assertIncludes(
    schema,
    'alter table public.session_payments enable row level security',
    'schema enables session_payments RLS',
  )
  assertIncludes(
    schema,
    'alter table public.session_payments force row level security',
    'schema force-enables session_payments RLS',
  )
  for (const operation of ['select', 'insert', 'update', 'delete'] as const) {
    assertIncludes(
      schema,
      `session_payments_${operation}_own`,
      `schema has session_payments ${operation} policy`,
    )
  }
  assert(
    (schema.match(/public\.is_session_owner\(session_id\)/g) ?? []).length >=
      4,
    'schema policies use is_session_owner',
  )
  assert(
    (schema.match(/public\.account_has_pro_access\(\)/g) ?? []).length >= 3,
    'schema write policies require Pro access',
  )
  console.log('PASS  schema documents session payment semantics')
}

{
  assertNotMatches(
    migration,
    /\balter\s+table\s+(?:public\.)?payments\b/i,
    'migration must not alter wedding payments',
  )
  assertNotMatches(
    migration,
    /\b(create|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?payments\b/i,
    'migration must not recreate wedding payments',
  )
  assertIncludes(
    migration,
    'Does NOT modify public.payments',
    'payment schema isolation is explicit',
  )
  assertIncludes(
    service,
    ".from('session_payments')",
    'session payment service uses its own ledger',
  )
  assertNotMatches(
    service,
    /\.from\(['"]payments['"]\)/,
    'session payment service must not use wedding payments',
  )
  console.log('PASS  public.payments remains unchanged and isolated')
}

console.log('\nAll session payment ledger guards passed.')
