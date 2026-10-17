import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WorkspaceWedding, WorkspaceWeddingDisplayName } from '@/features/collaboration/workspaceTypes'
import { parseWorkspaceWedding } from '@/features/collaboration/workspaceService'
import { groupAssignmentsBySeason } from '@/features/shared/presentation/groupAssignmentsBySeason'
import {
  composeWorkspaceWeddingRows,
  filterWorkspaceWeddingRowsForList,
  getPrimaryWorkspaceYears,
} from '@/features/weddings/modern/workspaceWeddings'
import type { Wedding } from '@/types/wedding'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

function workspaceRow(
  weddingId: string,
  ownershipKind: 'owned' | 'shared',
  weddingDate: string,
): WorkspaceWedding {
  return {
    wedding_id: weddingId,
    ownership_kind: ownershipKind,
    couple_first_name: ownershipKind === 'shared' ? 'QA Final A' : null,
    couple_second_name: ownershipKind === 'shared' ? 'Collaboration Test' : null,
    wedding_date: weddingDate,
    owner_display_name: ownershipKind === 'shared' ? 'QA Final A Studio' : null,
    membership_id: ownershipKind === 'shared' ? 'membership-qa' : null,
    access_version: ownershipKind === 'shared' ? '1' : null,
    permission_group_mapping_version: ownershipKind === 'shared' ? '2' : null,
    effective_capabilities: ownershipKind === 'shared'
      ? [{ key: 'wedding.identity', level: 'view' }]
      : [],
  }
}

function ownerWedding(id: string, date: string): Wedding {
  return {
    id,
    date,
    status: 'active',
    workflowStage: 'contract',
    couple: { partner1: 'Owned Pair', partner2: 'Owner Partner', email: '', phone: '', venue: '', city: '' },
    packageName: 'Private Package',
    price: 30000,
    packageItems: [], checklist: [], schedule: [], payments: [], finances: [],
    questionnaires: { contractData: { status: 'not_sent' }, weddingQuestionnaire: { status: 'not_sent' } },
    contract: { status: 'none' }, notes: [], deliverables: [], timeline: [],
    accentColor: '#123', createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const regressionId = '09270d9d-b8c0-4944-9e3b-b382a8875dbd'
const rawSharedRpcRow = {
  wedding_id: regressionId,
  ownership_kind: 'shared',
  couple_first_name: 'QA Final A',
  couple_second_name: 'Collaboration Test',
  wedding_date: '2027-06-21',
  owner_display_name: 'QA Final A Studio',
  membership_id: 'membership-qa',
  access_version: '1',
  permission_group_mapping_version: '3',
  effective_capabilities: [{ key: 'wedding.identity', level: 'view' }],
}
const mappedSharedRpcRow = parseWorkspaceWedding(rawSharedRpcRow)
assert(mappedSharedRpcRow, 'the RPC mapper preserves a V3 shared row')
assert.equal(mappedSharedRpcRow.ownership_kind, 'shared')
assert.equal(mappedSharedRpcRow.permission_group_mapping_version, '3')
const effectiveNameRows: WorkspaceWeddingDisplayName[] = [{
  wedding_id: regressionId,
  owner_canonical_display_name: 'Joanna Testowa i Maciej Testowy',
  effective_display_name: 'Joanna Testowa i Maciej Testowy',
  has_personal_override: false,
}]

const owner2026 = ownerWedding('owned-2026', '2026-09-10')
const owner2027 = ownerWedding('owned-2027', '2027-08-18')
const owner2025 = ownerWedding('owned-2025', '2025-08-07')
const rows = composeWorkspaceWeddingRows(
  [
    workspaceRow(owner2025.id, 'owned', owner2025.date),
    workspaceRow(owner2026.id, 'owned', owner2026.date),
    mappedSharedRpcRow,
    workspaceRow(owner2027.id, 'owned', owner2027.date),
  ],
  [owner2025, owner2026, owner2027],
  effectiveNameRows,
)

function ids(scope: 'all' | 'mine' | 'shared', year: number | null, query = '') {
  return filterWorkspaceWeddingRowsForList(rows, { scope, year, query }).map((row) => row.id)
}

assert.deepEqual(ids('all', 2026).includes(regressionId), false, '2026 + Wszystkie excludes the 2027 shared regression wedding')
assert.deepEqual(ids('all', 2027).includes(regressionId), true, '2027 + Wszystkie includes the shared wedding')
assert.deepEqual(ids('all', null).includes(regressionId), true, 'all years + Wszystkie includes the shared wedding')
assert.deepEqual(ids('shared', 2026), [], 'a shared-only year with no rows stays selectable and produces an empty result')
assert.deepEqual(ids('shared', 2027), [regressionId], '2027 + Udostępnione contains the shared wedding')
assert.deepEqual(ids('shared', null), [regressionId], 'all years + Udostępnione contains the shared wedding')
assert.deepEqual(ids('mine', 2027).includes(regressionId), false, '2027 + Moje excludes the shared wedding')
assert.deepEqual(ids('shared', 2027, 'Joanna Testowa'), [regressionId], 'search uses the current owner display_name for a collaborator without an override')
assert.deepEqual(ids('shared', 2027, 'QA Final A'), [], 'old invitation-era couple names are not the live title search target')
assert.deepEqual(ids('shared', 2027, 'Private Package'), [], 'shared search cannot inspect private owner package data')
assert.deepEqual(ids('all', null), ['owned-2025', 'owned-2026', regressionId, 'owned-2027'], 'canonical list composes past, owned, and shared rows')
const canonicalSeasons = groupAssignmentsBySeason(rows, (row) => row.date, { referenceYear: 2026 })
const primaryYearOptions = getPrimaryWorkspaceYears(
  canonicalSeasons.map((group) => group.season),
  2026,
)
assert.equal(canonicalSeasons.some((group) => group.season === 2025), true, 'historical wedding remains in canonical data')
assert.deepEqual(primaryYearOptions, [2026, 2027], 'primary year options include the shared 2027 season and exclude past seasons')
const duplicateShared = composeWorkspaceWeddingRows(
  [workspaceRow(regressionId, 'shared', '2027-06-21'), workspaceRow(regressionId, 'shared', '2027-06-21')],
  [],
  effectiveNameRows,
)
assert.deepEqual(duplicateShared.map((row) => row.id), [regressionId], 'canonical wedding IDs are deduplicated')

const zeroOwnedShared = composeWorkspaceWeddingRows(
  [workspaceRow(regressionId, 'shared', '2027-06-21')],
  [],
  effectiveNameRows,
)
assert.deepEqual(
  filterWorkspaceWeddingRowsForList(zeroOwnedShared, { scope: 'all', year: null, query: '' }).map((row) => row.id),
  [regressionId],
  'a user with zero owned weddings and one shared wedding has canonical list data',
)

const workspace = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
const page = read('src/pages/WeddingsModernPage.tsx')
const card = read('src/features/weddings/modern/ModernWeddingCard.tsx')
const ledger = read('src/features/weddings/modern/ModernWeddingLedger.tsx')
const attribution = read('src/features/weddings/modern/SharedWeddingAttribution.tsx')
const combinedSurface = workspace.slice(workspace.indexOf('data-testid="weddings-list-surface"'), workspace.indexOf('</section>', workspace.indexOf('data-testid="weddings-list-surface"')))
assert(combinedSurface.includes('data-testid="weddings-primary-toolbar"'), 'search, ownership, and view are in the same primary toolbar')
assert(combinedSurface.includes('data-testid="weddings-year-filter"'), 'year filters are in the canonical surface')
assert(combinedSurface.includes('data-testid="weddings-list-body"'), 'wedding rows and empty states are in the canonical surface')
assert(workspace.includes("['all', 'Wszystkie']") && workspace.includes("['mine', 'Moje']") && workspace.includes("['shared', 'Udostępnione']"), 'ownership labels match the product contract')
assert(card.includes('to={`/sluby/${wedding.id}`}') && ledger.includes('to={`/sluby/${wedding.id}`}'), 'shared card and list rows navigate through canonical wedding detail')
assert(attribution.includes('UsersRound') && attribution.includes('role="img"'), 'shared rows use an accessible, non-interactive Users marker')
assert(!card.slice(card.indexOf("ownershipKind === 'shared'"), card.indexOf('\n  const ownedWedding')).includes('getModernContractValueLabel'), 'shared cards do not render owner contract value')
assert(!ledger.slice(ledger.indexOf('function SharedWeddingLedgerRow'), ledger.indexOf('export function ModernWeddingLedger')).includes('getModernContractValueLabel'), 'shared list rows do not render owner contract value')
assert(workspace.includes('aria-pressed={scope === value}'), 'ownership selection is announced')
assert(workspace.includes('aria-label="Filtruj według roku"'), 'year controls have an accessible group label')
assert(page.includes('useUnifiedWeddingsWorkspace'), 'canonical page uses unified actor-authorized read model')
assert(!page.includes('weddingService.getAll'), 'page does not replace the curated list with broad owner reads')

console.log('PASS  unified /sluby shared-wedding acceptance matrix')
