import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'
import { PLANNER_AUTHORITY_CONTEXT_DESCRIPTION, serializePlannerAuthorityContext } from './plannerProviderBoundary'

const fixturePath = `${process.cwd()}/src/features/contract-generation-spike/multi-template-acceptance/cases/case-04-realistic-wedding-photographer/input.json`
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as { authoritativeInput: ContractGenerationInputOptions }
const secondOptions = JSON.parse(JSON.stringify(fixture.authoritativeInput)) as ContractGenerationInputOptions
secondOptions.wedding.id = 'synthetic-second-provider-fixture'
secondOptions.wedding.couple.partner1 = 'Iga Nowak'
secondOptions.wedding.couple.partner2 = 'Olek Lis'
delete secondOptions.questionnaireFields?.['partner2.address']
secondOptions.wedding.packageName = 'PAKIET KAMERALNY'
secondOptions.wedding.packageItems = [{ title: 'Zakres syntetyczny', sortOrder: 0, enabled: true }]
secondOptions.weddingPlaces = secondOptions.weddingPlaces.slice(0, 1).map((place) => ({ ...place, role: 'ceremony' as const, label: 'Urząd Stanu Cywilnego' }))
secondOptions.userProvidedAnswers = [{ id: 'unclassified.answer.ref/v2', value: 'wartość odpowiedzi' }]
secondOptions.contractRecordId = 'internal-contract-uuid-not-a-human-number'
secondOptions.genericContractAddress = 'Correspondence only, 99 Sample Road'

const normalized = buildContractGenerationInput(secondOptions)
const wire = serializePlannerAuthorityContext(normalized)
const payload = JSON.parse(wire) as { description: string; authorityContext: typeof normalized }
const transported = payload.authorityContext
assert.equal(payload.description, PLANNER_AUTHORITY_CONTEXT_DESCRIPTION)
assert.deepEqual(transported, normalized)
assert.equal(transported.parties[0]?.fullName?.value, 'Iga Nowak')
assert.equal(transported.parties[0]?.address?.owner, 'partner1')
assert.equal(transported.parties[1]?.fullName?.value, 'Olek Lis')
assert.equal(transported.parties[1]?.address, undefined, 'absent optional party address remains absent')
assert.deepEqual(transported.unownedFacts, normalized.unownedFacts)
assert.equal(transported.parties.some((party) => party.address?.value === 'Correspondence only, 99 Sample Road'), false)
assert.deepEqual(transported.additionalAnswers, [{
  id: 'unclassified.answer.ref/v2',
  value: 'wartość odpowiedzi',
  authority: 'user',
  source: 'userProvidedAnswers.unclassified.answer.ref/v2',
}])
assert.equal(transported.package.name.value, 'PAKIET KAMERALNY')
assert.equal(transported.locations.length, 1)
assert.equal(transported.locations[0]?.role.value, 'ceremony')
assert.equal(transported.generationContext.contractRecordId?.value, 'internal-contract-uuid-not-a-human-number')
assert.equal(transported.additionalAnswers.some(({ id }) => id === 'agreement.identifier'), false)

const serializerSource = await readFile(`${process.cwd()}/src/features/contract-generation-spike/plannerProviderBoundary.ts`, 'utf8')
assert.doesNotMatch(serializerSource, /PESEL|agreement\.identifier|contractNumber|clients\.address/i)
const serializerCode = serializerSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
assert.doesNotMatch(serializerCode, /parseFlexible|infer|classif|heuristic|ontology/i)
console.log('PASS generic normalized planner provider-boundary serialization')
