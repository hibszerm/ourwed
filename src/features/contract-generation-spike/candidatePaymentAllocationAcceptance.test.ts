import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import { makeInput, readSource, validateCandidate } from './generator'
import type { BlockOperation } from './blockDocxEditor'

const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

async function paymentFixture(schedule: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const text = [
    'Umowa dotyczy ślubu Ada Test i Bar Test, który odbędzie się 21 sierpnia 2027 roku.',
    'Ada Test, ada@example.com, telefon 111 222 333, zamieszkała przy ul. Kwiatowej 1, 00-001 Warszawa.',
    'Bar Test, telefon 444 555 666.',
    'Przygotowania, ceremonia i przyjęcie odbędą się przy ul. Kwiatowej 1, 00-001 Warszawa.',
    schedule,
    'Pakiet Alpha obejmuje jednego fotografa.',
  ].map(paragraph).join('')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function setup(args: { total: number; deposit: number; sourceSchedule: string; answer?: string }) {
  const sourceBytes = await paymentFixture(args.sourceSchedule)
  const source = await readSource(sourceBytes, 'source.docx')
  const userProvidedAnswers = args.answer ? [{ id: 'financials.remainingInstallmentAllocation', value: args.answer }] : []
  const input = makeInput({
    generationDate: '22.03.2027',
    sourceDocument: source,
    wedding: {
      bride: { name: 'Ada Test', email: 'ada@example.com', phone: '111 222 333' },
      groom: { name: 'Bar Test', phone: '444 555 666' },
      weddingDate: '21.08.2027',
      contractAddress: 'ul. Kwiatowej 1, 00-001 Warszawa',
      contractValuePln: args.total,
      depositPln: args.deposit,
      remainingDueDate: '04.09.2027',
      locations: {
        bridePreparations: 'ul. Kwiatowej 1, 00-001 Warszawa',
        groomPreparations: 'ul. Kwiatowej 1, 00-001 Warszawa',
        ceremony: 'ul. Kwiatowej 1, 00-001 Warszawa',
        reception: 'ul. Kwiatowej 1, 00-001 Warszawa',
      },
    },
    packagePolicy: { preserveSourcePackageExactly: true },
    extras: [],
    userProvidedAnswers,
  })
  const paymentBlock = source.blocks.find((block) => block.text.includes('Opłata rezerwacyjna'))!
  const candidateFor = async (text: string) => {
    const operations: BlockOperation[] = [{ blockId: paymentBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: text }]
    return { operations, bytes: await applyBlockOperations(sourceBytes, operations) }
  }
  return { sourceBytes, source, input, paymentBlock, candidateFor }
}

const simpleSchedule = 'Łączna wartość umowy wynosi 10 000 zł. Opłata rezerwacyjna wynosi 2 000 zł. Pozostała kwota 8 000 zł jest płatna po weselu.'
const simple = await setup({ total: 10000, deposit: 2000, sourceSchedule: simpleSchedule })
const simpleCandidate = await simple.candidateFor(simpleSchedule)
assert.deepEqual(await validateCandidate(simple.sourceBytes, simpleCandidate.bytes, simple.input, simpleCandidate.operations), [], 'V1 deposit plus one remaining payment continues to pass')

const sameAsDepositSource = 'Łączna wartość umowy wynosi 10 000 zł. Opłata rezerwacyjna wynosi 2 000 zł. Druga płatność wynosi 2 000 zł przed ślubem. Pozostała kwota 6 000 zł jest płatna po weselu.'
const sameAsDeposit = await setup({ total: 10000, deposit: 2000, sourceSchedule: sameAsDepositSource, answer: 'Second payment: 2 000 zł, due before the wedding.' })
const sameAsDepositCandidate = await sameAsDeposit.candidateFor(sameAsDepositSource)
assert.deepEqual(await validateCandidate(sameAsDeposit.sourceBytes, sameAsDepositCandidate.bytes, sameAsDeposit.input, sameAsDepositCandidate.operations), [], 'a legitimate installment equal to the deposit is still validated as a separate payment')

const detailedSource = 'Łączna wartość umowy wynosi 16 800 zł. Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 5 000 zł i jest płatna przed ślubem. Pozostała kwota 9 000 zł jest płatna po weselu.'
const detailed = await setup({ total: 16800, deposit: 2800, sourceSchedule: detailedSource, answer: 'Second payment: 6 000 zł, due no later than 30 days before the wedding.' })
const validDetailedText = 'Łączna wartość umowy wynosi 16 800 zł. Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 6 000 zł i jest płatna przed ślubem. Pozostała kwota 8 000 zł jest płatna po weselu.'
const detailedCandidate = await detailed.candidateFor(validDetailedText)
assert.deepEqual(await validateCandidate(detailed.sourceBytes, detailedCandidate.bytes, detailed.input, detailedCandidate.operations), [], 'authoritative 6,000 + derived 8,000 allocation passes without a literal aggregate remainder payment')

const wrongSplit = await detailed.candidateFor(validDetailedText.replace('6 000 zł', '5 000 zł').replace('8 000 zł', '9 000 zł'))
assert.ok((await validateCandidate(detailed.sourceBytes, wrongSplit.bytes, detailed.input, detailedCandidate.operations)).length > 0, 'same-sum but unauthorized 5,000 + 9,000 split is rejected')

const collapsedPayments = await detailed.candidateFor('Łączna wartość umowy wynosi 16 800 zł. Opłata rezerwacyjna wynosi 2 800 zł. Druga płatność wynosi 6 000 zł, a pozostała kwota 8 000 zł jest płatna po weselu.')
assert.ok((await validateCandidate(detailed.sourceBytes, collapsedPayments.bytes, detailed.input, detailedCandidate.operations)).length > 0, 'two authoritative amounts collapsed into one payment clause are rejected')

const staleSourceSplitText = 'Łączna wartość umowy wynosi 14 900 zł. Opłata rezerwacyjna wynosi 2 500 zł. Druga płatność wynosi 5 000 zł i jest płatna przed ślubem. Pozostała kwota 7 400 zł jest płatna po weselu.'
const staleSourceSplit = await detailed.candidateFor(staleSourceSplitText)
const staleFindings = await validateCandidate(detailed.sourceBytes, staleSourceSplit.bytes, detailed.input, detailedCandidate.operations)
assert.ok(staleFindings.some((finding) => /podziału płatności|kolejności źródłowych zobowiązań/i.test(finding)), 'stale source payment amounts are rejected')

const arithmeticMismatch = await detailed.candidateFor(validDetailedText.replace('8 000 zł', '7 000 zł'))
assert.ok((await validateCandidate(detailed.sourceBytes, arithmeticMismatch.bytes, detailed.input, detailedCandidate.operations)).length > 0, 'allocation that does not sum to total is rejected')

const unsupported = await setup({ total: 16800, deposit: 2800, sourceSchedule: detailedSource })
const unsupportedCandidate = await unsupported.candidateFor(validDetailedText)
assert.ok((await validateCandidate(unsupported.sourceBytes, unsupportedCandidate.bytes, unsupported.input, unsupportedCandidate.operations)).length > 0, 'multi-payment source without an authoritative detailed allocation is rejected')

const negativePayment = await detailed.candidateFor(validDetailedText.replace('8 000 zł', '-8 000 zł'))
assert.ok((await validateCandidate(detailed.sourceBytes, negativePayment.bytes, detailed.input, detailedCandidate.operations)).some((finding) => /ujemną kwotę płatności/i.test(finding)), 'negative payment amount is rejected')

const overAllocated = await detailed.candidateFor(validDetailedText.replace('8 000 zł', '9 000 zł'))
assert.ok((await validateCandidate(detailed.sourceBytes, overAllocated.bytes, detailed.input, detailedCandidate.operations)).length > 0, 'over-allocated payment is rejected')

console.log('PASS deterministic candidate payment allocation acceptance')
