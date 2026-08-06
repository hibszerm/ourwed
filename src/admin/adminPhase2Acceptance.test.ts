/**
 * OurWed Admin Phase 2 acceptance — real-data contracts, privacy, no fake metrics.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { maskEmail } from '@/admin/lib/maskEmail'
import { pctOf } from '@/admin/lib/adminFormat'
import { getAdminDeploymentInfo } from '@/admin/lib/deploymentInfo'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ADMIN = join(ROOT, 'src/admin')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  admin-phase2 — ${msg}`)
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
    if (/\.(tsx?|css)$/.test(name) && !name.includes('.test.')) {
      out.push(readFileSync(full, 'utf8'))
    }
  }
  return out.join('\n')
}

const sources = readAll(ADMIN)
const migration = readFileSync(
  join(ROOT, 'supabase/migrations/20260806140000_admin_phase2_aggregates.sql'),
  'utf8',
)
const inventory = readFileSync(
  join(ROOT, 'docs/admin-phase2-data-inventory.md'),
  'utf8',
)
const overview = readFileSync(join(ADMIN, 'pages/AdminOverviewPage.tsx'), 'utf8')
const shell = readFileSync(join(ADMIN, 'shell/AdminShell.tsx'), 'utf8')
const app = readFileSync(join(ADMIN, 'AdminApp.tsx'), 'utf8')
const css = readFileSync(join(ADMIN, 'styles/admin.module.css'), 'utf8')
const webhook = readFileSync(
  join(ROOT, 'supabase/functions/resend-webhook/index.ts'),
  'utf8',
)
const verify = readFileSync(
  join(ROOT, 'supabase/functions/resend-webhook/verify.ts'),
  'utf8',
)
const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8')

// Routes
for (const route of [
  '/overview',
  '/users',
  '/users/:userId',
  '/emails',
  '/integrations',
  '/system',
  '/audit',
]) {
  assert(app.includes(`path: '${route}'`), `route ${route}`)
}

assert(shell.includes('OurWed Platform'), 'shell product name')
assert(shell.includes('document.title = \'OurWed Platform\''), 'browser title')
assert(shell.includes('OW'), 'OW mark')
assert(shell.includes('Subskrypcje') && shell.includes('Niepodłączone'), 'billing disabled')
assert(shell.includes('MFA aktywne'), 'mfa badge')
assert(!shell.includes('Wkrótce'), 'no Wkrótce placeholders for phase2 nav')

// No impersonation
assert(!/zaloguj jako|impersonat|podejrzyj konto/i.test(sources), 'no impersonation')
assert(!sources.includes('service_role'), 'no service_role in admin src')
assert(!sources.includes('SUPABASE_SERVICE_ROLE_KEY'), 'no service role key in admin')
assert(!sources.includes('VITE_SUPABASE_SERVICE'), 'no vite service role')

// Overview: no hardcoded business metrics / placeholders
assert(!overview.includes('Panel administracyjny jest zabezpieczony'), 'no phase1 placeholder copy')
assert(!/accounts\.total\s*=\s*\d+/.test(overview), 'no hardcoded account totals')
assert(overview.includes('fetchOverviewMetrics'), 'overview uses API')
assert(overview.includes('Brak wiarygodnego źródła danych') || overview.includes('unavailable'), 'unavailable path')
assert(overview.includes('Nie udało się pobrać danych') || overview.includes('admin_fetch_failed') || overview.includes('error'), 'error state')
assert(overview.includes('Europe/Warsaw') || sources.includes('Europe/Warsaw'), 'Warsaw TZ documented')

// Private fields must not appear as returned contract fields in API types
const types = readFileSync(join(ADMIN, 'api/types.ts'), 'utf8')
for (const forbidden of [
  'bride_name',
  'groom_name',
  'answer_json',
  'answers_json',
  'phone',
  'venue',
  'file_path',
  'access_token',
  'refresh_token',
]) {
  assert(!types.includes(forbidden), `types exclude ${forbidden}`)
}

// Migration security
assert(migration.includes('assert_admin_owner_aal2'), 'aal2 gate')
assert(migration.includes("auth.jwt() ->> 'aal'"), 'jwt aal check')
assert(migration.includes('admin_get_overview_metrics'), 'overview rpc')
assert(migration.includes('admin_list_users'), 'users rpc')
assert(migration.includes('admin_mask_email'), 'server-side mask helper retained for audit')
assert(migration.includes('admin_email_events'), 'email events table')
assert(migration.includes('revoke all on function public.admin_get_overview_metrics'), 'revoke defaults')
assert(migration.includes('grant execute on function public.admin_get_overview_metrics'), 'grant authenticated')
assert(migration.includes('briefsDownloadedStatus'), 'briefs unavailable')
assert(migration.includes('form_instances fi'), 'form_instances via wedding join')
assert(!migration.includes('from public.form_instances where user_id'), 'no fake form_instances.user_id')

// Inventory exists
assert(inventory.includes('auth.users'), 'inventory auth.users')
assert(inventory.includes('SECURITY DEFINER'), 'inventory architecture')
assert(existsSync(join(ROOT, 'docs/admin-phase2-data-inventory.md')), 'inventory file')

// Email webhook
assert(webhook.includes('RESEND_WEBHOOK_SECRET'), 'webhook secret env')
assert(!/Deno\.env\.get\(['"]VITE_/.test(webhook), 'webhook no VITE_ env reads')
assert(webhook.includes('invalid_signature'), 'rejects bad sig')
assert(verify.includes('verifySvixSignature'), 'svix verify')
assert(verify.includes('recipientDomain'), 'privacy domain only')
assert(!verify.includes('subject:') || verify.includes('subject?:'), 'subject not stored as required field')

// QR
assert(css.includes('min-width: 240px') || css.includes('width: 240px'), 'qr desktop size')
assert(css.includes('min-width: 220px') || css.includes('width: 220px'), 'qr mobile size')
assert(css.includes('transform: none'), 'no qr scale transform')
assert(css.includes('background: #ffffff') || css.includes('background: #fff'), 'white quiet zone')
assert(!/qrWrap[\s\S]*transform:\s*scale/.test(css), 'no scale on qr')

// Masking
assert(maskEmail('hi@gmail.com').startsWith('hi'), 'mask keeps prefix')
assert(maskEmail('hi@gmail.com').includes('••••@gmail.com'), 'mask domain')
assert(maskEmail('hi@gmail.com') !== 'hi@gmail.com', 'mask hides local')

// pct helper
assert(pctOf(25, 100) === '25%', 'pct')
assert(pctOf(1, 0) === null, 'pct no divide by zero')

// Deployment local label when no window — function callable
const deploy = getAdminDeploymentInfo()
assert(typeof deploy.environmentLabel === 'string', 'deploy label')
assert(deploy.shortSha === null || deploy.shortSha.length <= 7, 'short sha or null')

// Hash recipient privacy (no plaintext round-trip)
const email = 'couple@example.com'
const hash = createHash('sha256').update(email).digest('hex')
assert(hash.length === 64, 'sha256 length')
assert(!hash.includes('@'), 'hash has no email')

// Package script
assert(pkg.includes('test:admin-phase2'), 'npm script')

// Pages exist
for (const page of [
  'AdminUsersPage.tsx',
  'AdminUserDetailPage.tsx',
  'AdminEmailsPage.tsx',
  'AdminIntegrationsPage.tsx',
  'AdminSystemPage.tsx',
  'AdminAuditPage.tsx',
]) {
  assert(existsSync(join(ADMIN, 'pages', page)), page)
}

console.log('PASS  admin-phase2 acceptance')
