import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WorkspaceWedding } from '@/features/collaboration/workspaceTypes'
import {
  composeWorkspaceWeddingRows,
  filterWorkspaceWeddingRows,
  matchesWorkspaceWeddingYear,
  matchesWorkspaceWeddingSearch,
  parseWorkspaceScope,
  resolveWorkspaceSearchYear,
  workspaceVisibleQueryKey,
} from '@/features/weddings/modern/workspaceWeddings'
import { listAllVisibleWorkspaceRows } from '@/features/weddings/modern/useUnifiedWeddingsWorkspace'
import type { Wedding } from '@/types/wedding'

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function workspaceRow(
  weddingId: string,
  ownershipKind: 'owned' | 'shared',
  weddingDate: string | null,
  overrides: Partial<WorkspaceWedding> = {},
): WorkspaceWedding {
  return {
    wedding_id: weddingId,
    ownership_kind: ownershipKind,
    couple_first_name: ownershipKind === 'shared' ? `Partner ${weddingId}` : null,
    couple_second_name: ownershipKind === 'shared' ? 'Guest' : null,
    wedding_date: weddingDate,
    owner_display_name: ownershipKind === 'shared' ? 'North Studio' : null,
    membership_id: ownershipKind === 'shared' ? `membership-${weddingId}` : null,
    access_version: ownershipKind === 'shared' ? '1' : null,
    permission_group_mapping_version: ownershipKind === 'shared' ? '1' : null,
    effective_capabilities: ownershipKind === 'shared'
      ? [{ key: 'wedding.identity', level: 'view' }]
      : [],
    ...overrides,
  }
}

function ownerWedding(
  id: string,
  date: string,
  displayName: string,
  status: 'active' | 'archived' | 'cancelled' = 'active',
): Wedding {
  return {
    id,
    date,
    displayName,
    status,
    couple: {
      partner1: `${displayName} Anna`,
      partner2: 'Jan Nowak',
      email: '', phone: '', venue: '', city: '',
    },
    workflowStage: 'contract',
    packageName: 'Private Package',
    price: 25000,
    primaryLocation: {
      venueName: 'Private Venue', locality: 'Kraków',
      displayText: 'Private Venue, Kraków', source: 'reception',
    },
    packageItems: [], checklist: [], schedule: [], payments: [], finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' }, notes: [], deliverables: [], timeline: [],
    accentColor: '#000', createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const ownerA = ownerWedding('owner-a', '2026-08-12', 'Owned A')
const ownerB = ownerWedding('owner-b', '2028-08-12', 'Owned B')
const shared2026 = workspaceRow('shared-2026', 'shared', '2026-09-18', {
  couple_first_name: 'Maria',
  couple_second_name: 'Piotr',
  owner_display_name: 'North Studio',
})
const shared2027 = workspaceRow('shared-2027', 'shared', '2027-06-18', {
  couple_first_name: 'Ola',
  couple_second_name: 'Marek',
  owner_display_name: 'Studio Południe',
})
const mixed = composeWorkspaceWeddingRows(
  [
    workspaceRow('owner-a', 'owned', ownerA.date),
    shared2027,
    workspaceRow('owner-b', 'owned', ownerB.date),
  ],
  [ownerA, ownerB],
)

assert.deepEqual(mixed.map((item) => item.id), ['owner-a', 'shared-2027', 'owner-b'])
assert.deepEqual(filterWorkspaceWeddingRows(mixed, 'all').map((item) => item.id), ['owner-a', 'shared-2027', 'owner-b'])
assert.deepEqual(filterWorkspaceWeddingRows(mixed, 'mine').map((item) => item.id), ['owner-a', 'owner-b'])
assert.deepEqual(filterWorkspaceWeddingRows(mixed, 'shared').map((item) => item.id), ['shared-2027'])
assert.equal(parseWorkspaceScope('invalid'), 'all')
assert.equal(parseWorkspaceScope('mine'), 'mine')
assert.notDeepEqual(workspaceVisibleQueryKey('actor-a'), workspaceVisibleQueryKey('actor-b'))

const ownerOnly = composeWorkspaceWeddingRows(
  [workspaceRow('owner-a', 'owned', ownerA.date), workspaceRow('owner-b', 'owned', ownerB.date)],
  [ownerA, ownerB],
)
assert.deepEqual(ownerOnly.map((item) => item.id), ['owner-a', 'owner-b'])
assert.equal(ownerOnly[0]?.ownershipKind, 'owned')
if (ownerOnly[0]?.ownershipKind === 'owned') {
  assert.equal(ownerOnly[0].wedding, ownerA, 'owner enrichment preserves the existing Wedding object')
  assert.equal(ownerOnly[0].wedding.packageName, 'Private Package')
  assert.equal(ownerOnly[0].wedding.price, 25000)
  assert.equal(ownerOnly[0].wedding.primaryLocation?.displayText, 'Private Venue, Kraków')
}

const sharedOnly = composeWorkspaceWeddingRows([shared2026, shared2027], [])
assert.deepEqual(filterWorkspaceWeddingRows(sharedOnly, 'all').map((item) => item.id), ['shared-2026', 'shared-2027'])
assert.deepEqual(filterWorkspaceWeddingRows(sharedOnly, 'mine'), [], 'collaborative-only workspace has a quiet empty Mine scope')
assert.deepEqual(filterWorkspaceWeddingRows(sharedOnly, 'shared').map((item) => item.id), ['shared-2026', 'shared-2027'])

const sharedItem = mixed.find((item) => item.ownershipKind === 'shared')!
assert.equal(sharedItem.ownershipKind, 'shared')
assert.equal('wedding' in sharedItem, false)
assert.equal('price' in sharedItem, false)
assert.equal('packageName' in sharedItem, false)
assert.equal(matchesWorkspaceWeddingSearch(sharedItem, 'Ola'), true)
assert.equal(matchesWorkspaceWeddingSearch(sharedItem, '2027-06'), true)
assert.equal(matchesWorkspaceWeddingYear(sharedItem, 2027), true)
assert.equal(matchesWorkspaceWeddingYear(sharedItem, 2026), false)
assert.equal(matchesWorkspaceWeddingSearch(sharedItem, 'Private Package'), false)
assert.equal(matchesWorkspaceWeddingSearch(sharedItem, 'Private Venue'), false)
assert.equal(matchesWorkspaceWeddingSearch(sharedItem, '25000'), false)
assert.deepEqual(
  filterWorkspaceWeddingRows(sharedOnly, 'shared')
    .filter((item) => matchesWorkspaceWeddingYear(item, 2027))
    .filter((item) => matchesWorkspaceWeddingSearch(item, 'Ola'))
    .map((item) => item.id),
  ['shared-2027'],
  'scope, selected year, and local safe-field search compose',
)
const ownedItem = mixed.find((item) => item.ownershipKind === 'owned')!
assert.equal(matchesWorkspaceWeddingSearch(ownedItem, 'Private Package'), true)

const allScopeRows = sharedOnly
const mineWithout2027 = [sharedOnly[0]!]
const sharedWith2027 = [sharedOnly[1]!]
assert.equal(resolveWorkspaceSearchYear(2027, mineWithout2027), null, 'an unavailable year clears when scope changes')
assert.equal(resolveWorkspaceSearchYear(2027, sharedWith2027), 2027, 'a year present in the new scope survives')
assert.equal(resolveWorkspaceSearchYear(2027, allScopeRows), 2027, 'scope availability is checked before text search')
assert.equal(
  allScopeRows
    .filter((item) => matchesWorkspaceWeddingYear(item, resolveWorkspaceSearchYear(2027, allScopeRows)!))
    .filter((item) => matchesWorkspaceWeddingSearch(item, 'XYZ')).length,
  0,
  'zero search matches do not clear a valid year selection',
)
const clearedYear = resolveWorkspaceSearchYear(2027, mineWithout2027)
assert.equal(clearedYear, null, 'invalid scope transition selects All years')
assert.equal(resolveWorkspaceSearchYear(clearedYear, allScopeRows), null, 'a cleared year does not reappear when returning to its former scope')
assert.equal(resolveWorkspaceSearchYear(2027, sharedWith2027), 2027, 'a valid selection remains the concrete visible year')
assert.equal(
  resolveWorkspaceSearchYear(2027, mineWithout2027) == null,
  true,
  'no concrete year filter is active when no matching year control can be selected',
)
const withArchive = composeWorkspaceWeddingRows(
  [workspaceRow('owner-a', 'owned', ownerA.date), shared2027],
  [ownerA, ownerWedding('archived-a', '2024-04-05', 'Archived A', 'archived')],
)
assert.equal(withArchive.find((item) => item.id === 'archived-a')?.ownershipKind, 'owned')
assert.equal(filterWorkspaceWeddingRows(withArchive, 'shared').length, 1)

const pagedRows = Array.from({ length: 70 }, (_, index) => {
  const id = `w-${String(index).padStart(2, '0')}`
  const ownershipKind = index === 60 || index % 2 === 1 ? 'shared' : 'owned'
  const weddingDate = index < 55
    ? '2026-06-01'
    : `2027-06-${String(index - 54).padStart(2, '0')}`
  return workspaceRow(id, ownershipKind, weddingDate, index === 60
    ? { couple_first_name: 'Target Couple', couple_second_name: 'After Page One' }
    : {})
}).sort((a, b) =>
  (a.wedding_date ?? '\uffff').localeCompare(b.wedding_date ?? '\uffff')
  || a.wedding_id.localeCompare(b.wedding_id),
)
const pagedOwnerRows = pagedRows
  .filter((row) => row.ownership_kind === 'owned')
  .map((row) => ownerWedding(row.wedding_id, row.wedding_date!, row.wedding_id))
let fetchCount = 0
const loadedRows = await listAllVisibleWorkspaceRows(async ({ after, limit, scope }) => {
  assert.equal(scope, 'all')
  assert.equal(limit, 50)
  fetchCount += 1
  const afterCursor = after
  const remaining = pagedRows.filter((row) => {
    if (!afterCursor) return true
    if (afterCursor.weddingDate == null) {
      return row.wedding_date == null && row.wedding_id > afterCursor.weddingId
    }
    return row.wedding_date == null
      || row.wedding_date > afterCursor.weddingDate
      || (row.wedding_date === afterCursor.weddingDate && row.wedding_id > afterCursor.weddingId)
  })
  return remaining.slice(0, limit)
})
assert.equal(loadedRows.length, 70)
assert.equal(fetchCount, 2)
const pagedDisplayRows = composeWorkspaceWeddingRows(loadedRows, pagedOwnerRows)
const lateShared = pagedDisplayRows.find((item) => item.id === 'w-60')!
assert.equal(lateShared.ownershipKind, 'shared')
assert.equal(filterWorkspaceWeddingRows(pagedDisplayRows, 'shared').some((item) => item.id === 'w-60'), true, 'a shared target after row 50 appears in Shared')
assert.equal(pagedDisplayRows.filter((item) => matchesWorkspaceWeddingYear(item, 2027)).some((item) => item.id === 'w-60'), true, 'a 2027 target after row 50 appears in the year result')
assert.equal(pagedDisplayRows.filter((item) => matchesWorkspaceWeddingSearch(item, 'Target Couple')).some((item) => item.id === 'w-60'), true, 'a couple-name search finds its target after row 50')
assert.equal(
  filterWorkspaceWeddingRows(pagedDisplayRows, 'shared')
    .filter((item) => matchesWorkspaceWeddingYear(item, 2027))
    .filter((item) => matchesWorkspaceWeddingSearch(item, 'Target Couple'))
    .some((item) => item.id === 'w-60'),
  true,
  'scope, year, and search find a combined target after row 50',
)
assert.equal(pagedRows[49]?.ownership_kind, 'shared')
assert.equal(pagedRows[50]?.ownership_kind, 'owned')

const nullBoundaryRows = [
  ...Array.from({ length: 55 }, (_, index) => workspaceRow(
    `dated-${String(index).padStart(2, '0')}`,
    index % 2 === 0 ? 'owned' : 'shared',
    '2026-01-01',
  )),
  ...Array.from({ length: 50 }, (_, index) => workspaceRow(
    `undated-${String(index).padStart(2, '0')}`,
    index % 2 === 0 ? 'owned' : 'shared',
    null,
  )),
].sort((a, b) =>
  (a.wedding_date ?? '\uffff').localeCompare(b.wedding_date ?? '\uffff')
  || a.wedding_id.localeCompare(b.wedding_id),
)
const nullBoundaryRowsLoaded = await listAllVisibleWorkspaceRows(async ({ after, limit }) => {
  const remaining = nullBoundaryRows.filter((row) => {
    if (!after) return true
    if (after.weddingDate == null) return row.wedding_date == null && row.wedding_id > after.weddingId
    return row.wedding_date == null
      || row.wedding_date > after.weddingDate
      || (row.wedding_date === after.weddingDate && row.wedding_id > after.weddingId)
  })
  return remaining.slice(0, limit)
})
assert.equal(nullBoundaryRowsLoaded.length, 105, 'pagination continues across the dated-to-null-date cursor boundary')
assert.equal(nullBoundaryRowsLoaded[nullBoundaryRowsLoaded.length - 1]?.wedding_id, 'undated-49')

const page = read('src/pages/WeddingsModernPage.tsx')
const hook = read('src/features/weddings/modern/useUnifiedWeddingsWorkspace.ts')
const model = read('src/features/weddings/modern/workspaceWeddings.ts')
const workspace = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
const card = read('src/features/weddings/modern/ModernWeddingCard.tsx')
const ledger = read('src/features/weddings/modern/ModernWeddingLedger.tsx')
const router = read('src/routes/router.tsx')
const settings = read('src/pages/CollaborationSettingsPage.tsx')
const reset = read('src/lib/auth/resetTenantClientState.ts')
const authProvider = read('src/features/auth/providers/AuthProvider.tsx')
const cardStyles = read('src/features/weddings/modern/ModernWeddingCard.module.css')
const attribution = read('src/features/weddings/modern/SharedWeddingAttribution.tsx')
const visualFixture = read('src/features/weddings/modern/WeddingsH2VisualFixture.tsx')
const ownerListService = read('src/lib/api/weddingListLightService.ts')
const h1WorkspaceSql = read('supabase/migrations/20261015130000_collaboration_1c_h1_workspace_authority.sql')
const h1WorkspaceDbTest = read('supabase/tests/collaboration_1c_h1_workspace_authority_test.sql')

assert(page.includes('useUnifiedWeddingsWorkspace'), '/sluby uses the unified projection-backed hook')
assert(page.includes('useSearchParams') && page.includes('WORKSPACE_SCOPE_QUERY_PARAM'), 'scope is URL state')
assert(workspace.includes('resolveWorkspaceSearchYear(searchYear, catalog)'), 'year validity is derived from the full current-scope catalog before search')
assert(workspace.includes('const explicitSearchYear = searching ? activeSearchYear : null'), 'only a valid, visible year selection is applied to search results')
assert(workspace.includes('const showChips = chipYears.length > 1 || searching'), 'search keeps the year control visible even when its scope has a single year')
assert(workspace.includes('const storedCurrentFuture = invalidSearchYear'), 'an invalid scope year immediately presents All years before state cleanup')
const yearReconciliationStart = workspace.indexOf('useEffect(() => {', workspace.indexOf('const storedCurrentFuture'))
const yearReconciliationEffect = workspace.slice(yearReconciliationStart, workspace.indexOf('const displayedCurrentFuture'))
assert(yearReconciliationEffect.includes('setSearchYear(null)'), 'scope changes clear a year that is unavailable in the new scope')
assert(yearReconciliationEffect.includes('setCurrentFutureExpanded(expandAllCurrentFutureYears(chipYears))'), 'clearing an unavailable year restores the all-years presentation')
assert(!/setQuery|setViewMode|onViewChange/.test(yearReconciliationEffect), 'year reconciliation preserves search and view state')
const scopeTransitionHandler = page.slice(page.indexOf('function handleScopeChange'), page.indexOf('return ('))
assert(!/setViewMode|setQuery/.test(scopeTransitionHandler), 'scope URL transitions preserve text search and view preference')
assert(read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx').includes('matchesWorkspaceWeddingYear'), 'explicit year selection composes with text search')
assert(workspace.includes('const explicitSearchYear = searching ? activeSearchYear : null'), 'default season expansion is not mistaken for an active search-year filter')
assert(hook.includes('workspaceVisibleQueryKey(userId)'), 'visible workspace query is actor-scoped')
assert(hook.includes('workspaceService.listWeddings') && hook.includes("scope: 'all'"), 'H1 projection is paged as the canonical row source')
assert(model.includes("row.ownership_kind === 'shared'") && model.includes('ownerDisplayName: row.owner_display_name'), 'shared display data comes only from the safe workspace DTO')
assert(model.includes('workspaceOwnedIds') && model.includes('ownersById.get(row.wedding_id)'), 'owner enrichment joins only H1-owned identities')
assert(card.includes('getWeddingPrimaryLocationSummary(ownedWedding)') && card.includes('getModernContractValueLabel(ownedWedding)'), 'owned card keeps location and contract value')
const sharedCardBranch = card.slice(card.indexOf("if ('ownershipKind' in wedding"), card.indexOf('const ownedWedding'))
assert(!/packageName|price|primaryLocation|payments|contact/i.test(sharedCardBranch), 'shared card markup never reads owner-private card fields')
assert(!sharedCardBranch.includes('Brak dostępu') && !sharedCardBranch.includes('WARTOŚĆ'), 'shared card omits fake unavailable fields')
assert(!card.slice(card.indexOf('const ownedWedding')).includes('<SharedWeddingAttribution'), 'owner cards do not show shared attribution')
assert(card.includes('/wspolpraca/sluby/${wedding.id}') && ledger.includes('/wspolpraca/sluby/${wedding.id}'), 'shared items retain the safe legacy detail route pending H3')
assert(card.includes('<SharedWeddingAttribution') && ledger.includes('<SharedWeddingAttribution'), 'shared attribution is adjacent to the couple name in both views')
const attributionMessage = attribution.slice(attribution.indexOf('const displayName'), attribution.indexOf('return ('))
assert(attributionMessage.includes('ownerDisplayName') && !/email|phone|package|price|permissions/i.test(attributionMessage), 'attribution displays only the safe H1 owner name')
assert(attribution.includes('FloatingPortal'), 'desktop attribution tooltip portals outside clipped list rows')
assert(attribution.includes('mobilePresentation="center"'), 'mobile attribution uses the centered modal pattern')
assert(attribution.includes('onFocus={() => setTooltipOpen(true)}'), 'desktop tooltip is keyboard accessible')
assert(attribution.includes('onClick={() => setOpen(true)}'), 'attribution affordance is touch/click accessible')
assert(ownerListService.includes(".eq('user_id', userId)"), 'owner enrichment remains current-user scoped')
assert(ownerListService.includes('enrichWeddingList(light)'), 'only owner-list rows receive package/payment/place enrichment')
assert(hook.includes('workspaceOwnedIds') || model.includes('workspaceOwnedIds'), 'owner enrichment joins only owned IDs from H1')
assert(h1WorkspaceSql.includes("m.status='active'") && h1WorkspaceSql.includes("effective_wedding_capability_level(w.id,'wedding.identity')>=1"), 'server projection requires an active membership with identity view')
assert(h1WorkspaceDbTest.includes('pending invitation is not workspace eligible'), 'H1 runtime coverage excludes pending invitations')
assert(h1WorkspaceDbTest.includes('revoked membership is not workspace eligible'), 'H1 runtime coverage excludes revoked memberships')
assert(h1WorkspaceDbTest.includes('globally connected user without an accepted wedding membership sees no shared rows'), 'H1 runtime coverage excludes global connection without accepted membership')
assert(h1WorkspaceDbTest.includes('ending the global connection does not remove an accepted active membership'), 'H1 runtime coverage preserves accepted active membership after global connection end')
assert(router.includes('RedirectLegacyCollaborativeWeddingList') && router.includes("search: '?scope=shared'"), 'old shared list redirects to canonical shared scope')
assert(settings.includes('to="/sluby?scope=shared"'), 'settings link targets canonical shared scope')
assert(router.includes('const h2VisualFixtureRoute = import.meta.env.DEV'), 'visual fixture route is development-only')
assert(visualFixture.includes("fixtureRows.filter((item) => item.ownershipKind === 'shared')"), 'visual fixture can test collaborative-only and Mine-empty states')
assert(page.includes("scope === 'all'"), 'global first-wedding onboarding appears only for truly empty All scope')
assert(read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx').includes('role="group" aria-label="Zakres ślubów"'), 'scope filters are grouped and accessible')
assert(read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx').includes('aria-pressed={scope === value}'), 'scope selected state is exposed accessibly')
assert(cardStyles.includes('.sharedCard') && card.includes('v3MaterialSecondaryCard'), 'shared tiles reuse the existing card material')
assert(reset.includes('queryClient.clear()') && authProvider.includes('applyAuthIdentityChange'), 'auth identity changes clear tenant query caches')
assert(!hook.includes('weddingService.getAll') && !hook.includes('CollaborativeWeddingListPage'), 'unified list does not mount detail or second collaborative list services')
assert(!hook.includes('listWeddingsForList(') && hook.includes('useWeddings()'), 'unified page reuses the existing owner hook rather than duplicating owner enrichment')
assert(!attribution.includes('workspaceService.') && !card.includes('workspaceService.'), 'shared attribution has no per-card owner lookup')

console.log('Collaboration 1C-H2 acceptance: PASS')
