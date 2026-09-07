/**
 * Account deletion P0 Phase 2A.3 — production-hardening acceptance.
 * Behavioral tests for Storage/calendar helpers + static contracts for SQL/Edge.
 * Does NOT execute destructive SQL or call production APIs / remote Storage.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertPrefixHasNoFiles,
  assertUserOwnedPrefix,
  eraseStoragePrefixUntilEmpty,
  STORAGE_LIST_LIMIT,
  type StorageErasureAdapter,
  type StorageListEntry,
} from '../../../supabase/functions/delete-account/storageErasure.ts'
import {
  cleanupCalendarCredentials,
  type CalendarCleanupDb,
} from '../../../supabase/functions/delete-account/calendarCleanup.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  account erasure — ${msg}`)
}

function assertIncludes(hay: string, needle: string, msg: string) {
  assert(hay.includes(needle), `${msg} (missing: ${needle})`)
}

function assertNotIncludes(hay: string, needle: string, msg: string) {
  assert(!hay.includes(needle), `${msg} (unexpected: ${needle})`)
}

async function assertThrows(
  fn: () => Promise<unknown>,
  codeOrMsg: string,
  msg: string,
) {
  try {
    await fn()
    throw new Error(`FAIL  account erasure — ${msg} (expected throw)`)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('FAIL  account erasure')) {
      throw err
    }
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : ''
    const text =
      err instanceof Error ? `${err.name}:${err.message}:${code}` : String(err)
    assert(text.includes(codeOrMsg), `${msg} (got: ${text})`)
  }
}

const MIGRATION = 'supabase/migrations/20260907180000_account_erasure_pipeline.sql'
const EDGE = 'supabase/functions/delete-account/index.ts'
const STORAGE_MOD = 'supabase/functions/delete-account/storageErasure.ts'
const CAL_MOD = 'supabase/functions/delete-account/calendarCleanup.ts'

// ---------------------------------------------------------------------------
// In-memory Storage mock
// ---------------------------------------------------------------------------

function createMemoryStorage(initial: string[]): {
  adapter: StorageErasureAdapter
  objects: Set<string>
  listCalls: Array<{ prefix: string; offset: number }>
  removeCalls: string[][]
} {
  const objects = new Set(initial)
  const listCalls: Array<{ prefix: string; offset: number }> = []
  const removeCalls: string[][] = []

  function childrenOf(prefix: string): StorageListEntry[] {
    const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`
    const names = new Map<string, StorageListEntry>()
    for (const path of objects) {
      if (path === prefix) continue
      if (!path.startsWith(prefixWithSlash) && path !== prefix) {
        // also allow prefix === userId root
        if (!(prefix && path.startsWith(`${prefix}/`))) continue
      }
      const rest = path.slice(prefix.length + (prefix ? 1 : 0))
      if (!rest) continue
      const slash = rest.indexOf('/')
      if (slash === -1) {
        names.set(rest, { name: rest, id: `id:${path}` })
      } else {
        const folder = rest.slice(0, slash)
        if (!names.has(folder)) {
          names.set(folder, { name: folder, id: null })
        }
      }
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  const adapter: StorageErasureAdapter = {
    async list(prefix, opts) {
      listCalls.push({ prefix, offset: opts.offset })
      const all = childrenOf(prefix)
      const slice = all.slice(opts.offset, opts.offset + opts.limit)
      return { entries: slice }
    },
    async remove(paths) {
      removeCalls.push([...paths])
      for (const p of paths) {
        objects.delete(p)
      }
      return {}
    },
  }

  return { adapter, objects, listCalls, removeCalls }
}

// ---------------------------------------------------------------------------
// 1. Artifacts
// ---------------------------------------------------------------------------

{
  assert(existsSync(join(ROOT, MIGRATION)), 'migration file exists')
  assert(existsSync(join(ROOT, EDGE)), 'Edge Function exists')
  assert(existsSync(join(ROOT, STORAGE_MOD)), 'storage module exists')
  assert(existsSync(join(ROOT, CAL_MOD)), 'calendar module exists')
  console.log('PASS  1. artifacts present')
}

// ---------------------------------------------------------------------------
// 2. Storage algorithm — behavioral
// ---------------------------------------------------------------------------

{
  assert(assertUserOwnedPrefix('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/x'), 'own prefix')
  assert(
    !assertUserOwnedPrefix(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee/x',
    ),
    'other user blocked',
  )

  const userA = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const userB = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'

  // 0 files
  {
    const mem = createMemoryStorage([])
    const r = await eraseStoragePrefixUntilEmpty(mem.adapter, userA)
    assert(r.deletedObjects === 0, '0 files → 0 deleted')
    await assertPrefixHasNoFiles(mem.adapter, userA)
  }

  // 1 file
  {
    const mem = createMemoryStorage([`${userA}/doc.pdf`])
    const r = await eraseStoragePrefixUntilEmpty(mem.adapter, userA)
    assert(r.deletedObjects === 1, '1 file deleted')
    assert(mem.objects.size === 0, 'store empty')
  }

  // nested files
  {
    const mem = createMemoryStorage([
      `${userA}/a/b/c.pdf`,
      `${userA}/a/d.pdf`,
      `${userA}/root.pdf`,
    ])
    await eraseStoragePrefixUntilEmpty(mem.adapter, userA)
    assert(mem.objects.size === 0, 'nested erased')
  }

  // >1000 flat objects + no offset-while-mutating on delete path
  {
    const paths = Array.from(
      { length: STORAGE_LIST_LIMIT + 50 },
      (_, i) => `${userA}/f-${String(i).padStart(4, '0')}.bin`,
    )
    const mem = createMemoryStorage(paths)
    await eraseStoragePrefixUntilEmpty(mem.adapter, userA)
    assert(mem.objects.size === 0, '>1000 flat erased')
    // Flat-file erasure must only list this prefix at offset 0 (never advance
    // offset while deleting from the same listing).
    const offsetsWhileNonEmpty = mem.listCalls
      .filter((c) => c.prefix === userA)
      .map((c) => c.offset)
    assert(
      offsetsWhileNonEmpty.every((o) => o === 0),
      'flat >1000 uses offset 0 only (no offset-while-mutating)',
    )
  }

  // another user's prefix untouched
  {
    const mem = createMemoryStorage([
      `${userA}/mine.pdf`,
      `${userB}/other.pdf`,
      `${userB}/nested/x.pdf`,
    ])
    await eraseStoragePrefixUntilEmpty(mem.adapter, userA)
    assert(!mem.objects.has(`${userA}/mine.pdf`), 'A erased')
    assert(mem.objects.has(`${userB}/other.pdf`), 'B root intact')
    assert(mem.objects.has(`${userB}/nested/x.pdf`), 'B nested intact')
  }

  // retry after partial deletion (idempotent)
  {
    const mem = createMemoryStorage([
      `${userA}/1.pdf`,
      `${userA}/2.pdf`,
      `${userA}/3.pdf`,
    ])
    // Simulate partial: manually remove one then run full erase
    mem.objects.delete(`${userA}/1.pdf`)
    await eraseStoragePrefixUntilEmpty(mem.adapter, userA)
    assert(mem.objects.size === 0, 'idempotent after partial')
  }

  // failure stops — verify throws when remove fails
  {
    const mem = createMemoryStorage([`${userA}/x.pdf`])
    const failing: StorageErasureAdapter = {
      list: mem.adapter.list,
      async remove() {
        return { error: 'boom' }
      },
    }
    await assertThrows(
      () => eraseStoragePrefixUntilEmpty(failing, userA),
      'storage_remove_failed',
      'remove failure throws StorageErasureError',
    )
  }

  // final verification detects leftover file
  {
    const mem = createMemoryStorage([`${userA}/ghost.pdf`])
    await assertThrows(
      () => assertPrefixHasNoFiles(mem.adapter, userA),
      'storage_verify_not_empty',
      'verify catches leftover',
    )
  }

  console.log('PASS  2. Storage algorithm behavioral')
}

// ---------------------------------------------------------------------------
// 3. Calendar local vs remote semantics
// ---------------------------------------------------------------------------

{
  const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  function baseDb(overrides: Partial<CalendarCleanupDb> = {}): CalendarCleanupDb {
    return {
      async findGoogleIntegration() {
        return { id: 'int-1', provider: 'google' }
      },
      async loadGoogleSecret() {
        return { refresh_token_enc: 'enc', access_token_enc: null }
      },
      async deleteGoogleSecret() {
        return {}
      },
      async clearGoogleIntegration() {
        return {}
      },
      async clearAppleIntegration() {
        return {}
      },
      async deleteAllSecretsForUser() {
        return {}
      },
      ...overrides,
    }
  }

  // remote revoke fail + local clear succeeds → continue
  {
    let remoteTried = false
    const result = await cleanupCalendarCredentials(userId, {
      db: baseDb(),
      async decryptSecret() {
        return 'tok'
      },
      resolveTokenKey: () => 'k',
      async revokeGoogleToken() {
        remoteTried = true
        throw new Error('network')
      },
    })
    assert(remoteTried, 'remote revoke attempted')
    assert(result.remoteRevokeOk === false, 'remote fail recorded')
  }

  // local credential clear fails → stop
  {
    await assertThrows(
      () =>
        cleanupCalendarCredentials(userId, {
          db: baseDb({
            async deleteGoogleSecret() {
              return { error: 'db_down' }
            },
          }),
          async decryptSecret() {
            return 'tok'
          },
          resolveTokenKey: () => 'k',
          async revokeGoogleToken() {},
        }),
      'google_secret_delete_failed',
      'local secret delete fails hard',
    )
  }

  // Apple clear fails → stop
  {
    await assertThrows(
      () =>
        cleanupCalendarCredentials(userId, {
          db: baseDb({
            async clearAppleIntegration() {
              return { error: 'apple_fail' }
            },
          }),
          async decryptSecret() {
            return 'tok'
          },
          resolveTokenKey: () => 'k',
          async revokeGoogleToken() {},
        }),
      'apple_integration_clear_failed',
      'Apple clear fails hard',
    )
  }

  console.log('PASS  3. Calendar local-mandatory / remote-best-effort')
}

// ---------------------------------------------------------------------------
// 4. Migration contracts (security + ordering + admin + rate limit)
// ---------------------------------------------------------------------------

{
  const sql = read(MIGRATION)
  assertIncludes(sql, "ourwed.account_erasure", 'GUC name')
  assertIncludes(
    sql,
    "pg_catalog.set_config('ourwed.account_erasure', 'on', true)",
    'transaction-local GUC via pg_catalog',
  )
  assertIncludes(
    sql,
    "pg_catalog.current_setting('ourwed.account_erasure', true) is distinct from 'on'",
    'trigger checks GUC on DELETE',
  )
  assertIncludes(sql, "set search_path = ''", 'hardened empty search_path')
  assertIncludes(sql, "elsif tg_op = 'DELETE'", 'DELETE branch')
  assertIncludes(sql, "if tg_op = 'UPDATE'", 'UPDATE branch retained')
  assertIncludes(sql, 'Locked wedding document % is immutable', 'UPDATE immutability')
  assertIncludes(sql, 'Cannot unlock wedding document %', 'unlock blocked')
  assertIncludes(sql, 'sole_admin_blocked', 'sole admin block')
  assertIncludes(sql, 'admin_members', 'admin_members audit')
  assertIncludes(sql, 'account_deletion_rate_limits', 'rate limit table')
  assertIncludes(sql, 'account_deletion_rate_limit_consume', 'rate limit RPC')
  assertIncludes(
    sql,
    'grant execute on function public.account_deletion_rate_limit_consume(uuid, integer, integer) to service_role',
    'rate limit service_role only',
  )
  assertIncludes(
    sql,
    'revoke all on function public.account_deletion_rate_limit_consume(uuid, integer, integer) from authenticated',
    'rate limit not for authenticated',
  )
  assertIncludes(sql, 'xyycwllsovpxlcustpcv', 'production project ref documented')
  assertNotIncludes(sql, 'delete from public.admin_audit_log', 'no audit wipe')
  assertNotIncludes(sql, 'delete from public.document_variable_registry', 'no registry wipe')

  // Ordering markers
  const formInst = sql.indexOf('delete from public.form_instances')
  const forms = sql.indexOf('delete from public.forms')
  const extrasJ = sql.indexOf('delete from public.wedding_extra_services')
  const extras = sql.indexOf('delete from public.extra_services')
  const drafts = sql.indexOf('delete from public.wedding_document_drafts')
  const runs = sql.indexOf('delete from public.wedding_contract_generation_runs')
  const templates = sql.lastIndexOf('delete from public.document_templates')
  const links = sql.indexOf('delete from public.document_template_component_links')
  const users = sql.lastIndexOf('delete from public.users')
  assert(formInst > 0 && formInst < forms, 'forms ← form_instances order')
  assert(extrasJ > 0 && extrasJ < extras, 'extra_services ← wedding_extra_services')
  assert(drafts > 0 && drafts < templates, 'templates ← drafts')
  assert(runs > 0 && runs < templates, 'templates ← runs')
  assert(links > 0, 'component links deleted')
  assert(users > forms && users > extras && users > templates, 'users last')

  assertIncludes(sql, 'security definer', 'SECURITY DEFINER')
  assertIncludes(sql, 'auth.role()', 'service_role gate')
  assertIncludes(
    sql,
    'grant execute on function public.erase_account_data(uuid) to service_role',
    'grant service_role only',
  )
  assertIncludes(
    sql,
    'revoke all on function public.erase_account_data(uuid) from authenticated',
    'revoke authenticated',
  )
  console.log('PASS  4. Migration security + ordering + admin + rate limit')
}

// ---------------------------------------------------------------------------
// 5. Edge orchestration contracts
// ---------------------------------------------------------------------------

{
  const edge = read(EDGE)
  assertIncludes(edge, 'auth.admin.deleteUser', 'Auth Admin delete')
  assertIncludes(edge, 'erase_account_data', 'RPC')
  assertIncludes(edge, 'signInWithPassword', 'password reauth')
  assertIncludes(edge, 'persistSession: false', 'ephemeral reauth')
  assertIncludes(edge, 'body.userId', 'rejects body userId')
  assertIncludes(edge, 'REAUTH_METHOD_UNAVAILABLE', 'passwordless code')
  assertIncludes(edge, 'RATE_LIMITED', 'rate limit code')
  assertIncludes(edge, 'ADMIN_DELETION_BLOCKED', 'admin block code')
  assertIncludes(edge, 'CALENDAR_LOCAL_CLEANUP_FAILED', 'calendar local code')
  assertIncludes(edge, 'STORAGE_ERASURE_FAILED', 'storage code')
  assertIncludes(edge, 'eraseStoragePrefixUntilEmpty', 'empty-proof storage')
  assertIncludes(edge, 'assertPrefixHasNoFiles', 'final storage verify')
  assertIncludes(edge, 'cleanupCalendarCredentials', 'calendar helper')
  assertIncludes(edge, 'account_deletion_rate_limit_consume', 'rate limit RPC')
  assertIncludes(edge, 'already_deleted', 'auth-already-gone idempotent')
  assertIncludes(edge, 'xyycwllsovpxlcustpcv', 'project ref documented')
  assertIncludes(edge, 'Phase 2B', 'frontend retry semantics documented')

  const authDeleteIdx = edge.lastIndexOf('auth.admin.deleteUser')
  const storageCallIdx = edge.lastIndexOf('eraseStoragePrefixUntilEmpty')
  const rpcCallIdx = edge.lastIndexOf("'erase_account_data'")
  const calendarIdx = edge.lastIndexOf('cleanupCalendarCredentials')
  assert(calendarIdx > 0 && calendarIdx < rpcCallIdx, 'Calendar before RPC')
  assert(storageCallIdx > rpcCallIdx, 'Storage after RPC')
  assert(authDeleteIdx > storageCallIdx, 'Auth delete after Storage')

  // Failure stops Auth: storage/calendar errors return before auth delete
  const storageFailReturn = edge.indexOf(
    "errorResponse(\n      'STORAGE_ERASURE_FAILED'",
  )
  assert(
    storageFailReturn > 0 && storageFailReturn < authDeleteIdx,
    'Storage failure returns before Auth delete',
  )

  assertNotIncludes(edge, 'AccountSettingsPage', 'no UI coupling')
  console.log('PASS  5. Edge orchestration contracts')
}

// ---------------------------------------------------------------------------
// 6. No UI; registration locked
// ---------------------------------------------------------------------------

{
  // Phase 2B.1 adds Settings UI; backend Edge must stay decoupled from page.
  assertNotIncludes(read(EDGE), 'AccountSettingsPage', 'Edge still has no UI coupling')
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration locked')
  console.log('PASS  6. registration still locked; Edge remains UI-decoupled')
}

console.log('\nPASS  account erasure Phase 2A.3 production-hardening acceptance')
console.log(`
CONTROLLED SINGLE-PROJECT QA (do NOT run in this phase):
REMOTE TARGET: xyycwllsovpxlcustpcv (production-like — synthetic accounts only)
1. Apply migration 20260907180000_account_erasure_pipeline.sql
2. Deploy delete-account Edge Function
3. Keep Settings UI hidden (no Phase 2B yet)
4. Create TEST_ERASURE_A and TEST_CONTROL_B (fake data only)
5. Delete A via backend endpoint; prove B + system rows untouched
6. Remove disposable B separately
7. Only after PASS → Phase 2B UI
`)
