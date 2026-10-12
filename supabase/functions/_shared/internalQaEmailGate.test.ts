import assert from 'node:assert/strict'
import { dispatchEmailUnlessInternalQa } from './internalQaEmailGate.ts'

let providerCalls = 0
let suppressedCalls = 0
const qaResult = await dispatchEmailUnlessInternalQa({
  isInternalQa: true,
  onSuppressed: async () => {
    suppressedCalls += 1
  },
  send: async () => {
    providerCalls += 1
    return 'sent'
  },
})
assert.deepEqual(qaResult, { status: 'suppressed' })
assert.equal(suppressedCalls, 1)
assert.equal(providerCalls, 0, 'QA delivery never invokes the provider')

const customerResult = await dispatchEmailUnlessInternalQa({
  isInternalQa: false,
  onSuppressed: async () => {
    suppressedCalls += 1
  },
  send: async () => {
    providerCalls += 1
    return 'sent'
  },
})
assert.deepEqual(customerResult, { status: 'sent', value: 'sent' })
assert.equal(providerCalls, 1, 'customer delivery invokes the provider once')
assert.equal(suppressedCalls, 1, 'customer delivery is not marked suppressed')

console.log('OK internal QA email suppression boundary')
