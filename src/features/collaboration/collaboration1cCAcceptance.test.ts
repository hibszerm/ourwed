import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatCollaborativeWeddingDate,
  isCollaborativePlaceRole,
  isUuid,
  isValidOperationalClock,
} from './collaborativeWeddingTypes'

const root = join(fileURLToPath(new URL('../../../', import.meta.url)))
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const migration = read('supabase/migrations/20261013113439_collaboration_1c_c_curated_reads.sql')
const service = read('src/features/collaboration/collaborativeWeddingService.ts')
const hooks = read('src/features/collaboration/useCollaborativeWeddings.ts')
const pages = read('src/features/collaboration/CollaborativeWeddingPages.tsx')
const css = read('src/features/collaboration/CollaborativeWeddingPages.module.css')
const router = read('src/routes/router.tsx')

let passed = 0
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL collaboration 1C-C — ${message}`)
  passed += 1
}

check(migration.includes('create function public.list_my_collaborative_weddings'), 'creates bounded list RPC')
check(migration.includes('create function public.get_collaborative_wedding_detail'), 'creates curated detail RPC')
check((migration.match(/security definer/g) ?? []).length === 2, 'both reads use controlled SECURITY DEFINER')
check((migration.match(/set search_path = ''/g) ?? []).length === 2, 'both definer functions pin an empty search path')
check((migration.match(/auth\.uid\(\)/g) ?? []).length === 2, 'both reads bind to auth.uid()')
check(migration.includes('au.email_confirmed_at is not null') && migration.includes('not au.is_anonymous')
  && migration.includes('au.deleted_at is null') && migration.includes('au.banned_until'), 'both reads validate the live Auth account')
check(migration.includes('m.member_user_id = v_actor') && migration.includes("m.status = 'active'"), 'list requires current active membership')
check(migration.includes('w.id = m.wedding_id') && migration.includes('w.user_id = m.owner_user_id'), 'reads validate live wedding owner linkage')
check(migration.includes('w.status = \'active\''), 'archived and cancelled weddings are excluded')
check(migration.includes('limit least(greatest(coalesce(p_limit, 50), 1), 50)'), 'list page size is clamped to 1–50')
check(migration.includes('invalid_cursor') && migration.includes("errcode = '22023'"), 'partial date cursor is rejected')
check(migration.includes('order by w.wedding_date asc nulls last, w.id asc'), 'list cursor ordering is stable and nulls last')
check(migration.includes("p.role in ('bride_preparation', 'groom_preparation', 'ceremony', 'reception')"), 'detail includes only the four approved operational place roles')
check(migration.includes("'formatted_address', p.formatted_address") && migration.includes("'operational_time'"), 'detail returns only curated place address and operational time')
check(migration.includes("ot.operational_time ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'"), 'operational time is validated to 00:00–23:59')
check(migration.includes("when ot.operational_time ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'\n              then ot.operational_time"),
  'saved operational time is validated before it can be returned')
check(migration.indexOf('when p.role = \'ceremony\' and v_ceremony_time is not null') > migration.indexOf('when ot.operational_time ~'),
  'invalid saved time is unavailable before ceremony fallback is considered')
check(migration.includes('revoke all on function public.list_my_collaborative_weddings')
  && migration.includes('revoke all on function public.get_collaborative_wedding_detail'), 'PUBLIC and anon execute are revoked')
check((migration.match(/grant execute on function/g) ?? []).length === 2 && migration.includes('to authenticated'), 'only authenticated receives explicit RPC execute')
check(!/create\s+policy/i.test(migration) && !/grant\s+(select|insert|update|delete|all).*\b(weddings|wedding_places|wedding_operational_times)\b/i.test(migration), 'migration adds no table grants or RLS policies')
check(migration.includes('create index wedding_collaboration_memberships_member_active_idx')
  && migration.includes('on public.wedding_collaboration_memberships(member_user_id, wedding_id)')
  && migration.includes("where status = 'active' and wedding_id is not null"),
  'member-leading partial index supports measured active collaboration list filtering')

check(service.includes("'list_my_collaborative_weddings'") && service.includes("'get_collaborative_wedding_detail'"), 'service uses only the two curated RPCs')
check(!service.includes(".from('weddings')") && !service.includes(".from('wedding_places')"), 'client does not read wedding tables directly')
check(service.includes('return {') && service.includes('wedding_id: row.wedding_id') && service.includes('operational_time:'), 'service builds field allowlists and ignores extra RPC fields')
check(hooks.includes("['collaboration', 'weddings', userId]")
  && hooks.includes("['collaboration', 'wedding', userId, weddingId]"), 'list and detail keys are identity scoped and separate')
check(hooks.includes('staleTime: 0') && hooks.includes("refetchOnMount: 'always'")
  && hooks.includes('refetchOnWindowFocus: true') && hooks.includes('retry: false'), 'queries immediately revalidate on mount and focus without retries')
check(hooks.includes('removeQueries({ queryKey: collaborativeWeddingQueryKeys.detail(userId, weddingId), exact: true })'), 'revoked membership removes exact detail cache')
check(hooks.includes('item.wedding_id !== weddingId'), 'revoked wedding is removed from every cached list page')
check(pages.includes('detail.isFetching') && pages.includes('Sprawdzanie dostępu'), 'cached details are masked during server revalidation')
check(pages.includes("navigate('/wspolpraca/sluby', { replace: true, state: { accessEnded: true } })"), 'null or failed server access replaces detail route with generic ended state')
check(pages.includes('PLACE_LABELS') && !pages.includes('package') && !pages.includes('contract_value'), 'detail UI exposes no package or commercial fields')
check(!pages.includes('WeddingDetailRoutePage') && !pages.includes('useWedding('), 'collaborator detail does not reuse owner wedding components')
check(router.includes("'/wspolpraca/sluby'") && router.includes("'/wspolpraca/sluby/:weddingId'"), 'separate protected collaborator routes are registered')
check(css.includes('min-height: 44px') && css.includes('@media (max-width: 480px)'), 'touch controls and narrow viewport styling are defined')

check(isCollaborativePlaceRole('ceremony') && !isCollaborativePlaceRole('hotel') && !isCollaborativePlaceRole('studio'), 'frontend role validator is allowlist only')
check(isValidOperationalClock('00:00') && isValidOperationalClock('23:59')
  && !isValidOperationalClock('24:00') && !isValidOperationalClock('7:30'), 'clock validator rejects malformed and out-of-range values')
check(isUuid('21000000-0000-4000-8000-000000000001') && !isUuid('not-a-uuid'), 'route identifier is validated before RPC')
check(formatCollaborativeWeddingDate('2027-06-01') !== null && formatCollaborativeWeddingDate('2027-13-40') === null,
  'date formatter rejects impossible calendar values')

console.log(`PASS collaboration 1C-C static and domain acceptance (${passed} assertions)`)
