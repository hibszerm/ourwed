/** Regression coverage for the production privileged-helper ACL hotfix. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const migration = read(
  'supabase/migrations/20261008143529_revoke_privileged_helper_client_execution.sql',
)
const presetsMigration = read(
  'supabase/migrations/20260824220000_official_pre_wedding_presets_v1.sql',
)
const remapMigration = read(
  'supabase/migrations/20260722170000_fix_templates_and_link_legacy_auth.sql',
)
const liveTriggerMigration = read(
  'supabase/migrations/20260907200000_user_legal_acceptances.sql',
)
const aclTest = read('supabase/tests/privileged_helper_execute_privileges.sql')

assert(
  /revoke\s+execute\s+on\s+function\s+public\.remap_legacy_studio_user\(uuid,\s*uuid\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i.test(
    migration,
  ),
  'remap helper client grants are revoked by exact signature',
)
assert(
  /revoke\s+execute\s+on\s+function\s+public\.provision_official_pre_wedding_presets\(uuid\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i.test(
    migration,
  ),
  'preset helper client grants are revoked by exact signature',
)
assert(!/\bgrant\s+execute\b/i.test(migration), 'no client or broad grants are added')
assert(
  !/\b(insert|update|delete|alter|drop)\s+(into\s+)?public\./i.test(migration),
  'hotfix migration changes no data or schema objects',
)
assert(
  presetsMigration.includes('perform public.provision_official_pre_wedding_presets(new.id)'),
  'original new-user trigger still calls preset provisioning',
)
assert(
  liveTriggerMigration.includes('perform public.provision_official_pre_wedding_presets(new.id)'),
  'current legal-acceptance trigger still calls preset provisioning',
)
assert(
  remapMigration.includes('perform public.remap_legacy_studio_user(r.legacy_id, r.auth_id)'),
  'historical remap is still available to its migration owner path',
)
assert(
  /has_function_privilege\('anon',[\s\S]*?has_function_privilege\('authenticated'/i.test(
    aclTest,
  ),
  'isolated SQL test checks effective anon and authenticated privileges',
)
assert(
  aclTest.includes('trusted new-user preset call is missing'),
  'isolated SQL test checks trusted trigger wiring',
)

console.log('PASS — privilegedHelperExecutePrivilegesAcceptance')
