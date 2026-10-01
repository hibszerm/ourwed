import assert from 'node:assert/strict'
import { buildContractGenerationInput } from './contractGenerationInput'
import { GENERIC_CONTRACT_PRODUCT_RULES } from './generator'
import { getEffectiveTravelFeeAmount } from '@/lib/utils/travelFeeCommercial'
import type { Wedding } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'

const wedding: Wedding = {
  id: 'generic-travel-composition-test',
  couple: { partner1: 'Partner One', partner2: 'Partner Two', email: '', phone: '', venue: '', city: '' },
  date: '2027-08-14', status: 'active', workflowStage: 'contract',
  packageId: 'package-1', packageName: 'Generic Package', price: 13_250,
  depositAmount: 1_000, currency: 'PLN',
  packageItems: [{ title: 'Base service', sortOrder: 0, enabled: true }],
  travelFeeStatus: 'charged', travelFeeAmount: 150,
  payments: [], finances: [], questionnaires: { contractData: { status: 'completed' }, weddingQuestionnaire: { status: 'not_sent' } },
  contract: { status: 'none' }, checklist: [], schedule: [], notes: [], deliverables: [], timeline: [],
  accentColor: '', createdAt: '2026-09-30',
}
const extras: WeddingExtraService[] = [
  { id: 'extra-1', weddingId: wedding.id, extraServiceId: 'service-1', nameSnapshot: 'Album', priceSnapshot: 900, quantity: 1, createdAt: '2026-09-30' },
  { id: 'extra-2', weddingId: wedding.id, extraServiceId: 'service-2', nameSnapshot: 'Drone', priceSnapshot: 800, quantity: 1, createdAt: '2026-09-30' },
]
const options = { wedding, weddingPlaces: [], extras, generationDate: '2026-09-30' }
const charged = buildContractGenerationInput(options)
const extrasTotal = charged.extras.reduce((sum, item) => sum + item.price.value * item.quantity.value, 0)
const chargedTravel = getEffectiveTravelFeeAmount(wedding)
const packageBase = charged.commercial.contractValue.value - extrasTotal - chargedTravel

assert.equal(charged.commercial.contractValue.value, 13_250, 'normalized contractValue stays the authoritative total')
assert.equal(charged.commercial.travelFeeStatus.value, 'charged')
assert.equal(charged.commercial.travelFeeAmount.value, 150)
assert.equal(chargedTravel, 150)
assert.equal(extrasTotal, 1_700)
assert.equal(packageBase + extrasTotal + chargedTravel, 13_250, 'charged travel and extras compose the same total')

const included = buildContractGenerationInput({
  ...options,
  wedding: { ...wedding, travelFeeStatus: 'included', travelFeeAmount: 0 },
})
assert.equal(getEffectiveTravelFeeAmount({ travelFeeStatus: 'included', travelFeeAmount: 0 }), 0)
assert.equal(included.commercial.contractValue.value, 13_250, 'included travel does not create an extra amount')
assert.equal(included.commercial.travelFeeAmount.value, 0)
assert.equal(charged.commercial.contractValue.value, included.commercial.contractValue.value, 'changing travel status does not make Planner recompute contractValue')

assert.match(GENERIC_CONTRACT_PRODUCT_RULES.join(' '), /contractValue is the authoritative total; do not add selected extras or charged travel on top/i)
assert.match(GENERIC_CONTRACT_PRODUCT_RULES.join(' '), /included or non-charged travel is not a separate added amount/i)
assert.match(GENERIC_CONTRACT_PRODUCT_RULES.join(' '), /explicit current extras/i)
console.log('PASS generic Planner travel-fee composition acceptance')
