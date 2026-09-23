import assert from 'node:assert/strict'
import { buildContractTransformationDataset } from './transformationDataset'
import { buildSemanticMapRequest } from './semanticMapModelContract'
import { buildGoldenScenarios } from './cg7/goldenScenarios'

const scenarios = buildGoldenScenarios()
const g02 = scenarios.find((item) => item.caseId === 'G02')!
const dataset = buildContractTransformationDataset({
  wedding: g02.wedding,
  package: g02.package,
  extras: g02.extras,
  currentDate: '2026-09-23',
  weddingPlaces: g02.structuredPlaces,
})

assert.deepEqual(dataset.clients.customers?.[0]?.addressTarget, {
  text: 'ul. Portowa 4/12, 80-246 Gdańsk',
  segments: ['ul. Portowa 4/12', '80-246 Gdańsk'],
}, 'customer address retains existing CRM components before flattening')
assert.deepEqual(dataset.locations.preparation?.target, {
  text: 'Hotel Motława, apartament 512, ul. Chmielna 7, Gdańsk',
  segments: ['Hotel Motława, apartament 512', 'ul. Chmielna 7, Gdańsk'],
}, 'WeddingPlace label and formatted address remain separate internally')
assert.deepEqual(dataset.locations.ceremony?.target, {
  text: 'Dwór Artusa — sala reprezentacyjna, Gdańsk',
  segments: ['Dwór Artusa — sala reprezentacyjna', 'Gdańsk'],
}, 'G02 ceremony uses only owner-specified components')
assert.deepEqual(dataset.locations.reception?.target, {
  text: 'Olivia Garden, al. Grunwaldzka 472, Gdańsk',
  segments: ['Olivia Garden', 'al. Grunwaldzka 472, Gdańsk'],
}, 'G02 reception uses only owner-specified components')
assert.equal(dataset.locations.ceremony?.displayName, 'Dwór Artusa — sala reprezentacyjna, Gdańsk', 'existing flattened canonical CRM context remains intact')

const request = buildSemanticMapRequest({ candidate: 'terra', sourceBlocks: [], dataset })
const userContext = request.input.find((item) => item.role === 'user')!.content
assert.equal(userContext.includes('addressTarget'), false, 'internal customer target segmentation is not exposed to the provider')
assert.equal(userContext.includes('"segments"'), false, 'internal location target segmentation is not exposed to the provider')
assert.equal(userContext.includes('formattedAddress'), false, 'provider contract remains semantic and does not receive target segment metadata')

const g03 = scenarios.find((item) => item.caseId === 'G03')!
const g03Dataset = buildContractTransformationDataset({ wedding: g03.wedding, package: g03.package, currentDate: '2026-09-23', weddingPlaces: g03.structuredPlaces })
assert.deepEqual(g03Dataset.locations.preparationLocations?.find((item) => item.person === 'bride')?.target?.segments, ['Villa Marina, apartament 1', 'ul. Bohaterów Monte Cassino 22, Sopot'])
assert.deepEqual(g03Dataset.locations.preparationLocations?.find((item) => item.person === 'groom')?.target?.segments, ['Hotel Nadmorski, pokój 408', 'ul. Ejsmonda 2, Gdynia'])
assert.deepEqual(g03Dataset.locations.ceremony?.target?.segments, ['Kościół Gwiazda Morza', 'Sopot'])
assert.deepEqual(g03Dataset.locations.reception?.target, {
  text: 'Grand Hotel Sopot — sala balowa, ul. Powstańców Warszawy 12/14, Sopot',
  segments: ['Grand Hotel Sopot — sala balowa', 'ul. Powstańców Warszawy 12/14, Sopot'],
}, 'G03 fixture retains the owner-supplied reception address component')
const g04 = scenarios.find((item) => item.caseId === 'G04')!
const g04Dataset = buildContractTransformationDataset({ wedding: g04.wedding, package: g04.package, currentDate: '2026-09-23', weddingPlaces: g04.structuredPlaces })
assert.deepEqual(g04Dataset.clients.customers?.[0]?.addressTarget?.segments, ['ul. Modułowa 7/9', '50-001 Wrocław'], 'G04 address uses its existing separate CRM fields')
console.log('PASS structured customer and WeddingPlace target values remain internal and authoritative')
