import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { applyBlockOperations, type BlockOperation } from './blockDocxEditor'
import {
  findMissingDocumentOwnedFacts,
  classifyPaymentObligations,
  makeInput as buildInput,
  readSource,
  runGeneration,
  TRANSFORMATION_INSTRUCTIONS,
  validateCandidate,
  validatePlannedPaymentAllocation,
  validatePlannedTransformation,
  type GenerationInput,
} from './generator'

const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const documentXml = (text: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(text)}<w:sectPr/></w:body></w:document>`

async function makeDocx(args: { body: string; footer?: string; subject?: string }): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', documentXml(args.body))
  if (args.footer) zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(args.footer)}</w:ftr>`)
  if (args.subject) zip.file('docProps/core.xml', `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject>${args.subject}</dc:subject></cp:coreProperties>`)
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

async function makeInput(sourceBytes: ArrayBuffer, answers: GenerationInput['userProvidedAnswers'] = []) {
  const sourceDocument = await readSource(sourceBytes, 'generic-source.docx')
  return makeInputBase(sourceDocument, answers)
}

function makeInputBase(sourceDocument: GenerationInput['sourceDocument'], answers: GenerationInput['userProvidedAnswers'] = []) {
  return buildInput({
    generationDate: '01.06.2027', sourceDocument, wedding,
    packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: answers,
  })
}

const missingSource = await makeDocx({ body: 'Agreement reference: OLD-001.' })
const missingInput = await makeInput(missingSource)
assert.equal(findMissingDocumentOwnedFacts(missingInput).length, 1, 'a source-owned document identifier with no replacement is a missing required input')
assert.equal(findMissingDocumentOwnedFacts(missingInput)[0]?.required, true)
assert.ok(validatePlannedTransformation(missingInput, []).some((finding) => /no authoritative replacement/i.test(finding)), 'a READY plan cannot preserve or silently omit a source identifier without authority')
assert.match(TRANSFORMATION_INSTRUCTIONS, /document-owned facts that identify the specific source document/i)
let missingReviewCalls = 0
const missingResult = await runGeneration(missingSource, missingInput, {
  async plan() { return { missingInputs: [], blockOperations: [] } },
  async review() { missingReviewCalls++; return { status: 'PASS' as const } },
})
assert.equal(missingResult.status, 'MISSING_INPUT', 'an unsafe READY response becomes MISSING_INPUT when a document-owned replacement is unavailable')
assert.equal(missingReviewCalls, 0, 'missing document-owned facts stop before candidate review')

const answers: GenerationInput['userProvidedAnswers'] = [{ id: 'document.reference', value: 'NEW-001' }]
const source = await makeDocx({
  body: 'Agreement reference: OLD-001.',
  footer: 'Document reference: OLD-001.',
  subject: 'Agreement reference: OLD-001',
})
const input = await makeInput(source, answers)
const bodyBlock = input.sourceDocument.blocks.find((block) => block.part === 'word/document.xml')!
const footerBlock = input.sourceDocument.blocks.find((block) => block.part === 'word/footer1.xml')!
assert.ok(input.sourceDocument.documentProperties?.some((property) => property.part === 'docProps/core.xml' && property.text.includes('OLD-001')), 'textual core properties are inspected as source facts')

const bodyOnly: BlockOperation[] = [{ blockId: bodyBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Agreement reference: NEW-001.' }]
assert.ok(validatePlannedTransformation(input, bodyOnly).some((finding) => /Stale document-owned source fact “OLD-001”/.test(finding)), 'an unchanged stale footer is rejected after the body replacement')
const bodyOnlyCandidate = await applyBlockOperations(source, bodyOnly)
assert.ok((await validateCandidate(source, bodyOnlyCandidate, input, bodyOnly)).some((finding) => /Stale document-owned source fact “OLD-001”/.test(finding)), 'candidate validation catches the stale footer')
assert.ok((await validateCandidate(source, bodyOnlyCandidate, input, bodyOnly)).some((finding) => /Stale document-owned source fact “OLD-001” remains in the generated document/.test(finding)), 'candidate validation catches the stale document property')
const ambiguousInput = await makeInput(source, [
  { id: 'document.reference', value: 'NEW-001' },
  { id: 'agreement.identifier', value: 'OTHER-001' },
])

const allTextOperations: BlockOperation[] = [
  { blockId: bodyBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Agreement reference: NEW-001.' },
  { blockId: footerBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Document reference: NEW-001.' },
]
assert.ok(validatePlannedTransformation(ambiguousInput, allTextOperations).some((finding) => /cannot be matched unambiguously/i.test(finding)), 'multiple authoritative document identifiers are never guessed into a source reference')
assert.deepEqual(validatePlannedTransformation(input, allTextOperations), [], 'authoritative replacement is accepted when planned document text updates body and footer')
const generation = await runGeneration(source, input, {
  async plan() { return { missingInputs: [], blockOperations: allTextOperations } },
  async review() { return { status: 'PASS' as const } },
})
assert.equal(generation.status, 'COMPLETED', 'the generic authoritative replacement produces a candidate')
if (generation.status === 'COMPLETED') {
  const candidateInput = await readSource(generation.docxBytes, 'generic-source.docx')
  assert.ok(candidateInput.documentProperties?.some((property) => property.text.includes('NEW-001')), 'the authoritative identifier is propagated to supported textual document metadata')
  assert.ok(!candidateInput.documentProperties?.some((property) => property.text.includes('OLD-001')), 'stale source metadata is removed from the generated document')
}

const reservationPhrases = [
  'Opłata rezerwacyjna wynosi 2 000 zł.',
  'Zaliczka wynosi 2 000 zł.',
  'Zadatek wynosi 2 000 zł.',
  'Płatność w celu zarezerwowania terminu wynosi 2 000 zł.',
]
for (const reservation of reservationPhrases) {
  const paymentSource = await makeDocx({ body: `Łączna wartość umowy wynosi 10 000 zł. ${reservation} Pozostała kwota 8 000 zł jest płatna do 20 sierpnia 2027 roku.` })
  const paymentInput = await makeInput(paymentSource)
  assert.deepEqual(classifyPaymentObligations(paymentInput.sourceDocument.blocks), { reservation: 1, postReservation: 1 }, `payment classifier returns one reservation and one remainder: ${reservation}`)
  assert.deepEqual(validatePlannedPaymentAllocation(paymentInput, []), [], `reservation phrase is excluded from post-reservation installments: ${reservation}`)
}

const intermediateSource = await makeDocx({ body: 'Łączna wartość umowy wynosi 10 000 zł. Płatność na zabezpieczenie rezerwacji terminu wynosi 2 000 zł. Pierwsza rata wynosi 3 000 zł. Pozostała kwota 5 000 zł jest płatna do 20 sierpnia 2027 roku.' })
const intermediateInput = await makeInput(intermediateSource, [{ id: 'financials.remainingInstallmentAllocation', value: 'First payment: 3 000 zł.' }])
assert.deepEqual(classifyPaymentObligations(intermediateInput.sourceDocument.blocks), { reservation: 1, postReservation: 2 }, 'a real intermediate installment remains a separate post-reservation obligation')
const intermediateOperation: BlockOperation = { blockId: intermediateInput.sourceDocument.blocks[0]!.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: intermediateInput.sourceDocument.blocks[0]!.text }
assert.deepEqual(validatePlannedPaymentAllocation(intermediateInput, [intermediateOperation]), [], 'a genuine intermediate installment remains a post-reservation obligation')

const runtimeText = await readFile(new URL('./generator.ts', import.meta.url), 'utf8')
assert.doesNotMatch(runtimeText, /contract\.number|18\/2027|case-04|Case 04|LUMEN STORIES/i, 'the shared runtime has no identifier-specific or Case 04 branch')
console.log('PASS generic document-owned facts and reservation-payment acceptance')
