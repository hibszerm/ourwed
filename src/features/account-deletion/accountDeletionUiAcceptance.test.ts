/**
 * Account deletion P0 Phase 2B.1 — Settings UI + service contracts.
 * Mocks only — does NOT call remote delete-account / Auth / Storage.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  AccountDeletionError,
} from '@/features/account-deletion/accountDeletionTypes'
import {
  isConfirmationPhraseValid,
  messageForAccountDeletionError,
} from '@/features/account-deletion/accountDeletionMessages'
import { clearAccountScopedClientStorage } from '@/features/account-deletion/accountDeletionService'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  account-deletion-ui — ${msg}`)
}

function assertIncludes(hay: string, needle: string, msg: string) {
  assert(hay.includes(needle), `${msg} (missing: ${needle})`)
}

function assertNotIncludes(hay: string, needle: string, msg: string) {
  assert(!hay.includes(needle), `${msg} (unexpected: ${needle})`)
}

const PAGE = 'src/pages/AccountSettingsPage.tsx'
const ZONE = 'src/features/account-deletion/AccountDeletionDangerZone.tsx'
const DIALOG = 'src/features/account-deletion/AccountDeletionDialog.tsx'
const SERVICE = 'src/features/account-deletion/accountDeletionService.ts'
const LANDING = 'src/pages/LandingPage.tsx'
const REGISTER = 'src/features/auth/components/RegisterForm.tsx'

{
  assert(existsSync(join(ROOT, ZONE)), 'danger zone exists')
  assert(existsSync(join(ROOT, DIALOG)), 'dialog exists')
  assert(existsSync(join(ROOT, SERVICE)), 'service exists')
  console.log('PASS  1. artifacts')
}

{
  const page = read(PAGE)
  const zone = read(ZONE)
  const dialog = read(DIALOG)
  assertIncludes(page, 'AccountDeletionDangerZone', 'page wires danger zone')
  assertIncludes(page, 'Strefa niebezpieczna', 'danger section header')
  assertIncludes(zone, 'Usuń konto', 'initial CTA label')
  assertIncludes(zone, 'AccountDeletionDialog', 'opens dialog component')
  assertIncludes(zone, 'onClick={() => setOpen(true)}', 'CTA opens dialog')
  assertIncludes(dialog, 'Usuń konto na zawsze', 'final destructive label')
  assertIncludes(dialog, 'ACCOUNT_DELETION_CONFIRMATION_PHRASE', 'typed confirm')
  assertIncludes(dialog, 'autoComplete="current-password"', 'password autocomplete')
  assertIncludes(dialog, 'busy={submitting}', 'modal busy while deleting')
  assertIncludes(dialog, 'submittingRef', 'double-submit guard')
  assertIncludes(dialog, "setPassword('')", 'password cleared on submit start')
  assertIncludes(dialog, 'disabled={!canSubmit}', 'submit gated')
  assertIncludes(dialog, 'isConfirmationPhraseValid', 'exact phrase gate')
  assertIncludes(dialog, 'password.length > 0', 'password required')
  console.log('PASS  2. UI structure + enablement gates')
}

{
  const service = read(SERVICE)
  assertIncludes(service, "const DELETE_ACCOUNT_FN = 'delete-account'", 'correct endpoint name')
  assertIncludes(service, 'functions.invoke(DELETE_ACCOUNT_FN', 'invokes delete-account')
  assertIncludes(service, 'body: { password: trimmed }', 'password-only body')
  assert(
    !/body:\s*\{[\s\S]*?userId/.test(service),
    'request body never includes userId',
  )
  assertNotIncludes(service, 'SERVICE_ROLE', 'no service role in client')
  assertNotIncludes(service, 'service_role', 'no service_role string')
  assertNotIncludes(service, 'erase_account_data', 'browser never calls RPC')
  assertIncludes(service, 'FunctionsFetchError', 'network ambiguity branch')
  assertIncludes(service, 'getUser()', 'session probe after ambiguous failure')
  assertIncludes(service, 'finalizeAccountDeletionClient', 'success cleanup')
  assertIncludes(service, 'resetTenantClientState', 'query cache clear')
  assertIncludes(service, 'window.location.replace', 'hard navigate home')
  assertIncludes(service, 'ACCOUNT_DELETED_QUERY', 'success query param constant')
  assertIncludes(service, 'clearAccountScopedClientStorage', 'targeted storage clear')
  assertNotIncludes(service, 'localStorage.clear()', 'no blind clear')
  console.log('PASS  3. service integration contracts')
}

{
  assert(ACCOUNT_DELETION_CONFIRMATION_PHRASE === 'USUŃ KONTO', 'phrase constant')
  assert(isConfirmationPhraseValid('USUŃ KONTO'), 'exact match')
  assert(isConfirmationPhraseValid('  USUŃ KONTO  '), 'trim match')
  assert(!isConfirmationPhraseValid('USUN KONTO'), 'diacritics required')
  assert(!isConfirmationPhraseValid('usuń konto'), 'case sensitive')
  assert(!isConfirmationPhraseValid(''), 'empty invalid')
  assert(!isConfirmationPhraseValid('USUŃ'), 'partial invalid')

  assert(
    messageForAccountDeletionError('REAUTH_FAILED').includes('Hasło jest nieprawidłowe'),
    'REAUTH_FAILED copy',
  )
  assert(
    messageForAccountDeletionError('RATE_LIMITED').includes('zbyt wiele prób'),
    'RATE_LIMITED copy',
  )
  assert(
    messageForAccountDeletionError('ADMIN_DELETION_BLOCKED').includes(
      'kontakt.ourwed@gmail.com',
    ),
    'ADMIN_DELETION_BLOCKED uses support email',
  )
  assert(
    messageForAccountDeletionError('DATABASE_ERASURE_FAILED').includes(
      'Nie udało się dokończyć usuwania',
    ),
    'generic stage failure',
  )
  assert(
    !messageForAccountDeletionError('STORAGE_ERASURE_FAILED').toLowerCase().includes('storage'),
    'no internal stage leak',
  )
  const err = new AccountDeletionError('REAUTH_FAILED', 'x')
  assert(err.code === 'REAUTH_FAILED', 'typed error')
  console.log('PASS  4. confirmation + error mapping')
}

{
  const landing = read(LANDING)
  assertIncludes(landing, 'AccountDeletedNotice', 'landing shows deleted notice')
  const notice = read('src/features/account-deletion/AccountDeletedNotice.tsx')
  assertIncludes(notice, 'Konto zostało usunięte.', 'success copy')
  assertIncludes(notice, 'history.replaceState', 'strips query param')
  console.log('PASS  5. success landing notice')
}

{
  // Targeted storage cleanup — preserve global preference keys
  const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const store: Record<string, string> = {
    'ourwed:appearance': 'keep',
    'ourwed:theme-id': 'keep',
    'ourwed:interface-style': 'keep',
    'ourwed:weddings-view-mode': 'keep',
    [`ourwed:appearance:u:${uid}`]: 'drop',
    [`ourwed:theme-id:u:${uid}`]: 'drop',
    'ourwed:calendar-backfill-pending': 'drop',
    'ourwed:ai-contract-lab-wedding-id': 'drop',
    'other-app:key': 'keep-foreign',
  }
  const proto = {
    get length() {
      return Object.keys(store).length
    },
    key(i: number) {
      return Object.keys(store)[i] ?? null
    },
    getItem(k: string) {
      return store[k] ?? null
    },
    setItem(k: string, v: string) {
      store[k] = v
    },
    removeItem(k: string) {
      delete store[k]
    },
  }
  const prev = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: proto,
  })
  try {
    clearAccountScopedClientStorage(uid)
    assert(store['ourwed:appearance'] === 'keep', 'preserve global appearance')
    assert(store['ourwed:theme-id'] === 'keep', 'preserve global theme')
    assert(store['ourwed:weddings-view-mode'] === 'keep', 'preserve view mode')
    assert(store['other-app:key'] === 'keep-foreign', 'preserve foreign keys')
    assert(!store[`ourwed:appearance:u:${uid}`], 'drop user appearance')
    assert(!store['ourwed:calendar-backfill-pending'], 'drop calendar pending')
    assert(!store['ourwed:ai-contract-lab-wedding-id'], 'drop lab wedding')
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: prev,
    })
  }
  console.log('PASS  6. targeted client storage cleanup')
}

{
  const register = read(REGISTER)
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration locked')
  const dialog = read(DIALOG)
  assertNotIncludes(dialog, 'console.log', 'no password/debug logging in dialog')
  assertNotIncludes(read(SERVICE), 'console.log(password', 'no password log in service')
  console.log('PASS  7. registration lock + no password logging')
}

console.log('\nPASS  account deletion Phase 2B.1 UI acceptance')
