/**
 * Regression: WeddingReadContext must preserve service-object receivers.
 *
 * paymentService.listByWeddingId / contractService.getByWeddingId call sibling
 * methods via `this`. Extracting them through `??` and invoking unbound throws:
 *   Cannot read properties of undefined (reading 'listByWeddingIds')
 */

import assert from 'node:assert/strict'
import { WeddingReadContext } from '../adapters/WeddingReadContext'
import { contractService } from '@/lib/api/contractService'
import { paymentService } from '@/lib/api/paymentService'
import type { Payment, WeddingContract } from '@/types/wedding'

const WEDDING_ID = '00000000-0000-4000-8000-0000000000b1'

{
  const fake = {
    async listByWeddingIds(ids: string[]) {
      return new Map(ids.map((id) => [id, [] as Payment[]]))
    },
    async listByWeddingId(weddingId: string) {
      const map = await this.listByWeddingIds([weddingId])
      return map.get(weddingId) ?? []
    },
  }
  const unbound = fake.listByWeddingId
  await assert.rejects(
    () => unbound(WEDDING_ID),
    (err: unknown) =>
      err instanceof TypeError &&
      /listByWeddingIds/.test(err.message),
    'unbound listByWeddingId must throw on this.listByWeddingIds',
  )
}

{
  const original = paymentService.listByWeddingIds
  let batchCalls = 0
  paymentService.listByWeddingIds = async (ids: string[]) => {
    batchCalls += 1
    const map = new Map<string, Payment[]>()
    for (const id of ids) map.set(id, [])
    return map
  }
  try {
    const payments = await new WeddingReadContext(WEDDING_ID).getPayments()
    assert.equal(batchCalls, 1, 'getPayments must reach listByWeddingIds via this')
    assert.deepEqual(payments, [])
  } finally {
    paymentService.listByWeddingIds = original
  }
}

{
  const original = contractService.listByWeddingIds
  let batchCalls = 0
  contractService.listByWeddingIds = async (ids: string[]) => {
    batchCalls += 1
    const map = new Map<string, WeddingContract | null>()
    for (const id of ids) map.set(id, null)
    return map
  }
  try {
    const contract = await new WeddingReadContext(WEDDING_ID).getContract()
    assert.equal(batchCalls, 1, 'getContract must reach listByWeddingIds via this')
    assert.equal(contract, null)
  } finally {
    contractService.listByWeddingIds = original
  }
}

console.log('weddingReadContextServiceBindingAcceptance: PASS')
