import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const migration = read('supabase/migrations/20261012212404_collaboration_1c_b_secure_invitation_reads.sql')
const connectionInviteMigration = read('supabase/migrations/20261013103640_collaboration_1c_b_invite_from_connection.sql')
const service = read('src/features/collaboration/weddingCollaborationService.ts')
const hooks = read('src/features/collaboration/useWeddingCollaboration.ts')
const owner = read('src/features/collaboration/WeddingCollaborationOwnerPanel.tsx')
const pages = read('src/features/collaboration/WeddingInvitationPages.tsx')
const css = read('src/features/collaboration/WeddingCollaboration.module.css')
const routes = read('src/routes/router.tsx')
const overview = read('src/features/weddings/modern-detail/ModernWeddingOverview.tsx')
const dashboard = read('src/features/dashboard-v3/DashboardV3AttentionPanel.tsx')
const tap = read('supabase/tests/collaboration_v1_1c_a_test.sql')

let passed = 0
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL collaboration 1C-B — ${message}`)
  passed += 1
}

for (const name of [
  'get_wedding_collaboration_invitation_preview',
  'get_wedding_collaboration_state',
  'list_my_wedding_collaboration_invitations',
]) {
  check(migration.includes(`create function public.${name}`), `${name} is created`)
  check(migration.includes(`grant execute on function public.${name}`), `${name} is granted only through the explicit role grant`)
  check(migration.includes(`revoke all on function public.${name}`), `${name} revokes PUBLIC and anon`)
}
check((migration.match(/auth\.uid\(\)/g) ?? []).length >= 3, 'each read RPC derives identity from auth.uid()')
check((migration.match(/set search_path = ''/g) ?? []).length === 4, 'all new definer functions and trigger helper use empty search_path')
check(!/grant\s+(select|all).*wedding_collaboration_(invitations|memberships|events)\s+to\s+authenticated/i.test(migration),
  'migration does not grant client table SELECT')
check(!/create\s+policy\s+.*\bon\s+public\.(weddings|wedding_)/i.test(migration),
  'migration adds no wedding or child-resource policy')
check(!/insert\s+into\s+public\.notification_(events|deliveries)/i.test(migration),
  'notification integration remains in-app only and does not enqueue email')

const allowed = [
  'invitation_id', 'status', 'reason', 'couple_first_name', 'couple_second_name', 'wedding_date',
  'package_label', 'inviter_display_name', 'contract_value', 'currency', 'proposed_share_amount', 'membership_status',
  'created_at', 'expires_at', 'accepted_at', 'declined_at', 'cancelled_at',
  'expired_at', 'superseded_at',
]
check(allowed.every((field) => migration.includes(`'${field}'`)), 'preview output explicitly builds the approved allowlist')
check(!migration.includes("'terms_version'"), 'preview omits internal terms version not needed by the UI')
check(!migration.includes("'terms_snapshot'") && !migration.includes("'extras_snapshot'"),
  'preview does not return unrestricted terms or extras JSON')
check(migration.includes('where i.id = p_invitation_id and i.invitee_user_id = v_actor'),
  'preview binds invitation visibility to the authenticated invitee')
check(migration.includes('where w.id = p_wedding_id and w.user_id = v_actor'),
  'owner state binds wedding visibility to the authenticated owner')
check(migration.includes('where i.invitee_user_id = v_actor'), 'incoming list binds results to auth.uid()')
check(migration.includes('limit 20'), 'incoming list is bounded')
check(migration.includes("'Użytkownik niedostępny'"), 'redacted historical identities have a safe fallback')
check(migration.includes('create trigger wedding_collaboration_notify_event'), 'lifecycle changes feed the existing in-app inbox')
check(!migration.includes('notification_email_enabled') && !migration.includes('notification_deliveries'),
  'email delivery is deferred without dispatcher changes')

check(service.includes("'get_wedding_collaboration_invitation_preview'"), 'client preview uses the dedicated RPC')
check(service.includes("'list_my_wedding_collaboration_invitations'"), 'client incoming list uses the actor-bound RPC')
check(service.includes("'get_wedding_collaboration_state'"), 'client owner panel uses the owner state RPC')
check(service.includes('collaborationService.getState()'), 'collaborator picker reuses the active global connection RPC')
check(service.includes("'create_wedding_collaboration_invitation_configured'")
  && service.includes('p_connection_id: connectionId') && !service.includes('p_invitee_user_id'),
  'owner invite service sends the connection ID and explicit access config to configured creation')
check(!service.includes('from(\'wedding_collaboration_invitations\')'), 'client never reads private collaboration tables directly')
check(hooks.includes("['wedding-collaboration', userId, weddingId]"), 'owner state uses identity-scoped cache key')
check(hooks.includes("['my-wedding-invitations', userId]"), 'incoming list uses identity-scoped cache key')
check(hooks.includes("['wedding-invitation-preview', userId, invitationId]"), 'preview has a dedicated identity-scoped cache')
check(hooks.includes('invalidateNotificationQueries(queryClient)'), 'mutations refresh existing notification queries')
check(hooks.includes('onSettled: (_data, _error, input)') && hooks.includes("queryKey: weddingCollaborationQueryKeys.preview(userId, input.invitationId)"),
  'failed lifecycle actions refetch invitation state so stale controls reconcile')
check(!hooks.includes("queryKey: ['weddings'"), 'acceptance does not populate or invalidate normal wedding detail cache')
check(service.includes("if (result.status !== 'accepted') throw new Error('invitation_unavailable')"),
  'accept action treats terminal JSON statuses as failure rather than false success')

check(owner.includes('Dodaj współpracownika') && owner.includes('Sprawdź zaproszenie') && owner.includes('Wyślij zaproszenie'),
  'owner flow selects a connected collaborator, reviews, then sends')
check(owner.includes('selectedConnectionId') && owner.includes('connectionId: selected.id'),
  'selected collaborator remains keyed by connection ID through the mutation')
check(owner.includes('type="number"') && owner.includes('min="0"') && owner.includes("normalizedAmountInput === '' ? null"),
  'share amount is optional, money-only, and accepts explicit zero while rejecting negatives')
check(owner.includes('decimalPlaces > 2') && owner.includes('amount > 9_999_999_999.99'),
  'share amount validation matches the database numeric(12,2) scale and range')
check(owner.includes("invite.status === 'accepted' ? 'Uzgodniona kwota'"),
  'accepted invitation is described as an agreed amount, not a pending proposal')
check(!owner.toLowerCase().includes('percentage') && !owner.toLowerCase().includes('procent'),
  'owner proposal UI does not offer percentage terms')
check(owner.includes('window.confirm') && owner.includes('Anuluj') && owner.includes('Usuń ze zlecenia'),
  'owner cancel and revoke require confirmation')
check(!owner.includes('leaveMembership'), 'member Leave UI is deferred without a safe member context')
check(overview.includes('<WeddingCollaborationOwnerPanel'), 'collaboration entry is placed in the owner Wedding Detail overview')
check(dashboard.includes('useMyWeddingInvitations()') && dashboard.includes("invitation.status === 'pending'"),
  'dashboard attention uses actor-bound incoming invitation state and shows only actionable items')
check(dashboard.includes('to="/wspolpraca/zaproszenia"') && dashboard.includes('dashboard-wedding-invitations'),
  'dashboard invitation presence links to the dedicated incoming invitation list')
check(pages.includes('Zaproszenie do zlecenia') && pages.includes('Akceptuj') && pages.includes('Odrzuć'),
  'invitee sees a focused preview with accept and decline actions')
check(pages.includes('Warunki zaproszenia uległy zmianie') && pages.includes('To zaproszenie nie jest już aktywne'),
  'superseded and cancelled states are clearly non-actionable')
check(pages.includes('Akceptacja została zapisana') && pages.includes('nie udostępnia szczegółów zlecenia')
  && !pages.includes('navigate(`/sluby/'), 'acceptance confirms lifecycle only and never enters shared Wedding Detail')
check(pages.includes('membershipEnded') && pages.includes('Współpraca przy zleceniu została zakończona'),
  'revisited accepted invitation distinguishes a revoked or left membership')
check(pages.includes('STATUS_LABELS[invite.status]'), 'incoming list shows terminal lifecycle state')
check(routes.includes("'/wspolpraca/zaproszenia'") && routes.includes("'/wspolpraca/zaproszenie/:invitationId'"),
  'protected invitation list and preview routes are registered')
check(css.includes('100dvh') && css.includes('env(safe-area-inset-top)') && css.includes('overflow-y: auto'),
  'preview adapts to dynamic mobile viewport and safe areas with internal scrolling')
check(css.includes('min-height: 44px') && css.includes('min-height: 48px'), 'mobile actions meet the 44px touch target minimum')
check(tap.includes('preview returns exactly the allow-listed snapshot') && tap.includes('third authenticated user cannot preview')
  && tap.includes('owner state does not enumerate another owner wedding'), 'pgTAP includes allowlist and IDOR coverage')
check(connectionInviteMigration.includes('create function public.create_wedding_collaboration_invite_from_connection')
  && connectionInviteMigration.includes('security definer') && connectionInviteMigration.includes("set search_path = ''"),
  'new resolver RPC uses SECURITY DEFINER with an empty search_path')
check(connectionInviteMigration.includes('revoke all on function') && connectionInviteMigration.includes('from public, anon')
  && connectionInviteMigration.includes('to authenticated'), 'new resolver RPC is executable only by authenticated users')
check(connectionInviteMigration.includes('where c.id = p_connection_id')
  && connectionInviteMigration.includes('c.status = \'active\'')
  && connectionInviteMigration.includes('v_actor in (c.participant_low_id, c.participant_high_id)'),
  'resolver binds access to the exact active connection owned by the actor')
check(connectionInviteMigration.includes('wedding_collaboration_lock_users(array[v_actor, v_peer])')
  && connectionInviteMigration.includes('for update')
  && connectionInviteMigration.includes('return public.create_wedding_collaboration_invite('),
  'resolver locks the selected connection then delegates to reviewed invitation logic')
check(!connectionInviteMigration.includes('create policy') && !connectionInviteMigration.includes('grant select'),
  'remediation introduces no RLS or table grant changes')
check(tap.includes('server resolves the connection peer as invitee')
  && tap.includes('actor cannot invite through another pair connection')
  && tap.includes('inactive connection receives the uniform safe rejection')
  && tap.includes('same connection request and idempotency key replays successfully'),
  'pgTAP covers mapping, actor binding, inactive state, and idempotency')

console.log(`PASS collaboration 1C-B static UX/security acceptance (${passed} assertions)`)
