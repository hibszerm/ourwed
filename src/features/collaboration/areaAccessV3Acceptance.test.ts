import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COLLABORATION_AREA_KEYS,
  COLLABORATION_AREA_OPTIONS,
  EDITOR_AREA_DEFAULTS,
  VIEWER_AREA_DEFAULTS,
  areaDefaultsForMode,
  getEffectiveAreaLevel,
  parseAreaAccess,
  type CollaborationAreaAccess,
} from './areaAccessV3'
import { parseWeddingDetailAuthorityV3 } from '../weddings/detail/weddingDetailAuthority'

let assertions = 0
function check(condition: unknown, message: string) {
  assertions += 1
  assert.ok(condition, message)
}
function rejects(action: () => unknown, message: string) {
  assertions += 1
  assert.throws(action, undefined, message)
}

const labels = ['Logistyka', 'Ankieta przedślubna', 'Kontakty', 'Zadania', 'Notatki', 'Rozliczenie']
check(COLLABORATION_AREA_KEYS.join(',') === 'logistics,prewedding,contacts,tasks,notes,compensation', 'six canonical keys and order')
check(COLLABORATION_AREA_OPTIONS.length === 6, 'exactly six area options')
check(COLLABORATION_AREA_OPTIONS.map(({ label }) => label).join('|') === labels.join('|'), 'exact Polish labels and order')
check(Object.keys(VIEWER_AREA_DEFAULTS).join(',') === COLLABORATION_AREA_KEYS.join(','), 'Viewer serializes all six keys')
check(JSON.stringify(VIEWER_AREA_DEFAULTS) === JSON.stringify({ logistics: 1, prewedding: 1, contacts: 1, tasks: 1, notes: 1, compensation: 0 }), 'Viewer defaults exact')
check(JSON.stringify(EDITOR_AREA_DEFAULTS) === JSON.stringify({ logistics: 2, prewedding: 2, contacts: 2, tasks: 2, notes: 2, compensation: 0 }), 'Editor defaults exact')
check(areaDefaultsForMode('viewer')?.compensation === 0, 'Viewer compensation defaults to none')
check(areaDefaultsForMode('editor')?.compensation === 0, 'Editor compensation defaults to none')
check(areaDefaultsForMode('custom') === null, 'Custom has no implicit defaults')

const custom: CollaborationAreaAccess = { logistics: 0, prewedding: 1, contacts: 2, tasks: 0, notes: 1, compensation: 2 }
check(JSON.stringify(parseAreaAccess(custom)) === JSON.stringify(custom), 'all explicit Custom levels are retained')
check(getEffectiveAreaLevel({ kind: 'shared', weddingId: 'w', membershipId: 'm', accessVersion: '9007199254740993',
  mappingVersion: '3', roleKey: 'custom', customRoleLabel: 'Role', accessMode: 'custom', configuredAreas: custom,
  effectiveAreas: custom }, 'contacts') === 2, 'edit resolves to level 2 without numeric access-version coercion')
check(getEffectiveAreaLevel({ kind: 'owned', weddingId: 'w', mappingVersion: '3', configuredAreas: custom,
  effectiveAreas: custom }, 'prewedding') === 1, 'view resolves to level 1')
check(getEffectiveAreaLevel({ kind: 'shared', weddingId: 'w', membershipId: 'm', accessVersion: '1', mappingVersion: '3',
  roleKey: 'assistant', customRoleLabel: null, accessMode: 'custom', configuredAreas: custom,
  effectiveAreas: { ...custom, logistics: 0 } }, 'logistics') === 0, 'none resolves to level 0 independent of role')
check(getEffectiveAreaLevel({ kind: 'unavailable' }, 'logistics') === 0, 'unavailable authority fails closed')
const parsedAuthority = parseWeddingDetailAuthorityV3({ kind: 'shared', wedding_id: 'w', membership_id: 'm',
  access_version: '9007199254740993', mapping_version: '3', role_key: 'assistant', custom_role_label: null,
  access_mode: 'custom', configured_areas: custom, effective_areas: custom }, 'w')
check(parsedAuthority.kind === 'shared' && parsedAuthority.accessVersion === '9007199254740993', 'v3 parser accepts mapping 3 and keeps access version as string')
rejects(() => parseWeddingDetailAuthorityV3({ kind: 'shared', wedding_id: 'w', membership_id: 'm',
  access_version: 1, mapping_version: '3', role_key: 'assistant', custom_role_label: null,
  access_mode: 'custom', configured_areas: custom, effective_areas: custom }, 'w'), 'numeric access version is rejected')
rejects(() => parseWeddingDetailAuthorityV3({ kind: 'shared', wedding_id: 'w', membership_id: 'm',
  access_version: '1', mapping_version: '2', role_key: 'assistant', custom_role_label: null,
  access_mode: 'custom', configured_areas: custom, effective_areas: custom }, 'w'), 'legacy mapping authority is rejected by v3 parser')
rejects(() => parseWeddingDetailAuthorityV3({ kind: 'shared', wedding_id: 'w', membership_id: 'm',
  access_version: '1', mapping_version: '3', role_key: 'assistant', custom_role_label: null,
  access_mode: 'custom', configured_areas: { logistics: 1 }, effective_areas: custom }, 'w'), 'missing area state is rejected')
rejects(() => parseAreaAccess({ ...custom, identity: 1 }), 'unknown seventh area rejected')
rejects(() => parseAreaAccess({ ...custom, logistics: 3 }), 'out-of-range level rejected')
rejects(() => parseAreaAccess({ logistics: 1 }), 'incomplete Custom rejected')
rejects(() => parseAreaAccess({ ...custom, notes: 'view' }), 'non-numeric level rejected')

const root = process.cwd()
const matrix = readFileSync(join(root, 'src/features/collaboration/CollaborationAreaMatrixV3.tsx'), 'utf8')
const owner = readFileSync(join(root, 'src/features/collaboration/WeddingCollaborationOwnerPanel.tsx'), 'utf8')
const management = readFileSync(join(root, 'src/features/collaboration/CollaborationAccessManagementSheet.tsx'), 'utf8')
const service = readFileSync(join(root, 'src/features/collaboration/weddingCollaborationService.ts'), 'utf8')
const authority = readFileSync(join(root, 'src/features/weddings/detail/weddingDetailAuthority.ts'), 'utf8')
check(matrix.includes("const LABELS = ['Brak', 'Podgląd', 'Edycja']"), 'matrix offers exactly Brak, Podgląd, Edycja')
check(matrix.includes('role="radiogroup"') && matrix.includes('aria-checked'), 'matrix exposes labelled selected state')
check(matrix.includes('ArrowRight') && matrix.includes('ArrowLeft') && matrix.includes("event.key === 'Home'") && matrix.includes("event.key === 'End'"), 'matrix supports keyboard level navigation')
check(owner.includes('CollaborationAreaMatrixV3') && management.includes('CollaborationAreaMatrixV3'), 'active invitation and management surfaces use v3 matrix')
check(owner.includes("['viewer', 'Podgląd'") && owner.includes("['editor', 'Edycja'") && owner.includes("['custom', 'Własny'"), 'invitation modes use product labels')
check(management.includes("['viewer','Podgląd']") && management.includes("['editor','Edycja']") && management.includes("['custom','Własny']"), 'management modes use product labels')
check(!owner.includes('Podstawowe informacje') && !owner.includes('Miejsca i godziny')
  && !management.includes('Podstawowe informacje') && !management.includes('Miejsca i godziny'), 'active surfaces omit legacy permission rows')
check(service.includes("'create_wedding_collaboration_invitation_v3'") && service.includes("'update_wedding_collaboration_membership_access_v3'"), 'v3 service RPCs are active')
check(authority.includes("'resolve_my_wedding_detail_authority_v3'") && authority.includes("typeof row.access_version !== 'string'"), 'authority parser uses v3 and keeps version string')
check(!service.includes('list_wedding_places') && !service.includes('get_wedding_tasks')
  && !service.includes('get_wedding_contacts') && !service.includes('get_questionnaire'), 'authority service adds no domain queries')

console.log(`Collaboration V3 six-area frontend acceptance: ${assertions}/${assertions} PASS`)
