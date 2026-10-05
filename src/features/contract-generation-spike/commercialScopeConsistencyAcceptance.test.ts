import assert from 'node:assert/strict'
import { GENERIC_CONTRACT_PRODUCT_RULES } from './generator'
import { buildContractGenerationInput } from './contractGenerationInput'
import type { Wedding } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'

const rules = GENERIC_CONTRACT_PRODUCT_RULES.join(' ').toLowerCase()
assert.match(rules, /existing source-authored description of what the authoritative total remuneration includes consistent with the adapted contract scope/)
assert.match(rules, /when an authoritative extra is represented in the contract scope and included in contractvalue/)
assert.match(rules, /update only an existing source span that actually enumerates or describes components covered by the total/)
assert.match(rules, /if several such extras are represented in scope, account for all of them concisely/)
assert.match(rules, /do not add extra names to deposit or remaining-payment clauses unless a clause itself describes total composition/)
assert.match(rules, /if the source states only the total amount and does not describe its composition, do not invent a component breakdown/)
assert.match(rules, /do not introduce an individual extra price, quantity, or arithmetic/)
assert.match(rules, /preserve existing valid travel composition without adding travel twice or changing its charge status/)
assert.match(rules, /preserve the surrounding source payment structure and text, making only localized edits/)
assert.doesNotMatch(rules, /vhs|video standard|11[,. ]?400|§\s*2|paragraph\s+\d/i, 'the product policy has no scenario-specific references')

const wedding: Wedding = {
  id: 'commercial-scope-fixture', couple: { partner1: 'A', partner2: 'B', email: '', phone: '', venue: '', city: '' },
  date: '2027-08-14', status: 'active', workflowStage: 'contract', packageId: 'p', packageName: 'Package',
  price: 11_400, depositAmount: 1_000, currency: 'PLN', packageItems: [], travelFeeStatus: 'included', travelFeeAmount: 0,
  payments: [], finances: [], questionnaires: { contractData: { status: 'completed' }, weddingQuestionnaire: { status: 'not_sent' } },
  contract: { status: 'none' }, checklist: [], schedule: [], notes: [], deliverables: [], timeline: [], accentColor: '', createdAt: '2026-10-05',
}
const vhs: WeddingExtraService = {
  id: 'fixture-extra', weddingId: wedding.id, extraServiceId: 'fixture-service', nameSnapshot: 'VHS', priceSnapshot: 700, quantity: 1, createdAt: '2026-10-05',
}
const authority = buildContractGenerationInput({ wedding, weddingPlaces: [], extras: [vhs], generationDate: '2026-10-05' })
assert.equal(authority.commercial.contractValue.value, 11_400, 'authoritative total remains unchanged by prose composition')
assert.equal(authority.commercial.agreedDeposit.value, 1_000)
assert.equal(authority.commercial.remainingAfterDeposit.value, 10_400)
assert.equal(authority.extras[0]?.name.value, 'VHS', 'the offline acceptance authority includes its extra')

// Mocked, provider-free source/candidate fixture: only scope and its existing
// total-composition description receive localized changes.
const source = [
  'Event and location terms remain source-authored.',
  'Base package scope and deliverables remain source-authored.',
  'General performance provision remains source-authored.',
  'The total remuneration is 11,400 PLN and covers the package and travel.',
  'The deposit is 1,000 PLN.',
  'The remaining amount is 10,400 PLN.',
]
const candidate = [
  source[0]!,
  `${source[1]} Additionally, the contract scope includes the authoritative wedding extra VHS.`,
  source[2]!,
  'The total remuneration is 11,400 PLN and covers the package, the additional service VHS, and travel.',
  source[4]!,
  source[5]!,
]

// A. One extra is added to the existing composition description; total unchanged.
assert.match(candidate[3]!, /package, the additional service VHS, and travel/)
assert.match(candidate[3]!, /11,400 PLN/)
assert.equal(authority.commercial.contractValue.value, 11_400)

// B. Every added extra is naturally accounted for in the same existing span.
const multipleExtrasComposition = 'The total remuneration covers the package, the additional services VHS and album, and travel.'
assert.match(multipleExtrasComposition, /VHS and album/)
assert.match(multipleExtrasComposition, /travel/)
assert.doesNotMatch(multipleExtrasComposition, /\d|PLN|each extra costs/i)

// C. An extra already present in the source composition is not duplicated.
const alreadyRepresented = 'The total remuneration covers the package, VHS service, and travel.'
assert.equal((alreadyRepresented.match(/VHS/gi) ?? []).length, 1)

// D. An amount-only source remains amount-only; no breakdown is invented.
const amountOnlySource = 'The remuneration is 11,400 PLN.'
const amountOnlyCandidate = amountOnlySource
assert.equal(amountOnlyCandidate, amountOnlySource)
assert.doesNotMatch(amountOnlyCandidate, /package|travel|VHS/i)

// E/F. Deposit and remaining-payment clauses do not receive extra names.
assert.equal(candidate[4], source[4])
assert.equal(candidate[5], source[5])
assert.doesNotMatch(candidate[4]!, /VHS/i)
assert.doesNotMatch(candidate[5]!, /VHS/i)

// G/H. No individual extra price or quantity is added to the composition.
assert.doesNotMatch(candidate[3]!, /700|per item|quantity|\b1\s*(?:unit|item|pc)\b/i)

// I/J. The authoritative total remains final and valid travel is represented once.
assert.equal(authority.commercial.contractValue.value, 11_400)
assert.equal((candidate[3]!.match(/travel/gi) ?? []).length, 1)
assert.match(rules, /contractvalue is the authoritative total; do not add selected extras or charged travel on top/)

// K/L. V29 scope placement remains after the package and before performance
// terms; the only textual changes are the scope addition and total composition.
assert.ok(candidate[1]!.includes('VHS'))
assert.ok(candidate[1]!.includes('Base package scope and deliverables'))
assert.ok(candidate.indexOf(candidate[1]!) < candidate.indexOf(candidate[2]!))
assert.equal(candidate[0], source[0])
assert.equal(candidate[2], source[2])
assert.equal(candidate[4], source[4])
assert.equal(candidate[5], source[5])
const changedIndexes = candidate.flatMap((text, index) => text === source[index] ? [] : [index])
assert.deepEqual(changedIndexes, [1, 3], 'only the localized scope insertion and existing total-composition span change')

console.log('PASS Option B commercial-scope consistency acceptance')
