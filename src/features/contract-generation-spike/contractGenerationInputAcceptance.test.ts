import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import type { Wedding } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'
import type { WeddingPlace } from '@/types/travel'
import { buildContractGenerationInput } from './contractGenerationInput'
import { generationInstructionsForLocale } from './generator'

const wedding: Wedding = {
  id: 'ce475d46-c572-4499-acba-bd568f3dde4b',
  couple: {
    partner1: 'Karolina Kuś', partner2: 'Andrzej Nowacki',
    partner1FirstName: 'Karolina', partner1LastName: 'Kuś',
    partner2FirstName: 'Andrzej', partner2LastName: 'Nowacki',
    partner1Phone: '666777888', partner2Phone: '999777222',
    partner1Email: 'ka.wesele2026@gmail.com', partner2Email: undefined,
    partner1Address: 'Michała Grażyńskiego 5, 41-810 Zabrze',
    email: 'ka.wesele2026@gmail.com', phone: '666777888', venue: 'Villa Love', city: '',
  },
  date: '2026-11-01', status: 'active', workflowStage: 'reservation',
  packageName: 'Video Standard', packageId: 'package-video-standard',
  price: 13200, depositAmount: 1000, currency: 'PLN', packageItems: [
    { sourceItemId: 'item-1', title: 'film 4K', description: null, sortOrder: 0, enabled: true },
  ],
  travelFeeStatus: 'charged', travelFeeAmount: 100,
  finalPaymentTerms: { mode: 'wedding_day' }, finalPaymentDueDate: '2026-11-01',
  payments: [], finances: [], questionnaires: { contractData: { status: 'completed' }, weddingQuestionnaire: { status: 'not_sent' } },
  contract: { status: 'none' }, checklist: [], schedule: [], notes: [], deliverables: [], timeline: [], accentColor: '#000', createdAt: '2026-09-29',
}

const extras: WeddingExtraService[] = [
  { id: 'extra-row-1', weddingId: wedding.id, extraServiceId: 'drone-id', nameSnapshot: 'Ujęcia z drona', priceSnapshot: 800, quantity: 1, createdAt: '2026-09-29' },
  { id: 'extra-row-2', weddingId: wedding.id, extraServiceId: 'vhs-id', nameSnapshot: 'VHS', priceSnapshot: 900, quantity: 1, createdAt: '2026-09-29' },
  { id: 'extra-row-3', weddingId: wedding.id, extraServiceId: 'album-id', nameSnapshot: 'Album fotograficzny', priceSnapshot: 900, quantity: 1, createdAt: '2026-09-29' },
]
const locations: WeddingPlace[] = ['bride_preparation', 'groom_preparation', 'ceremony', 'reception'].map((role, index) => ({
  id: `place-${index}`, weddingId: wedding.id, role: role as WeddingPlace['role'], label: `Place ${index}`,
  placeId: `google-${index}`, formattedAddress: `Address ${index}`, latitude: 50 + index, longitude: 19 + index,
  sortOrder: index, createdAt: '2026-09-29', updatedAt: '2026-09-29',
}))

const originalWedding = structuredClone(wedding)
const result = buildContractGenerationInput({
  wedding, weddingPlaces: locations, extras, generationDate: '2026-09-29T18:45:00.000Z',
  contractRecordId: 'internal-contract-uuid',
  questionnaireFields: {
    'partner1.address': { label: null, placeId: 'zabrze-place', formattedAddress: 'Michała Grażyńskiego 5, 41-810 Zabrze' },
    'partner1.firstName': 'Karolina',
    'partner2.address': 'Partner two address',
    'partner2.firstName': 'Andrzej',
  },
  userProvidedAnswers: [{ id: 'wedding.partner2.pesel', value: 'fictional-id' }, { id: 'arbitrary.ref', value: 'arbitrary value' }],
})
assert.equal(result.locale, 'pl', 'the established Polish application locale is the deterministic default')
assert.equal(buildContractGenerationInput({ wedding, weddingPlaces: [], extras: [], generationDate: '2026-09-29', locale: 'en' }).locale, 'en')
assert.match(generationInstructionsForLocale(result.locale), /naturally in Polish, matching locale pl/)
assert.match(generationInstructionsForLocale('en'), /naturally in English, matching locale en/)
assert.deepEqual(result.participantAssociations, [], 'no association is invented from participant names or ordering')

const explicitAssociations = buildContractGenerationInput({
  wedding, weddingPlaces: [], extras: [], generationDate: '2026-09-29',
  participantAssociations: [
    { participant: 'partner1', association: { value: 'bride', source: 'authoritative wedding record bride field' } },
    { participant: 'partner2', association: { value: 'groom', source: 'authoritative wedding record groom field' } },
  ],
})
assert.deepEqual(explicitAssociations.participantAssociations, [
  { participant: 'partner1', association: { value: 'bride', source: 'authoritative wedding record bride field' } },
  { participant: 'partner2', association: { value: 'groom', source: 'authoritative wedding record groom field' } },
], 'explicit upstream associations and their provenance survive normalization')

const [party1, party2] = result.parties
assert.equal(party1?.sourceKey, 'partner1')
assert.equal(party1?.fullName?.value, 'Karolina Kuś')
assert.equal(party1?.fullName?.owner, 'partner1')
assert.equal(party2?.sourceKey, 'partner2')
assert.equal(party2?.fullName?.value, 'Andrzej Nowacki')
assert.equal(party2?.fullName?.owner, 'partner2')
assert.equal(party1?.address?.value, 'Michała Grażyńskiego 5, 41-810 Zabrze')
assert.equal(party1?.address?.source, 'form_answers.answer_json.fields.partner1.address.formattedAddress')
assert.equal(party1?.address?.owner, 'partner1')
assert.equal(party2?.address?.value, 'Partner two address')
assert.equal(party2?.address?.owner, 'partner2')
assert.equal(party1?.phone?.owner, 'partner1', 'participant 1 phone retains participant ownership')
assert.equal(party2?.phone?.owner, 'partner2', 'participant 2 phone retains participant ownership')
assert.notEqual(party1?.address?.value, party2?.address?.value, 'distinct participant addresses remain distinct authoritative facts')

const withoutParty2Address = buildContractGenerationInput({
  wedding: { ...wedding, couple: { ...wedding.couple, partner2Address: undefined } },
  weddingPlaces: [], extras: [], generationDate: '2026-09-29',
  questionnaireFields: { 'partner1.address': 'Party one only' },
})
assert.equal(withoutParty2Address.parties[1]?.address, undefined, 'missing Party 2 address remains absent')

const genericAddress = buildContractGenerationInput({
  wedding: { ...wedding, couple: { ...wedding.couple, partner1Address: 'Generic correspondence address' } },
  weddingPlaces: [], extras: [], generationDate: '2026-09-29', questionnaireFields: {},
})
assert.deepEqual(genericAddress.parties[0]?.address, {
  value: 'Generic correspondence address',
  source: 'wedding.couple.partner1Address (mapped from public.weddings.contract_address)',
  owner: 'partner1',
}, 'the existing canonical contract-address association is preserved on partner1')
assert.equal(genericAddress.unownedFacts.length, 0)
assert.equal('residential' in (genericAddress.parties[0]?.address ?? {}), false, 'contract address is not reclassified as residential')

assert.equal(party1?.phone?.value, '666777888')
assert.equal(party1?.phone?.owner, 'partner1')
assert.equal(party2?.phone?.value, '999777222')
assert.equal(party2?.phone?.owner, 'partner2')
assert.equal(party1?.email?.value, 'ka.wesele2026@gmail.com')
assert.equal(party1?.email?.owner, 'partner1')
assert.equal(party2?.email, undefined, 'missing optional email does not fail')

const withPartner2Email = buildContractGenerationInput({
  wedding: { ...wedding, couple: { ...wedding.couple, partner2Email: 'andrzej@example.test' } },
  weddingPlaces: [], extras: [], generationDate: '2026-09-29',
})
assert.equal(withPartner2Email.parties[1]?.email?.value, 'andrzej@example.test')
assert.equal(withPartner2Email.parties[1]?.email?.owner, 'partner2')
const currentManualWedding = buildContractGenerationInput({
  wedding: { ...wedding, couple: { ...wedding.couple, partner1: 'Current Manual Name' } },
  weddingPlaces: [], extras: [], generationDate: '2026-09-29',
  questionnaireFields: { 'partner1.firstName': 'Older submitted name' },
})
assert.equal(currentManualWedding.parties[0]?.fullName?.value, 'Current Manual Name', 'current hydrated wedding facts flow through')

assert.equal(result.wedding.date.value, '2026-11-01')
assert.equal(result.wedding.date.source, 'public.weddings.wedding_date')
assert.equal(result.package.id?.value, 'package-video-standard')
assert.equal(result.package.name.value, 'Video Standard')
assert.equal(result.package.items.value[0]?.title, 'film 4K')
assert.equal(result.commercial.contractValue.value, 13200)
assert.equal(result.commercial.agreedDeposit.value, 1000)
assert.equal(result.commercial.totalPaid.value, 0)
assert.equal(result.commercial.remainingAfterDeposit.value, 12200)
assert.equal(result.commercial.remainingToPayNow.value, 13200)
assert.notEqual(result.commercial.remainingAfterDeposit.value, result.commercial.remainingToPayNow.value)
assert.deepEqual(result.commercial.finalPaymentTerms?.value, { mode: 'wedding_day' })
assert.equal(result.commercial.finalPaymentDueDate?.value, '2026-11-01')
assert.equal(result.commercial.travelFeeStatus.value, 'charged')
assert.equal(result.commercial.travelFeeAmount.value, 100)
assert.deepEqual(result.extras.map((extra) => [extra.name.value, extra.quantity.value, extra.price.value]), [
  ['Ujęcia z drona', 1, 800], ['VHS', 1, 900], ['Album fotograficzny', 1, 900],
])
assert.equal(result.extras[0]?.name.source, 'public.wedding_extra_services.extra-row-1.name_snapshot')
const legacyExtraName = buildContractGenerationInput({
  wedding, weddingPlaces: [], extras: [{ ...extras[0]!, nameSnapshot: undefined, name: 'Catalog fallback' }], generationDate: '2026-09-29',
})
assert.equal(legacyExtraName.extras[0]?.name.value, 'Catalog fallback')
assert.equal(legacyExtraName.extras[0]?.name.source, 'extra_services.name (legacy fallback for extra-row-1)')
assert.deepEqual(result.locations.map((place) => place.role.value), ['bride_preparation', 'groom_preparation', 'ceremony', 'reception'])
assert.deepEqual(result.locations.map((place) => place.label?.value), ['Place 0', 'Place 1', 'Place 2', 'Place 3'], 'stored place display names remain in normalized authority')
assert.deepEqual(result.locations.map((place) => place.label?.source), locations.map((place) => `public.wedding_places.${place.id}.label`), 'stored display-name provenance is retained')
assert.deepEqual(result.locations.map((place) => place.formattedAddress.value), locations.map((place) => place.formattedAddress), 'formatted addresses remain available alongside display names')
assert.deepEqual(result.locations.map((place) => place.role.source), locations.map((place) => `public.wedding_places.${place.id}.role`), 'place role provenance is retained')
assert.equal(result.locations[0]?.placeId?.value, 'google-0')
assert.equal(result.generationContext.contractRecordId?.value, 'internal-contract-uuid')
assert.equal('contractNumber' in result.generationContext, false)
assert.equal('agreementNumber' in result.generationContext, false)
assert.equal('pesel' in (result.parties[0] ?? {}), false, 'PESEL is not required by the adapter')
assert.deepEqual(result.additionalAnswers.map(({ id, value, authority }) => [id, value, authority]), [
  ['wedding.partner2.pesel', 'fictional-id', 'user'], ['arbitrary.ref', 'arbitrary value', 'user'],
])
assert.equal(result.additionalAnswers[1]?.source, 'userProvidedAnswers.arbitrary.ref')
assert.deepEqual(result.questionnaireAnswers.map((answer) => answer.source), [
  'form_answers.answer_json.fields.partner1.address',
  'form_answers.answer_json.fields.partner1.firstName',
  'form_answers.answer_json.fields.partner2.address',
  'form_answers.answer_json.fields.partner2.firstName',
])
assert.equal(result.questionnaireAnswers[0]?.owner, 'partner1')
assert.equal(result.questionnaireAnswers[2]?.owner, 'partner2')
assert.deepEqual(wedding, originalWedding, 'adapter does not mutate current wedding data')

const genericProvidedAlongsideOwnedAddress = buildContractGenerationInput({
  wedding, weddingPlaces: [], extras: [], generationDate: '2026-09-29',
  questionnaireFields: { 'partner1.address': 'Party-owned address' },
  genericContractAddress: 'Canonical correspondence address',
})
assert.deepEqual(genericProvidedAlongsideOwnedAddress.parties[0]?.address, {
  value: 'Canonical correspondence address',
  source: 'public.weddings.contract_address',
  owner: 'partner1',
}, 'the canonical address keeps its established association when a separate submitted address is also present')
assert.equal(genericProvidedAlongsideOwnedAddress.questionnaireAnswers[0]?.value, 'Party-owned address', 'the separate owned questionnaire fact remains available with its provenance')
assert.equal(genericProvidedAlongsideOwnedAddress.questionnaireAnswers[0]?.owner, 'partner1')
assert.equal(genericProvidedAlongsideOwnedAddress.unownedFacts.length, 0)
assert.equal(genericProvidedAlongsideOwnedAddress.parties[1]?.address, undefined, 'partner1 association is not copied to partner2')
assert.equal(result.additionalAnswers.find((answer) => answer.id === 'arbitrary.ref')?.value, 'arbitrary value', 'unassociated user answers remain separate from party address facts')
assert.equal('owner' in result.additionalAnswers.find((answer) => answer.id === 'arbitrary.ref')!, false, 'unassociated answers do not gain an invented owner')
assert.equal(result.parties[0]?.address?.value, 'Michała Grażyńskiego 5, 41-810 Zabrze', 'unassociated user answers are not assigned to partner1')

const explicitlyRepeatedParticipantFact = buildContractGenerationInput({
  wedding: { ...wedding, couple: { ...wedding.couple, partner1Address: 'Shared by direct authority', partner2Address: 'Shared by direct authority' } },
  weddingPlaces: [], extras: [], generationDate: '2026-09-29', questionnaireFields: {},
})
assert.deepEqual(explicitlyRepeatedParticipantFact.parties.map((party) => [party.address?.value, party.address?.owner]), [
  ['Shared by direct authority', 'partner1'], ['Shared by direct authority', 'partner2'],
], 'a fact explicitly present for each participant remains available to both without inferred ownership')

const adapterSource = await readFile(`${process.cwd()}/src/features/contract-generation-spike/contractGenerationInput.ts`, 'utf8')
assert.doesNotMatch(adapterSource, /JSZip|readSource|sourceDocx|parseDocx/i)
assert.doesNotMatch(adapterSource, /supabase|\.from\(|\.insert\(|\.update\(|\.delete\(/i)
assert.doesNotMatch(adapterSource, /\bcontractNumber\b|\bagreementNumber\b|parsePaymentProse|questionnaireLabelNlp/i)
assert.doesNotMatch(adapterSource, /new RegExp|\.match\(|\.matchAll\(/)
assert.doesNotMatch(adapterSource, /bride.*address.*heuristic|address.*regex/i)
console.log('PASS real OurWed ContractGenerationInput adapter acceptance')
