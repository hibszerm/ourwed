import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COLLABORATION_AREA_KEYS, EDITOR_AREA_DEFAULTS, VIEWER_AREA_DEFAULTS } from './areaAccessV3'
import { presetDescriptionError, presetNameError } from './permissionPresetValidation'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const migration = read('supabase/migrations/20261016101826_collaboration_v3_six_area_authority_management.sql')
const service = read('src/features/collaboration/permissionPresetService.ts')
const hooks = read('src/features/collaboration/useCollaborationPermissionPresets.ts')
const presetTypes = read('src/features/collaboration/permissionPresetTypes.ts')
const picker = read('src/features/collaboration/CollaborationPermissionPresetPicker.tsx')
const manager = read('src/features/collaboration/CollaborationPermissionPresetManager.tsx')
const accessSheet = read('src/features/collaboration/CollaborationAccessManagementSheet.tsx')
const invitePanel = read('src/features/collaboration/WeddingCollaborationOwnerPanel.tsx')
const saveAs = read('src/features/collaboration/SaveAccessAsPresetDialog.tsx')

for (const rpc of [
  'list_collaboration_permission_presets_v3', 'get_collaboration_permission_preset_v3',
  'create_collaboration_permission_preset_v3', 'update_collaboration_permission_preset_v3',
  'archive_collaboration_permission_preset_v3', 'duplicate_collaboration_permission_preset_v3',
]) assert.ok(migration.includes(`function public.${rpc}`) && service.includes(`'${rpc}'`), `${rpc} is consistently named`)

assert.deepEqual(COLLABORATION_AREA_KEYS, ['logistics','prewedding','contacts','tasks','notes','compensation'], 'preset model has exactly six canonical areas')
assert.deepEqual(VIEWER_AREA_DEFAULTS, { logistics: 1, prewedding: 1, contacts: 1, tasks: 1, notes: 1, compensation: 0 }, 'system Viewer snapshot exact')
assert.deepEqual(EDITOR_AREA_DEFAULTS, { logistics: 2, prewedding: 2, contacts: 2, tasks: 2, notes: 2, compensation: 0 }, 'system Editor snapshot exact')
assert.ok(migration.includes("'collaboration_viewer_v3'") && migration.includes("'collaboration_editor_v3'"), 'v3 system preset identities are seeded')
assert.ok(!migration.includes('preset_applied') && !accessSheet.includes('preset_applied'), 'preset application emits no authority event')
assert.ok(!/create_wedding_collaboration_invitation_v3\([\s\S]{0,700}p_preset_id/.test(migration), 'authority RPC accepts no preset identity')
assert.ok(!invitePanel.includes('Podstawowe informacje') && !accessSheet.includes('Miejsca i godziny'), 'active UI has no legacy matrix rows')
assert.ok(picker.includes('onApply({ ...detail.areas })') && picker.includes('permissionPresetService.get'), 'applying preset copies the loaded six-area draft locally')
assert.ok(accessSheet.includes("displayDraft.accessMode === 'custom'") && accessSheet.includes('<CollaborationPermissionPresetPicker'), 'access picker appears only in Custom mode')
assert.ok(invitePanel.includes("accessMode === 'custom'") && invitePanel.includes('<CollaborationPermissionPresetPicker'), 'initial invite preset picker appears only in Custom mode')
assert.ok(accessSheet.includes('useUpdateCollaborationAccess') && !accessSheet.includes("supabase.rpc('update_wedding_collaboration"), 'sheet delegates writes to the typed service')
assert.ok(invitePanel.includes('useCreateWeddingInvitation') && read('src/features/collaboration/weddingCollaborationService.ts').includes('create_wedding_collaboration_invitation_v3'), 'initial invite uses v3 configured create')
assert.ok(!saveAs.includes('useUpdateCollaborationAccess') && !saveAs.includes('membership') && !saveAs.includes('invitation'), 'Save as preset does not save authority')
assert.ok(hooks.includes("['collaboration', 'permission-presets', userId]") && !hooks.includes('wedding-collaboration'), 'preset cache keys are actor scoped and separate from memberships')
assert.ok(!service.includes('Number(') && !service.includes('parseInt(') && !service.includes('parseFloat('), 'preset versions stay decimal strings')
assert.ok(manager.includes('Zestaw zmienił się w międzyczasie') && manager.includes('Zapisz zestaw'), 'preset edit conflict and save copy are present')
assert.ok(manager.includes('Zestaw zniknie z listy') && manager.includes('Duplikuj'), 'archive and duplicate UX are present')
assert.ok(presetTypes.includes('areas: CollaborationAreaAccess') && !presetTypes.includes('grants:'), 'v3 preset DTO has areas and no raw grants')
assert.ok(migration.toLowerCase().includes('for update') && migration.includes('p_expected_version::numeric<>v_p.version::numeric'), 'preset writes use optimistic concurrency')
assert.ok(migration.includes('scope=\'system\' then raise exception') && migration.includes("message='FORBIDDEN'"), 'system presets cannot be edited or archived')
assert.equal(presetNameError('😀'.repeat(80)), '', '80 Unicode code points fit the name limit')
assert.ok(presetNameError('😀'.repeat(81)), '81 Unicode code points exceed the name limit')
assert.equal(presetNameError(`${String.fromCodePoint(0x2003)}Nazwa${String.fromCodePoint(0x2003)}`), '', 'client trim follows Unicode whitespace handling')
assert.ok(presetDescriptionError('x'.repeat(241)), 'description limit is enforced for UX')
assert.equal(presetDescriptionError('😀'.repeat(240)), '', 'description counts Unicode code points, not UTF-16 units')

console.log('Collaboration 1C-G v3 presets acceptance: 25/25 PASS')
