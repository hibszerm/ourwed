import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient } from '@tanstack/react-query'
import { collaborativeNotesQueryKey } from './collaborativeNotesService'

const page = readFileSync(resolve(process.cwd(), 'src/pages/WeddingDetailModernPage.tsx'), 'utf8')
const manager = readFileSync(resolve(process.cwd(), 'src/features/weddings/modern-detail/ManageWeddingNotesModal.tsx'), 'utf8')
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
const actor = 'qa-member'
const wedding = '11111111-1111-4111-8111-111111111111'
const ownerKey = ['weddings', 'qa-member', wedding] as const
const v1Key = collaborativeNotesQueryKey(actor, wedding, '1')
const v2Key = collaborativeNotesQueryKey(actor, wedding, '2')
const otherActorKey = collaborativeNotesQueryKey('other-member', wedding, '1')
const otherWeddingKey = collaborativeNotesQueryKey(actor, '22222222-2222-4222-8222-222222222222', '1')
const oldNote = { id: 'note-a', content: 'A', author: 'Owner', pinned: false, createdAt: '2026-10-17', revision: '4' }

queryClient.setQueryData(ownerKey, { notes: [{ ...oldNote, id: 'owner-note' }] })
queryClient.setQueryData(v1Key, { wedding_id: wedding, access_version: '1', notes_level: 2, notes: [oldNote] })
queryClient.setQueryData(otherActorKey, { notes: ['other actor'] })
queryClient.setQueryData(otherWeddingKey, { notes: ['other wedding'] })

// Notes 2 → 1 retains authorized rows while the rendered manager loses write authority.
const retained = queryClient.getQueryData<{ notes: typeof oldNote[] }>(v1Key)
assert.equal(retained?.notes[0]?.content, 'A')
assert.match(page, /open=\{notesEditing && notesLevel === 2 && Boolean\(notesQuery\.data\)\}/)
assert.match(page, /authority\.effectiveAreas\.contacts\}:\$\{authority\.effectiveAreas\.notes\}/)
assert.match(page, /collaborativeNotesQueryKey\(userId, weddingId, accessVersion\)/)
assert.match(page, /notesLevel === 2 \? \(\) => setNotesEditing\(true\) : undefined/)
assert.match(page, /notesLevel === 2 \? \(\) => setNotesAdding\(true\) : undefined/)

// Notes > 0 → 0 removes every cached authority version, without crossing actor/domain boundaries.
queryClient.setQueryData(v2Key, { wedding_id: wedding, access_version: '2', notes_level: 1, notes: [oldNote] })
assert.equal(queryClient.getQueryData<{ notes: typeof oldNote[] }>(v2Key)?.notes[0]?.content, 'A', 'Notes 2→1 refetch retains authorized rows under the new access version')
queryClient.removeQueries({ queryKey: v1Key, exact: true })
assert.equal(queryClient.getQueryData(v1Key), undefined, 'old authority-version cache is evicted after transition')
queryClient.removeQueries({ queryKey: ['collaborative-wedding-notes-v3', actor, wedding] })
assert.equal(queryClient.getQueryData(v1Key), undefined)
assert.equal(queryClient.getQueryData(v2Key), undefined)
assert.deepEqual(queryClient.getQueryData(otherActorKey), { notes: ['other actor'] })
assert.deepEqual(queryClient.getQueryData(otherWeddingKey), { notes: ['other wedding'] })
assert.equal(queryClient.getQueryData(ownerKey)?.notes[0]?.id, 'owner-note')

// A stale editor refetch converges to the server winner after a CAS conflict.
const conflictKey = collaborativeNotesQueryKey(actor, wedding, '3')
queryClient.setQueryData(conflictKey, { notes: [oldNote] })
const winner = { ...oldNote, content: 'B', revision: '5' }
await queryClient.fetchQuery({ queryKey: conflictKey, queryFn: async () => ({ notes: [winner] }), staleTime: 0 })
assert.equal(queryClient.getQueryData<{ notes: typeof oldNote[] }>(conflictKey)?.notes[0]?.content, 'B')
assert.equal(queryClient.getQueryData<{ notes: typeof oldNote[] }>(conflictKey)?.notes[0]?.revision, '5')
assert.match(manager, /caught instanceof CollaborativeNotesError && caught\.kind === 'CONFLICT'/)
assert.match(manager, /setBaseline\(currentNotes\)[\s\S]*setDraft\(currentNotes\)/)

// Revoke/UNAVAILABLE clears shared data; owner wedding state remains intact.
queryClient.removeQueries({ queryKey: ['collaborative-wedding-notes-v3', actor, wedding] })
assert.equal(queryClient.getQueryData(conflictKey), undefined)
assert.equal(queryClient.getQueryData(ownerKey)?.notes[0]?.id, 'owner-note')
queryClient.clear()

console.log('Collaborative Notes QueryClient cache behavior passed (19 assertions; real QueryClient state exercised)')
