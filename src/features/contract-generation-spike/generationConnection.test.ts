import assert from 'node:assert/strict'
import {
  clearGenerationConnection,
  generationConnectionKey,
  readGenerationConnection,
  writeGenerationConnection,
} from './generationConnection'

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
}
const key = generationConnectionKey('wedding-1')
writeGenerationConnection(storage, 'wedding-1', { requestId: 'opaque-request', sessionId: 'opaque-session' })
assert.deepEqual(readGenerationConnection(storage, 'wedding-1'), { requestId: 'opaque-request', sessionId: 'opaque-session' })
assert.deepEqual(Object.keys(JSON.parse(values.get(key)!)).sort(), ['requestId', 'sessionId'])
values.set(key, JSON.stringify({ requestId: 'x', authority: { legal: true } }))
assert.equal(readGenerationConnection(storage, 'wedding-1'), null, 'rejects persisted authority or undeclared data')
clearGenerationConnection(storage, 'wedding-1')
assert.equal(readGenerationConnection(storage, 'wedding-1'), null)
console.log('Opaque generation connection storage passed.')
