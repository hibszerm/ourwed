import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collaborativeWeddingIdentityQueryKey } from './useCollaborativeWeddingIdentity'
import { parseCollaborativeWeddingIdentity } from './collaborativeWeddingIdentityService'
import { CollaborativeReadError } from './collaborativeReadError'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const valid = {
  wedding_id: 'a9200000-0000-4000-8000-000000000001',
  couple_first_name: 'Ada',
  couple_second_name: 'Jan',
  wedding_date: '2027-09-01',
}

assert.deepEqual(parseCollaborativeWeddingIdentity([valid], valid.wedding_id), valid,
  'only the four-field canonical identity projection is parsed')
assert.equal(parseCollaborativeWeddingIdentity([], valid.wedding_id), null, 'zero rows map to unavailable')
assert.equal(parseCollaborativeWeddingIdentity(null, valid.wedding_id), null, 'null maps to unavailable')
assert.throws(() => parseCollaborativeWeddingIdentity([{ ...valid, places: [] }], valid.wedding_id),
  (error) => error instanceof CollaborativeReadError && error.kind === 'UNKNOWN',
  'additional response fields such as Places are rejected')
assert.throws(() => parseCollaborativeWeddingIdentity([{ ...valid, wedding_date: 7 }], valid.wedding_id),
  (error) => error instanceof CollaborativeReadError && error.kind === 'UNKNOWN',
  'invalid identity projection values are rejected')
assert.throws(() => parseCollaborativeWeddingIdentity([{ ...valid, wedding_id: 'a9200000-0000-4000-8000-000000000002' }], valid.wedding_id),
  (error) => error instanceof CollaborativeReadError && error.kind === 'UNKNOWN',
  'the returned projection must match the requested wedding')
assert.deepEqual(collaborativeWeddingIdentityQueryKey('actor-a', valid.wedding_id),
  ['collaborative-wedding-identity', 'actor-a', valid.wedding_id],
  'canonical identity cache is actor and wedding scoped')
assert.notDeepEqual(collaborativeWeddingIdentityQueryKey('actor-a', valid.wedding_id),
  collaborativeWeddingIdentityQueryKey('actor-b', valid.wedding_id),
  'different actors cannot share the canonical identity cache key')

const service = read('src/features/collaboration/collaborativeWeddingIdentityService.ts')
assert.match(service, /get_my_collaborative_wedding_identity/,
  'canonical identity service calls the dedicated narrow RPC')
assert.doesNotMatch(service, /get_collaborative_wedding_detail/,
  'canonical identity service never calls the broad legacy detail RPC')
const dto = read('src/features/collaboration/collaborativeWeddingIdentityTypes.ts')
assert.deepEqual([...dto.matchAll(/^\s+(\w+):/gm)].map((match) => match[1]).sort(),
  ['couple_first_name', 'couple_second_name', 'wedding_date', 'wedding_id'],
  'canonical identity DTO contains no Places or deferred domain fields')

console.log('PASS Collaboration H3 shared identity projection frontend acceptance (11 assertions)')
