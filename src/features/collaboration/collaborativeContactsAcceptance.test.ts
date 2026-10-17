import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCollaborativeContactsProjection } from './collaborativeContactsService'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const page = read('src/pages/WeddingDetailModernPage.tsx')
const overview = read('src/features/weddings/modern-detail/ModernWeddingOverview.tsx')
const editor = read('src/features/weddings/detail/CanonicalCoupleContactsEditor.tsx')
const service = read('src/features/collaboration/collaborativeContactsService.ts')
const workspace = read('src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx')
const weddingService = read('src/lib/api/weddingService.ts')
const migration = read('supabase/migrations/20261016151212_collaboration_v3_contacts_canonical.sql')
const merge = read('src/lib/forms/mergeFormAnswersIntoWeddingCore.ts')
const sharedPage = page.slice(page.indexOf('function SharedWeddingDetail'), page.indexOf('function toSharedIdentityWedding'))

assert.match(page, /enabled: Boolean\(userId\) && contactsLevel > 0/, 'Contacts 0 does not mount the private Contacts query')
assert.match(page, /contactsLevel === 0 \|\| revoked/, 'Contacts 0 and revoked membership enter the private-data cleanup path')
assert.match(page, /const contactsKeyPrefix = \['collaborative-contacts-v3', userId, weddingId\][\s\S]*queryClient\.removeQueries\(\{ queryKey: contactsKeyPrefix \}\)/, 'private Contacts cache is evicted when authority is lost')
assert.match(page, /key=\{`\$\{user\?\.id\}:\$\{authority\.weddingId\}:\$\{authority\.accessVersion\}:\$\{authority\.effectiveAreas\.contacts\}:\$\{authority\.effectiveAreas\.notes\}`\}/, 'Contacts and Notes authority changes remount the shared detail and discard private drafts')
assert.match(page, /contactsLevel > 0 && contactsQuery\.data/, 'the private canonical card is omitted at Contacts 0')
assert.match(page, /contactsLevel === 2 \? \(\) =>/, 'Edit is exposed only at Contacts level 2')
assert.match(page, /contactsLevel === 2 && contactsDraft/, 'shared editor is available only at Contacts level 2')
assert.match(page, /collaborativeContactsService\.saveShared/, 'shared save uses the scoped V3 adapter')
assert.match(service, /get_my_collaborative_contacts_v3/, 'shared Contacts reads use the narrow RPC')
assert.match(overview, /export function CanonicalCoupleCard/, 'owner and shared use the same Para card')
assert.match(overview, /tel:/, 'canonical card keeps telephone links')
assert.match(overview, /mailto:/, 'canonical card keeps email links')
assert.match(overview, /modern-couple-contract-address/, 'canonical card includes the complete contract address Contacts value')
assert.match(editor, /getEditorSectionMeta\('contacts'\)/, 'owner and shared reuse the canonical Contacts editor metadata')
assert.match(editor, /CoupleContactFields/, 'canonical editor reuses the owner couple/contact fields')
assert.match(editor, /WeddingEditDrawerV2/, 'canonical editor reuses the centered owner modal shell')
assert.match(editor, /validateWeddingCorrespondenceEntries/, 'correspondence validation is reused')
assert.match(workspace, /collaborativeContactsService\.saveOwner/, 'owner Contacts save uses the narrow canonical adapter')
assert.match(workspace, /collaborativeContactsService\.getOwner/, 'owner Contacts read gets its bigint revision as exact text through a narrow RPC')
const genericUpdate = weddingService.slice(weddingService.indexOf(".from('weddings')\n      .update({"), weddingService.indexOf('wedding_date: patch.wedding_date'))
assert.doesNotMatch(genericUpdate, /bride_name:|groom_name:|correspondence:|groom_email:|groom_phone:|email: patch\.email|phone: patch\.phone/, 'unrelated wedding saves cannot overwrite canonical Contacts from a stale draft')
assert.match(workspace, /CanonicalCoupleContactsEditor/, 'owner path mounts the shared canonical editor')
assert.match(workspace, /ownerContactsQuery\.data/, 'owner editor displays the current canonical Contacts RPC projection')
assert.match(workspace, /onSave=\{\(\) => void saveOwnerContacts\(\)\}/, 'owner Contacts save does not use broad edit-draft persistence')
assert.doesNotMatch(sharedPage, /WeddingWorkspaceEditSurface|useWeddingDetailHost|useModernWeddingDetailContext/, 'shared Contacts do not mount the broad owner edit graph')
assert.match(service, /exactKeys\(value,/, 'shared Contacts parser rejects unknown root and nested keys')
assert.match(service, /update_my_collaborative_contacts_v3/, 'shared Contacts use one transactional write RPC')
assert.match(migration, /update_my_wedding_contacts_v3/, 'owner command has an owner-only canonical SQL authority path')
assert.match(migration, /contacts_revision::text/, 'the database revision crosses the SQL boundary as text')
assert.match(migration, /resolve_wedding_area_level\(p_wedding_id,'contacts'\)/, 'shared authority uses the frozen Contacts level')
assert.match(migration, /revoke all on function public\.get_my_collaborative_contacts_v3\(uuid\) from public,anon,service_role/, 'shared read is not executable by PUBLIC, anon, or service_role')
assert.match(migration, /grant execute on function public\.get_my_collaborative_contacts_v3\(uuid\) to authenticated/, 'shared read is explicitly granted to authenticated')
assert.doesNotMatch(migration, /create policy .*collaborat/i, 'the Contacts migration does not widen raw table RLS')
assert.match(merge, /Contact answers remain part of the Contract snapshot/, 'Contract form answers no longer hydrate operational Contacts')
assert.doesNotMatch(merge, /resolveEffectiveContractAddress|resolveCoupleNamesFromFormParts|nameFieldString/, 'Contract answers no longer override canonical operational Contacts')

const valid = {
  wedding_id: '11111111-1111-4111-8111-111111111111',
  access_version: '12', contacts_level: 2, contacts_revision: '900719925474099312345',
  bride: { first_name: 'Anna', last_name: 'Nowak', phone: null, email: 'anna@example.test' },
  groom: { first_name: 'Jan', last_name: 'Kowalski', phone: null, email: null },
  contract_address: null,
  correspondence: [{ id: '22222222-2222-4222-8222-222222222222', channel: 'instagram', value: '@anna' }],
}
assert.equal(parseCollaborativeContactsProjection(valid).contacts_revision, valid.contacts_revision, 'large monotonic revision remains an exact decimal string')
assert.throws(() => parseCollaborativeContactsProjection({ ...valid, extra: true }), /INVALID_CONTACTS_PROJECTION/, 'unknown response root fields are rejected')
assert.throws(() => parseCollaborativeContactsProjection({ ...valid, bride: { ...valid.bride, extra: true } }), /INVALID_CONTACTS_PROJECTION/, 'unknown person fields are rejected')
assert.throws(() => parseCollaborativeContactsProjection({ ...valid, access_version: '1.5' }), /INVALID_CONTACTS_PROJECTION/, 'malformed access version is rejected')
assert.throws(() => parseCollaborativeContactsProjection({ ...valid, contacts_revision: 4 }), /INVALID_CONTACTS_PROJECTION/, 'numeric revision is rejected rather than rounded')
assert.throws(() => parseCollaborativeContactsProjection({ ...valid, correspondence: [{ ...valid.correspondence[0], channel: 'sms' }] }), /INVALID_CONTACTS_PROJECTION/, 'unsupported correspondence channels are rejected')
assert.throws(() => parseCollaborativeContactsProjection({ ...valid, correspondence: [{ ...valid.correspondence[0], id: 'bad' }] }), /INVALID_CONTACTS_PROJECTION/, 'malformed correspondence IDs are rejected')

console.log('Collaboration V3 Contacts acceptance checks passed (41 assertions)')
