import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveWeddingDetailHostBranch } from './weddingDetailHostBranch'
import type { WeddingDetailAuthority } from './weddingDetailAuthority'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const shared: WeddingDetailAuthority = {
  kind: 'shared',
  weddingId: 'a8200000-0000-4000-8000-000000000002',
  membershipId: 'a8400000-0000-4000-8000-000000000001',
  accessVersion: '9007199254740993',
  mappingVersion: '1',
  effectiveCapabilities: { 'wedding.identity': 1 },
}

assert.equal(resolveWeddingDetailHostBranch({ validId: true, isFetching: true, isPending: false, isError: false,
  authority: { kind: 'owned', weddingId: shared.weddingId } }), 'loading',
'cached owner authority is not rendered while authority refresh is in flight')
assert.equal(resolveWeddingDetailHostBranch({ validId: false, isFetching: false, isPending: true, isError: false }),
  'unavailable', 'malformed deep links stop before domain host selection')
assert.equal(resolveWeddingDetailHostBranch({ validId: true, isFetching: false, isPending: false, isError: false,
  authority: { kind: 'owned', weddingId: shared.weddingId } }), 'owned', 'only owned authority selects owner host')
assert.equal(resolveWeddingDetailHostBranch({ validId: true, isFetching: false, isPending: false, isError: false,
  authority: shared }), 'shared', 'identity-authorized result selects the shared host')
assert.equal(resolveWeddingDetailHostBranch({ validId: true, isFetching: false, isPending: false, isError: false,
  authority: { kind: 'unavailable' } }), 'unavailable', 'unavailable authority selects neither data host')
assert.equal(resolveWeddingDetailHostBranch({ validId: true, isFetching: false, isPending: false, isError: true }),
  'error', 'resolver failure selects an error state rather than either domain host')

const page = read('src/pages/WeddingDetailModernPage.tsx')
const sharedHost = page.slice(page.indexOf('function SharedWeddingDetail'), page.indexOf('function toSharedIdentityWedding'))
const ownedHost = page.slice(page.indexOf('function OwnedWeddingDetail'), page.indexOf('function SharedWeddingDetail'))
assert.match(page, /branch === 'owned'\) return <OwnedWeddingDetail \/>/,
  'owned host element is created only for the owned branch')
assert.match(page, /branch === 'shared' && authority\?\.kind === 'shared'[\s\S]*?return <SharedWeddingDetail/,
  'shared host element is created only for the shared branch')
assert.match(ownedHost, /useWeddingDetailHost\(\)/,
  'the existing owner query graph is mounted inside the owned-only child component')
assert.doesNotMatch(sharedHost, /useWeddingDetailHost|useModernWeddingDetailContext|weddingService|taskService|contactService|weddingExtraServiceService|weddingPlaceService|travelService|Finance|collaborativeWeddingService|collaborativeWeddingQueryKeys/,
  'shared host cannot execute owner detail, child, finance, places, or travel data sources')
assert.match(sharedHost, /useCollaborativeWeddingIdentity/,
  'shared host uses the narrow canonical identity query')
assert.doesNotMatch(sharedHost, /places\s*:\s*detail\.places|detail\.places/,
  'canonical shared host does not consume Places data')
assert.match(read('src/features/collaboration/useCollaborativeWeddingIdentity.ts'), /refetchOnWindowFocus: true/,
  'canonical shared identity revalidates after focus without changing global query policy')

const authority = read('src/features/weddings/detail/weddingDetailAuthority.ts')
assert.match(authority, /\['wedding-detail-authority', userId, weddingId\]/,
  'authority query key is actor and wedding scoped')
assert.match(authority, /enabled: Boolean\(userId && isUuid\(weddingId\)\)/,
  'malformed or unauthenticated requests do not call the authority RPC')
assert.match(authority, /refetchOnMount: 'always'/,
  'direct detail navigation always revalidates authority')
assert.match(authority, /collaborativeWeddingQueryKeys\.detail\(userId, weddingId\)/,
  'confirmed unavailable authority evicts the actor-scoped shared detail cache')
assert.match(authority, /collaborativeWeddingIdentityQueryKey\(userId, weddingId\)/,
  'confirmed unavailable authority evicts the actor-scoped narrow identity cache')

const router = read('src/routes/router.tsx')
assert.match(router, /path: '\/wspolpraca\/sluby\/:weddingId', element: <CollaborativeWeddingDetailPage \/>/,
  'transitional shared detail route remains unchanged')
assert.match(read('src/features/weddings/modern/ModernWeddingCard.tsx') + read('src/features/weddings/modern/ModernWeddingLedger.tsx'), /`\/wspolpraca\/sluby\//,
  'H2 shared-card navigation remains on the transitional route')
const legacyPage = read('src/features/collaboration/CollaborativeWeddingPages.tsx')
assert.match(legacyPage, /useCollaborativeWedding\(/,
  'transitional legacy route retains its existing broad collaboration detail query')
assert.match(read('src/features/collaboration/useCollaborativeWeddings.ts'), /getCollaborativeWeddingDetail/,
  'legacy query continues to use the broad curated detail service')
assert.match(sharedHost, /places=\{\[\]\}/,
  'canonical shared Phase-1 UI renders no Places')
assert.doesNotMatch(sharedHost, /Plan Day|plan_day|schedule\.operational_time/,
  'canonical shared Phase-1 UI does not introduce Plan Day')
for (const path of [
  '/sluby/:weddingId/uzupelnij-z-umowy',
  '/sluby/:weddingId/umowy/nowa',
  '/sluby/:weddingId/umowy/:contractId',
  '/sluby/:weddingId/dzien-slubu',
]) {
  const routeStart = router.indexOf(`path: '${path}'`)
  assert.notEqual(routeStart, -1, `route exists: ${path}`)
  assert.match(router.slice(routeStart, routeStart + 280), /WeddingOwnerRouteGuard/,
    `owner-only route is gated before its page mounts: ${path}`)
}

const migration = read('supabase/migrations/20261016100000_collaboration_1c_h3_detail_authority.sql')
assert.match(migration, /auth\.uid\(\)/, 'RPC derives actor from auth.uid()')
assert.match(migration, /security definer\s+set search_path = ''/i, 'RPC uses SECURITY DEFINER and pinned search_path')
assert.match(migration, /grant execute[\s\S]*to authenticated/i, 'only authenticated receives intended execution')
assert.match(migration, /revoke all[\s\S]*from public, anon, service_role/i, 'PUBLIC, anon and service_role execution is revoked')
assert.doesNotMatch(migration, /create policy|grant select on public\.(weddings|wedding_)/i,
  'migration adds no core table grants or RLS policy')

console.log('PASS Collaboration H3 authority-first host acceptance')
