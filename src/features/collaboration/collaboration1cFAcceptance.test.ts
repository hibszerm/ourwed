import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const service = read('src/features/collaboration/weddingCollaborationService.ts')
const hooks = read('src/features/collaboration/useWeddingCollaboration.ts')
const owner = read('src/features/collaboration/WeddingCollaborationOwnerPanel.tsx')
const sheet = read('src/features/collaboration/CollaborationAccessManagementSheet.tsx')
const matrix = read('src/features/collaboration/CollaborationAreaMatrixV3.tsx')
const matrixStyles = read('src/features/collaboration/CollaborationPermissionMatrix.module.css')
const migration = read('supabase/migrations/20261016101826_collaboration_v3_six_area_authority_management.sql')
const permissionHooks = read('src/features/collaboration/useCollaborativeWeddings.ts')

function check(condition: boolean, message: string) {
  assert.ok(condition, message)
  console.log(`PASS ${message}`)
}

check(service.includes("'create_wedding_collaboration_invitation_v3'")
  && !service.includes("'create_wedding_collaboration_invitation_configured'"),
'active invite service uses only the six-area v3 RPC')
check(owner.includes('configuration: {') && owner.includes('accessMode') && owner.includes('customAreas'),
  'initial invitation serializes role, mode and six-area snapshot')
check(!service.includes('get_wedding_collaboration_access_previews')
  && !hooks.includes('useWeddingAccessPreviews'), 'active frontend has no legacy granular access preview path')
check(owner.includes('CollaborationAreaMatrixV3') && sheet.includes('CollaborationAreaMatrixV3'),
  'invitation and owner-management surfaces share the v3 area matrix')
check(sheet.includes('Dostęp zmienił się w międzyczasie') && sheet.includes('Twoje ustawienia pozostają w formularzu'),
  'conflict and network failures retain the local draft')
check(matrix.includes('role="radiogroup"') && matrix.includes('aria-checked') && matrixStyles.includes('focus-visible'),
  'six-area selector exposes accessible selected state and visible focus')
check(matrix.includes('ArrowRight') && matrix.includes('ArrowLeft') && matrix.includes("event.key === 'Home'")
  && matrix.includes("event.key === 'End'"), 'six-area selector supports keyboard selection')
check(!/Number\([^)]*(?:Version|version)|parseInt\([^)]*(?:Version|version)/.test(service + hooks + sheet),
  'decimal string versions are not coerced to JavaScript numbers')
check(migration.includes('p_custom_areas jsonb') && migration.includes("jsonb_object_keys(p_areas)")
  && migration.includes("p_mode is null"), 'server validates exact six-key Custom configuration and null mode')
check(migration.includes('access_version=access_version+1') && migration.includes('configuration_revision=configuration_revision+1'),
  'membership and invitation concurrency revisions remain monotonic')
check(migration.includes('v_old is distinct from v_areas') && migration.includes("'mapping_version','3'"),
  'membership changes compare and audit the complete v3 snapshot')
check(migration.includes("from public,anon,service_role") && migration.includes("to authenticated"),
  'public RPC privilege declarations are explicitly restricted')
check(permissionHooks.includes('clearCollaborativeWeddingDetailAccess')
  && permissionHooks.includes('getMyAccessContext'), 'FORBIDDEN continues to purge protected cache and refresh access context')
check(!owner.includes('Podstawowe informacje') && !owner.includes('Miejsca i godziny')
  && !sheet.includes('Podstawowe informacje') && !sheet.includes('Miejsca i godziny'),
  'active v3 product UI omits legacy permission rows')
check(!service.includes('list_wedding_places') && !service.includes('get_wedding_tasks')
  && !service.includes('get_wedding_contacts'), 'access management service introduces no domain reads')
console.log('Collaboration 1C-F active management acceptance: 15/15 PASS')
