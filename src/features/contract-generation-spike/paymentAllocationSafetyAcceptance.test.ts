import assert from 'node:assert/strict'
import { addPaymentAllocationHelp, makeInput, TRANSFORMATION_INSTRUCTIONS, validatePlannedPaymentAllocation, type GenerationInput, type SourceBlock } from './generator'
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
  finalText: 'Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 5 000 zł i jest należna 30 dni przed weselem. Pozostałe 9 000 zł zostanie zapłacone po weselu. Suma płatności wynosi 16 800 zł.',
}]).length, 1, 'a mathematically correct aggregate does not authorize its detailed split')

// D/E: A complete explicit allocation is accepted and must match the planned obligations exactly.
const explicitAllocation = [{ id: 'financials.paymentAllocation', value: '5 000 zł oraz 9 000 zł' }]
const explicitInput = input(multiTwo, explicitAllocation)
assert.equal(validatePlannedPaymentAllocation(input(multiTwo, [{ id: 'payment.schedule', value: '5 000 zł' }]), []).length, 1, 'partial explicit allocation remains unresolved')
assert.deepEqual(validatePlannedPaymentAllocation(explicitInput, [{
  blockId: 'word/document.xml#payments', operation: 'REPLACE_BLOCK_TEXT',
  finalText: 'Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 5 000 zł i jest należna 30 dni przed weselem. Pozostałe 9 000 zł zostanie zapłacone po weselu. Suma płatności wynosi 16 800 zł.',
}]), [])
assert.deepEqual(validatePlannedPaymentAllocation(input(multiThree, [{ id: 'payment.schedule', value: '4000, 5000, 5000' }]), [{
  blockId: 'word/document.xml#payments', operation: 'REPLACE_BLOCK_TEXT',
  finalText: 'Opłata rezerwacyjna wynosi 2 800 zł. Pierwsza rata po rezerwacji wynosi 4 000 zł. Druga rata wynosi 5 000 zł. Pozostałe 5 000 zł zostanie zapłacone po weselu. Łącznie 16 800 zł.',
}]), [])

// F/G: Catalogue prices and travel/static monetary clauses are not payment allocations and remain untouched.
assert.deepEqual(validatePlannedPaymentAllocation(input(safeSingleRemainder, [], [catalogue, travel]), []), [])
assert.equal(catalogue.text, 'Katalog usług opcjonalnych — album 950 zł; dodatkowy operator 1 200 zł.')
assert.equal(travel.text, 'Cena obejmuje dojazd w promieniu 80 km; poza tym obszarem koszt dojazdu wynosi 350 zł.')

// K: An authoritative intermediate amount allows a uniquely source-identified final remainder to be derived.
const twoInstallments = 'Druga płatność wynosi 5 000 zł i jest należna 30 dni przed weselem. Pozostałe 9 000 zł zostanie zapłacone 3 dni po weselu. Suma płatności wynosi 16 800 zł.'
const continuation = input(twoInstallments, [{ id: 'financials.remainingInstallmentAllocation', value: 'Second payment: 6 000 zł, due no later than 30 days before the wedding.' }])
assert.equal(continuation.deterministicDerivedFacts.length, 1)
assert.equal(continuation.deterministicDerivedFacts[0]!.concept, 'final installment amount')
assert.match(continuation.deterministicDerivedFacts[0]!.value, /8\s?000 zł/u)
assert.equal(continuation.deterministicDerivedFacts[0]!.derivation, 'contract total minus deposit and all authoritative intermediate installment amounts')
const derivedPlan: BlockOperation[] = [{
  blockId: 'word/document.xml#payments', operation: 'REPLACE_BLOCK_TEXT',
  finalText: 'Druga płatność wynosi 6 000 zł i jest należna 30 dni przed weselem. Pozostałe 8 000 zł zostanie zapłacone 3 dni po weselu. Suma płatności wynosi 16 800 zł.',
}]
assert.deepEqual(validatePlannedPaymentAllocation(continuation, derivedPlan), [])
assert.match(derivedPlan[0]!.finalText, /30 dni przed weselem.*3 dni po weselu/u, 'both source-defined payment timings remain unchanged')

// L: Two unresolved amounts remain when three post-deposit obligations have only one authoritative amount.
const threePaymentInput = input(multiThree, [{ id: 'payment.schedule', value: 'First installment: 4 000 zł' }])
assert.deepEqual(threePaymentInput.deterministicDerivedFacts, [])
assert.equal(validatePlannedPaymentAllocation(threePaymentInput, []).length, 1)

// M/N: Explicit final amounts remain authoritative and conflicting arithmetic is rejected.
const explicitFinal = input(twoInstallments, [{ id: 'payment.schedule', value: 'Second payment: 6 000 zł; final payment: 8 000 zł' }])
assert.deepEqual(explicitFinal.deterministicDerivedFacts, [])
assert.deepEqual(validatePlannedPaymentAllocation(explicitFinal, derivedPlan), [])
const conflictingFinal = input(twoInstallments, [{ id: 'payment.schedule', value: 'Second payment: 6 000 zł; final payment: 7 000 zł' }])
assert.match(validatePlannedPaymentAllocation(conflictingFinal, derivedPlan)[0]!, /conflict with the authoritative remaining contract balance/i)

// O/P: Negative or over-allocated remainders cannot be derived; valid totals pass exactly.
const negativeRemainder = input(twoInstallments, [{ id: 'financials.remainingInstallmentAllocation', value: 'Second payment: 15 000 zł' }])
assert.deepEqual(negativeRemainder.deterministicDerivedFacts, [])
assert.equal(validatePlannedPaymentAllocation(negativeRemainder, []).length, 1)
const sumMismatch = input(twoInstallments, [{ id: 'payment.schedule', value: 'Second payment: 5 000 zł; final payment: 8 000 zł' }])
assert.match(validatePlannedPaymentAllocation(sumMismatch, derivedPlan)[0]!, /conflict with the authoritative remaining contract balance/i)

// Q: Missing-input metadata can explain the automatic final calculation without fixture data.
const allocationMissing = [{ id: 'financials.paymentAllocation', label: 'Kwota drugiej raty', explanation: 'Source requires this amount.', inputType: 'number' as const, required: true as const, sourceContext: 'Payment clause.' }]
const help = addPaymentAllocationHelp(input(twoInstallments), allocationMissing)
assert.equal(help[0]!.infoText, 'Podaj kwoty wymaganych płatności po opłacie rezerwacyjnej w kolejności wynikającej ze źródła. Jedna pozostała końcowa kwota może zostać wyliczona automatycznie z wartości umowy i zaliczki.')
assert.doesNotMatch(`${TRANSFORMATION_INSTRUCTIONS} ${help[0]!.infoText}`, /Case.?03|Zuzanna|Kacper|16\s?800|6\s?000|8\s?000/i)
assert.ok(!('payments' in continuation), 'the CRM payment model remains unchanged')

// I/J: The shared rule requests clarification generically and contains no fixture-specific facts.
assert.match(TRANSFORMATION_INSTRUCTIONS, /authoritative aggregate amount separately.*multiple independently meaningful payments.*return MISSING_INPUT/i)
assert.doesNotMatch(TRANSFORMATION_INSTRUCTIONS, /Case.?03|Zuzanna|Kacper|16 800|5 500|8 500/i)

console.log('PASS generic payment allocation safety acceptance')
