import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ContractGenerationInputOptions } from '../../../contractGenerationInput'
import { buildContractGenerationInput } from '../../../contractGenerationInput'
import { readSource } from '../../../generator'

const caseDirectory = path.dirname(fileURLToPath(import.meta.url))
type CaseFixture = {
  id: string
  sourceDocx: 'source.docx'
  authoritativeInput: ContractGenerationInputOptions
  expectedProductRules: {
    preserveSourcePackageExactly: true
    preserveSourceConclusionPlace: string
    preserveSourceContractingPartyStructure: true
  }
}
const fixture = JSON.parse(await readFile(path.join(caseDirectory, 'input.json'), 'utf8')) as CaseFixture
assert.equal(fixture.id, 'case-04-realistic-wedding-photographer')
assert.equal(fixture.sourceDocx, 'source.docx')

const input = buildContractGenerationInput(fixture.authoritativeInput)
const sourceBytes = await readFile(path.join(caseDirectory, fixture.sourceDocx))
const sourceArrayBuffer = new ArrayBuffer(sourceBytes.byteLength)
new Uint8Array(sourceArrayBuffer).set(sourceBytes)
const source = await readSource(sourceArrayBuffer, fixture.sourceDocx)
assert.ok(source.blocks.length > 0, 'offline source preflight can read the unchanged DOCX')
assert.ok(source.blocks.some((block) => block.text.includes('REPORTAŻ PEŁNY')))

const [party1, party2] = input.parties
assert.equal(party1?.sourceKey, 'partner1')
assert.equal(party1?.fullName?.value, 'Klaudia Majewska')
assert.equal(party1?.fullName?.owner, 'partner1')
assert.deepEqual(party1?.address, {
  value: 'ul. Francuska 18/7, 40-015 Katowice',
  source: 'form_answers.answer_json.fields.partner1.address.formattedAddress',
  owner: 'partner1',
})
assert.equal(party2?.sourceKey, 'partner2')
assert.equal(party2?.fullName?.value, 'Tomasz Domański')
assert.equal(party2?.fullName?.owner, 'partner2')
assert.deepEqual(party2?.address, {
  value: 'ul. Słoneczna 12/5, 43-300 Bielsko-Biała',
  source: 'form_answers.answer_json.fields.partner2.address.formattedAddress',
  owner: 'partner2',
})
assert.equal(party1?.address?.source.includes('contract_address'), false)
assert.equal(party2?.address?.source.includes('contract_address'), false)
assert.equal(input.unownedFacts.some((fact) => String(fact.source).includes('contract_address')), false)
assert.equal(party1?.phone?.value, '+48 510 284 739')
assert.equal(party1?.phone?.owner, 'partner1')
assert.equal(party2?.phone?.value, '+48 606 391 825')
assert.equal(party2?.phone?.owner, 'partner2')
assert.equal(party1?.email?.value, 'klaudia.majewska@example.com')
assert.equal(party1?.email?.owner, 'partner1')
assert.equal(party2?.email?.value, 'tomasz.domanski@example.com')
assert.equal(party2?.email?.owner, 'partner2')

assert.deepEqual(input.additionalAnswers, [
  { id: 'party.partner1.pesel', value: '98072312346', authority: 'user', source: 'userProvidedAnswers.party.partner1.pesel' },
  { id: 'party.partner2.pesel', value: '97041112358', authority: 'user', source: 'userProvidedAnswers.party.partner2.pesel' },
  { id: 'agreement.identifier', value: '01/2028', authority: 'user', source: 'userProvidedAnswers.agreement.identifier' },
])
assert.equal('pesel' in (party1 ?? {}), false)
assert.equal('pesel' in (party2 ?? {}), false)
assert.equal('contractNumber' in input.generationContext, false)
assert.equal(input.generationContext.contractRecordId, undefined)
assert.equal(input.additionalAnswers.some((answer) => answer.id === 'agreement.identifier' && answer.value === '01/2028'), true)
assert.equal(input.wedding.date.value, '2028-05-22')
assert.equal(input.wedding.date.source, 'public.weddings.wedding_date')
assert.equal(input.generationContext.generationDate.value, '2028-02-04')
assert.equal(input.generationContext.generationDate.source, 'generation_start')
assert.equal(fixture.expectedProductRules.preserveSourceConclusionPlace, 'Kraków')

assert.equal(input.commercial.contractValue.value, 10600)
assert.equal(input.commercial.agreedDeposit.value, 2000)
assert.equal(input.commercial.totalPaid.value, 0)
assert.equal(input.commercial.remainingAfterDeposit.value, 8600)
assert.equal(input.commercial.remainingToPayNow.value, 10600)
assert.notEqual(input.commercial.remainingAfterDeposit.value, input.commercial.remainingToPayNow.value)
assert.deepEqual(input.commercial.finalPaymentTerms, undefined)
assert.deepEqual(input.commercial.finalPaymentDueDate, {
  value: '2028-05-15',
  source: 'public.weddings.final_payment_due_date',
})
assert.equal(input.package.name.value, 'REPORTAŻ PEŁNY')
assert.equal(input.package.name.source, 'public.weddings.package_name')
assert.equal(input.package.id, undefined, 'no synthetic catalog UUID is added')
assert.deepEqual(input.package.items.value, fixture.authoritativeInput.wedding.packageItems)
assert.equal(input.package.items.source, 'public.weddings.package_items_snapshot')
assert.deepEqual(input.extras, [])
assert.equal(input.commercial.travelFeeStatus.value, 'included')
assert.equal(input.commercial.travelFeeAmount.value, 0)
assert.deepEqual(input.locations.map((place) => place.role.value), [
  'bride_preparation', 'groom_preparation', 'ceremony', 'reception',
])
assert.equal(input.locations[0]?.label?.value, 'Hotel Monopol Katowice')
assert.equal(input.locations[0]?.formattedAddress.value, 'Hotel Monopol Katowice')
assert.equal(input.locations[2]?.formattedAddress.value, 'Bazylika św. Ludwika i Wniebowzięcia NMP, Panewniki')
assert.equal(input.locations[3]?.label?.value, 'Rezydencja Luxury Hotel')
assert.equal(input.locations[3]?.formattedAddress.value, 'Rezydencja Luxury Hotel, Piekary Śląskie')
assert.equal(input.locations.every((place) => place.placeId === undefined), true, 'no fake place identifiers')
assert.equal(input.locations.every((place) => place.id.source.startsWith('public.wedding_places.')), true)

const adapterSource = await readFile(new URL('../../../contractGenerationInput.ts', import.meta.url), 'utf8')
const weddingTypeSource = await readFile(new URL('../../../../../types/wedding.ts', import.meta.url), 'utf8')
const generatorSource = await readFile(new URL('../../../generator.ts', import.meta.url), 'utf8')
const acceptanceHarnessSource = await readFile(new URL('../../harness.ts', import.meta.url), 'utf8')
assert.doesNotMatch(adapterSource, /\bpesel\b|contractNumber|agreementNumber|contractPlace/i)
assert.doesNotMatch(weddingTypeSource, /\bpesel\b|contractNumber|agreementNumber|contractPlace/i)
assert.doesNotMatch(generatorSource, /case-04|case04/i)
assert.match(acceptanceHarnessSource, /buildContractGenerationInput/)
assert.doesNotMatch(acceptanceHarnessSource, /case-04|case04/i)
assert.doesNotMatch(acceptanceHarnessSource, /\bcontractNumber\b|\bagreementNumber\b|\bpesel\b/i)
assert.doesNotMatch(acceptanceHarnessSource, /parse.*(?:payment|address|questionnaire).*prose|questionnaire.*label.*(?:nlp|interpret)/i)
assert.doesNotMatch(adapterSource, /remainingDueDate|parse.*payment.*prose/i)
console.log('PASS Case 04 real OurWed input adapter and offline source preflight')
