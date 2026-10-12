import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const migration = readFileSync(join(ROOT, 'supabase/migrations/20261012133531_collaboration_v1_global_connections.sql'), 'utf8').toLowerCase()
const service = readFileSync(join(ROOT, 'src/features/collaboration/collaborationService.ts'), 'utf8')
const settings = readFileSync(join(ROOT, 'src/pages/CollaborationSettingsPage.tsx'), 'utf8')
const router = readFileSync(join(ROOT, 'src/routes/router.tsx'), 'utf8')
const auth = readFileSync(join(ROOT, 'src/features/auth/components/RegisterForm.tsx'), 'utf8')
const config = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8')

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`FAIL collaboration 1B — ${message}`)
}

for (const table of ['collaboration_invitations', 'collaboration_connections', 'collaboration_events']) {
  assert(migration.includes(`create table public.${table}`), `creates ${table}`)
  assert(migration.includes(`alter table public.${table} force row level security`), `forces RLS on ${table}`)
  assert(migration.includes(`revoke all on public.${table} from public, anon, authenticated`), `removes default client grants for ${table}`)
}

assert(migration.includes('from auth.users au join public.users u on u.id = au.id'), 'resolves only provisioned accounts through the canonical Auth/profile link')
assert(migration.includes('au.email_confirmed_at is not null'), 'requires a confirmed Auth email')
assert(migration.includes('au.deleted_at is null') && migration.includes('not au.is_anonymous') && migration.includes('au.banned_until'), 'excludes deleted, anonymous, and currently banned accounts')
assert(migration.includes('v_invitee_count > 1') && migration.includes("'account_ambiguous'"), 'refuses ambiguous case-insensitive account matches')
assert(migration.includes("lower(btrim(au.email)) = v_email"), 'normalizes email in the server command')
assert(migration.includes("'account_not_found'"), 'returns a distinct missing-account outcome to the authenticated inviter')
assert(migration.includes("interval '24 hours'") && migration.includes('>= 20'), 'applies a durable twenty-attempt daily limit')
assert(migration.includes("e.metadata->>'command' = 'create_collaboration_invite'"), 'rate limit counts invite creation attempts only')
assert(migration.includes("metadata->>'command' is distinct from 'accept_collaboration_invite'") && migration.includes('idempotency_key_reused'), 'scopes idempotency replays to their command and target')
assert(migration.includes('collaboration_invitations_pending_pair_unique'), 'allows only one pending invite per unordered pair')
assert(migration.includes('collaboration_connections_active_pair_unique'), 'allows only one active canonical connection per pair')
assert(!migration.includes('token_hash') && !migration.includes('intended_email') && !migration.includes('expires_at'), 'removes token, retained email, and expiry model')
assert(!migration.includes('public.weddings'), 'does not read or alter weddings')
assert(!migration.includes('proposed_share_bps') && !migration.includes('proposed_share_amount'), 'does not implement future financial terms')
assert(migration.includes('collaboration_before_user_delete'), 'cancels pending state and ends connections during account deletion')
assert(migration.includes("set search_path = ''"), 'uses a fixed empty search_path for privileged functions')

for (const name of [
  'create_collaboration_invite', 'accept_collaboration_invite', 'decline_collaboration_invite',
  'cancel_collaboration_invite', 'end_collaboration', 'get_collaboration_state',
]) {
  assert(migration.includes(`revoke all on function public.${name}`), `revokes PUBLIC/anon from ${name}`)
  assert(migration.includes(`grant execute on function public.${name}`), `grants intended authenticated execution for ${name}`)
}

assert(service.includes("'create_collaboration_invite'"), 'creates invitations only through the server command')
assert(service.includes("'accept_collaboration_invite'"), 'accepts by invitation id and authenticated RPC')
assert(settings.includes('Nie znaleźliśmy konta OurWed dla tego adresu'), 'shows clear missing-account guidance')
assert(settings.includes('incoming_pending') && settings.includes('Odrzuć') && settings.includes('Akceptuj'), 'shows authenticated incoming invitation actions')
assert(settings.includes('outgoing_pending') && settings.includes('Anuluj'), 'shows outgoing invitation and cancel action')
assert(settings.includes('window.confirm'), 'requires confirmation to end a connection')
assert(settings.includes("import { Modal } from '@/components/ui/Modal'") && settings.includes('<Modal'), 'uses the accessible app modal with focus trap and Escape handling')
assert(settings.includes('await refreshAfterActionFailure()') && settings.includes('queryClient.resetQueries'), 'clears stale rows before reconciling after failed mutations')
assert(!settings.includes('Wyślij ponownie') && !settings.includes('token'), 'does not keep resend-token or invitation-token UX')
assert(!router.includes('CollaborationInvitationPage') && !router.includes('/wspolpraca/zaproszenie'), 'removes the credential route')
assert(!auth.includes('REGISTRATION_ENABLED = true'), 'does not enable general registration')
assert(!config.includes('[functions.collaboration-invitation]'), 'removes unused invite edge-function configuration')

console.log('PASS collaboration 1B existing-users-only static security and UI acceptance')
