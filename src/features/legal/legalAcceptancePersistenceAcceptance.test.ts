/**
 * Legal acceptance persistence P0 — static contracts for DB + signup path.
 * No remote writes. No backfill. Registration remains disabled.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEGAL_VERSION } from '@/features/legal/legalMeta'
import { registerSchema } from '@/features/auth/services/authSchemas'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const MIGRATION = 'supabase/migrations/20260907200000_user_legal_acceptances.sql'

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  legal acceptance — ${msg}`)
}

function assertIncludes(hay: string, needle: string, msg: string) {
  assert(hay.includes(needle), `${msg} (missing: ${needle})`)
}

function assertNotIncludes(hay: string, needle: string, msg: string) {
  assert(!hay.includes(needle), `${msg} (unexpected: ${needle})`)
}

function assertMatch(hay: string, re: RegExp, msg: string) {
  assert(re.test(hay), msg)
}

{
  const sql = read(MIGRATION)
  assertIncludes(sql, 'create table if not exists public.user_legal_acceptances', 'table')
  assertIncludes(sql, 'terms_version text not null', 'terms_version')
  assertIncludes(sql, 'privacy_version text not null', 'privacy_version')
  assertIncludes(sql, 'accepted_at timestamptz not null', 'accepted_at')
  assertIncludes(sql, "check (source = 'registration')", 'source controlled')
  assertIncludes(sql, 'references auth.users (id) on delete cascade', 'FK cascade to auth')
  assertIncludes(sql, 'enable row level security', 'RLS on')
  assertIncludes(sql, 'force row level security', 'RLS forced')
  assertIncludes(sql, 'user_legal_acceptances_owner_select', 'owner select policy')
  assertIncludes(sql, 'for select', 'select-only policy')
  assertNotIncludes(sql, 'for update', 'no update policy')
  assertNotIncludes(sql, 'for delete', 'no delete policy')
  assertNotIncludes(sql, 'for insert', 'no insert policy for clients')
  assertIncludes(
    sql,
    'revoke all on table public.user_legal_acceptances from authenticated',
    'revoke then grant select',
  )
  assertIncludes(
    sql,
    'grant select on table public.user_legal_acceptances to authenticated',
    'owner grant select',
  )
  console.log('PASS  1. database table + RLS immutability')
}

{
  const sql = read(MIGRATION)
  // NO BACKFILL — prove absence of seeding acceptances for existing accounts
  assertNotIncludes(sql, 'insert into public.user_legal_acceptances\nselect', 'no SELECT backfill')
  assertNotIncludes(
    sql,
    'insert into public.user_legal_acceptances select',
    'no inline SELECT backfill',
  )
  assertMatch(
    sql,
    /NO BACKFILL/i,
    'migration documents no backfill',
  )
  // Acceptance insert only for NEW trigger row — not from auth.users scan
  assertIncludes(sql, 'values (\n    new.id,', 'insert uses new.id only')
  assert(
    !/insert into public\.user_legal_acceptances[\s\S]{0,400}from\s+(auth\.users|public\.users)/i.test(
      sql,
    ),
    'acceptance insert is not SELECT-from existing users',
  )
  assert(
    !/update\s+public\.(users|profiles)/i.test(sql),
    'no UPDATE of existing public.users/profiles',
  )
  assert(!/update\s+auth\.users/i.test(sql), 'no UPDATE of auth.users')
  console.log('PASS  2. no backfill / no existing-user mutation')
}

{
  const sql = read(MIGRATION)
  assertIncludes(
    sql,
    "create or replace function public.current_production_legal_version()",
    'server version fn',
  )
  assertIncludes(sql, "select '1.1'::text", 'server version 1.1')
  assert(LEGAL_VERSION === '1.1', 'frontend LEGAL_VERSION is 1.1')
  // Drift guard: extract SQL literal and compare to LEGAL_VERSION
  const m = sql.match(
    /function public\.current_production_legal_version\(\)[\s\S]*?select '([^']+)'::text/,
  )
  assert(m?.[1] === LEGAL_VERSION, 'SQL version matches LEGAL_VERSION (drift)')
  assertIncludes(sql, 'legal_registration_accepted', 'requires acceptance flag')
  assertIncludes(sql, 'legal version mismatch', 'rejects wrong versions')
  assertIncludes(sql, 'legal registration acceptance required', 'rejects missing flag')
  assertIncludes(sql, "timezone('utc', now())", 'server accepted_at')
  assertNotIncludes(
    sql.slice(sql.indexOf('insert into public.user_legal_acceptances')),
    "raw_user_meta_data->>'accepted_at'",
    'accepted_at not from client metadata',
  )
  console.log('PASS  3. trusted versions + server accepted_at')
}

{
  const sql = read(MIGRATION)
  assertIncludes(sql, 'delete from public.user_legal_acceptances', 'erasure deletes acceptances')
  const acceptDel = sql.lastIndexOf('delete from public.user_legal_acceptances')
  const usersDel = sql.lastIndexOf('delete from public.users')
  assert(acceptDel > 0 && acceptDel < usersDel, 'acceptances deleted before public.users')
  assertIncludes(
    sql,
    'V1 deletes acceptance with account erasure',
    'deletion decision documented',
  )
  console.log('PASS  4. account erasure includes legal acceptances')
}

{
  const service = read('src/features/auth/services/authService.ts')
  const registerStart = service.indexOf('async register(')
  const registerEnd = service.indexOf('async requestPasswordReset(')
  assert(registerStart > 0 && registerEnd > registerStart, 'register method bounds')
  const registerFn = service.slice(registerStart, registerEnd)

  assertIncludes(service, "from '@/features/legal/legalMeta'", 'imports LEGAL_VERSION')
  assertIncludes(registerFn, 'legal_registration_accepted: true', 'sends acceptance flag')
  assertIncludes(registerFn, 'terms_version: LEGAL_VERSION', 'terms from canonical')
  assertIncludes(registerFn, 'privacy_version: LEGAL_VERSION', 'privacy from canonical')
  assertIncludes(
    registerFn,
    'accepted_at is server-generated',
    'documents server-side accepted_at',
  )
  assert(
    !/accepted_at\s*:/.test(registerFn),
    'client metadata does not include accepted_at',
  )
  assertNotIncludes(registerFn, 'localStorage', 'register does not touch localStorage')
  assertMatch(registerFn, /password:\s*input\.password/, 'password only for signUp')
  assert(!/data:\s*\{[^}]*password/s.test(registerFn), 'password not in user metadata')
  console.log('PASS  5. signup metadata contract')
}

{
  const form = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(form, 'acceptTerms', 'checkbox field')
  assertIncludes(form, 'to={LEGAL_ROUTES.terms}', 'terms link')
  assertIncludes(form, 'to={LEGAL_ROUTES.privacy}', 'privacy link')
  assertIncludes(form, 'potwierdzam zapoznanie się z', 'acknowledgement semantics')
  assertIncludes(form, 'const REGISTRATION_ENABLED = false', 'registration locked')
  assertNotIncludes(form, 'newsletter', 'no newsletter consent')
  assertNotIncludes(form, 'marketing', 'no marketing consent')
  assertNotIncludes(form, 'profiling', 'no profiling consent')

  const bad = registerSchema.safeParse({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'Secret123',
    confirmPassword: 'Secret123',
    profession: 'wedding_photographer',
    acceptTerms: false,
  })
  assert(!bad.success, 'checkbox required')

  const good = registerSchema.safeParse({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'Secret123',
    confirmPassword: 'Secret123',
    profession: 'wedding_photographer',
    acceptTerms: true,
  })
  assert(good.success, 'valid signup with acceptance')
  console.log('PASS  6. registration UI + Zod + lock')
}

{
  // Future Legal v1.2 checklist encoded in migration comment
  const sql = read(MIGRATION)
  assertIncludes(sql, 'legalMeta.ts LEGAL_VERSION', 'frontend bump documented')
  assertIncludes(sql, 'current_production_legal_version()', 'DB bump documented')
  console.log('PASS  7. version bump docs')
}

console.log('\nPASS  legal acceptance persistence P0 acceptance')
