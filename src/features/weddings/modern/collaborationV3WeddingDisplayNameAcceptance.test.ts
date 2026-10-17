import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient } from '@tanstack/react-query'
import {
  updateWorkspaceWeddingDisplayNameCaches,
  workspaceWeddingDisplayNamesQueryKey,
} from '@/features/collaboration/useWorkspaceWeddingDisplayNames'
import type { WorkspaceWedding, WorkspaceWeddingDisplayName } from '@/features/collaboration/workspaceTypes'
import {
  composeWorkspaceWeddingRows,
  getWorkspaceWeddingName,
  matchesWorkspaceWeddingSearch,
} from '@/features/weddings/modern/workspaceWeddings'

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const shared: WorkspaceWedding = {
  wedding_id: '09270d9d-b8c0-4944-9e3b-b382a8875dbd',
  ownership_kind: 'shared',
  couple_first_name: 'QA Final A',
  couple_second_name: 'Collaboration Test',
  wedding_date: '2027-06-21',
  owner_display_name: 'QA Final A Studio',
  membership_id: 'membership-a',
  access_version: '1',
  permission_group_mapping_version: '3',
  effective_capabilities: [{ key: 'wedding.identity', level: 'view' }],
}

function displayName(effective: string, hasOverride: boolean): WorkspaceWeddingDisplayName {
  return {
    wedding_id: shared.wedding_id,
    owner_canonical_display_name: 'Joanna Testowa i Maciej Testowy',
    effective_display_name: effective,
    has_personal_override: hasOverride,
  }
}

const following = composeWorkspaceWeddingRows([shared], [], [displayName('Joanna Testowa i Maciej Testowy', false)])[0]!
assert.equal(getWorkspaceWeddingName(following), 'Joanna Testowa i Maciej Testowy')
assert.equal(matchesWorkspaceWeddingSearch(following, 'Joanna Testowa'), true)
assert.equal(matchesWorkspaceWeddingSearch(following, 'QA Final A'), false)
assert.equal(following.ownershipKind === 'shared' && following.ownerDisplayName, 'QA Final A Studio',
  'owner attribution remains separate from actor-effective title')

const overridden = composeWorkspaceWeddingRows([shared], [], [displayName('Mój prywatny tytuł', true)])[0]!
assert.equal(getWorkspaceWeddingName(overridden), 'Mój prywatny tytuł')
assert.equal(matchesWorkspaceWeddingSearch(overridden, 'Mój prywatny'), true)
assert.equal(matchesWorkspaceWeddingSearch(overridden, 'Joanna Testowa'), false)
assert.equal(composeWorkspaceWeddingRows([shared], [], []).length, 0,
  'missing authoritative name row never falls back to invitation-era couple names at runtime')

const queryClient = new QueryClient()
const actorKey = workspaceWeddingDisplayNamesQueryKey('actor-a', [shared.wedding_id])
const otherActorKey = workspaceWeddingDisplayNamesQueryKey('actor-b', [shared.wedding_id])
queryClient.setQueryData(actorKey, [displayName('Joanna Testowa i Maciej Testowy', false)])
queryClient.setQueryData(otherActorKey, [displayName('Another actor title', true)])
updateWorkspaceWeddingDisplayNameCaches(queryClient, 'actor-a', displayName('My local title', true))
assert.equal(queryClient.getQueryData<WorkspaceWeddingDisplayName[]>(actorKey)?.[0]?.effective_display_name, 'My local title')
assert.equal(queryClient.getQueryData<WorkspaceWeddingDisplayName[]>(otherActorKey)?.[0]?.effective_display_name, 'Another actor title',
  'actor-local display-name cache updates never leak into another user’s query cache')
queryClient.clear()

const service = read('src/features/collaboration/workspaceService.ts')
assert(service.includes("'get_my_workspace_wedding_display_names'"), 'shared workspace names use the batch resolver')
assert(service.includes("'set_my_wedding_display_name_override'"), 'shared name saves use the actor-bound preference command')
assert(service.includes("'clear_my_wedding_display_name_override'"), 'restore removes the actor-bound preference')
assert(!service.includes('p_actor_user_id'), 'client never chooses the preference actor')

const workspaceHook = read('src/features/weddings/modern/useUnifiedWeddingsWorkspace.ts')
assert(workspaceHook.includes('useWorkspaceWeddingDisplayNames'), 'unified /sluby batches effective names for shared rows')
const sharedDetail = read('src/pages/WeddingDetailModernPage.tsx')
assert(sharedDetail.includes('mode="shared"'), 'shared detail uses the canonical shared header mode')
assert(sharedDetail.includes('<ModernWeddingDetailHeader'), 'shared title editing is placed in the existing detail header')
assert(sharedDetail.includes('onSaveSharedDisplayName={saveSharedDisplayName}'), 'shared detail routes editor saves to private preference RPC')
assert(sharedDetail.includes('onRestoreOwnerDisplayName={restoreOwnerDisplayName}'), 'shared detail routes restore through clear RPC')

const header = read('src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx')
assert(header.includes('<WeddingIdentityEditDialog'), 'owner and collaborator share the same editor component')
assert(header.includes("mode === 'shared' || !requireProForOwnerEdit"), 'shared identity edit uses the same header affordance without a commercial Pro gate')
assert(header.includes('mode === \'owner\' ? <>'), 'owner-only actions remain absent from the shared menu')

const dialog = read('src/features/weddings/detail/v2/WeddingIdentityEditDialog.tsx')
assert(dialog.includes('mode === \'shared\'') && dialog.includes('onSharedSave(requestedName)'),
  'same dialog routes collaborator saves to a private preference')
assert(dialog.includes('hasPersonalDisplayNameOverride ?'), 'restore appears only when a personal name exists')
assert(dialog.includes('onSharedRestore()'), 'restore clears the preference and resolves the latest owner title')
assert(dialog.includes('readOnly={mode === \'shared\'}'), 'shared identity dialog preserves the owner date field visually without allowing date mutation')
assert(dialog.includes('weddingService.update('), 'existing owner canonical mutation remains intact')

const visualFixture = read('src/features/weddings/modern-detail/CollaborationDisplayNameVisualFixture.tsx')
assert(visualFixture.includes('onOwnerSave={saveOwnerName}')
  && visualFixture.includes('onSaveSharedDisplayName={savePersonalName}')
  && visualFixture.includes('enableBriefAction={false}'),
'visual fixture routes both saves to local state and disables Supabase-backed brief queries')
const router = read('src/routes/router.tsx')
assert(router.includes('const displayNameVisualFixtureRoute = import.meta.env.DEV')
  && router.includes("path: '/dev/collaboration-display-name'"),
'visual fixture route exists in development builds only')

console.log('Collaboration V3 actor-specific wedding display names passed.')
