import assert from 'node:assert/strict'
import { makeInput, TRANSFORMATION_INSTRUCTIONS, validatePlannedPaymentAllocation, type GenerationInput, type SourceBlock } from './generator'
import type { BlockOperation } from './blockDocxEditor'

const paymentBlock = (text: string): SourceBlock => ({
  blockId: 'word/document.xml#payments', part: 'word/document.xml', index: 0, kind: 'body', context: '', contentClass: 'factual_dynamic', text,
})
const catalogue: SourceBlock = {
  blockId: 'word/document.xml#catalogue', part: 'word/document.xml', index: 1, kind: 'body', context: '', contentClass: 'package_service',
  text: 'Katalog usług opcjonalnych — album 950 zł; dodatkowy operator 1 200 zł.',
}
const travel: SourceBlock = {
  blockId: 'word/document.xml#travel', part: 'word/document.xml', index: 2, kind: 'body', context: '', contentClass: 'protected_legal_static',
  text: 'Cena obejmuje dojazd w promieniu 80 km; poza tym obszarem koszt dojazdu wynosi 350 zł.',
}

function input(paymentText: string, userProvidedAnswers: GenerationInput['userProvidedAnswers'] = [], extraBlocks: SourceBlock[] = []): GenerationInput {
  return makeInput({
    generationDate: '01.01.2028',
    sourceDocument: { fileName: 'generic.docx', blocks: [paymentBlock(paymentText), ...extraBlocks] },
    wedding: {
      bride: { name: 'Alicja Nowa', phone: '', email: '' }, groom: { name: 'Jan Nowy', phone: '' },
      weddingDate: '19.06.2028', contractAddress: 'ul. Nowa 1, 00-001 Miasto', contractValuePln: 16800, depositPln: 2800,
      remainingDueDate: '3 dni po weselu', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' },
    },
    packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers,
  })
}

const safeSingleRemainder = 'Opłata rezerwacyjna wynosi 2 800 zł. Pozostała kwota 14 000 zł zostanie zapłacona po weselu.'
const multiTwo = 'Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 5 000 zł i jest należna 30 dni przed weselem. Pozostałe 9 000 zł zostanie zapłacone po weselu. Suma płatności wynosi 16 800 zł.'
const multiThree = 'Opłata rezerwacyjna wynosi 2 800 zł. Pierwsza rata po rezerwacji wynosi 4 000 zł. Druga rata wynosi 5 000 zł. Pozostałe 5 000 zł zostanie zapłacone po weselu. Łącznie 16 800 zł.'

// A: One post-reservation obligation matches OurWed's one remaining amount.
assert.deepEqual(validatePlannedPaymentAllocation(input(safeSingleRemainder), []), [])

// B/C/H: Aggregate remaining money cannot authorize an arbitrary allocation, even if the split adds up correctly.
const unsupportedTwo = validatePlannedPaymentAllocation(input(multiTwo), [])
assert.equal(unsupportedTwo.length, 1)
assert.match(unsupportedTwo[0]!, /multiple distinct post-reservation payment obligations.*aggregate amount/i)
assert.equal(validatePlannedPaymentAllocation(input(multiThree), [] ).length, 1)
assert.equal(validatePlannedPaymentAllocation(input(multiTwo), [{
  blockId: 'word/document.xml#payments', operation: 'REPLACE_BLOCK_TEXT',
  finalText: 'Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 5 000 zł. Pozostałe 9 000 zł zostanie zapłacone po weselu. Suma płatności wynosi 16 800 zł.',
}]).length, 1, 'a mathematically correct aggregate does not authorize its detailed split')

// D/E: A complete explicit allocation is accepted and must match the planned obligations exactly.
const explicitAllocation = [{ id: 'financials.paymentAllocation', value: '5 000 zł oraz 9 000 zł' }]
const explicitInput = input(multiTwo, explicitAllocation)
assert.equal(validatePlannedPaymentAllocation(input(multiTwo, [{ id: 'payment.schedule', value: '5 000 zł' }]), []).length, 1, 'partial explicit allocation remains unresolved')
assert.deepEqual(validatePlannedPaymentAllocation(explicitInput, [{
  blockId: 'word/document.xml#payments', operation: 'REPLACE_BLOCK_TEXT',
  finalText: 'Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 5 000 zł. Pozostałe 9 000 zł zostanie zapłacone po weselu. Suma płatności wynosi 16 800 zł.',
}]), [])
assert.deepEqual(validatePlannedPaymentAllocation(input(multiThree, [{ id: 'payment.schedule', value: '4000, 5000, 5000' }]), [{
  blockId: 'word/document.xml#payments', operation: 'REPLACE_BLOCK_TEXT',
  finalText: 'Opłata rezerwacyjna wynosi 2 800 zł. Pierwsza rata po rezerwacji wynosi 4 000 zł. Druga rata wynosi 5 000 zł. Pozostałe 5 000 zł zostanie zapłacone po weselu. Łącznie 16 800 zł.',
}]), [])

// F/G: Catalogue prices and travel/static monetary clauses are not payment allocations and remain untouched.
assert.deepEqual(validatePlannedPaymentAllocation(input(safeSingleRemainder, [], [catalogue, travel]), []), [])
assert.equal(catalogue.text, 'Katalog usług opcjonalnych — album 950 zł; dodatkowy operator 1 200 zł.')
assert.equal(travel.text, 'Cena obejmuje dojazd w promieniu 80 km; poza tym obszarem koszt dojazdu wynosi 350 zł.')

// I/J: The shared rule requests clarification generically and contains no fixture-specific facts.
assert.match(TRANSFORMATION_INSTRUCTIONS, /authoritative aggregate amount separately.*multiple independently meaningful payments.*return MISSING_INPUT/i)
assert.doesNotMatch(TRANSFORMATION_INSTRUCTIONS, /Case.?03|Zuzanna|Kacper|16 800|5 500|8 500/i)

console.log('PASS generic payment allocation safety acceptance')
