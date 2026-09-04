/**
 * Browser-safe ID helper + import session ID.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/createBrowserSafeId.test.ts
 */

import { createBrowserSafeId, isUuidV4 } from '@/lib/utils/createBrowserSafeId'
import {
  createImportSessionId,
  executeWeddingImport,
} from '@/features/weddings/import/weddingImportService'
import type { WeddingImportReviewRow } from '@/features/weddings/import/types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

const originalCrypto = globalThis.crypto
const originalCryptoDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto')

function restoreCrypto() {
  if (originalCryptoDesc) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDesc)
    return
  }
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: originalCrypto,
  })
}

function withCrypto(
  value: Pick<Crypto, 'getRandomValues'> | { randomUUID?: Crypto['randomUUID'] } | Record<string, never>,
  fn: () => void | Promise<void>,
) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value,
  })
  return Promise.resolve(fn()).finally(restoreCrypto)
}

function readyRow(id: string, partner1Name: string): WeddingImportReviewRow {
  return {
    id,
    sourceRowNumber: 2,
    weddingDate: '2027-06-12',
    coupleDisplayName: `${partner1Name} i Partner`,
    partner1Name,
    partner2Name: 'Partner',
    contractValue: 10500,
    priceState: 'value',
    status: 'ready',
    issues: [],
    duplicateCandidates: [],
    selectedForImport: true,
  }
}

async function main() {
  await run('A. crypto.randomUUID available returns a valid UUID v4', () => {
    const id = createBrowserSafeId()
    assert(isUuidV4(id), `expected uuid v4, got ${id}`)
  })

  await run('B. randomUUID missing, getRandomValues available — UUID v4, no throw', () =>
    withCrypto(
      {
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      () => {
        assert(typeof globalThis.crypto.randomUUID !== 'function', 'randomUUID must be absent')
        const id = createBrowserSafeId()
        assert(isUuidV4(id), `fallback uuid v4, got ${id}`)
      },
    ),
  )

  await run('C. createImportSessionId does not throw when randomUUID is missing', () =>
    withCrypto({}, () => {
      const id = createImportSessionId()
      assert(typeof id === 'string' && id.length > 0, 'session id string')
      assert(isUuidV4(id), `session id uuid v4, got ${id}`)
    }),
  )

  await run('D. import page lazily initializes one session id and resets only on another file', () =>
    withCrypto({}, () => {
      const page = readFileSync(resolve(process.cwd(), 'src/pages/WeddingImportPage.tsx'), 'utf8')
      assert(
        page.includes('useState(() => createImportSessionId())'),
        'lazy session init',
      )
      assert(page.includes('setImportSessionId(createImportSessionId())'), 'reset on another file')
      const handleFile = page.slice(
        page.indexOf('async function handleFile'),
        page.indexOf('function applySheetSelection'),
      )
      assert(!handleFile.includes('setImportSessionId'), 'changing file does not reset session')
      const sessionId = createImportSessionId()
      assert(isUuidV4(sessionId), `fallback session init uuid v4, got ${sessionId}`)
    }),
  )

  await run('E. same-session retry still skips already imported rows', async () => {
    await withCrypto({}, async () => {
      const importSessionId = createImportSessionId()
      const rows = [readyRow('row-ok', 'Anna'), readyRow('row-fail', 'Fail')]
      const importedRowIds = new Set<string>()
      const created: string[] = []
      const createWedding = async (input: { partner1: string }) => {
        created.push(input.partner1)
        if (input.partner1 === 'Fail') throw new Error('fail')
        return { id: `w-${input.partner1}` }
      }

      const first = await executeWeddingImport({
        importSessionId,
        rows,
        importedRowIds,
        createWedding,
      })
      assert(first.importSessionId === importSessionId, 'session id echoed')
      assert(first.importedCount === 1, 'first pass imported 1')
      assert(first.failedCount === 1, 'first pass failed 1')
      for (const record of first.records) {
        if (record.status === 'imported') importedRowIds.add(record.reviewRowId)
      }

      created.length = 0
      const second = await executeWeddingImport({
        importSessionId,
        rows,
        importedRowIds,
        createWedding,
      })
      assert(created.length === 1, 'retry only remaining failure')
      assert(created[0] === 'Fail', 'retry targets failed row')
      assert(second.importedCount === 0, 'still failing')
      assert(second.failedCount === 1, 'same failure')
    })
  })

  console.log('\ncreateBrowserSafeId tests finished.')
}

void main()
