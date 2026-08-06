/**
 * OurWed Admin Phase 1 acceptance — static/source guarantees.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { maskEmail } from '@/admin/lib/maskEmail'
import {
  decideAdminAccess,
  isEnabledOwner,
  type AdminSessionStatus,
} from './lib/adminAccessDecision'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ADMIN = join(ROOT, 'src/admin')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  admin-phase1 — ${msg}`)
}

function readAll(dir: string): string {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules') continue
      out.push(readAll(full))
      continue
    }
    if (/\.(tsx?|css|md)$/.test(name) && !name.includes('.test.')) {
      out.push(readFileSync(full, 'utf8'))
    }
  }
  return out.join('\n')
}

const sources = readAll(ADMIN)
const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
const router = readFileSync(join(ROOT, 'src/routes/router.tsx'), 'utf8')
const migration = readFileSync(
  join(ROOT, 'supabase/migrations/20260805160000_admin_single_owner_foundation.sql'),
  'utf8',
)
const createOwner = readFileSync(join(ROOT, 'scripts/createAdminOwner.ts'), 'utf8')
const serverClient = readFileSync(
  join(ROOT, 'scripts/lib/supabaseAdminClient.ts'),
  'utf8',
)
const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8')

// Routes / registration
assert(existsSync(join(ADMIN, 'pages/AdminLoginPage.tsx')), 'login page')
assert(existsSync(join(ADMIN, 'pages/AdminMfaSetupPage.tsx')), 'mfa setup')
assert(existsSync(join(ADMIN, 'pages/AdminMfaVerifyPage.tsx')), 'mfa verify')
assert(existsSync(join(ADMIN, 'pages/AdminOverviewPage.tsx')), 'overview')
assert(existsSync(join(ADMIN, 'pages/AdminUnauthorizedPage.tsx')), 'unauthorized')
assert(!sources.includes("path: '/register'"), 'no admin register route')
assert(!sources.includes('/invite'), 'no invite route')
assert(!sources.includes('/admins/new'), 'no admins/new')
assert(!/admin.*register/i.test(sources) || !sources.includes('<Register'), 'no register UI')

// App boundary
assert(app.includes('AdminApp'), 'AdminApp wired')
assert(app.includes('resolveAdminMount'), 'host/path mount')
assert(router.includes("path: '/'"), 'customer / preserved')
assert(!router.includes("path: '/admin"), 'customer router has no /admin CRM')

// Authorization decision unit tests
assert(
  decideAdminAccess({
    loading: true,
    hasSession: false,
    status: null,
    assurance: null,
  }).kind === 'loading',
  'loading state',
)
assert(
  decideAdminAccess({
    loading: false,
    hasSession: false,
    status: null,
    assurance: null,
  }).kind === 'unauthenticated',
  'unauthenticated',
)

const nonAdmin: AdminSessionStatus = {
  isAdmin: false,
  enabled: false,
  role: null,
}
assert(
  decideAdminAccess({
    loading: false,
    hasSession: true,
    status: nonAdmin,
    assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
  }).kind === 'unauthorized',
  'normal user unauthorized',
)

const disabled: AdminSessionStatus = {
  isAdmin: true,
  enabled: false,
  role: 'owner',
}
assert(!isEnabledOwner(disabled), 'disabled owner fails')
assert(
  decideAdminAccess({
    loading: false,
    hasSession: true,
    status: disabled,
    assurance: { currentLevel: 'aal2', nextLevel: 'aal2' },
  }).kind === 'unauthorized',
  'disabled owner unauthorized',
)

const owner: AdminSessionStatus = {
  isAdmin: true,
  enabled: true,
  role: 'owner',
}
assert(
  decideAdminAccess({
    loading: false,
    hasSession: true,
    status: owner,
    assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
  }).kind === 'mfa_setup',
  'aal1/aal1 → setup',
)
assert(
  decideAdminAccess({
    loading: false,
    hasSession: true,
    status: owner,
    assurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
  }).kind === 'mfa_verify',
  'aal1/aal2 → verify',
)
assert(
  decideAdminAccess({
    loading: false,
    hasSession: true,
    status: owner,
    assurance: { currentLevel: 'aal2', nextLevel: 'aal2' },
  }).kind === 'authorized',
  'aal2 → overview',
)

// Guard / shell
const guard = readFileSync(join(ADMIN, 'auth/AdminAuthGuard.tsx'), 'utf8')
assert(guard.includes('admin-auth-loading'), 'loading sentinel')
assert(guard.includes("decision.kind === 'authorized'") || guard.includes('AAL2'), 'authorized gate')
assert(guard.includes('AdminShell'), 'shell only when authorized')

const overview = readFileSync(join(ADMIN, 'pages/AdminOverviewPage.tsx'), 'utf8')
assert(
  overview.includes('Kondycja platformy i rzeczywiste wykorzystanie OurWed'),
  'overview copy',
)
assert(
  overview.includes('fetchOverviewMetrics'),
  'overview uses server aggregates',
)
assert(
  !/\.from\(['"]weddings['"]\)|\.from\(['"]payments['"]\)/.test(overview),
  'no direct customer table queries in overview',
)

// Migration invariants
assert(migration.includes('admin_members'), 'admin_members table')
assert(migration.includes('admin_audit_log'), 'audit log')
assert(migration.includes('admin_members_enforce_single_owner'), 'single-owner trigger')
assert(migration.includes("role = 'owner'"), 'owner role check')
assert(migration.includes('get_admin_session_status'), 'status rpc')
assert(migration.includes('append_admin_audit_event'), 'audit rpc')
assert(migration.includes('enable row level security'), 'rls')

// Creation script
assert(pkg.includes('admin:create-owner'), 'npm script')
assert(createOwner.includes('MIN_PASSWORD_LENGTH = 16'), 'password policy')
assert(createOwner.includes('Refusing to silently promote'), 'no silent promote')
assert(createOwner.includes('An active administrator already exists'), 'refuse second owner')
assert(createOwner.includes('email_confirm: true'), 'confirm email')
assert(!createOwner.includes('console.log(password)'), 'password not logged')
assert(!createOwner.includes('console.log(confirm)'), 'confirm not logged')
assert(serverClient.includes('SUPABASE_SERVICE_ROLE_KEY'), 'service role env')
assert(serverClient.includes('must not be imported in a browser'), 'browser guard')
assert(!serverClient.includes('VITE_SUPABASE_SERVICE_ROLE_KEY='), 'no vite service assignment')

// Bundle safety — admin client sources must not reference service role
assert(!sources.includes('SERVICE_ROLE'), 'no service role in admin UI sources')
assert(!sources.includes('service_role'), 'no service_role in admin UI sources')

const mfaLib = readFileSync(join(ADMIN, 'lib/adminMfa.ts'), 'utf8')
const mfaCore = readFileSync(join(ADMIN, 'lib/adminMfaSetupCore.ts'), 'utf8')
assert(mfaLib.includes('prepareTotpSetup'), 'prepareTotpSetup exists')
assert(mfaCore.includes('unenroll'), 'unenroll stale factors')
assert(mfaCore.includes('setupInFlight'), 'in-flight idempotency guard')
assert(mfaCore.includes("status === 'verified'"), 'verified status check')
assert(!mfaCore.includes('friendlyName ==='), 'does not key off friendly name alone')
assert(!mfaCore.includes('friendly_name ==='), 'does not key off friendly_name alone')

// Email masking
assert(maskEmail('owner@example.com').includes('••••@example.com'), 'mask email')
assert(!maskEmail('ab@example.com').startsWith('ab@'), 'mask hides local')

// Docs
assert(existsSync(join(ROOT, 'docs/admin-phase1.md')), 'phase1 docs')

console.log('PASS  admin-phase1')
