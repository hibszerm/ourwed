/**
 * Validates frontend RPC call sites against SQL signatures and rpcContracts.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADMIN_PHASE2_RPC_CONTRACTS } from '@/admin/api/rpcContracts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  admin-rpc-contracts — ${msg}`)
}

const api = readFileSync(join(ROOT, 'src/admin/api/adminApi.ts'), 'utf8')
const corrective = readFileSync(
  join(ROOT, 'supabase/migrations/20260806180000_admin_phase2_rpc_signature_fix.sql'),
  'utf8',
)
const original = readFileSync(
  join(ROOT, 'supabase/migrations/20260806140000_admin_phase2_aggregates.sql'),
  'utf8',
)

/** Parse `create or replace function public.name(args)` identity args from SQL. */
function parseSqlIdentityArgs(sql: string, name: string): string[] {
  const re = new RegExp(
    String.raw`create\s+or\s+replace\s+function\s+public\.${name}\s*\(([^)]*)\)`,
    'i',
  )
  const m = sql.match(re)
  assert(m, `SQL definition missing for ${name}`)
  const raw = (m[1] ?? '').trim()
  if (!raw) return []
  return raw.split(',').map((part) => {
    const cleaned = part.trim()
    // "p_days integer default 30" → p_days
    return cleaned.split(/\s+/)[0]!
  })
}

function parseFrontendArgs(rpcName: string): string[] {
  // Match callRpc('name', { ... }) or callRpc('name')
  const withArgs = new RegExp(
    String.raw`callRpc\(\s*'${rpcName}'\s*,\s*\{([^}]*)\}`,
    'm',
  )
  const bare = new RegExp(String.raw`callRpc\(\s*'${rpcName}'\s*\)`, 'm')
  const m = api.match(withArgs)
  if (m) {
    const body = m[1] ?? ''
    const keys = [...body.matchAll(/([a-zA-Z_][\w]*)\s*:/g)].map((x) => x[1]!)
    return keys
  }
  assert(bare.test(api), `frontend callRpc missing for ${rpcName}`)
  return []
}

// Content-Length: 13 diagnosis — browser body for today-range is p_days with a single digit
assert(JSON.stringify({ p_days: 1 }) === '{"p_days":1}', 'compact payload shape')
assert(JSON.stringify({ p_days: 1 }).length === 12, 'compact {"p_days":1} is 12 bytes')
assert('{"p_days": 1}'.length === 13, 'spaced {"p_days": 1} is 13 bytes (Network Content-Length)')
assert(api.includes("callRpc('admin_get_registration_series', { p_days: days })"), 'registration payload key p_days')

assert(corrective.includes("notify pgrst, 'reload schema'"), 'schema reload notify')
assert(corrective.includes('drop function if exists public.admin_get_registration_series(integer)'), 'drop overload')
assert(corrective.includes('day_spine'), 'registration CTE rename')
assert(corrective.includes('day_count'), 'registration var rename')
assert(corrective.includes('revoke all on function public.admin_get_registration_series(integer) from public, anon'), 'revoke anon')
assert(original.includes('admin_get_registration_series(p_days integer default 30)'), 'original signature documented')

for (const contract of ADMIN_PHASE2_RPC_CONTRACTS) {
  const sqlArgs = parseSqlIdentityArgs(corrective, contract.name)
  const expected = contract.args.map((a) => a.name)
  assert(
    JSON.stringify(sqlArgs) === JSON.stringify(expected),
    `${contract.name} SQL args ${JSON.stringify(sqlArgs)} !== ${JSON.stringify(expected)}`,
  )

  const feArgs = parseFrontendArgs(contract.name)
  assert(
    JSON.stringify(feArgs) === JSON.stringify(expected),
    `${contract.name} frontend args ${JSON.stringify(feArgs)} !== ${JSON.stringify(expected)}`,
  )

  assert(api.includes(`'${contract.name}'`), `adminApi references ${contract.name}`)
  assert(
    corrective.includes(`grant execute on function public.${contract.name}`),
    `grant execute ${contract.name}`,
  )
}

// Diagnostic path for 42883
assert(api.includes('ADM-RPC-SIGNATURE'), 'dev signature category')
assert(api.includes('42883'), 'handles pg 42883')
assert(api.includes('PGRST202'), 'handles PostgREST missing fn')
assert(!api.includes('Authorization'), 'no auth header logging')
assert(!api.includes('service_role'), 'no service_role')

console.log('PASS  admin-rpc-contracts')
