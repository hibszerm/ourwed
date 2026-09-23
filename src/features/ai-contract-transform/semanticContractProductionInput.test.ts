import assert from 'node:assert/strict'
import { buildSemanticContractProductionDataset } from './semanticContractProductionInput'
import type { Wedding } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'
import type { WeddingPlace } from '@/types/travel'

const wedding = {
  id: 'wedding-1',
  couple: {
    partner1: 'Anna Kowalska', partner2: 'Jan Nowak',
    partner1Email: 'anna@example.test', partner2Email: 'jan@example.test',
    partner1Address: 'Lipowa 4', partner1PostalCode: '00-001', partner1City: 'Warszawa',
    partner2Address: 'Polna 8', partner2PostalCode: '30-002', partner2City: 'Kraków',
    email: '', phone: '', venue: '', city: '',
  },
  date: '2027-06-19', price: 12000, depositAmount: 3000, currency: 'PLN',
  packageId: 'package-1', packageName: 'Pakiet', packageItems: [], payments: [],
  deliveryMonths: 2, deliveryDays: null, deliveryDueDate: null,
  finalPaymentTerms: null, finalPaymentDueDate: '2027-06-01',
} as unknown as Wedding

const place = (role: WeddingPlace['role'], label: string, formattedAddress: string) => ({
  id: role, weddingId: wedding.id, role, label, formattedAddress,
  placeId: null, latitude: null, longitude: null, sortOrder: 0,
  createdAt: '', updatedAt: '',
}) satisfies WeddingPlace

const extras = [{
  id: 'extra-1', weddingId: wedding.id, extraServiceId: 'service-1',
  priceSnapshot: 9876, quantity: 7, createdAt: '', nameSnapshot: 'Album premium', name: 'Album premium',
}] satisfies WeddingExtraService[]

const result = buildSemanticContractProductionDataset({
  wedding,
  package: { id: 'package-1', name: 'Pakiet' },
  currentDate: '2026-09-23',
  extras,
  weddingPlaces: [
    place('bride_preparation', 'Dom Panny Młodej', 'Lipowa 4, Warszawa'),
    place('groom_preparation', 'Dom Pana Młodego', 'Polna 8, Kraków'),
    place('ceremony', 'Kościół', 'Rynek 1, Warszawa'),
    place('reception', 'Sala', 'Leśna 2, Warszawa'),
  ],
})

assert.deepEqual(result.clients.customers.map((customer) => customer.displayName), ['Anna Kowalska', 'Jan Nowak'])
assert.deepEqual(result.clients.customers.map((customer) => customer.email), ['anna@example.test', 'jan@example.test'])
assert.deepEqual(result.clients.customers[0]?.addressTarget?.segments, ['Lipowa 4', '00-001 Warszawa'])
assert.deepEqual(result.clients.customers[1]?.addressTarget?.segments, ['Polna 8', '30-002 Kraków'])
assert.equal(result.locations.preparationLocations?.length, 2)
assert.deepEqual(result.locations.preparationLocations?.map((item) => item.person), ['bride', 'groom'])
assert.deepEqual(result.locations.ceremony?.target?.segments, ['Kościół', 'Rynek 1, Warszawa'])
assert.deepEqual(result.locations.reception?.target?.segments, ['Sala', 'Leśna 2, Warszawa'])
assert.equal(result.dates.contractExecutionDate, '23.09.2026 r.')
assert.equal(result.dates.weddingDate, '19.06.2027 r.')
assert.equal(result.dates.finalPaymentDueDate, '01.06.2027 r.')
assert.equal(result.dates.deliveryDueDate, '19.08.2027 r.')
assert.equal(result.finances.contractValueFormatted, '12 000 zł')
assert.ok(result.finances.contractValueWords)
assert.equal(result.finances.depositFormatted, '3 000 zł')
assert.ok(result.finances.depositWords)
assert.equal(result.finances.remainingFormatted, '9 000 zł')
assert.ok(result.finances.remainingWords)
assert.deepEqual(result.additionalServices, [{ name: 'Album premium' }])
assert.equal(JSON.stringify(result.additionalServices).includes('9876'), false)
assert.equal(JSON.stringify(result.additionalServices).includes('quantity'), false)
assert.equal(JSON.stringify(result.additionalServices).includes('service-1'), false)

console.log('PASS semantic production input: ordered owners, structured values, dates, commercial summary, and name-only extras')
