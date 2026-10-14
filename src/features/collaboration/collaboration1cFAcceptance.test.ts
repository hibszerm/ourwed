import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const service = read('src/features/collaboration/weddingCollaborationService.ts')
const hooks = read('src/features/collaboration/useWeddingCollaboration.ts')
const owner = read('src/features/collaboration/WeddingCollaborationOwnerPanel.tsx')
const sheet = read('src/features/collaboration/CollaborationAccessManagementSheet.tsx')
const migration = read('supabase/migrations/20261014150000_collaboration_1c_f_owner_access_management.sql')
const permissionHooks = read('src/features/collaboration/useCollaborativeWeddings.ts')

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL ${message}`)
  console.log(`PASS ${message}`)
}

check(service.includes("'create_wedding_collaboration_invitation_configured'")
  && !service.includes("'create_wedding_collaboration_invite_from_connection'"),
'new frontend exposes configured create only')
check(owner.includes('configuration: {') && owner.includes('accessMode') && owner.includes('customGrants'),
  'initial invitation captures role and access before send')
check(service.includes('get_wedding_collaboration_access_previews') && owner.includes('useWeddingAccessPreviews')
  && !owner.includes("{ capability_key: 'places.address', level: 1 }"),
  'new Custom invite drafts use the owner-only server preview instead of hard-coded authority defaults')
check(owner.includes('Ładowanie bezpiecznych ustawień dostępu') && owner.includes('Spróbuj ponownie'),
  'Custom preview loading and retry failure are announced to the owner')
check(sheet.includes('viewer_preview') && sheet.includes('editor_preview') && sheet.includes('effectiveDraft'),
  'Custom entry uses server-provided current defaults')
check(sheet.includes('Dostęp zmienił się w międzyczasie') && sheet.includes('Twoje ustawienia pozostają w formularzu'),
  'conflict and network failures retain the local draft')
check(sheet.includes('role="radio"') && sheet.includes('aria-checked') && sheet.includes("import { Modal }")
  && !sheet.includes('window.confirm'), 'permission selectors and close confirmation use accessible app UI')
check(sheet.includes("['wedding.identity']") && !sheet.includes("['wedding.identity', 'places.address']"),
  'identity is isolated from editable places and time controls')
check(!/Number\([^)]*(?:Version|version)|parseInt\([^)]*(?:Version|version)/.test(service + hooks + sheet),
  'decimal string versions are not coerced to JavaScript numbers')
check(migration.includes('p_custom_grants jsonb') && migration.includes('jsonb_array_elements(p_custom_grants)')
  && migration.includes('having count(*)>1'), 'server validates a duplicate-detectable Custom array')
check(migration.includes('access_version=access_version+1') && migration.includes('configuration_revision=configuration_revision+1'),
  'membership and invitation revisions remain distinct monotonic decimal counters')
check(migration.includes('v_before_grants is distinct from v_grants'),
  'Custom save replaces and compares the complete sparse snapshot')
check(migration.includes("'FORBIDDEN'") && permissionHooks.includes('clearCollaborativeWeddingDetailAccess')
  && permissionHooks.includes('getMyAccessContext'), 'FORBIDDEN purges protected cache and refreshes current access context')
check(migration.includes('access_configuration_version=1') && migration.includes('configuration_revision)')
  && migration.includes('invitation_permission_grants(invitation_id,capability_key,level)'),
  'configured invitation writes v1 and Custom grants in one RPC transaction')
check(!migration.includes('preset_applied'), '1C-F does not introduce preset events')
