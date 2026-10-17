import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import {
  invalidateCompensationPaymentMutation,
  invalidateCompensationPrivateMutation,
} from './compensationV3Cache'
import { compensationV3QueryKeys } from './compensationV3Service'

let assertions = 0
function check(value: unknown, expected: unknown, message: string) {
  assertions += 1
  assert.equal(value, expected, message)
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const ownerKey = compensationV3QueryKeys.owner('actor-owner', 'wedding-1')
const recipientPrivateKey = compensationV3QueryKeys.private('actor-a', 'relationship-1', '5')
const otherActorPrivateKey = compensationV3QueryKeys.private('actor-b', 'relationship-1', '5')
const sharedKey = compensationV3QueryKeys.shared('actor-a', 'wedding-1', '5')
const financeKey = compensationV3QueryKeys.personalFinance('actor-a', 2027)

client.setQueryData(ownerKey, { amount: '5000.00' })
client.setQueryData(recipientPrivateKey, { fallbackAmount: '2000.00', privateReceivedTotal: '1000.00' })
client.setQueryData(otherActorPrivateKey, { fallbackAmount: '9000.00' })
client.setQueryData(sharedKey, { officialTerms: null })
client.setQueryData(financeKey, { personalValue: '2000.00' })

assertions += 1; assert.deepEqual(client.getQueryData(ownerKey), { amount: '5000.00' })
assertions += 1; assert.deepEqual(client.getQueryData(recipientPrivateKey), { fallbackAmount: '2000.00', privateReceivedTotal: '1000.00' })
check(JSON.stringify(recipientPrivateKey) === JSON.stringify(otherActorPrivateKey), false, 'private entries cannot collide between actors')
check(JSON.stringify(ownerKey) === JSON.stringify(recipientPrivateKey), false, 'owner official and recipient private entries use separate namespaces')
check(JSON.stringify(sharedKey) === JSON.stringify(recipientPrivateKey), false, 'shared official read and private settlement use separate namespaces')

await client.invalidateQueries({ queryKey: ownerKey, exact: true })
check(client.getQueryState(ownerKey)?.isInvalidated, true, 'owner terms invalidation touches the real QueryClient entry')
check(client.getQueryState(recipientPrivateKey)?.isInvalidated, false, 'owner terms invalidation does not clear recipient private bookkeeping')

await client.invalidateQueries({ queryKey: recipientPrivateKey, exact: true })
check(client.getQueryState(recipientPrivateKey)?.isInvalidated, true, 'private mutation invalidation targets the recipient settlement entry')
check(client.getQueryState(otherActorPrivateKey)?.isInvalidated, false, 'private mutation never invalidates another actor key')

const privateClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const actorAShared = compensationV3QueryKeys.shared('actor-a', 'wedding-1', '5')
const actorAPrivate = compensationV3QueryKeys.private('actor-a', 'relationship-1', '5')
const actorAFinance = compensationV3QueryKeys.personalFinance('actor-a', 2027)
const actorBOwnerFinance = compensationV3QueryKeys.owner('actor-b', 'wedding-1')
privateClient.setQueryData(actorAShared, {})
privateClient.setQueryData(actorAPrivate, {})
privateClient.setQueryData(actorAFinance, {})
privateClient.setQueryData(actorBOwnerFinance, {})
await invalidateCompensationPrivateMutation(privateClient, {
  userId: 'actor-a', weddingId: 'wedding-1', relationshipId: 'relationship-1', accessVersion: '5',
})
check(privateClient.getQueryState(actorAShared)?.isInvalidated, true, 'fallback/receipt mutation invalidates actor A shared projection')
check(privateClient.getQueryState(actorAPrivate)?.isInvalidated, true, 'fallback/receipt mutation invalidates actor A private settlement')
check(privateClient.getQueryState(actorAFinance)?.isInvalidated, true, 'fallback/receipt mutation invalidates actor A Finance')
check(privateClient.getQueryState(actorBOwnerFinance)?.isInvalidated, false, 'recipient-private mutation does not invalidate actor B owner Finance')

const paymentClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const paymentLedger = ['weddings', 'owner-1', 'wedding-1'] as const
const recipientA = compensationV3QueryKeys.private('actor-a', 'relationship-a', '5')
const recipientB = compensationV3QueryKeys.private('actor-b', 'relationship-b', '5')
const paymentFinance = ['finance', 'season', 'owner-1', 2027] as const
paymentClient.setQueryData(paymentLedger, [{ amount: 3000, receiver: 'actor-a' }])
paymentClient.setQueryData(recipientA, {})
paymentClient.setQueryData(recipientB, {})
paymentClient.setQueryData(paymentFinance, {})
await invalidateCompensationPaymentMutation(paymentClient)
check(paymentClient.getQueryState(paymentLedger)?.isInvalidated, true, 'receiver A-to-B invalidates the wedding payment ledger')
check(paymentClient.getQueryState(recipientA)?.isInvalidated, true, 'receiver A-to-B invalidates former recipient settlement')
check(paymentClient.getQueryState(recipientB)?.isInvalidated, true, 'receiver A-to-B invalidates new recipient settlement')
check(paymentClient.getQueryState(paymentFinance)?.isInvalidated, true, 'receiver A-to-B invalidates owner Finance totals')

client.clear()
privateClient.clear()
paymentClient.clear()
console.log(`Compensation v3 QueryClient cache behavior: PASS (${assertions} assertions; real QueryClient state and production invalidation helpers exercised)`)
