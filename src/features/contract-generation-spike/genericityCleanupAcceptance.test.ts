import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { applyBlockOperations, type BlockOperation } from './blockDocxEditor'
import {
  addPaymentAllocationHelp,
  classifyBlock,
  makeInput,
  readSource,
  runGeneration,
  TRANSFORMATION_INSTRUCTIONS,
  validateCandidate,
  validatePlannedPaymentAllocation,
  type GenerationInput,
} from './generator'

const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

async function docx(paragraphs: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(paragraph).join('')}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const wedding = {
  bride: { name: 'Ada Test', phone: '111 222 333', email: 'ada@example.test' },
  groom: { name: 'Bar Client', phone: '444 555 666' },
  weddingDate: '20.08.2027',
  contractAddress: 'ul. Nowa 1, 00-001 Nowe Miasto',
  contractValuePln: 10000,
  depositPln: 2000,
  remainingDueDate: '20.08.2027',
  locations: {
    bridePreparations: 'ul. Inna 2, 00-002 Inne Miasto',
    groomPreparations: 'ul. Inna 3, 00-003 Inne Miasto',
    ceremony: 'ul. Inna 4, 00-004 Inne Miasto',
    reception: 'ul. Inna 5, 00-005 Inne Miasto',
  },
}

async function inputFor(sourceBytes: ArrayBuffer, userProvidedAnswers: GenerationInput['userProvidedAnswers'] = []) {
  const sourceDocument = await readSource(sourceBytes, 'arbitrary-name.docx')
  return makeInput({
    generationDate: '01.06.2027', sourceDocument, wedding,
    packagePolicy: { preserveSourcePackageExactly: true }, extras: ['Unavailable-by-source extra'], userProvidedAnswers,
  })
}

const oneClientSource = await docx(['Ada Test, zwana dalej „Klientką”.'])
const oneClientInput = await inputFor(oneClientSource)
assert.deepEqual(await validateCandidate(oneClientSource, oneClientSource, oneClientInput), [], 'source without email, phone, address, locations, amounts, or a second client does not require those CRM values in the candidate')
assert.equal(oneClientInput.sourceDocument.blocks.length, 1, 'the source contains only one formal client')

const contractNumberSource = await docx(['Umowa nr SRC-001.'])
const contractNumberInput = await inputFor(contractNumberSource, [{ id: 'contract.number', value: 'NEW-2027-001' }])
assert.deepEqual(await validateCandidate(contractNumberSource, contractNumberSource, contractNumberInput), [], 'an available contract number is not inserted when the source does not require it')
const numberBlock = contractNumberInput.sourceDocument.blocks[0]!
const numberOperation: BlockOperation = { blockId: numberBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Umowa nr NEW-2027-001.' }
const updatedContractNumber = await applyBlockOperations(contractNumberSource, [numberOperation])
assert.deepEqual(await validateCandidate(contractNumberSource, updatedContractNumber, contractNumberInput, [numberOperation]), [], 'a plan-applied contract number is validated through the generic approved-operation path')

const nonPakietScopeText = 'Przedmiotem umowy jest reportaż fotograficzny obejmujący osiem godzin realizacji.'
assert.equal(classifyBlock(nonPakietScopeText), 'package_service', 'service scope under a different heading is classified without the word pakiet')
const packageSource = await docx([nonPakietScopeText])
const packageInput = await inputFor(packageSource)
const packageBlock = packageInput.sourceDocument.blocks[0]!
const changedScope: BlockOperation = { blockId: packageBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: nonPakietScopeText.replace('osiem', 'dziesięć') }
const changedPackage = await applyBlockOperations(packageSource, [changedScope])
assert.ok((await validateCandidate(packageSource, changedPackage, packageInput, [changedScope])).some((finding) => /Treść pakietu różni się/i.test(finding)), 'a source-defined selected service scope remains preserved under a non-pakiet heading')

async function paymentSetup(answerValues: string[]) {
  const sourceBytes = await docx([
    'Łączna wartość umowy wynosi 10 000 zł.',
    'Opłata rezerwacyjna wynosi 2 000 zł.',
    'Pierwsza płatność wynosi 3 000 zł i jest płatna do 1 czerwca 2027 roku.',
    'Pozostała kwota wynosi 5 000 zł i jest płatna do 1 sierpnia 2027 roku.',
  ])
  const answers = answerValues.map((value) => ({ id: 'financials.remainingInstallmentAllocation', value }))
  const input = await inputFor(sourceBytes, answers)
  const first = input.sourceDocument.blocks.find((block) => block.text.startsWith('Pierwsza płatność'))!
  const final = input.sourceDocument.blocks.find((block) => block.text.startsWith('Pozostała kwota'))!
  const candidateFor = async (firstText: string, finalText: string) => {
    const operations: BlockOperation[] = [
      { blockId: first.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: firstText },
      { blockId: final.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText },
    ]
    return { operations, bytes: await applyBlockOperations(sourceBytes, operations) }
  }
  return { sourceBytes, input, candidateFor, first, final }
}

const payment = await paymentSetup(['First payment: 3 000 zł.'])
const validPayments = await payment.candidateFor(
  'Pierwsza płatność wynosi 3 000 zł i jest płatna do 1 czerwca 2027 roku.',
  'Pozostała kwota wynosi 5 000 zł i jest płatna do 1 sierpnia 2027 roku.',
)
assert.deepEqual(validatePlannedPaymentAllocation(payment.input, validPayments.operations), [], 'authoritative amounts match source-ordered payment obligations')
assert.deepEqual(await validateCandidate(payment.sourceBytes, validPayments.bytes, payment.input, validPayments.operations), [], 'valid allocation and source-defined timing pass')

const swappedAmounts = await payment.candidateFor(
  'Pierwsza płatność wynosi 5 000 zł i jest płatna do 1 czerwca 2027 roku.',
  'Pozostała kwota wynosi 3 000 zł i jest płatna do 1 sierpnia 2027 roku.',
)
assert.ok(validatePlannedPaymentAllocation(payment.input, swappedAmounts.operations).length > 0, 'correct aggregate with amounts attached to the wrong obligations fails')

const swappedTiming = await payment.candidateFor(
  'Pierwsza płatność wynosi 3 000 zł i jest płatna do 1 sierpnia 2027 roku.',
  'Pozostała kwota wynosi 5 000 zł i jest płatna do 1 czerwca 2027 roku.',
)
assert.ok(validatePlannedPaymentAllocation(payment.input, swappedTiming.operations).length > 0, 'amounts attached to the wrong source-defined dates fail')

const threeObligationSource = await docx([
  'Łączna wartość umowy wynosi 10 000 zł.',
  'Opłata rezerwacyjna wynosi 2 000 zł.',
  'Pierwsza płatność wynosi 2 000 zł.',
  'Druga płatność wynosi 2 000 zł.',
  'Pozostała kwota wynosi 4 000 zł.',
])
const threeObligationInput = await inputFor(threeObligationSource, [{ id: 'financials.remainingInstallmentAllocation', value: 'First payment: 2 000 zł.' }])
const paymentHelp = addPaymentAllocationHelp(threeObligationInput, [{ id: 'financials.remainingInstallmentAllocation', label: 'Payment allocation', explanation: 'Provide intermediate payment amounts.', inputType: 'text', required: true, sourceContext: 'payment schedule' }])
assert.match(paymentHelp[0]?.infoText ?? '', /końcowa kwota może zostać wyliczona automatycznie/i, 'payment guidance applies when more than two post-reservation obligations exist')

const noRepairSource = await docx(['Umowa o świadczenie usługi.'])
const noRepairInput = await inputFor(noRepairSource)
let repairCalls = 0
const noRepairAi = {
  async plan() { return { missingInputs: [], blockOperations: [] } },
  async review() { return { status: 'FAIL' as const, issues: ['independent review failed'] } },
  async repair() { repairCalls++; return [] },
}
const reviewFailure = await runGeneration(noRepairSource, noRepairInput, noRepairAi)
assert.deepEqual(reviewFailure, { status: 'FAILED', issues: ['independent review failed'] })
assert.equal(repairCalls, 0, 'a review failure stops generation without automatic repair')

const invalidCandidateSource = await docx(['Wesele odbędzie się 19.06.2027.'])
const invalidCandidateInput = await inputFor(invalidCandidateSource)
let invalidCandidateReviewCalls = 0
const invalidCandidateResult = await runGeneration(invalidCandidateSource, invalidCandidateInput, {
  async plan() { return { missingInputs: [], blockOperations: [] } },
  async review() { invalidCandidateReviewCalls++; return { status: 'PASS' } },
})
assert.equal(invalidCandidateResult.status, 'FAILED', 'deterministic candidate validation stops an invalid candidate')
assert.equal(invalidCandidateReviewCalls, 0, 'independent review is not called after deterministic validation fails')

assert.doesNotMatch(TRANSFORMATION_INSTRUCTIONS, /tel\./i, 'the shared prompt has no fixture-derived tel. defect example')
assert.match(TRANSFORMATION_INSTRUCTIONS, /obvious, unambiguous, minimal local editorial correction/i, 'generic meaning-preserving editorial correction remains allowed')
const runtimeText = await readFile(new URL('./generator.ts', import.meta.url), 'utf8')
assert.doesNotMatch(runtimeText, /contract\.number|case-0[123]|Case 0[123]|Julia|Maksymilian|96041412344|14200|Video Standard/i, 'shared generator runtime contains no contract-number branch or known fixture residue')

console.log('PASS contract-generation genericity cleanup acceptance')
