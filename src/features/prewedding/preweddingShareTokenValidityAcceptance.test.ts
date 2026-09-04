/**
 * Share-token validity: session plaintext must hash to CURRENT public_token_hash.
 * Run: npm run test:prewedding-share
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  clearShareToken,
  hashPreweddingShareToken,
  persistShareToken,
  readShareToken,
  readValidShareToken,
  shareTokenHashesEqual,
} from '@/features/prewedding/preweddingShareHelpers'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function installMemorySessionStorage() {
  const store = new Map<string, string>()
  const memory = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: memory,
    configurable: true,
  })
}

const TOKEN_A = 'fixture-token-a'
const TOKEN_B = 'fixture-token-b'
const Q1 = 'questionnaire-one'
const Q2 = 'questionnaire-two'

installMemorySessionStorage()

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

await test('sha256 helper matches node crypto (postgres digest equivalent)', async () => {
  const expected = createHash('sha256').update(TOKEN_A, 'utf8').digest('hex')
  const actual = await hashPreweddingShareToken(TOKEN_A)
  assertEq(actual, expected, 'digest')
  assert(actual.length === 64, 'hex length')
})

await test('1. matching plaintext + current hash → Copy allowed', async () => {
  persistShareToken(Q1, TOKEN_A)
  const hashA = await hashPreweddingShareToken(TOKEN_A)
  const valid = await readValidShareToken(Q1, hashA)
  assertEq(valid, TOKEN_A, 'valid plaintext returned')
  assertEq(readShareToken(Q1), TOKEN_A, 'cache kept')
})

await test('2. mismatching plaintext → stale cleared, Copy unavailable', async () => {
  persistShareToken(Q1, TOKEN_A)
  const hashB = await hashPreweddingShareToken(TOKEN_B)
  const valid = await readValidShareToken(Q1, hashB)
  assertEq(valid, null, 'rejected')
  assertEq(readShareToken(Q1), null, 'stale cache cleared')
})

await test('3. hash change after cache populate → cached plaintext rejected', async () => {
  persistShareToken(Q1, TOKEN_A)
  const hashA = await hashPreweddingShareToken(TOKEN_A)
  const first = await readValidShareToken(Q1, hashA)
  assertEq(first, TOKEN_A, 'initially valid')
  const hashB = await hashPreweddingShareToken(TOKEN_B)
  const second = await readValidShareToken(Q1, hashB)
  assertEq(second, null, 'rejected after hash change')
  assertEq(readShareToken(Q1), null, 'cleared after hash change')
})

await test('4. rotate: old token rejected, new token accepted', async () => {
  persistShareToken(Q1, TOKEN_A)
  const hashA = await hashPreweddingShareToken(TOKEN_A)
  const hashB = await hashPreweddingShareToken(TOKEN_B)
  assertEq(await readValidShareToken(Q1, hashA), TOKEN_A, 'old valid before rotate')
  clearShareToken(Q1)
  persistShareToken(Q1, TOKEN_B)
  assertEq(await readValidShareToken(Q1, hashB), TOKEN_B, 'new accepted')
  assertEq(readShareToken(Q1), TOKEN_B, 'new cache kept')
  persistShareToken(Q1, TOKEN_A)
  assertEq(await readValidShareToken(Q1, hashB), null, 'old plaintext vs new hash rejected')
  assertEq(readShareToken(Q1), null, 'stale leftover cleared')
})

await test('5. different questionnaire cannot leak token', async () => {
  persistShareToken(Q1, TOKEN_A)
  const hashA = await hashPreweddingShareToken(TOKEN_A)
  assertEq(await readValidShareToken(Q2, hashA), null, 'no token on Q2')
  assertEq(await readValidShareToken(Q1, hashA), TOKEN_A, 'Q1 still valid')
  assertEq(readShareToken(Q2), null, 'Q2 cache empty')
})

await test('6. hash-only: missing plaintext and missing hash', async () => {
  clearShareToken(Q1)
  const hashA = await hashPreweddingShareToken(TOKEN_A)
  assertEq(await readValidShareToken(Q1, hashA), null, 'no cache')
  persistShareToken(Q1, TOKEN_A)
  assertEq(await readValidShareToken(Q1, null), null, 'no current hash')
  assertEq(readShareToken(Q1), null, 'orphan plaintext cleared')
})

await test('7. rotate source: answers/status preserved, cache cleared then replaced', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  const hook = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/usePreWeddingQuestionnaireWorkspace.ts',
    ),
    'utf8',
  )
  assert(
    service.includes('readValidShareToken(id, current.publicTokenHash)'),
    'ensureShareLink validates',
  )
  assert(service.includes('Token rotation only — keep submitted'), 'status preserved')
  assert(service.includes('inconsistent hash'), 'generate verifies returned token')
  assert(hook.includes('clearShareToken(questionnaire.id)'), 'rotate clears cache')
  assert(hook.includes('readValidShareToken'), 'hydrate validates')
  assert(hook.includes('shareTokenHashesEqual'), 'Copy gated on current hash')
  assert(!hook.includes('setToken(cached)'), 'no blind hydrate')
})

await test('8. hash compare is case-insensitive; no secrets logged', async () => {
  const hashA = await hashPreweddingShareToken(TOKEN_A)
  assert(shareTokenHashesEqual(hashA, hashA.toUpperCase()), 'case')
  assert(!shareTokenHashesEqual(hashA, await hashPreweddingShareToken(TOKEN_B)), 'mismatch')
  assert(!shareTokenHashesEqual(null, hashA), 'missing left')
})

console.log('\nprewedding share token validity: done')
