import assert from 'node:assert/strict'
import { makeInput, TRANSFORMATION_INSTRUCTIONS, validatePlannedEntityFacts, type GenerationInput, type SourceBlock } from './generator'
import type { BlockOperation } from './blockDocxEditor'

const clientIdentity: SourceBlock = {
  blockId: 'word/document.xml#identity', part: 'word/document.xml', index: 0, kind: 'body', context: '', contentClass: 'factual_dynamic',
  text: 'Umowę zawierają Northwind Studio, business reference: BIZ-44, oraz Alicja Stara, adres: ul. Stara 7, 00-100 Stare Miasto, identifier: REF-OLD-73, e-mail: alicja.old@example.test, telefon: +48 500 111 222, zwana dalej "Zleceniodawczynią".',
}
const providerFact: SourceBlock = {
  blockId: 'word/document.xml#provider', part: 'word/document.xml', index: 1, kind: 'body', context: '', contentClass: 'factual_dynamic',
  text: 'Northwind Studio, business reference: BIZ-44',
}
const thirdPartyFact: SourceBlock = {
  blockId: 'word/document.xml#third-party', part: 'word/document.xml', index: 2, kind: 'body', context: '', contentClass: 'factual_dynamic',
  text: 'Świadek: Iga Trzecia, reference: THIRD-PARTY-19',
}
const catalogue: SourceBlock = {
  blockId: 'word/document.xml#catalogue', part: 'word/document.xml', index: 3, kind: 'body', context: '', contentClass: 'package_service',
  text: 'Katalog opcji: album 950 zł; dodatkowy operator 1 200 zł.',
}

const replacementText = (identifier: string) => `Umowę zawierają Northwind Studio, business reference: BIZ-44, oraz Marta Zielna, adres: ul. Nowa 8, 00-200 Nowe Miasto, identifier: ${identifier}, e-mail: marta.zielna@example.test, telefon: +48 600 222 333, zwana dalej "Zleceniodawczynią".`

function createInput(userProvidedAnswers: GenerationInput['userProvidedAnswers'] = []): GenerationInput {
  return makeInput({
    generationDate: '',
    sourceDocument: { fileName: 'generic-source.docx', blocks: [clientIdentity, providerFact, thirdPartyFact, catalogue] },
    wedding: {
      bride: { name: 'Marta Zielna', phone: '+48 600 222 333', email: 'marta.zielna@example.test' },
      groom: { name: 'Tomasz Zielny', phone: '+48 600 333 444' },
      weddingDate: '19.06.2028', contractAddress: 'ul. Nowa 8, 00-200 Nowe Miasto', contractValuePln: 16800, depositPln: 2800,
      remainingDueDate: 'nie później niż 3 dni po weselu',
      locations: { bridePreparations: 'Hotel Nowy', groomPreparations: 'Hotel Nowy', ceremony: 'Kościół Nowy', reception: 'Sala Nowa' },
    },
    packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers,
  })
}

function plan(identifier: string): BlockOperation[] {
  return [{ blockId: clientIdentity.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: replacementText(identifier) }]
}

const newIdentifierAnswer = { id: 'wedding.bride.identifier', value: 'REF-NEW-73' }
const allReplacementsInput = createInput([newIdentifierAnswer])
const unrelatedContentOperations: BlockOperation[] = [
  ...plan('REF-NEW-73'),
  { blockId: thirdPartyFact.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: thirdPartyFact.text },
  { blockId: catalogue.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: catalogue.text },
]

// A: Replaced customer facts have authoritative values, including a scoped answer for an unmodeled attribute.
assert.deepEqual(validatePlannedEntityFacts(allReplacementsInput, plan('REF-NEW-73')), [])

// B/G: The old customer's identifier survives in the same formal identity block without authority for the new client.
const stalePlan = plan('REF-OLD-73')
const staleFinding = validatePlannedEntityFacts(createInput(), stalePlan)
assert.equal(staleFinding.length, 1)
assert.match(staleFinding[0]!, /source entity-owned value remains.*authoritative replacement.*same entity and concept/i)
assert.ok(stalePlan[0]!.operation === 'REPLACE_BLOCK_TEXT' && stalePlan[0]!.finalText.includes('Marta Zielna'))
assert.ok(clientIdentity.text.includes('oraz Alicja Stara'))

// C: The same value is allowed when the authoritative input confirms it for the replacement client and matching concept.
assert.deepEqual(validatePlannedEntityFacts(createInput([{ id: 'wedding.bride.identifier', value: 'REF-OLD-73' }]), stalePlan), [])

// D: Provider/business facts after the formal client role boundary remain unchanged and are not treated as client facts.
assert.deepEqual(validatePlannedEntityFacts(allReplacementsInput, [{ ...stalePlan[0]!, operation: 'REPLACE_BLOCK_TEXT', finalText: replacementText('REF-NEW-73') }]), [])
assert.ok(replacementText('REF-NEW-73').includes('business reference: BIZ-44'))

// E/F: Unrelated third-party facts and static catalogue prices are outside the replaced client's identity scope.
assert.deepEqual(validatePlannedEntityFacts(allReplacementsInput, unrelatedContentOperations), [])
assert.equal(thirdPartyFact.text.includes('THIRD-PARTY-19'), true)
assert.equal(catalogue.text.includes('950 zł') && catalogue.text.includes('1 200 zł'), true)

// H: The rule and implementation are generic and do not name a field, case, or customer.
assert.match(TRANSFORMATION_INSTRUCTIONS, /When a source entity is replaced.*source-owned factual values are not authoritative.*return MISSING_INPUT/i)
assert.doesNotMatch(TRANSFORMATION_INSTRUCTIONS, /PESEL/i)
assert.doesNotMatch(validatePlannedEntityFacts.toString(), /PESEL|Case.?03|Alicja|Marta/i)

console.log('PASS generic planned entity-owned fact validation acceptance')
