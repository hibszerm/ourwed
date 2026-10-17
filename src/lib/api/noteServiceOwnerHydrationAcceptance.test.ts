import assert from 'node:assert/strict'
import { supabase } from '@/lib/supabase'
import { noteService } from '@/lib/api/noteService'

const weddingWithNote = '11111111-1111-4111-8111-111111111111'
const weddingWithoutNotes = '22222222-2222-4222-8222-222222222222'
const calls: Array<{ name: string; weddingId: unknown }> = []

Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  writable: true,
  value: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, weddingId: args.p_wedding_id })
    return {
      error: null,
      data: args.p_wedding_id === weddingWithNote
        ? [{
            id: '33333333-3333-4333-8333-333333333333',
            wedding_id: weddingWithNote,
            author: 'Owner',
            content: 'Hydrated owner Note',
            pinned: true,
            created_at: '2026-10-16T12:00:00.000Z',
            revision: '9007199254740993',
          }]
        : [],
    }
  },
})

try {
  const result = await noteService.listByWeddingIds([weddingWithNote, weddingWithoutNotes])
  const notes = result.get(weddingWithNote) ?? []
  assert.equal(calls.length, 2, 'owner hydration read uses the owner Notes RPC for each wedding')
  assert.ok(calls.every((call) => call.name === 'get_my_owned_wedding_notes_v3'), 'owner hydration never selects raw bigint Notes rows')
  assert.deepEqual(calls.map((call) => call.weddingId), [weddingWithNote, weddingWithoutNotes], 'RPC remains bound to each requested wedding')
  assert.equal(notes.length, 1, 'canonical owner Note hydrates successfully')
  assert.equal(notes[0]?.content, 'Hydrated owner Note', 'owner Note content is preserved')
  assert.equal(notes[0]?.revision, '9007199254740993', 'large bigint revision remains exact decimal text')
  assert.equal(typeof notes[0]?.revision, 'string', 'hydrated revision remains a string')
  assert.deepEqual(result.get(weddingWithoutNotes), [], 'zero-Notes wedding hydrates as an empty list')
  console.log('Owner Notes hydration transport acceptance passed (8 assertions)')
} finally {
  delete (supabase as unknown as { rpc?: unknown }).rpc
}
