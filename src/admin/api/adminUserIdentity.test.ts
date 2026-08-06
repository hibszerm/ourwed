/**
 * Account identity: full email + profile name priority.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  adminDisplayName,
  adminOptionalText,
} from '@/admin/lib/adminIdentityDisplay'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  admin-user-identity — ${msg}`)
}

const migration = readFileSync(
  join(ROOT, 'supabase/migrations/20260806200000_admin_user_identity_fields.sql'),
  'utf8',
)
const profilesMig = readFileSync(
  join(ROOT, 'supabase/migrations/20260722140000_auth_profiles.sql'),
  'utf8',
)
const listPage = readFileSync(join(ROOT, 'src/admin/pages/AdminUsersPage.tsx'), 'utf8')
const detailPage = readFileSync(
  join(ROOT, 'src/admin/pages/AdminUserDetailPage.tsx'),
  'utf8',
)
const types = readFileSync(join(ROOT, 'src/admin/api/types.ts'), 'utf8')
const audit = readFileSync(join(ROOT, 'src/admin/lib/adminAudit.ts'), 'utf8')
const cteFix = readFileSync(
  join(ROOT, 'supabase/migrations/20260806190000_admin_list_users_cte_scope_fix.sql'),
  'utf8',
)

// Real profile source
assert(profilesMig.includes('create table if not exists public.profiles'), 'profiles table')
assert(profilesMig.includes('first_name text'), 'first_name column')
assert(profilesMig.includes('last_name text'), 'last_name column')
assert(profilesMig.includes('raw_user_meta_data'), 'signup copies metadata into profiles')

// Shared identity helper + sources
assert(migration.includes('admin_compose_account_identity'), 'shared helper')
assert(migration.includes('auth.users'), 'email from auth.users')
assert(migration.includes('left join public.profiles'), 'profiles join')
assert(migration.includes("profile_source := 'profile'"), 'profile priority')
assert(migration.includes("profile_source := 'auth_metadata'"), 'metadata fallback')
assert(migration.includes("profile_source := 'none'"), 'none source')
assert(!migration.includes('grant execute on function public.admin_compose_account_identity'), 'helper not granted')
assert(migration.includes('assert_admin_owner_aal2'), 'aal2 retained')

// Both RPCs use same helper
assert(
  (migration.match(/admin_compose_account_identity/g) ?? []).length >= 3,
  'helper used in list + summary',
)

// No raw metadata object returned
assert(!migration.includes("'rawUserMetaData'"), 'no raw metadata field')
assert(!migration.includes('raw_user_meta_data as'), 'no raw meta dump')

// No couple fields
for (const bad of ['bride_name', 'groom_name', 'answer_json', 'phone', 'venue']) {
  assert(!migration.includes(bad), `no ${bad}`)
}

// CTE scope still fixed in list (single with … counted/page)
assert(migration.includes('counted as'), 'single-statement pagination')
assert(migration.includes('page as'), 'page cte')
assert(
  !/select count\(\*\) into total from filtered[\s\S]*from filtered f/.test(migration),
  'no cross-statement CTE',
)
assert(cteFix.includes('counted as'), 'prior CTE fix present')

// Search
assert(migration.includes('like \'%\' || q_lower || \'%\''), 'partial search')
assert(listPage.includes('E-mail, imię, nazwisko lub ID'), 'search placeholder')

// UI full email + Nie podano
assert(listPage.includes('row.email'), 'list shows email')
assert(!listPage.includes('maskedEmail'), 'list no mask')
assert(listPage.includes('adminDisplayName'), 'list display name')
assert(listPage.includes('privacyNote'), 'privacy note')
assert(detailPage.includes('data.email'), 'detail email')
assert(detailPage.includes('adminOptionalText(data.firstName)'), 'detail first')
assert(detailPage.includes("action: 'admin.user_lookup'"), 'detail audit action')
assert(detailPage.includes('targetId: userId'), 'audit target id only')
assert(
  detailPage.includes('metadata: { ok: true }') ||
    detailPage.includes('metadata: { ok: false }'),
  'audit metadata is ok flag only',
)
assert(!/metadata:\s*\{[^}]*email/i.test(detailPage), 'audit no email in metadata')

assert(types.includes('email: string | null'), 'types email')
assert(types.includes('firstName: string | null'), 'types firstName')
assert(types.includes("profileSource: AdminProfileSource"), 'types profileSource')
assert(!types.includes('maskedEmail'), 'types drop maskedEmail')

assert(adminDisplayName(null) === 'Nie podano', 'null display')
assert(adminDisplayName('  ') === 'Nie podano', 'blank display')
assert(adminDisplayName('Anna Kowalska') === 'Anna Kowalska', 'name display')
assert(adminOptionalText(null) === 'Nie podano', 'optional null')

// Audit helper must not require logging emails for list views
assert(!audit.includes('p_metadata: { email'), 'audit lib no email default')

console.log('PASS  admin-user-identity')
