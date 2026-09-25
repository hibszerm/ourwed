import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runGeneration, makeInput, readSource, conclusionRule, KNOWN_OLD_VALUES, type ContractAi, type GenerationInput, type SourceBlock } from './generator'

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceBytes = await readFile(`${here}fixtures/source-video-standard.docx`)
const referenceBytes = await readFile(`${here}fixtures/work-generated-reference.docx`)
const sourceBuffer = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength)
const referenceBuffer = referenceBytes.buffer.slice(referenceBytes.byteOffset, referenceBytes.byteOffset + referenceBytes.byteLength)
const source = await readSource(sourceBuffer, 'source-video-standard.docx')
const wedding: GenerationInput['wedding'] = {
  bride: { name: 'Julia Kanicka', phone: '555666898', email: 'kanickaj7@wp.pl' },
  groom: { name: 'Maksymilian Ruth', phone: '675264927' },
  weddingDate: '20.09.2026', contractAddress: 'Juliusza Słowackiego 6/17, 41-800 Zabrze', contractValuePln: 14200, depositPln: 1000, remainingDueDate: '20.09.2026',
  locations: {
    groomPreparations: 'Wolności 110, 30-661 Kraków', bridePreparations: 'Marii Konopnickiej 6, 04-218 Kraków',
    ceremony: 'Zamek Królewski na Wawelu – Państwowe Zbiory Sztuki, Wawel 5, 31-001 Kraków',
    reception: 'Hotel Stary, Szczepańska 5, 31-011 Kraków',
  },
}
const input = makeInput({ generationDate: '25.09.2026', sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: ['ujęcia VHS', 'ujęcia z drona'], userProvidedAnswers: [] })
assert.equal(input.financials.remainingPln, 13200)
assert.equal(input.conclusion.replaceDate, true)
assert.equal(input.conclusion.preservePlace, 'Zabrzu')
assert.deepEqual(conclusionRule([{ part: 'word/document.xml', index: 0, text: 'Zawarta w dniu .................... r. w ........................, zwana dalej umową' }], '25.09.2026'), { replaceDate: true, replacementDate: '25.09.2026' })

let transformCalls = 0
let reviewCalls = 0
const missingAi: ContractAi = {
  async plan() { transformCalls++; return { missingInputs: [{ id: 'template-value-1', label: 'PESEL Julii Kanickiej', explanation: 'Umowa wymaga numeru PESEL Julii Kanickiej.', inputType: 'text', required: true, sourceContext: 'Identyfikacja Strony' }] } },
  async review() { reviewCalls++; return { status: 'PASS' } },
  async repair() { throw new Error('repair must not run') },
}
const missing = await runGeneration(sourceBuffer, input, missingAi)
assert.equal(missing.status, 'MISSING_INPUT')
assert.equal(transformCalls, 1)
assert.equal(reviewCalls, 0)
if (missing.status === 'MISSING_INPUT') assert.equal(missing.missingInputs[0]?.label, 'PESEL Julii Kanickiej')

const supplied = makeInput({ generationDate: input.generationDate, sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: input.extras, userProvidedAnswers: [{ id: 'template-value-1', value: '90010112345' }] })
assert.equal(supplied.userProvidedAnswers[0]?.value, '90010112345', 'user answer enters the next authoritative generation input')
let answeredReviewCalls = 0
const answeredAi: ContractAi = {
  async plan(nextInput) { assert.equal(nextInput.userProvidedAnswers[0]?.value, '90010112345'); return { missingInputs: [], blockOperations: [] } },
  async review() { answeredReviewCalls++; return { status: 'PASS' } },
  async repair() { throw new Error('repair must not run') },
}
const resumed = await runGeneration(sourceBuffer, supplied, answeredAi)
assert.equal(resumed.status, 'FAILED', 'answered attempt proceeds past missing-input planning and reaches final safety checks')
assert.equal(answeredReviewCalls, 1)

const reference = await readSource(referenceBuffer, 'work-generated-reference.docx')
const refText = reference.blocks.map((b) => b.text).join('\n')
assert.match(refText, /Zawarta w dniu \.{3,} r\. w \.{3,}/)
assert.match(refText, /wydarzeń odbywających się w dniu 20\.09\.2026/)
assert.match(refText, /14 200 zł/)
assert.match(refText, /13 200 zł/)
assert.match(refText, /ujęć VHS oraz ujęć z drona/)
assert.match(refText, /Video Standard/)

const noPlace = conclusionRule([{ part: 'word/document.xml', index: 0, text: 'Zawarta w dniu 22.09.2026 r., zwana dalej umową' }], '25.09.2026')
assert.deepEqual(noPlace, { replaceDate: true, replacementDate: '25.09.2026' }, 'absence of source conclusion place does not authorize city insertion')
assert.ok(KNOWN_OLD_VALUES.every((value) => source.blocks.some((b: SourceBlock) => b.text.includes(value))), 'old-data guard fixture values come from actual source')
console.log('PASS contract-generation-spike offline acceptance (fixture preparation, missing input, supplied answer, dates, place rule, finance, extras, package)')
