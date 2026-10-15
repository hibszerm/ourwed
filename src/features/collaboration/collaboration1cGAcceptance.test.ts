import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { replacePermissionGroup, ACTIVE_PERMISSION_GROUPS } from './CollaborationPermissionMatrixModel'
import type { CustomCapabilityGrant } from './accessManagementTypes'
import { presetDescriptionError, presetNameError } from './permissionPresetValidation'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const migration = read('supabase/migrations/20261015100000_collaboration_1c_g_permission_presets.sql')
const service = read('src/features/collaboration/permissionPresetService.ts')
const hooks = read('src/features/collaboration/useCollaborationPermissionPresets.ts')
const authorityService = read('src/features/collaboration/weddingCollaborationService.ts')
const picker = read('src/features/collaboration/CollaborationPermissionPresetPicker.tsx')
const manager = read('src/features/collaboration/CollaborationPermissionPresetManager.tsx')
const accessSheet = read('src/features/collaboration/CollaborationAccessManagementSheet.tsx')
const invitePanel = read('src/features/collaboration/WeddingCollaborationOwnerPanel.tsx')
const settings = read('src/pages/CollaborationSettingsPage.tsx')
const saveAs = read('src/features/collaboration/SaveAccessAsPresetDialog.tsx')

for (const rpc of [
  'list_collaboration_permission_presets', 'get_collaboration_permission_preset',
  'create_collaboration_permission_preset', 'update_collaboration_permission_preset',
  'archive_collaboration_permission_preset', 'duplicate_collaboration_permission_preset',
]) assert.ok(migration.includes(`function public.${rpc}`) && service.includes(`'${rpc}'`), `${rpc} is consistently named`)

assert.ok(migration.includes("validate_owner_access_configuration('unspecified',null,'custom',p_grants)"), 'preset grants use the exact 1C-F validator')
assert.ok(!migration.includes('preset_applied') && !accessSheet.includes('preset_applied'), 'preset application emits no event')
assert.ok(!migration.includes('p_preset_id') || !/create_wedding_collaboration_invitation_configured\([\s\S]{0,400}p_preset_id/.test(migration), 'authority RPCs do not accept preset identity')
assert.ok(!invitePanel.includes('roleKey') || !/roleKey[\s\S]{0,160}preset/i.test(invitePanel), 'role selection has no preset mapping')
assert.ok(picker.includes('onApply(detail.grants') && picker.includes('permissionPresetService.get'), 'applying a preset copies its loaded grants into local state')
assert.ok(accessSheet.includes("displayDraft.accessMode === 'custom'") && accessSheet.includes('<CollaborationPermissionPresetPicker'), 'access picker is rendered only for Custom')
assert.ok(invitePanel.includes("accessMode === 'custom'") && invitePanel.includes('<CollaborationPermissionPresetPicker'), 'initial invite picker is rendered only for Custom')
assert.ok(accessSheet.includes('update_wedding_collaboration') === false, 'sheet delegates authority writes to the existing service')
assert.ok(invitePanel.includes('useCreateWeddingInvitation') && authorityService.includes('createConfiguredInvitation'), 'initial invite keeps configured-create service path')
assert.ok(!saveAs.includes('useUpdateCollaborationAccess') && !saveAs.includes('membership') && !saveAs.includes('invitation'), 'save-as-preset only creates a preset')
assert.ok(settings.includes('<CollaborationPermissionPresetManager'), 'settings page hosts the canonical preset manager')
assert.ok(hooks.includes("['collaboration', 'permission-presets', userId]") && !hooks.includes('invalidateQueries({ queryKey: [\'wedding-collaboration\''), 'preset mutations use isolated query keys')
assert.ok(!service.includes('Number(') && !service.includes('parseInt(') && !service.includes('parseFloat('), 'preset versions are never numerically coerced')
assert.ok(manager.includes('Zestaw zmienił się w międzyczasie') && manager.includes('Zapisz zestaw'), 'conflict and save copy are present')
assert.ok(manager.includes('Zestaw zniknie z listy') && manager.includes('Duplikuj'), 'archive and duplicate UX are present')

const visibleCapabilities = ACTIVE_PERMISSION_GROUPS.flatMap((group) => group.capabilities)
assert.deepEqual(visibleCapabilities, ['wedding.identity', 'places.address', 'schedule.operational_time'], 'matrix exposes only active capability groups')
const mixed: CustomCapabilityGrant[] = [
  { capability_key: 'places.address', level: 2 },
  { capability_key: 'schedule.operational_time', level: 1 },
  { capability_key: 'wedding.identity', level: 1 },
]
assert.deepEqual(replacePermissionGroup(mixed, ['wedding.identity'], 1), mixed, 'unchanged group selection preserves mixed grants')
assert.deepEqual(replacePermissionGroup(mixed, ['places.address', 'schedule.operational_time'], 1), [
  { capability_key: 'places.address', level: 1 },
  { capability_key: 'schedule.operational_time', level: 1 },
  { capability_key: 'wedding.identity', level: 1 },
], 'only explicit selection normalizes the selected group')
assert.deepEqual(replacePermissionGroup([], ['wedding.identity'], 0), [], 'empty permission snapshot remains empty')
assert.equal(presetNameError('😀'.repeat(80)), '', '80 Unicode code points fit the name limit')
assert.ok(presetNameError('😀'.repeat(81)), '81 Unicode code points exceed the name limit')
assert.equal(presetNameError(`${String.fromCodePoint(0x2003)}Nazwa${String.fromCodePoint(0x2003)}`), '',
  'client trim follows Unicode whitespace handling')
assert.ok(presetDescriptionError('x'.repeat(241)), 'description limit is enforced for UX')
assert.equal(presetDescriptionError('😀'.repeat(240)), '', 'description counts Unicode code points, not UTF-16 units')

console.log('collaboration1cGAcceptance: PASS')
