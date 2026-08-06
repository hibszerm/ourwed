/**
 * Regression: admin_list_users must not reference CTEs across SQL statements,
 * and all product relations must be schema-qualified real tables.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  admin-list-users-relation — ${msg}`)
}

const fix = readFileSync(
  join(ROOT, 'supabase/migrations/20260806190000_admin_list_users_cte_scope_fix.sql'),
  'utf8',
)
const prior = readFileSync(
  join(ROOT, 'supabase/migrations/20260806180000_admin_phase2_rpc_signature_fix.sql'),
  'utf8',
)
const api = readFileSync(join(ROOT, 'src/admin/api/adminApi.ts'), 'utf8')
const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8')
const sessionsMig = readFileSync(
  join(ROOT, 'supabase/migrations/20260728220000_sessions.sql'),
  'utf8',
)
const calendarMig = readFileSync(
  join(ROOT, 'supabase/migrations/20260730160000_calendar_integrations.sql'),
  'utf8',
)
const docsMig = readFileSync(
  join(ROOT, 'supabase/migrations/20260722200000_documents_engine_foundation.sql'),
  'utf8',
)

// Documented failure mode in prior migration (for regression awareness)
assert(
  /select count\(\*\) into total from filtered[\s\S]*from filtered f/.test(prior),
  'prior migration contained CTE scope bug pattern',
)

// Fix uses single WITH including counted + page
assert(fix.includes('with base as'), 'base CTE')
assert(fix.includes('filtered as'), 'filtered CTE')
assert(fix.includes('counted as'), 'counted CTE in same statement')
assert(fix.includes('page as'), 'page CTE in same statement')
assert(!/select count\(\*\) into total from filtered[\s\S]*from filtered f/.test(fix), 'no cross-statement filtered')
assert(fix.includes("notify pgrst, 'reload schema'"), 'schema reload')

// Schema-qualified real tables only
for (const rel of [
  'auth.users',
  'public.weddings',
  'public.sessions',
  'public.wedding_documents',
  'public.calendar_integrations',
  'public.form_instances',
  'public.wedding_questionnaires',
  'public.payments',
  'auth.mfa_factors',
]) {
  assert(fix.includes(rel), `qualified ${rel}`)
}

// Existence in repo schema / migrations
assert(schema.includes('create table public.weddings'), 'weddings in schema')
assert(sessionsMig.includes('create table if not exists public.sessions'), 'sessions migration')
assert(docsMig.includes('create table public.wedding_documents'), 'wedding_documents migration')
assert(calendarMig.includes('create table if not exists public.calendar_integrations'), 'calendar migration')

// No unqualified product table scans in the fixed function body
const fnBody = fix.slice(fix.indexOf('admin_list_users'))
assert(!/\bfrom users\b/.test(fnBody), 'no unqualified users')
assert(!/\bfrom profiles\b/.test(fnBody), 'no unqualified profiles')
assert(!/\bfrom weddings\b/.test(fnBody), 'no unqualified weddings')
assert(!/\bfrom sessions\b/.test(fnBody), 'no unqualified sessions')

// Privacy: no private field names returned
for (const bad of ['bride_name', 'groom_name', 'answer_json', 'phone', 'venue', 'file_path']) {
  assert(!fix.includes(bad), `no private field ${bad}`)
}

// Diagnostics
assert(api.includes('ADM-RPC-RELATION'), 'relation error category')
assert(api.includes('42P01'), 'maps 42P01')
assert(api.includes('Kod błędu: ADM-RPC-RELATION'), 'production error code copy')
assert(!api.includes('Authorization'), 'no auth header logging')

// AAL2 preserved
assert(fix.includes('assert_admin_owner_aal2'), 'aal2 gate')
assert(fix.includes('revoke all on function public.admin_list_users'), 'revoke')
assert(fix.includes('grant execute on function public.admin_list_users'), 'grant authenticated')

console.log('PASS  admin-list-users-relation')
