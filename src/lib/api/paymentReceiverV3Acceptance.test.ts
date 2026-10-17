import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  defaultPaymentReceiverKey,
  mapPaymentRowToModel,
  paymentReceiverFields,
  paymentReceiverOptionKey,
  resolvePaymentReceiverOption,
  type PaymentReceiverOption,
} from '@/lib/api/paymentService'

let assertions = 0
function assert(condition: boolean, message: string) {
  assertions += 1
  if (!condition) throw new Error(message)
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const paid = mapPaymentRowToModel({
  id: 'payment-1',
  wedding_id: 'wedding-1',
  type: 'installment',
  amount: '3000.00',
  payment_date: '2026-10-17T12:00:00Z',
  method: 'transfer',
  note: null,
  created_at: '2026-10-17T12:00:00Z',
  received_by_user_id: 'recipient-1',
  receiver_relationship_id: 'relationship-1',
  receiver_label_snapshot: 'Współpracownik A',
  receiver_kind: 'collaborator',
  compensation_revision: 4,
})
assert(paid.paid && paid.paidAt === '2026-10-17', 'paid state follows payment_date')
assert(paid.amount === 3000, 'receiver mapping does not alter payment amount')
assert(paid.receivedByUserId === 'recipient-1', 'physical receiver user is retained')
assert(paid.receiverRelationshipId === 'relationship-1', 'stable relationship identity is retained')
assert(paid.receiverKind === 'collaborator', 'receiver kind is retained')
assert(paid.receiverLabel === 'Współpracownik A', 'historical display snapshot is retained')
assert(paid.receiverRevision === '4', 'CAS revision is normalized to a decimal string')

const unpaid = mapPaymentRowToModel({
  id: 'payment-2',
  wedding_id: 'wedding-1',
  type: 'deposit',
  amount: 1000,
  payment_date: null,
  method: null,
  note: null,
  created_at: '2026-10-17T12:00:00Z',
  received_by_user_id: null,
  receiver_relationship_id: null,
  receiver_label_snapshot: null,
  receiver_kind: null,
  compensation_revision: 1,
})
assert(!unpaid.paid, 'scheduled payment remains unpaid without payment_date')
assert(unpaid.receivedByUserId === undefined, 'unpaid payment has no physical receiver')
assert(unpaid.receiverRelationshipId === undefined, 'unpaid scheduled payment may omit receiver attribution')

const owner: PaymentReceiverOption = {
  userId: 'owner-1', relationshipId: null, label: 'Ja / studio', kind: 'owner',
}
const collaborator: PaymentReceiverOption = {
  userId: 'collaborator-1', relationshipId: 'relationship-1', label: 'Współpracownik A', kind: 'collaborator',
}
// The receiver RPC response is the complete picker input. Pending and foreign
// collaborators are absent by contract and must not be synthesized by the UI.
const eligibleOptions = [owner, collaborator]
assert(defaultPaymentReceiverKey(eligibleOptions) === 'owner:owner-1', 'new paid payment defaults to the wedding owner')
assert(eligibleOptions.map(paymentReceiverOptionKey).join(',') === 'owner:owner-1,collaborator:relationship-1', 'picker keys use owner identity and stable active relationship identity')
const selected = resolvePaymentReceiverOption(eligibleOptions, 'collaborator:relationship-1')
assert(selected === collaborator, 'selected eligible collaborator resolves from wedding-scoped options')
assert(JSON.stringify(paymentReceiverFields(selected!)) === JSON.stringify({
  receivedByUserId: 'collaborator-1', receiverRelationshipId: 'relationship-1',
}), 'selected receiver maps to both canonical mutation fields')
assert(resolvePaymentReceiverOption(eligibleOptions, 'collaborator:pending-relationship') === undefined, 'pending invitee cannot be selected when omitted by RPC')
assert(resolvePaymentReceiverOption(eligibleOptions, 'collaborator:foreign-relationship') === undefined, 'foreign wedding collaborator cannot be selected when omitted by RPC')

const paymentService = source('src/lib/api/paymentService.ts')
const modal = source('src/features/weddings/actions/AddPaymentModal.tsx')
const detail = source('src/features/weddings/components/detail/WeddingDetailFinances.tsx')
const compact = source('src/features/weddings/detail/editing/fields/FinanceFields.tsx')
assert(paymentService.includes("'list_wedding_payment_receivers_v3'"), 'receiver options come from the wedding-scoped RPC')
assert(paymentService.includes('received_by_user_id: input.receivedByUserId'), 'create sends receiver user to server validation')
assert(paymentService.includes('receiver_relationship_id: input.receiverRelationshipId'), 'create sends stable relationship to server validation')
assert(paymentService.includes(".eq('compensation_revision', input.expectedRevision)"), 'updates use payment CAS revision')
assert(paymentService.includes('expectedRevision: string') && paymentService.includes('if (input.paid !== undefined || input.paymentDate !== undefined)'), 'the single update API requires a revision for paid and unpaid state changes')
assert(paymentService.includes('if (paid === false) return null') && paymentService.includes('if (input.amount !== undefined) patch.amount = input.amount'), 'the revision-checked update path handles unpaid transitions and amount edits')
assert(modal.includes('label="Otrzymał"') && modal.includes('paymentService.listReceivers(wedding.id)'), 'add/edit modal exposes wedding-scoped receiver picker')
assert(modal.includes('required') && modal.includes('Wybierz osobę, która otrzymała wpłatę.'), 'paid create/edit requires a resolved receiver')
assert(modal.includes('...paymentReceiverFields(receiver)'), 'selected receiver reaches both create and update payloads')
assert(modal.includes('paymentService.update(payment.id'), 'editing receiver uses canonical revision-checked payment update')
assert(detail.includes('label="Otrzymał"') && detail.includes('paymentService.listReceivers(wedding.id)'), 'modern wedding detail exposes receiver attribution')
assert(compact.includes('label="Otrzymał"') && compact.includes('paymentService.listReceivers(wedding.id)'), 'compact finance editor exposes receiver attribution')

console.log(`Payment receiver v3 acceptance: PASS (${assertions} assertions; pure flow helpers + source contract; database authorization covered by pgTAP)`)
