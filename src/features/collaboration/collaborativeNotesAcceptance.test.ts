import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient } from '@tanstack/react-query'
import { collaborativeNotesQueryKey, parseCollaborativeNotesProjection } from './collaborativeNotesService'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const page = read('src/pages/WeddingDetailModernPage.tsx')
const workspace = read('src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx')
const manager = read('src/features/weddings/modern-detail/ManageWeddingNotesModal.tsx')
const persistence = read('src/features/weddings/edit/persistWeddingEditDraft.ts')
const noteService = read('src/lib/api/noteService.ts')
const weddingActions = read('src/lib/api/weddingActionsService.ts')
const migration = read('supabase/migrations/20261016215616_collaboration_v3_notes.sql')
const addModal = read('src/features/weddings/actions/AddNoteModal.tsx')

const id = '11111111-1111-4111-8111-111111111111'
const valid = {
  wedding_id: id,
  access_version: '900719925474099312345',
  notes_level: 2,
  notes: [{
    id: '22222222-2222-4222-8222-222222222222', author: 'Marta Notes', content: 'Treść',
    pinned: true, created_at: '2026-10-16T12:00:00.000Z', revision: '900719925474099312346',
  }],
}

const parsed = parseCollaborativeNotesProjection(valid, id, valid.access_version)
assert.equal(parsed.access_version, valid.access_version, 'access_version remains an exact decimal string')
assert.equal(parsed.notes[0]?.revision, valid.notes[0].revision, 'note revision remains an exact decimal string')
assert.equal(parsed.notes[0]?.pinned, true, 'canonical pinned state is preserved')
assert.throws(() => parseCollaborativeNotesProjection({ ...valid, extra: true }, id), /Nie udało się/, 'unknown projection fields are rejected')
assert.throws(() => parseCollaborativeNotesProjection({ ...valid, access_version: 2 }, id), /Nie udało się/, 'numeric access version is rejected')
assert.throws(() => parseCollaborativeNotesProjection({ ...valid, access_version: '01' }, id), /Nie udało się/, 'noncanonical access version is rejected')
assert.throws(() => parseCollaborativeNotesProjection({ ...valid, access_version: '3' }, id, '2'), /Nie udało się/, 'stale authority projection is rejected')
assert.throws(() => parseCollaborativeNotesProjection({ ...valid, notes: [{ ...valid.notes[0], revision: 3 }] }, id), /Nie udało się/, 'numeric note revision is rejected')
assert.throws(() => parseCollaborativeNotesProjection({ ...valid, notes: [{ ...valid.notes[0], private_field: 'x' }] }, id), /Nie udało się/, 'unknown note fields are rejected')

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const actorA = collaborativeNotesQueryKey('actor-a', id, '1')
const actorB = collaborativeNotesQueryKey('actor-b', id, '1')
const otherWedding = collaborativeNotesQueryKey('actor-a', '33333333-3333-4333-8333-333333333333', '1')
const nextVersion = collaborativeNotesQueryKey('actor-a', id, '2')
for (const [key, value] of [[actorA, 'A'], [actorB, 'B'], [otherWedding, 'other-wedding'], [nextVersion, 'v2']] as const) {
  client.setQueryData(key, value)
}
client.removeQueries({ queryKey: ['collaborative-wedding-notes-v3', 'actor-a', id] })
assert.equal(client.getQueryData(actorA), undefined, 'authority loss evicts actor and wedding notes cache')
assert.equal(client.getQueryData(nextVersion), undefined, 'authority loss evicts every cached version for the same actor and wedding')
assert.equal(client.getQueryData(actorB), 'B', 'another actor cache is isolated')
assert.equal(client.getQueryData(otherWedding), 'other-wedding', 'another wedding cache is isolated')
client.clear()

assert.match(page, /enabled: Boolean\(userId\) && notesLevel > 0/, 'Notes 0 does not issue a shared Notes query')
assert.match(page, /notesLevel === 0 \|\| revoked/, 'Notes 0 and revoked access evict shared note data')
assert.match(page, /onEditNotes=\{notesLevel === 2 \?/, 'Notes 1 does not expose edit')
assert.match(page, /onAddNote=\{notesLevel === 2 \?/, 'Notes 1 does not expose create')
assert.match(page, /feed=\{wedding\.notes\.map/, 'shared Historia receives only the Notes projection')
assert.match(workspace, /onEditNotes=\{\(\) => setNotesManageOpen\(true\)\}/, 'owner Notes edits open a Notes-only surface')
assert.match(workspace, /onAddNote=\{\(\) => onHeroAction\('add_note'\)\}/, 'owner quick-add keeps its canonical owner flow')
assert.doesNotMatch(persistence, /noteService\.(create|update|delete)/, 'broad wedding save no longer persists Notes')
assert.match(persistence, /weddingService\.update\(nextWedding/)
assert.match(persistence, /contactService\.(create|update|delete)/)
assert.match(persistence, /weddingExtraServiceService\.(add|update|remove)/)
assert.match(persistence, /paymentService\.(create|update|delete)/)
assert.match(manager, /expectedRevision|expected_revision|revision/, 'Notes-only editor carries each original note revision into writes')
assert.match(noteService, /p_expected_revision: expectedRevision/, 'owner writes use per-note revision CAS')
assert.match(noteService, /class NoteRevisionConflictError/)
assert.match(manager, /caught instanceof NoteRevisionConflictError/)
assert.match(addModal, /mode === 'shared'[\s\S]*collaborativeNotesService\.create/, 'shared Add Note uses the exact-wedding shared RPC')
assert.match(addModal, /Notatka będzie widoczna dla osób, które mają dostęp do notatek w tym zleceniu\./, 'Add Note privacy copy is accurate and concise')
assert.match(weddingActions, /type: 'note_added',[\s\S]*description: content\.slice\(0, 100\)/, 'owner quick-add keeps its historical note_added event')
assert.match(weddingActions, /await noteService\.create\([\s\S]*await timelineEventService\.create/, 'owner quick-add writes the note before its historical timeline event')
assert.doesNotMatch(noteService, /timelineEventService/, 'note deletion does not rewrite historical timeline events')
assert.match(migration, /new\.revision := old\.revision \+ 1/, 'server trigger increments every update exactly once')
assert.match(migration, /new\.revision := 1/, 'server trigger prevents caller-selected initial revision')
assert.match(migration, /resolve_wedding_area_level\(p_wedding_id,'notes'\)/, 'shared Notes writes authorize the Notes area level')
assert.doesNotMatch(migration, /create policy .*collaborat/i, 'migration does not widen raw Notes RLS')
assert.doesNotMatch(migration, /create index/i, 'migration adds no index without measured need')

console.log('Collaboration V3 Notes acceptance checks passed (36 assertions)')
