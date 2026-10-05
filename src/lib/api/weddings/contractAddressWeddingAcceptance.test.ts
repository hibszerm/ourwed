import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mapWeddingModelToRow, mapWeddingRowToModel, type WeddingRow } from './weddingMappers'
import { resolveEffectiveContractAddress } from '@/lib/utils/contractAddress'
import { weddingToContractAnswerFields } from '@/lib/forms/weddingCoupleNameFields'
import { mergeFormAnswersIntoWeddingCore } from '@/lib/forms/mergeFormAnswersIntoWeddingCore'

const legacyRow = {
  id: '00000000-0000-4000-8000-000000000001', user_id: 'owner',
  bride_name: 'Ada Nowak', groom_name: 'Jan Nowak', email: null, phone: null,
  contract_address: 'ul. Kwiatowa 8', contract_postal_code: '00-001', contract_city: 'Warszawa',
  wedding_date: '2027-06-12', ceremony_time: null, venue: null, status: 'active',
  workflow_stage: 'reservation', package_name: 'Pakiet', package_id: null,
  contract_value: 10000, deposit_amount: 1000, currency: 'PLN', accent_color: null,
  created_at: '2026-10-01', updated_at: '2026-10-01',
} as WeddingRow

const legacy = mapWeddingRowToModel(legacyRow)
assert.equal(resolveEffectiveContractAddress({ address: legacyRow.contract_address, postalCode: legacyRow.contract_postal_code, city: legacyRow.contract_city }), 'ul. Kwiatowa 8, 00-001 Warszawa')
assert.equal(legacy.contractAddress, 'ul. Kwiatowa 8, 00-001 Warszawa', 'legacy split row reads as one complete address')
assert.equal(legacy.couple.partner1Address, 'ul. Kwiatowa 8', 'legacy base representation is retained')
const legacyRoundTrip = mapWeddingModelToRow(legacy)
assert.equal(legacyRoundTrip.contract_address, 'ul. Kwiatowa 8')
assert.equal(legacyRoundTrip.contract_postal_code, '00-001')
assert.equal(legacyRoundTrip.contract_city, 'Warszawa')

const questionnaireMerge = await mergeFormAnswersIntoWeddingCore(legacy, {
  fields: { 'partner1.address': 'Nowa pełna umowna lokalizacja' },
})
assert.equal(questionnaireMerge.contractAddress, 'Nowa pełna umowna lokalizacja', 'latest questionnaire address has contract-level precedence')
assert.equal(questionnaireMerge.couple.partner1Address, 'ul. Kwiatowa 8', 'questionnaire contract address is not assigned to partner 1 personal address')

const structuredQuestionnaireMerge = await mergeFormAnswersIntoWeddingCore(legacy, {
  fields: {
    'partner1.address': {
      formattedAddress: 'ul. Publiczna 7, 40-001 Katowice',
      postalCode: '40-001',
      city: 'Katowice',
    },
  },
})
assert.equal(structuredQuestionnaireMerge.contractAddress, 'ul. Publiczna 7, 40-001 Katowice', 'questionnaire structured location is preserved as a complete contract address')
assert.equal(structuredQuestionnaireMerge.couple.partner1PostalCode, '40-001', 'legacy structured metadata remains compatible')

const canonicalText = 'Mieszkanie 4, budynek C — wejście od ogrodu'
const explicitlyEdited = {
  ...legacy,
  contractAddress: canonicalText,
  couple: {
    ...legacy.couple,
    partner1Address: canonicalText,
    partner1PostalCode: undefined,
    partner1City: undefined,
    city: '',
  },
}
const canonicalRow = mapWeddingModelToRow(explicitlyEdited)
assert.equal(canonicalRow.contract_address, canonicalText, 'canonical address is stored without parsing or formatting')
assert.equal(canonicalRow.contract_postal_code, null, 'explicit address edit clears stale postal metadata')
assert.equal(canonicalRow.contract_city, null, 'explicit address edit clears stale city metadata')
assert.equal(mapWeddingRowToModel(canonicalRow as WeddingRow).contractAddress, canonicalText, 'canonical re-read is exact and nonduplicated')
assert.equal(weddingToContractAnswerFields(explicitlyEdited)['partner1.address'], canonicalText, 'studio edit patches the existing questionnaire address consistently')

const mapper = await readFile(`${process.cwd()}/src/lib/api/weddingService.ts`, 'utf8')
assert.match(mapper, /options\?\.preserveContractAddress === false/, 'full-model updates preserve address columns unless an explicit edit opts in')
const draftPersistence = await readFile(`${process.cwd()}/src/features/weddings/edit/persistWeddingEditDraft.ts`, 'utf8')
assert.match(draftPersistence, /contractAddressChanged = nextAddress !== originalAddress/)
assert.match(draftPersistence, /preserveContractAddress: !contractAddressChanged/)
assert.match(draftPersistence, /contractAddressChanged,[\s\S]*\}\)/)
assert.match(draftPersistence, /partner1PostalCode: undefined[\s\S]*partner1City: undefined/)

const fields = await readFile(`${process.cwd()}/src/features/weddings/detail/editing/fields/CoupleContactFields.tsx`, 'utf8')
assert.equal((fields.match(/label="Adres do umowy"/g) ?? []).length, 1, 'modal presents one contract address control')
assert.match(fields, /Dane do umowy/)
assert.doesNotMatch(fields, /label="Adres"|label="Kod pocztowy"|label="Miasto"/)
assert.ok(fields.indexOf('title="Panna Młoda"') < fields.indexOf('title="Pan Młody"'))
assert.ok(fields.indexOf('title="Pan Młody"') < fields.indexOf('Dane do umowy'))
const questionnaire = await readFile(`${process.cwd()}/src/lib/forms/contractQuestionnaireTemplate.ts`, 'utf8')
assert.match(questionnaire, /label: 'Adres do umowy'/)

console.log('PASS wedding-level contract address compatibility acceptance')
